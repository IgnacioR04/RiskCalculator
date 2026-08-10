/**
 * Motor de riesgo efectivo y conflictos (LAB-203).
 *
 * Función pura y determinista: mismos datos y misma versión de regla, mismo
 * resultado y mismos códigos. Sin red, sin store, sin fechas implícitas —el
 * «hoy» se pasa como argumento— para que sea reproducible.
 *
 * Implementa `docs/adr/ADR-002-investment-policy.md` §3 a §5.
 */
import {
  EFFECTIVE_RISK_RULE_VERSION,
  type CapacityAssessment,
  type InvestmentPolicy,
  type RiskAssessment,
  type RiskBand,
} from '../domain/investmentPolicy'

/**
 * Códigos estables. Son parte del contrato: la interfaz traduce el código a
 * texto, y un cambio de redacción no debe alterar el código.
 */
export type PolicyReasonCode =
  /** No se puede calcular el riesgo efectivo. */
  | 'capacity_missing'
  /** La necesidad supera lo que tolerancia y capacidad permiten. */
  | 'need_exceeds_effective'
  /** La capacidad limita por debajo de la tolerancia. */
  | 'capacity_limits_tolerance'
  /** Tolerancia y capacidad coinciden. */
  | 'tolerance_matches_capacity'
  /** La tolerancia limita por debajo de la capacidad. */
  | 'tolerance_limits_capacity'
  /** La política no declara necesidad, así que no puede haber conflicto por ella. */
  | 'need_not_assessed'
  /** La revisión está próxima. */
  | 'review_due_soon'
  /** La política ha caducado: se suspende la personalización. */
  | 'policy_expired'

/** Hechos objetivos que debe traer la capacidad para poder resolverse. */
const HECHOS_DE_CAPACIDAD = [
  'horizonYears',
  'emergencyFundMonths',
  'incomeStability',
  'dependents',
  'shareOfNetWorth',
] as const satisfies readonly (keyof CapacityAssessment)[]

export interface PolicyAssessmentResult {
  /**
   * Riesgo efectivo, o `null` cuando no puede calcularse. **Nunca se estima**:
   * sin capacidad medida no hay número, y eso no es un error, es un estado.
   */
  readonly effectiveRisk: RiskBand | null
  /** Qué falta para poder calcularlo. Vacío si no falta nada. */
  readonly missingCapacityFacts: readonly (keyof CapacityAssessment)[]
  /**
   * Hay conflicto cuando la necesidad supera al riesgo efectivo. Es una
   * situación legítima de la política, **no un error de datos**.
   */
  readonly hasConflict: boolean
  /** Salidas ofrecidas ante el conflicto. Ninguna sube el riesgo. */
  readonly conflictOptions: readonly ConflictOption[]
  /** Estado temporal de la política. */
  readonly validity: 'vigente' | 'por-revisar' | 'caducada' | 'sin-revision'
  /** Si la personalización puede usarse. */
  readonly personalizationAllowed: boolean
  /** Códigos ordenados de forma estable. */
  readonly reasonCodes: readonly PolicyReasonCode[]
  readonly ruleVersion: number
}

/**
 * Salidas ante un conflicto (ADR-002 §4). Son exactamente las cinco del plan y
 * **ninguna consiste en subir el riesgo**: necesitar más rentabilidad no
 * aumenta lo que alguien puede permitirse perder.
 */
export type ConflictOption =
  | 'increase_contribution'
  | 'extend_horizon'
  | 'reduce_target'
  | 'acknowledge_and_review'
  | 'seek_professional_advice'

export const CONFLICT_OPTIONS: readonly ConflictOption[] = [
  'increase_contribution',
  'extend_horizon',
  'reduce_target',
  'acknowledge_and_review',
  'seek_professional_advice',
]

/** Meses antes de la revisión en los que se empieza a avisar (ADR-002 §5). */
export const REVIEW_WARNING_MONTHS = 2

/** Qué hechos objetivos faltan para poder resolver la capacidad. */
export function missingCapacityFacts(
  capacity: CapacityAssessment,
): readonly (keyof CapacityAssessment)[] {
  return HECHOS_DE_CAPACIDAD.filter((hecho) => capacity[hecho] === undefined)
}

/**
 * Riesgo efectivo: `min(tolerancia, capacidad)`.
 *
 * Devuelve `null` si la capacidad no está resuelta. No se sustituye por la
 * tolerancia, no se estima y no se asume un valor por defecto: es el criterio
 * de aceptación de ADR-002 y el error que este modelo existe para evitar.
 */
export function computeEffectiveRisk(assessment: RiskAssessment): RiskBand | null {
  const capacidad = assessment.capacity.band
  if (capacidad === undefined) return null
  if (missingCapacityFacts(assessment.capacity).length > 0) return null
  return Math.min(assessment.tolerance.band, capacidad) as RiskBand
}

/** Meses completos entre dos fechas `YYYY-MM-DD`. Negativo si la segunda es anterior. */
function mesesEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00Z`)
  const b = new Date(`${hasta}T00:00:00Z`)
  const meses =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  return b.getUTCDate() < a.getUTCDate() ? meses - 1 : meses
}

/**
 * Evalúa la política a una fecha dada.
 *
 * `today` es un parámetro y no `new Date()` a propósito: un motor que lee el
 * reloj por su cuenta no es reproducible, y estos resultados deben poder
 * recalcularse igual meses después.
 */
export function assessPolicy(policy: InvestmentPolicy, today: string): PolicyAssessmentResult {
  const codigos: PolicyReasonCode[] = []

  const faltan = missingCapacityFacts(policy.assessment.capacity)
  const effectiveRisk = computeEffectiveRisk(policy.assessment)

  if (effectiveRisk === null) {
    codigos.push('capacity_missing')
  } else {
    const tolerancia = policy.assessment.tolerance.band
    const capacidad = policy.assessment.capacity.band as RiskBand
    if (capacidad < tolerancia) codigos.push('capacity_limits_tolerance')
    else if (capacidad > tolerancia) codigos.push('tolerance_limits_capacity')
    else codigos.push('tolerance_matches_capacity')
  }

  const necesidad = policy.assessment.need?.band
  const hasConflict = effectiveRisk !== null && necesidad !== undefined && necesidad > effectiveRisk
  if (necesidad === undefined) codigos.push('need_not_assessed')
  else if (hasConflict) codigos.push('need_exceeds_effective')

  let validity: PolicyAssessmentResult['validity'] = 'sin-revision'
  if (policy.nextReviewAt !== undefined) {
    const meses = mesesEntre(today, policy.nextReviewAt)
    if (meses < 0) {
      validity = 'caducada'
      codigos.push('policy_expired')
    } else if (meses < REVIEW_WARNING_MONTHS) {
      validity = 'por-revisar'
      codigos.push('review_due_soon')
    } else {
      validity = 'vigente'
    }
  }

  // Caducar suspende la personalización, no el acceso: el análisis descriptivo
  // sigue disponible (ADR-002 §5).
  const personalizationAllowed =
    effectiveRisk !== null && policy.status === 'active' && validity !== 'caducada'

  return {
    effectiveRisk,
    missingCapacityFacts: faltan,
    hasConflict,
    conflictOptions: hasConflict ? CONFLICT_OPTIONS : [],
    validity,
    personalizationAllowed,
    // Orden estable: mismos datos, misma secuencia de códigos.
    reasonCodes: [...codigos].sort(),
    ruleVersion: EFFECTIVE_RISK_RULE_VERSION,
  }
}
