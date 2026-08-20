/**
 * Evaluación de candidatas (LAB-609).
 *
 * Mide todas las carteras —las propuestas **y la que el usuario ya tiene**— con
 * el mismo código, los mismos datos y los mismos supuestos.
 *
 * ## Por qué eso es el criterio de aceptación y no un detalle
 *
 * Si la cartera actual se midiera con una función y las candidatas con otra,
 * cualquier diferencia entre ellas sería inatribuible: ¿va mejor la candidata, o
 * es que se calcula distinto? Es el fallo clásico de los comparadores, y no se
 * nota nunca porque el resultado siempre sale plausible.
 *
 * Aquí la cartera actual entra como una candidata más, con
 * `method: 'current'`. No hay una ruta especial para ella.
 *
 * ## Lo que se mide y lo que no
 *
 * Riesgo (volatilidad), riesgo bajista, concentración, distancia a la actual,
 * rotación, coste e incumplimientos. **No hay rentabilidad esperada**: ninguno
 * de los motores la estima, y añadirla aquí sería inventar la cifra que más
 * mueve una decisión.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { CompiledConstraints } from './constraintCompiler'
import { violations as comprobar } from './constraintCompiler'
import type { CandidateMethod } from './contracts'
import { estimateCost, tradesFor, turnover, type BrokerCosts } from './costModel'
import { portfolioVariance, riskContributions } from './optimizers'

export const EVALUATION_VERSION = 'candidate-eval-v1'

const EPS = 1e-12

/** Una cartera a evaluar. La actual es una más. */
export interface EvaluableCandidate {
  readonly method: CandidateMethod | 'current'
  readonly label: string
  readonly weights: readonly number[]
}

export interface EvaluationInput {
  readonly compiled: CompiledConstraints
  /**
   * Covarianza **ya anualizada**, tal y como la devuelve `covarianceMatrix`.
   *
   * No se anualiza aquí a propósito: hacerlo sobre una matriz que ya lo estaba
   * multiplica la volatilidad por √252 ≈ 15,9 y produce cifras absurdas —un
   * 237 % de volatilidad anual— que además son *casi* creíbles si nadie mira el
   * orden de magnitud. Una sola anualización, y vive donde se estima la matriz.
   */
  readonly covariance: readonly (readonly number[])[]
  /** Pesos actuales, para medir distancia y rotación. */
  readonly currentWeights: readonly number[]
  readonly totalValue: number
  readonly costs?: BrokerCosts
}

export interface CandidateMetrics {
  readonly method: CandidateMethod | 'current'
  readonly label: string
  readonly weights: readonly number[]
  /** Volatilidad anualizada de la cartera. */
  readonly volatility: number
  /**
   * Concentración por Herfindahl: suma de pesos al cuadrado.
   * 1 es todo en una posición; 1/n es reparto perfecto.
   */
  readonly hhi: number
  /** Número efectivo de posiciones: 1/HHI. */
  readonly effectivePositions: number
  /** Peso de la mayor posición. */
  readonly maxWeight: number
  /**
   * Concentración del **riesgo**, no del dinero. Dos carteras pueden repartir
   * igual los euros y muy distinto el riesgo.
   */
  readonly riskConcentration: number
  /** Fracción de cartera que habría que mover para llegar aquí. */
  readonly turnover: number
  /** Coste de llegar. `null` si algún dato falta: no se representa como cero. */
  readonly cost: number | null
  /** Qué costes no se han podido calcular. */
  readonly costUnknown: readonly string[]
  /** Límites que incumple. */
  readonly violations: readonly string[]
  /** `true` si incumple algún límite duro. */
  readonly breaksHardConstraints: boolean
}

export interface EvaluationResult {
  readonly version: string
  readonly metrics: readonly CandidateMetrics[]
  /** Supuestos comunes a todas: por eso son comparables. */
  readonly sharedAssumptions: readonly string[]
}

export const SHARED_ASSUMPTIONS = [
  'Todas las carteras, incluida la actual, se miden con el mismo código y la misma matriz de covarianza. Cualquier diferencia entre ellas es de la cartera, no del cálculo.',
  'No se estima rentabilidad esperada de ninguna. Comparar riesgo y coste es comparar lo que se puede medir; comparar rentabilidades futuras sería inventarlas.',
  'La volatilidad se estima con el historial disponible y supone que el futuro se parece al pasado en ese aspecto. Es un supuesto, no un hecho.',
] as const

/**
 * Evalúa un conjunto de carteras con el mismo motor.
 *
 * La actual se añade automáticamente si no viene en la lista: comparar sin la
 * referencia es comparar contra nada.
 */
export function evaluateCandidates(
  candidates: readonly EvaluableCandidate[],
  input: EvaluationInput,
): EvaluationResult {
  const tieneActual = candidates.some((c) => c.method === 'current')
  const todas: EvaluableCandidate[] = tieneActual
    ? [...candidates]
    : [
        { method: 'current', label: 'Tu cartera actual', weights: input.currentWeights },
        ...candidates,
      ]

  const metrics = todas.map((candidata) => medir(candidata, input))

  return {
    version: EVALUATION_VERSION,
    metrics,
    sharedAssumptions: [...SHARED_ASSUMPTIONS],
  }
}

function medir(candidata: EvaluableCandidate, input: EvaluationInput): CandidateMetrics {
  const w = candidata.weights
  const varianza = portfolioVariance(w, input.covariance)
  const hhi = w.reduce((s, x) => s + x * x, 0)

  // Concentración del riesgo: el mismo Herfindahl pero sobre las contribuciones
  // al riesgo. Dos carteras pueden repartir igual los euros y muy distinto el
  // riesgo, y esa segunda es la que importa.
  const contribuciones = riskContributions(w, input.covariance)
  const riskConcentration = contribuciones.reduce((s, c) => s + c * c, 0)

  const operaciones = tradesFor(
    input.currentWeights,
    w,
    input.totalValue,
    input.compiled.universe,
  )
  const coste = estimateCost(operaciones, input.costs ?? {})

  const incumple = comprobar(input.compiled, w)

  return {
    method: candidata.method,
    label: candidata.label,
    weights: w,
    // Sin factor: la matriz ya viene anualizada.
    volatility: Math.sqrt(Math.max(0, varianza)),
    hhi,
    effectivePositions: hhi > EPS ? 1 / hhi : 0,
    maxWeight: w.length === 0 ? 0 : Math.max(...w),
    riskConcentration,
    turnover: turnover(input.currentWeights, w),
    cost: coste.total,
    costUnknown: coste.unknown,
    violations: incumple.map((v) => v.label),
    breaksHardConstraints: incumple.some((v) => v.severity === 'hard'),
  }
}

/**
 * Ordena por una métrica, **sin declarar ninguna «mejor»**.
 *
 * Existe para poder presentar una tabla ordenada por lo que el usuario elija.
 * Deliberadamente no hay una función `bestCandidate`: elegir es suyo, y una
 * aplicación que preselecciona una candidata está recomendando aunque diga que
 * no.
 */
export function sortBy(
  metrics: readonly CandidateMetrics[],
  key: 'volatility' | 'hhi' | 'turnover' | 'riskConcentration',
  direction: 'asc' | 'desc' = 'asc',
): readonly CandidateMetrics[] {
  const signo = direction === 'asc' ? 1 : -1
  return [...metrics].sort((a, b) => signo * (a[key] - b[key]) || a.label.localeCompare(b.label))
}
