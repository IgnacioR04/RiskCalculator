/**
 * Ejecución de candidatas (LAB-611).
 *
 * Produce todas las candidatas de una vez, con los mismos datos, y las evalúa
 * bajo el mismo motor. Es lo que la pantalla llama: una sola entrada, un
 * resultado tipado, y ninguna decisión tomada por el camino.
 *
 * ## No es una API de servidor
 *
 * El plan la llamaba «API de candidatas» y contemplaba autenticación y
 * timeouts. [`ADR-007`](../../../../docs/adr/ADR-007-optimization-engine.md)
 * decidió que la optimización corre **en el navegador**, así que no hay red que
 * autenticar ni petición que expirar. Lo que sí sobrevive de aquella idea es lo
 * que importaba: **una entrada tipada, un resultado tipado y un código de error
 * estable cuando las restricciones no admiten solución**.
 *
 * `LAB_CONSTRAINTS_INFEASIBLE` es ese código, y es el criterio de aceptación de
 * LAB-611.
 *
 * ## Idempotencia
 *
 * Los mismos datos producen el mismo resultado, bit a bit. Ningún motor de esta
 * fase lee el reloj ni usa `Math.random`; la robustez lleva semilla explícita.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import {
  compileConstraints,
  type CompiledConstraints,
  type CompilerInstrument,
} from './constraintCompiler'
import { assessFeasibility, type FeasibilityReport } from './constraintFeasibility'
import { candidateEqualWeight } from './candidateEqualWeight'
import {
  candidateEqualRiskContribution,
  candidateMinimumVariance,
} from './optimizers'
import {
  evaluateCandidates,
  type CandidateMetrics,
  type EvaluableCandidate,
} from './evaluateCandidate'
import { assessRobustness, type RobustnessReport } from './candidateRobustness'
import type { BrokerCosts } from './costModel'
import type { PortfolioCandidate } from './contracts'
import { CANDIDATE_DISCLAIMER } from './contracts'

export const CANDIDATE_RUN_VERSION = 'candidate-run-v1'

/** Códigos de error estables. La interfaz los traduce; no los reinventa. */
export type CandidateRunError =
  | 'LAB_CONSTRAINTS_INFEASIBLE'
  | 'LAB_EMPTY_UNIVERSE'
  | 'LAB_COVARIANCE_UNAVAILABLE'

export const RUN_ERROR_TEXT: Readonly<Record<CandidateRunError, string>> = {
  LAB_CONSTRAINTS_INFEASIBLE:
    'Tus reglas no admiten ninguna cartera. No se puede proponer nada hasta aflojar alguna.',
  LAB_EMPTY_UNIVERSE: 'No hay instrumentos sobre los que construir una cartera.',
  LAB_COVARIANCE_UNAVAILABLE:
    'Falta historial suficiente para estimar el riesgo. Sin él solo se puede repartir a partes iguales.',
}

export interface CandidateRunInput {
  readonly universe: readonly CompilerInstrument[]
  readonly constraints: readonly PortfolioConstraint[]
  /** Pesos actuales, en el orden del universo. */
  readonly currentWeights: readonly number[]
  readonly totalValue: number
  /**
   * Covarianza **ya anualizada**, como la devuelve `covarianceMatrix`. `null`
   * si no hay historial suficiente.
   */
  readonly covariance: readonly (readonly number[])[] | null
  readonly costs?: BrokerCosts
  /** Semilla del análisis de robustez. Obligatoria: sin ella no se repite. */
  readonly seed: number
}

export interface CandidateRunResult {
  readonly version: string
  readonly compiled: CompiledConstraints
  readonly feasibility: FeasibilityReport
  /** Candidatas producidas, incluidas las que no dieron solución. */
  readonly candidates: readonly PortfolioCandidate[]
  /** Métricas comparables, con la actual dentro. `null` si no hubo covarianza. */
  readonly metrics: readonly CandidateMetrics[] | null
  /** Robustez de la mínima varianza, que es la más sensible a los datos. */
  readonly robustness: RobustnessReport | null
  /** Errores que impiden parte o todo el análisis. */
  readonly errors: readonly CandidateRunError[]
  readonly disclaimer: string
}

const ETIQUETAS: Readonly<Record<string, string>> = {
  equalWeight: 'A partes iguales',
  minimumVariance: 'Mínima varianza',
  equalRiskContribution: 'Riesgo repartido',
}

/**
 * Genera y evalúa todas las candidatas.
 *
 * Se para antes de optimizar si las restricciones son contradictorias: sin
 * factibilidad, cualquier cartera que se devolviera incumpliría algo, y sería
 * peor entregarla que no entregarla.
 */
export function runCandidates(input: CandidateRunInput): CandidateRunResult {
  const compiled = compileConstraints(input.constraints, input.universe)
  const feasibility = assessFeasibility(compiled)
  const errors: CandidateRunError[] = []

  const base = {
    version: CANDIDATE_RUN_VERSION,
    compiled,
    feasibility,
    disclaimer: CANDIDATE_DISCLAIMER,
  }

  if (input.universe.length === 0) {
    return { ...base, candidates: [], metrics: null, robustness: null, errors: ['LAB_EMPTY_UNIVERSE'] }
  }

  if (!feasibility.feasible) {
    // Criterio de aceptación de LAB-611: entradas incompatibles devuelven este
    // código. El detalle de qué falla ya lo tiene `feasibility`.
    return {
      ...base,
      candidates: [],
      metrics: null,
      robustness: null,
      errors: ['LAB_CONSTRAINTS_INFEASIBLE'],
    }
  }

  const candidates: PortfolioCandidate[] = [candidateEqualWeight(compiled)]

  if (input.covariance === null) {
    // Sin historial no se puede optimizar riesgo, pero 1/N sigue valiendo: es
    // justamente la candidata que no estima nada.
    errors.push('LAB_COVARIANCE_UNAVAILABLE')
  } else {
    candidates.push(
      candidateMinimumVariance({ compiled, covariance: input.covariance }),
      candidateEqualRiskContribution({ compiled, covariance: input.covariance }),
    )
  }

  const evaluables: EvaluableCandidate[] = candidates.flatMap((c) =>
    c.weights === null
      ? []
      : [{ method: c.method, label: ETIQUETAS[c.method] ?? c.method, weights: c.weights }],
  )

  const metrics =
    input.covariance === null
      ? null
      : evaluateCandidates(evaluables, {
          compiled,
          covariance: input.covariance,
          currentWeights: input.currentWeights,
          totalValue: input.totalValue,
          ...(input.costs === undefined ? {} : { costs: input.costs }),
        }).metrics

  // Solo se analiza la robustez de la mínima varianza: es la más sensible a la
  // matriz, y hacerlo para todas multiplicaría el coste sin añadir información.
  const robustness =
    input.covariance === null
      ? null
      : assessRobustness({
          compiled,
          covariance: input.covariance,
          optimize: (cov) => candidateMinimumVariance({ compiled, covariance: cov }),
          seed: input.seed,
        })

  return { ...base, candidates, metrics, robustness, errors }
}
