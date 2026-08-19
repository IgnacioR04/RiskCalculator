/**
 * Contratos de cartera candidata (Fase 6).
 *
 * Una candidata **no es una recomendación**. Es una cartera que cumple las
 * restricciones declaradas y optimiza un criterio concreto; qué criterio, con
 * qué datos y con qué límites viaja dentro del resultado, porque sin eso la
 * cifra parece un consejo.
 *
 * ## Por qué el estado del solver es obligatorio
 *
 * Un vector de pesos sin estado de convergencia es indistinguible de un vector
 * de pesos correcto. [`ADR-007`](../../../../docs/adr/ADR-007-optimization-engine.md)
 * establece que si un algoritmo no converge **no se devuelven pesos**: devolver
 * la última iteración sería presentar un resultado a medio cocer como si fuera
 * la solución.
 */

/** Cómo terminó el optimizador. */
export type SolverStatus =
  /** Convergió dentro de la tolerancia. */
  | 'converged'
  /** Agotó las iteraciones sin converger. **No hay pesos.** */
  | 'max_iterations'
  /** Las restricciones no admiten ninguna solución. **No hay pesos.** */
  | 'infeasible'
  /** La entrada no permite ni empezar: universo vacío, covarianza inválida. */
  | 'invalid_input'

export interface SolverReport {
  readonly status: SolverStatus
  readonly iterations: number
  /** Medida de lo lejos que quedó de converger. Menor es mejor. */
  readonly residual: number
  readonly tolerance: number
}

/** De qué criterio sale la candidata. */
export type CandidateMethod =
  | 'equalWeight'
  | 'contributionsOnly'
  | 'minimumVariance'
  | 'equalRiskContribution'

export interface CandidateAssumption {
  readonly label: string
  readonly detail: string
}

export interface PortfolioCandidate {
  readonly method: CandidateMethod
  /** Versión del algoritmo. Sube si cambian los pesos que produce. */
  readonly modelVersion: string
  /**
   * Pesos en el orden del universo compilado, o `null` si no hay solución.
   *
   * `null` no es «todo a cero»: es «no se ha podido». Un cero es una decisión;
   * la ausencia de solución es la falta de una.
   */
  readonly weights: readonly number[] | null
  readonly solver: SolverReport
  /** Límites que la candidata incumple, si alguno. Los blandos pueden quedar. */
  readonly violations: readonly string[]
  readonly assumptions: readonly CandidateAssumption[]
  /** Lo que no se ha podido tener en cuenta, nombrado en vez de omitido. */
  readonly notCovered: readonly string[]
}

/** Aviso obligatorio: una candidata describe, no aconseja. */
export const CANDIDATE_DISCLAIMER =
  'Una cartera candidata cumple las reglas que has escrito y optimiza un criterio concreto. No es una recomendación de compra o venta, ni afirma que vaya a comportarse mejor que la que tienes.'
