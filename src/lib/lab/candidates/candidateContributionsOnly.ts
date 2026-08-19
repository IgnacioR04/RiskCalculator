/**
 * Candidata de solo aportaciones (LAB-605).
 *
 * Contesta la pregunta más práctica de todas: **«tengo 500 € este mes, ¿dónde
 * los meto?»**.
 *
 * Es la candidata que más se usa y la que menos se parece a un optimizador. No
 * propone una cartera ideal: propone **el mejor uso del dinero nuevo**, dejando
 * intacto lo que ya hay.
 *
 * ## Por qué no vender importa tanto
 *
 * Vender tiene tres costes que un optimizador no ve: comisiones, **impuestos
 * sobre la plusvalía** —que en España pueden ser un 19–28 % de la ganancia— y
 * el riesgo de equivocarse en el momento. Para un inversor particular que aporta
 * cada mes, rebalancear con aportaciones es casi siempre mejor que rebalancear
 * vendiendo, aunque tarde más en llegar al objetivo.
 *
 * **Ninguna cantidad se vende. Nunca.** Es el criterio de aceptación de LAB-605
 * y es una invariante del módulo: el peso final de cada activo, en euros, es
 * mayor o igual que el de partida.
 *
 * ## Cómo se reparte
 *
 * Se da prioridad a quien más lejos está **por debajo** de su objetivo, medido
 * en euros que le faltan. Los que están por encima no reciben nada: no se puede
 * bajar su peso sin vender, así que la única forma de corregirlos es que los
 * demás crezcan.
 *
 * Puede que la aportación no llegue para cuadrarlo todo. Eso no es un fallo:
 * es la respuesta, y se dice cuánto falta.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { CompiledConstraints } from './constraintCompiler'
import type { PortfolioCandidate } from './contracts'

export const CONTRIBUTIONS_ONLY_VERSION = 'candidate-contributions-v1'

const EPS = 1e-9

const SUPUESTOS = [
  {
    label: 'No se vende nada',
    detail:
      'Vender cuesta comisiones e impuestos sobre la plusvalía, y obliga a acertar con el momento. Aportar tarda más en cuadrar la cartera, pero no tiene ninguno de los tres costes.',
  },
  {
    label: 'Lo que sobra se corrige creciendo, no recortando',
    detail:
      'Un activo por encima de su objetivo no recibe aportación. Su peso baja solo porque los demás suben, no porque se venda nada.',
  },
] as const

export interface ContributionsOnlyInput {
  readonly compiled: CompiledConstraints
  /** Valor actual de cada posición, en el orden del universo. */
  readonly currentValues: readonly number[]
  /** Dinero nuevo a repartir, en divisa de presentación. */
  readonly contribution: number
  /** Pesos objetivo, en el orden del universo. Deben sumar 1. */
  readonly targetWeights: readonly number[]
  /** Comisión proporcional por compra, fracción. */
  readonly tradingFee?: number
}

export interface ContributionPlanLine {
  readonly assetId: string
  readonly symbol: string
  /** Euros que se destinan a este activo. Nunca negativo. */
  readonly amount: number
  readonly weightBefore: number
  readonly weightAfter: number
  /** Cuánto le sigue faltando para su objetivo, en euros. */
  readonly stillShort: number
}

export interface ContributionsOnlyCandidate extends PortfolioCandidate {
  readonly plan: readonly ContributionPlanLine[]
  /** Comisiones totales. */
  readonly cost: number
  /** Dinero que no se ha podido colocar por los topes. */
  readonly unallocated: number
  /** Suma de lo que aún falta para cuadrar del todo. */
  readonly remainingGap: number
}

export function candidateContributionsOnly(
  input: ContributionsOnlyInput,
): ContributionsOnlyCandidate {
  const { compiled, currentValues, contribution, targetWeights } = input
  const n = compiled.universe.length

  const vacio = (
    motivo: string,
    status: PortfolioCandidate['solver']['status'],
  ): ContributionsOnlyCandidate => ({
    method: 'contributionsOnly',
    modelVersion: CONTRIBUTIONS_ONLY_VERSION,
    weights: null,
    solver: { status, iterations: 0, residual: 0, tolerance: EPS },
    violations: [],
    assumptions: [...SUPUESTOS],
    notCovered: [motivo],
    plan: [],
    cost: 0,
    unallocated: contribution,
    remainingGap: 0,
  })

  if (n === 0) return vacio('No hay ningún instrumento donde aportar.', 'invalid_input')
  if (!(contribution > 0)) {
    return vacio('No hay dinero nuevo que repartir.', 'invalid_input')
  }

  // La comisión sale del propio dinero aportado: lo que se invierte es menos.
  const comision = Math.max(0, input.tradingFee ?? 0)
  const invertible = contribution / (1 + comision)
  const cost = contribution - invertible

  const valorActual = currentValues.reduce((s, v) => s + (v ?? 0), 0)
  const valorFinal = valorActual + invertible

  // Techos por activo, en euros sobre el valor final. Un activo excluido del
  // universo tiene techo cero y no recibe nada.
  const techoPeso = new Array<number>(n).fill(1)
  for (const b of compiled.bounds) {
    if (b.severity !== 'hard') continue
    if (b.members.length === 1) {
      techoPeso[b.members[0]!] = Math.min(techoPeso[b.members[0]!]!, b.max)
    } else if (b.max <= EPS) {
      // Un grupo con techo cero obliga a cada miembro a cero: los pesos no son
      // negativos, ninguno puede compensar a otro.
      for (const i of b.members) techoPeso[i] = 0
    }
  }

  const asignado = new Array<number>(n).fill(0)
  let restante = invertible
  let iteraciones = 0

  // Reparto por rondas: en cada una se da a quien más le falta, hasta que se
  // acaba el dinero o nadie tiene sitio. Varias rondas porque un activo puede
  // toparse a mitad de camino y liberar dinero para el siguiente.
  while (restante > EPS && iteraciones < n + 2) {
    iteraciones += 1

    const huecos = compiled.universe.map((_, i) => {
      const actual = (currentValues[i] ?? 0) + asignado[i]!
      const objetivo = (targetWeights[i] ?? 0) * valorFinal
      const techo = techoPeso[i]! * valorFinal
      // Lo que le falta para su objetivo, sin pasarse de su techo.
      return Math.max(0, Math.min(objetivo, techo) - actual)
    })

    const totalHueco = huecos.reduce((s, v) => s + v, 0)
    if (totalHueco <= EPS) break

    const aRepartir = Math.min(restante, totalHueco)
    for (let i = 0; i < n; i += 1) {
      if (huecos[i]! <= EPS) continue
      asignado[i] = asignado[i]! + aRepartir * (huecos[i]! / totalHueco)
    }
    restante -= aRepartir
  }

  const plan: ContributionPlanLine[] = compiled.universe.map((instrumento, i) => {
    const antes = currentValues[i] ?? 0
    const despues = antes + asignado[i]!
    const objetivo = (targetWeights[i] ?? 0) * valorFinal
    return {
      assetId: instrumento.id,
      symbol: instrumento.symbol,
      amount: asignado[i]!,
      weightBefore: valorActual > 0 ? antes / valorActual : 0,
      weightAfter: valorFinal > 0 ? despues / valorFinal : 0,
      stillShort: Math.max(0, objetivo - despues),
    }
  })

  const pesos = plan.map((p) => p.weightAfter)

  return {
    method: 'contributionsOnly',
    modelVersion: CONTRIBUTIONS_ONLY_VERSION,
    weights: pesos,
    solver: {
      status: 'converged',
      iterations: iteraciones,
      residual: restante,
      tolerance: EPS,
    },
    // Los topes por activo se respetan al repartir; los de grupo se comprueban
    // fuera, con `violations` del compilador, igual que en 1/N.
    violations: [],
    assumptions: [...SUPUESTOS],
    notCovered:
      restante > EPS
        ? [`Quedan ${restante.toFixed(2)} sin colocar: los topes no admiten más.`]
        : [],
    plan,
    cost,
    unallocated: restante,
    remainingGap: plan.reduce((s, p) => s + p.stillShort, 0),
  }
}
