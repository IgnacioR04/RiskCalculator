/**
 * Modelo de costes y rotación (LAB-608).
 *
 * Una candidata que ignora lo que cuesta llegar a ella no es una candidata: es
 * un dibujo. Mover una cartera cuesta comisiones, horquilla y —en España— un
 * 19–28 % de la plusvalía realizada, y ese último es casi siempre el mayor de
 * los tres.
 *
 * ## La regla que gobierna el módulo
 *
 * **Un coste desconocido no se representa como cero.** Es el criterio de
 * aceptación de LAB-608 y no es un tecnicismo: un cero se suma, se compara y
 * acaba en un «esta candidata te cuesta 40 €» que el usuario se cree. Un
 * desconocido se propaga hasta la pantalla y obliga a decir «no se sabe».
 *
 * Por eso el total es `number | null` y no un número con un asterisco.
 *
 * ## Lo que este modelo NO hace
 *
 * No estima impacto de mercado. Una orden de un particular no mueve el precio de
 * un ETF mundial, y para los casos en que sí lo movería —un valor ilíquido— no
 * hay datos de profundidad de libro. Inventar un impacto sería inventar el dato
 * más difícil de todos.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

/** Margen de coma flotante al comparar sumas de fracciones. */
const EPS = 1e-9

export interface BrokerCosts {
  /** Comisión proporcional, en fracción. 0,001 es un 0,1 %. */
  readonly proportional?: number
  /** Comisión fija por operación, en divisa de presentación. */
  readonly fixed?: number
  /** Coste de cambio de divisa, fracción sobre el importe convertido. */
  readonly fxSpread?: number
  /** Mínimo por operación, si el bróker lo aplica. */
  readonly minimum?: number
}

export interface TradeLine {
  readonly assetId: string
  readonly symbol: string
  /** Positivo compra, negativo vende. En divisa de presentación. */
  readonly amount: number
  /** `true` si la operación cruza divisa. */
  readonly crossesCurrency?: boolean
  /**
   * Plusvalía latente de la parte vendida, si se conoce.
   *
   * `undefined` significa **no se sabe** —falta el precio de compra—, no que sea
   * cero. La diferencia decide si el total se puede publicar.
   */
  readonly realizedGain?: number
}

export interface CostBreakdown {
  readonly proportional: number
  readonly fixed: number
  readonly fx: number
  /** Impuesto estimado sobre plusvalías, o `null` si falta algún dato. */
  readonly tax: number | null
  /** Suma de todo. `null` si alguna parte es desconocida. */
  readonly total: number | null
  /** Qué falta para poder dar un total. */
  readonly unknown: readonly string[]
}

/**
 * Tramos del ahorro en España (IRPF 2024–2026).
 *
 * Se declaran como dato y no se esconden en el código: son una **suposición
 * fiscal**, dependen del país y de la situación de cada uno, y quien lea el
 * número tiene derecho a saber de dónde sale.
 */
export const CAPITAL_GAINS_BRACKETS: readonly { readonly upTo: number; readonly rate: number }[] = [
  { upTo: 6_000, rate: 0.19 },
  { upTo: 50_000, rate: 0.21 },
  { upTo: 200_000, rate: 0.23 },
  { upTo: 300_000, rate: 0.27 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.28 },
]

export const TAX_ASSUMPTION =
  'Impuesto estimado con los tramos del ahorro en España, sobre la plusvalía de lo vendido en esta operación. No tiene en cuenta pérdidas compensables de otros años, exenciones ni tu situación fiscal concreta.'

/** Impuesto sobre una plusvalía, por tramos. */
export function capitalGainsTax(gain: number): number {
  if (gain <= 0) return 0
  let restante = gain
  let anterior = 0
  let total = 0

  for (const tramo of CAPITAL_GAINS_BRACKETS) {
    const ancho = tramo.upTo - anterior
    const enTramo = Math.min(restante, ancho)
    total += enTramo * tramo.rate
    restante -= enTramo
    anterior = tramo.upTo
    if (restante <= EPS) break
  }
  return total
}

/**
 * Coste de ejecutar un conjunto de operaciones.
 *
 * Una venta con plusvalía desconocida hace que el **total** sea `null`, no que
 * el impuesto valga cero: no saber cuánto cuesta algo no es que sea gratis.
 */
export function estimateCost(
  trades: readonly TradeLine[],
  costs: BrokerCosts,
): CostBreakdown {
  const proporcional = costs.proportional ?? 0
  const fija = costs.fixed ?? 0
  const horquillaFx = costs.fxSpread ?? 0
  const minimo = costs.minimum ?? 0

  const reales = trades.filter((t) => Math.abs(t.amount) > EPS)

  let comisionProporcional = 0
  let comisionFija = 0
  let costeFx = 0

  for (const t of reales) {
    const importe = Math.abs(t.amount)
    const propia = Math.max(importe * proporcional, minimo > 0 ? minimo : 0)
    comisionProporcional += propia
    comisionFija += fija
    if (t.crossesCurrency === true) costeFx += importe * horquillaFx
  }

  // Solo las ventas generan plusvalía realizada.
  const ventas = reales.filter((t) => t.amount < 0)
  const sinDato = ventas.filter((t) => t.realizedGain === undefined)

  const unknown = sinDato.map(
    (t) => `${t.symbol}: no se conoce el precio de compra, así que no se puede estimar el impuesto.`,
  )

  const impuesto =
    sinDato.length > 0
      ? null
      : capitalGainsTax(ventas.reduce((s, t) => s + (t.realizedGain ?? 0), 0))

  return {
    proportional: comisionProporcional,
    fixed: comisionFija,
    fx: costeFx,
    tax: impuesto,
    total:
      impuesto === null ? null : comisionProporcional + comisionFija + costeFx + impuesto,
    unknown,
  }
}

/* ── Rotación ──────────────────────────────────────────────────────────────── */

/**
 * Rotación entre dos carteras: la fracción que hay que mover.
 *
 * Es **la mitad** de la suma de diferencias absolutas, porque cada euro que sale
 * de una posición entra en otra y contarlo dos veces duplicaría la cifra. Es la
 * misma convención que usa `portfolioPath` para cobrar la comisión de
 * rebalanceo, y compartirla evita que dos partes del Laboratorio den números
 * distintos para lo mismo.
 */
export function turnover(
  from: readonly number[],
  to: readonly number[],
): number {
  const n = Math.max(from.length, to.length)
  let suma = 0
  for (let i = 0; i < n; i += 1) suma += Math.abs((to[i] ?? 0) - (from[i] ?? 0))
  return suma / 2
}

/** Las operaciones que llevan de una cartera a otra, en euros. */
export function tradesFor(
  from: readonly number[],
  to: readonly number[],
  totalValue: number,
  universe: readonly { readonly id: string; readonly symbol: string }[],
): readonly TradeLine[] {
  return universe.flatMap((instrumento, i) => {
    const delta = ((to[i] ?? 0) - (from[i] ?? 0)) * totalValue
    return Math.abs(delta) <= EPS
      ? []
      : [{ assetId: instrumento.id, symbol: instrumento.symbol, amount: delta }]
  })
}
