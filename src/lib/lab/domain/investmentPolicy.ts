/**
 * Dominio de la política de inversión (LAB-202).
 *
 * Implementa lo decidido en `docs/adr/ADR-002-investment-policy.md`. Son tipos
 * puros: sin React, sin zod, sin nada de interfaz. La validación vive en
 * `../schemas/investmentPolicy.ts` y el cálculo del riesgo efectivo en LAB-203.
 *
 * La idea que sostiene todo el modelo: **tolerancia, capacidad y necesidad son
 * tres cosas distintas**. Están separadas en el tipo, no solo en la pantalla,
 * para que sea imposible rellenar una con otra por descuido.
 */
import type { Currency } from '../../domain'

/** Versión del contrato. Se guarda con cada política persistida. */
export const IPS_SCHEMA_VERSION = 1

/** Versión de la regla de riesgo efectivo bajo la que se calculó (ADR-002 §3). */
export const EFFECTIVE_RISK_RULE_VERSION = 1

/**
 * Banda de riesgo ordinal, de 1 a 5 (ADR-002 §1).
 *
 * Se comparan entre sí; no se promedian, no se interpolan y no se suman. El
 * riesgo efectivo es el mínimo de dos bandas, y eso exige un orden total.
 */
export type RiskBand = 1 | 2 | 3 | 4 | 5

export const RISK_BANDS: readonly RiskBand[] = [1, 2, 3, 4, 5]

/** Nombre y lectura en lenguaje llano de cada banda. Nunca se muestra el número solo. */
export const RISK_BAND_INFO: Readonly<Record<RiskBand, { nombre: string; lectura: string }>> = {
  1: { nombre: 'Muy baja', lectura: 'Preservar el capital por encima de todo.' },
  2: { nombre: 'Baja', lectura: 'Aceptar oscilaciones pequeñas.' },
  3: { nombre: 'Media', lectura: 'Aceptar caídas relevantes a cambio de crecimiento.' },
  4: { nombre: 'Alta', lectura: 'Aceptar caídas grandes y prolongadas.' },
  5: { nombre: 'Muy alta', lectura: 'Aceptar la posibilidad de pérdidas severas.' },
}

export type PolicyStatus = 'draft' | 'active' | 'superseded'

/* ── Evaluación: tres bloques que no se contaminan ────────────────────────── */

/**
 * Tolerancia: qué está **dispuesto** a soportar. Es una preferencia declarada.
 *
 * `band` es opcional por el mismo motivo que en la capacidad (LAB-208): un
 * cuestionario a medias no da una preferencia, da un hueco. Un valor central
 * puesto «mientras tanto» acabaría entrando en `min()` y produciendo un riesgo
 * efectivo que nadie ha declarado.
 */
export interface ToleranceAssessment {
  /** Respuestas del cuestionario de actitud, por identificador de pregunta. */
  readonly answers: Readonly<Record<string, string>>
  /** Solo se rellena con el cuestionario completo, o al migrar un perfil anterior. */
  readonly band?: RiskBand
  readonly assessedAt?: string
  /** De dónde salió la banda. Sin banda no hay procedencia. */
  readonly source?: ToleranceSource
}

/**
 * Procedencia de la banda de tolerancia.
 *
 * Hace falta distinguirlas porque se recalculan de forma distinta: la del
 * cuestionario se rehace en cada cambio, y la que viene del perfil anterior no
 * puede recalcularse —sus preguntas eran otras—, así que se conserva hasta que
 * el cuestionario nuevo dé un resultado. Sin esta marca, empezar a rellenar el
 * asistente borraría en silencio lo que la migración había traído.
 */
export type ToleranceSource = 'cuestionario' | 'perfil-anterior'

/**
 * Capacidad: qué **puede** soportar sin romper su plan. Son hechos objetivos.
 *
 * `band` es opcional a propósito. Si falta cualquiera de los hechos, la
 * capacidad queda **desconocida**, y ADR-002 prohíbe estimarla, tomar la
 * tolerancia como sustituto o asumir un valor por defecto.
 */
export interface CapacityAssessment {
  /** Años hasta necesitar el dinero. Entero no negativo. */
  readonly horizonYears?: number
  /** Meses de gasto cubiertos por el colchón de liquidez. */
  readonly emergencyFundMonths?: number
  readonly incomeStability?: 'estable' | 'variable' | 'incierta'
  readonly dependents?: number
  /** Fracción del patrimonio total que representa esta cartera, 0–1. */
  readonly shareOfNetWorth?: number
  /** Solo se rellena cuando todos los hechos anteriores están presentes. */
  readonly band?: RiskBand
  readonly assessedAt?: string
}

/**
 * Cambio sobre los hechos de capacidad.
 *
 * Existe aparte de `Partial<CapacityAssessment>` porque aquí `undefined` es un
 * valor con significado —«retira este dato»— y no la ausencia de la clave. Con
 * `exactOptionalPropertyTypes` esa diferencia importa, y conviene que importe:
 * retirar un hecho declarado es una acción, no un descuido.
 */
export type CapacityFactsUpdate = {
  readonly [K in keyof CapacityAssessment]?: CapacityAssessment[K] | undefined
}

/**
 * Necesidad: qué riesgo exigiría alcanzar los objetivos. Se **deriva**, no se
 * pregunta, y nunca sube el riesgo efectivo (ADR-002 §3).
 */
export interface NeedAssessment {
  readonly band: RiskBand
  /** Cómo se obtuvo, para poder explicarlo. */
  readonly derivedFrom: 'goals' | 'declared'
  readonly assessedAt: string
}

/**
 * Conocimientos y experiencia declarados (LAB-208).
 *
 * **No entra en el riesgo efectivo.** ADR-002 §3 fija `min(tolerancia,
 * capacidad)` y esta cuarta dimensión no aparece ahí: saber más no permite
 * perder más, y saber menos no reduce lo que alguien puede permitirse perder.
 * Sirve para avisar cuando un producto es más complejo que la experiencia
 * declarada, que es uno de los conflictos del documento de producto (§8.3).
 */
export interface KnowledgeAssessment {
  readonly answers: Readonly<Record<string, string>>
  readonly level?: KnowledgeLevel
  readonly assessedAt?: string
}

/** Escala ordinal de conocimientos. Se compara; no se promedia. */
export type KnowledgeLevel = 'basico' | 'medio' | 'avanzado'

export const KNOWLEDGE_LEVELS: readonly KnowledgeLevel[] = ['basico', 'medio', 'avanzado']

export const KNOWLEDGE_LEVEL_INFO: Readonly<Record<KnowledgeLevel, string>> = {
  basico: 'Poca o ninguna experiencia invirtiendo.',
  medio: 'Alguna experiencia con productos habituales.',
  avanzado: 'Experiencia amplia, incluidos productos complejos.',
}

export interface RiskAssessment {
  readonly tolerance: ToleranceAssessment
  readonly capacity: CapacityAssessment
  readonly need?: NeedAssessment
  readonly knowledge?: KnowledgeAssessment
}

/* ── Objetivos ────────────────────────────────────────────────────────────── */

export type GoalPriority = 'esencial' | 'importante' | 'deseable'

export interface InvestmentGoal {
  readonly id: string
  readonly name: string
  readonly priority: GoalPriority
  readonly currency: Currency
  /** Importe objetivo, positivo y finito. Como texto para no perder precisión. */
  readonly targetAmount: string
  /** Fecha objetivo, `YYYY-MM-DD`. */
  readonly targetDate: string
  /** Si la fecha puede moverse; entra en las salidas del conflicto. */
  readonly dateFlexible: boolean
  /** Si el importe puede ajustarse. */
  readonly amountFlexible: boolean
  readonly monthlyContribution?: string
  readonly notes?: string
}

/* ── Restricciones ────────────────────────────────────────────────────────── */

/** Dimensiones por las que se puede restringir un grupo de posiciones. */
export type ExposureDimension = 'assetType' | 'sector' | 'region' | 'currency' | 'issuer'

/**
 * Restricciones de cartera (documento 02 §6.4). Los pesos son fracciones 0–1,
 * nunca porcentajes: mezclar ambas escalas es una fuente clásica de errores de
 * dos órdenes de magnitud.
 */
export type PortfolioConstraint =
  | { readonly kind: 'assetWeight'; readonly instrumentId: string; readonly min?: number; readonly max?: number }
  | {
      readonly kind: 'groupWeight'
      readonly dimension: ExposureDimension
      readonly key: string
      readonly min?: number
      readonly max?: number
    }
  | { readonly kind: 'turnover'; readonly max: number }
  | { readonly kind: 'liquidity'; readonly minimumLiquidWeight: number }
  | { readonly kind: 'lockedPosition'; readonly instrumentId: string; readonly weight?: number }
  | { readonly kind: 'eligibleUniverse'; readonly instrumentIds: readonly string[] }
  | { readonly kind: 'contributionsOnly'; readonly enabled: true }

/* ── Plan de aportaciones y rebalanceo ────────────────────────────────────── */

export interface ContributionPlan {
  readonly amount: string
  readonly currency: Currency
  readonly frequency: 'mensual' | 'trimestral' | 'anual' | 'puntual'
  readonly startsOn?: string
}

/**
 * Política de rebalanceo. «No rebalancear» es una elección legítima y debe
 * poder declararse: dejarla implícita esconde una decisión.
 */
export type RebalancePolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'calendar'; readonly everyMonths: number }
  | { readonly kind: 'bands'; readonly toleranceBand: number }

/** Supuestos declarados bajo los que se construyó la política. */
export interface PolicyAssumptions {
  /** Inflación anual asumida, fracción. */
  readonly inflation?: number
  /** Tipo libre de riesgo anual asumido, fracción. */
  readonly riskFreeRate?: number
  readonly taxTreatment?: 'ignorado' | 'estimado'
  readonly notes?: string
}

/** Confirmación explícita del usuario. Sin ella la política no se activa. */
export interface PolicyAcknowledgement {
  readonly kind: 'perfil-confirmado' | 'conflicto-aceptado' | 'migracion-confirmada'
  readonly acknowledgedAt: string
  readonly note?: string
}

/* ── La política ──────────────────────────────────────────────────────────── */

export interface InvestmentPolicy {
  readonly schemaVersion: number
  readonly id: string
  readonly userId?: string
  /** Versión de la política. Cada cambio material incrementa (ADR-002 §7). */
  readonly version: number
  readonly status: PolicyStatus
  readonly effectiveFrom: string
  readonly reviewedAt?: string
  /** `effectiveFrom` + 12 meses (ADR-002 §5). */
  readonly nextReviewAt?: string
  readonly baseCurrency: Currency
  readonly assessment: RiskAssessment
  /**
   * Riesgo efectivo ya resuelto. Opcional porque **sin capacidad medida no
   * existe**: el motor de LAB-203 lo deja ausente en vez de inventarlo.
   */
  readonly effectiveRisk?: RiskBand
  readonly effectiveRiskRuleVersion: number
  readonly liquidityReserveMonths?: number
  readonly goals: readonly InvestmentGoal[]
  readonly constraints: readonly PortfolioConstraint[]
  readonly contributionPlan?: ContributionPlan
  readonly rebalancePolicy: RebalancePolicy
  readonly assumptions: PolicyAssumptions
  readonly acknowledgements: readonly PolicyAcknowledgement[]
}

/* ── Migración desde el perfil actual ─────────────────────────────────────── */

/**
 * Mapeo de las tres categorías actuales a bandas (ADR-002 §1).
 *
 * Va al centro del rango y **nunca a los extremos**: el cuestionario de hoy no
 * distingue «muy baja» de «baja», así que asignar 1 o 5 afirmaría más de lo que
 * se preguntó. El resultado exige confirmación antes de activarse.
 */
export const BAND_FROM_LEGACY_CATEGORY: Readonly<Record<string, RiskBand>> = {
  conservador: 2,
  moderado: 3,
  dinamico: 4,
}
