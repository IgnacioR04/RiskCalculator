/**
 * Evolución contable de una cartera (LAB-504).
 *
 * Lleva una cartera período a período aplicando, **en un orden fijo y
 * declarado**: rendimiento, flujo, coste y rebalanceo.
 *
 * ## Por qué el orden importa tanto como la aritmética
 *
 * Aportar antes o después de aplicar el rendimiento del mes cambia el resultado,
 * y no poco: una aportación que «participa» del mes que acaba de pasar infla la
 * rentabilidad calculada. Es el error clásico de los simuladores caseros, y no
 * se nota nunca porque el número sale plausible.
 *
 * Aquí el orden es:
 *
 * 1. **Rendimiento.** Lo que había al empezar el periodo se mueve.
 * 2. **Flujo.** La aportación entra *después*: no participa del periodo que
 *    acaba de ocurrir, porque no estaba.
 * 3. **Coste.** Se cobra sobre lo que se ha movido, incluida la aportación.
 * 4. **Rebalanceo.** Al final, sobre el valor ya definitivo del periodo.
 *
 * ## Conservación
 *
 * En cada periodo se cumple, por construcción:
 *
 * ```
 * valorFinal = valorInicial · (1 + r) + flujo − coste
 * ```
 *
 * El rebalanceo mueve dinero **entre** posiciones sin cambiar el total, así que
 * no aparece en esa identidad. Es lo que hace el resultado explicable: cualquier
 * diferencia entre lo que entra y lo que sale tiene un nombre.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export interface PathAsset {
  readonly id: string
  /** Peso objetivo dentro de la cartera, fracción 0–1. */
  readonly targetWeight: number
  /** Valor inicial en divisa de presentación. */
  readonly initialValue: number
}

/** Cuándo se rebalancea. */
export type RebalancePolicy =
  /** Nunca: los pesos derivan con el mercado. */
  | { readonly kind: 'none' }
  /** Cada `everyPeriods` periodos, mire como mire la cartera. */
  | { readonly kind: 'calendar'; readonly everyPeriods: number }
  /** Solo si alguna posición se aleja de su objetivo más de `tolerance`. */
  | { readonly kind: 'bands'; readonly tolerance: number }

export interface PathCosts {
  /** Comisión proporcional sobre lo que se mueve al rebalancear, fracción. */
  readonly tradingFee?: number
  /** Coste periódico sobre el patrimonio (TER prorrateado), fracción. */
  readonly holdingFee?: number
}

export interface PathFlow {
  /** Importe por periodo. Positivo aporta, negativo retira. */
  readonly amount: number
  /** Cada cuántos periodos ocurre. 1 = todos. */
  readonly everyPeriods: number
}

export interface PortfolioPathInput {
  readonly assets: readonly PathAsset[]
  /**
   * Rendimientos por periodo y activo: `returns[periodo][activo]`, en el mismo
   * orden que `assets`. La longitud define cuántos periodos se simulan.
   */
  readonly returns: readonly (readonly number[])[]
  readonly flow?: PathFlow
  readonly costs?: PathCosts
  readonly rebalance?: RebalancePolicy
}

export interface PathPeriod {
  readonly period: number
  readonly startValue: number
  /** Lo que ganó o perdió el capital que ya estaba. */
  readonly grossReturn: number
  readonly flow: number
  readonly cost: number
  readonly endValue: number
  /** `true` si se rebalanceó al cerrar el periodo. */
  readonly rebalanced: boolean
}

export interface PortfolioPathResult {
  readonly periods: readonly PathPeriod[]
  readonly initialValue: number
  readonly finalValue: number
  /** Suma de todo lo aportado (o retirado, si es negativo). */
  readonly totalFlow: number
  readonly totalCost: number
  /** Peor caída dentro del recorrido, como fracción negativa. */
  readonly maxDrawdown: number
  /** Valor final por activo, para poder explicar de dónde viene el total. */
  readonly finalByAsset: Readonly<Record<string, number>>
}

/** Margen de coma flotante para comparar sumas de fracciones. */
const EPS = 1e-9

/**
 * Recorre la cartera periodo a periodo.
 *
 * `returns[p][i]` es el rendimiento del activo `i` en el periodo `p`. Un array
 * vacío devuelve la cartera intacta: cero periodos es un recorrido válido, no
 * un error.
 */
export function portfolioPath(input: PortfolioPathInput): PortfolioPathResult {
  const valores = input.assets.map((a) => a.initialValue)
  const initialValue = valores.reduce((s, v) => s + v, 0)

  const periods: PathPeriod[] = []
  let totalFlow = 0
  let totalCost = 0
  let pico = initialValue
  let maxDrawdown = 0
  let periodosDesdeRebalanceo = 0

  for (let p = 0; p < input.returns.length; p += 1) {
    const rendimientos = input.returns[p] ?? []
    const startValue = valores.reduce((s, v) => s + v, 0)

    // 1. Rendimiento sobre lo que ya estaba.
    for (let i = 0; i < valores.length; i += 1) {
      valores[i] = valores[i]! * (1 + (rendimientos[i] ?? 0))
    }
    const trasRendimiento = valores.reduce((s, v) => s + v, 0)
    const grossReturn = trasRendimiento - startValue

    // 2. Flujo, después del rendimiento: lo que entra hoy no participa del
    //    periodo que acaba de pasar, porque no estaba.
    let flujo = 0
    if (input.flow !== undefined && (p + 1) % input.flow.everyPeriods === 0) {
      flujo = input.flow.amount
      repartir(valores, input.assets, flujo, trasRendimiento)
      totalFlow += flujo
    }

    // 3. Coste periódico sobre el patrimonio resultante.
    const base = valores.reduce((s, v) => s + v, 0)
    let coste = base * (input.costs?.holdingFee ?? 0)

    // 4. Rebalanceo al cierre, y su comisión.
    const toca = tocaRebalancear(
      input.rebalance,
      valores,
      input.assets,
      periodosDesdeRebalanceo + 1,
    )
    if (toca) {
      const movido = rebalancear(valores, input.assets)
      coste += movido * (input.costs?.tradingFee ?? 0)
      periodosDesdeRebalanceo = 0
    } else {
      periodosDesdeRebalanceo += 1
    }

    // El coste sale a prorrata de lo que hay, para no vaciar una posición.
    aplicarCoste(valores, coste)
    totalCost += coste

    const endValue = valores.reduce((s, v) => s + v, 0)
    periods.push({
      period: p,
      startValue,
      grossReturn,
      flow: flujo,
      cost: coste,
      endValue,
      rebalanced: toca,
    })

    // La caída se mide sobre el valor, no sobre el rendimiento: una aportación
    // grande puede subir el valor en un periodo malo, y eso no es recuperación.
    if (endValue > pico) pico = endValue
    if (pico > 0) maxDrawdown = Math.min(maxDrawdown, endValue / pico - 1)
  }

  return {
    periods,
    initialValue,
    finalValue: valores.reduce((s, v) => s + v, 0),
    totalFlow,
    totalCost,
    maxDrawdown,
    finalByAsset: Object.fromEntries(input.assets.map((a, i) => [a.id, valores[i]!])),
  }
}

/** Reparte un flujo entre las posiciones según su peso objetivo. */
function repartir(
  valores: number[],
  assets: readonly PathAsset[],
  importe: number,
  totalActual: number,
): void {
  const sumaObjetivo = assets.reduce((s, a) => s + a.targetWeight, 0)

  for (let i = 0; i < valores.length; i += 1) {
    // Sin pesos objetivo declarados, el flujo entra en la proporción actual:
    // aportar es entonces «más de lo mismo», que es lo que menos supone.
    const peso =
      sumaObjetivo > EPS
        ? assets[i]!.targetWeight / sumaObjetivo
        : totalActual > EPS
          ? valores[i]! / totalActual
          : 1 / valores.length
    valores[i] = valores[i]! + importe * peso
  }
}

/** Cobra un coste a prorrata del valor de cada posición. */
function aplicarCoste(valores: number[], coste: number): void {
  if (coste === 0) return
  const total = valores.reduce((s, v) => s + v, 0)
  if (total <= EPS) return
  for (let i = 0; i < valores.length; i += 1) {
    valores[i] = valores[i]! - coste * (valores[i]! / total)
  }
}

function tocaRebalancear(
  politica: RebalancePolicy | undefined,
  valores: readonly number[],
  assets: readonly PathAsset[],
  periodosDesde: number,
): boolean {
  if (politica === undefined || politica.kind === 'none') return false
  if (politica.kind === 'calendar') return periodosDesde >= politica.everyPeriods

  const total = valores.reduce((s, v) => s + v, 0)
  if (total <= EPS) return false
  const sumaObjetivo = assets.reduce((s, a) => s + a.targetWeight, 0)
  if (sumaObjetivo <= EPS) return false

  return assets.some((a, i) => {
    const objetivo = a.targetWeight / sumaObjetivo
    return Math.abs(valores[i]! / total - objetivo) > politica.tolerance
  })
}

/**
 * Lleva cada posición a su peso objetivo.
 *
 * Devuelve **cuánto dinero se ha movido** —la mitad de la suma de diferencias
 * absolutas, porque cada euro que sale de un sitio entra en otro— para poder
 * cobrar la comisión sobre eso y no sobre el patrimonio entero.
 */
function rebalancear(valores: number[], assets: readonly PathAsset[]): number {
  const total = valores.reduce((s, v) => s + v, 0)
  const sumaObjetivo = assets.reduce((s, a) => s + a.targetWeight, 0)
  if (total <= EPS || sumaObjetivo <= EPS) return 0

  let movido = 0
  for (let i = 0; i < valores.length; i += 1) {
    const objetivo = total * (assets[i]!.targetWeight / sumaObjetivo)
    movido += Math.abs(objetivo - valores[i]!)
    valores[i] = objetivo
  }
  return movido / 2
}
