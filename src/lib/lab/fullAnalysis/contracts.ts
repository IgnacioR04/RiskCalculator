/**
 * Contratos del análisis automático de cartera (LAB-1201).
 *
 * El Laboratorio tenía catorce motores y ninguna forma de decir «esto es el
 * diagnóstico completo de esta cartera, en esta fecha, con estas versiones».
 * Cada pantalla llamaba a lo suyo y el resultado se perdía al navegar.
 *
 * ## La regla que sostiene todo el módulo
 *
 * **Un dato ausente nunca se representa con un cero.** Un cero es una
 * afirmación: dice «esto vale cero». No tener el dato dice otra cosa muy
 * distinta, y confundirlos es cómo una pantalla acaba enseñando una
 * volatilidad del 0 % para una cartera de la que no se sabe nada.
 *
 * De ahí `ResultState<T>`: cada resultado dice si está disponible, si falta
 * información, si la pregunta no aplica o si algo se rompió. Los cuatro son
 * estados legítimos y los cuatro se pintan distinto.
 */
import type { Currency } from '../../domain'

/* ── Ámbito ────────────────────────────────────────────────────────────────── */

/**
 * Qué se analiza.
 *
 * `portfolio` es la suma consolidada de todas las cuentas. Un informe de cuenta
 * usa **solo** las posiciones, operaciones y efectivo de esa cuenta: mezclarlas
 * daría un informe que no corresponde a nada que el usuario pueda ver.
 */
export type AnalysisScope =
  | { readonly kind: 'portfolio' }
  | { readonly kind: 'account'; readonly accountId: string }

/** Clave estable de un ámbito, para índices y cachés. */
export function scopeKey(scope: AnalysisScope): string {
  return scope.kind === 'portfolio' ? 'portfolio' : `account:${scope.accountId}`
}

/* ── Estado de un resultado ────────────────────────────────────────────────── */

export type ResultState<T> =
  | {
      readonly status: 'available'
      readonly value: T
      /** Fecha de los datos con los que se calculó, `YYYY-MM-DD`. */
      readonly asOf: string
      readonly observations?: number
      /** Fracción de la cartera cubierta, 0–1. */
      readonly coverage?: number
      readonly source?: string
      readonly assumptions?: readonly string[]
    }
  | {
      readonly status: 'insufficient'
      readonly reasonCode: string
      readonly message: string
      /** Qué haría falta. Un bloqueo sin salida no es un aviso útil. */
      readonly required?: readonly string[]
    }
  | {
      readonly status: 'notApplicable'
      readonly reasonCode: string
      readonly message: string
    }
  | {
      readonly status: 'error'
      readonly errorCode: string
      readonly message: string
      readonly retryable: boolean
    }

export const available = <T>(
  value: T,
  asOf: string,
  extra?: Omit<Extract<ResultState<T>, { status: 'available' }>, 'status' | 'value' | 'asOf'>,
): ResultState<T> => ({ status: 'available', value, asOf, ...extra })

export const insufficient = <T>(
  reasonCode: string,
  message: string,
  required?: readonly string[],
): ResultState<T> => ({
  status: 'insufficient',
  reasonCode,
  message,
  ...(required === undefined ? {} : { required }),
})

export const notApplicable = <T>(reasonCode: string, message: string): ResultState<T> => ({
  status: 'notApplicable',
  reasonCode,
  message,
})

/* ── Etapas ────────────────────────────────────────────────────────────────── */

/**
 * Etapas del análisis, en orden.
 *
 * Existe como lista y no como cadena suelta porque la interfaz tiene que poder
 * decir «3 de 6» sin saberse el nombre de ninguna.
 */
export const ANALYSIS_STAGES = [
  'snapshot',
  'localMetrics',
  'marketData',
  'quality',
  'riskAndDependence',
  'diagnosis',
] as const

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number]

export const STAGE_LABEL: Readonly<Record<AnalysisStage, string>> = {
  snapshot: 'Ordenando tus posiciones',
  localMetrics: 'Midiendo concentración',
  marketData: 'Descargando historial',
  quality: 'Comprobando cobertura',
  riskAndDependence: 'Calculando riesgo y dependencia',
  diagnosis: 'Redactando conclusiones',
}

/**
 * Estado global de una ejecución.
 *
 * `partial` no es un estado de transición cosmético: significa que hay
 * resultados publicados y utilizables mientras otros siguen calculándose, y es
 * lo que permite enseñar la concentración sin esperar a la red.
 */
export type AnalysisStatus =
  | 'empty'
  | 'normalizing'
  | 'loadingMarketData'
  | 'partial'
  | 'calculating'
  | 'ready'
  | 'insufficient'
  | 'error'
  | 'stale'

/* ── Hallazgos y limitaciones ──────────────────────────────────────────────── */

export type FindingAction =
  | 'complete_data'
  | 'define_profile'
  | 'review_limit'
  | 'review_concentration'
  | 'reduce_overlap'
  | 'review_liquidity'
  | 'research_diversifier'
  | 'review_goal'
  | 'reject_unstable_optimization'

export interface PortfolioFinding {
  readonly code: string
  readonly severity: 'info' | 'attention' | 'critical'
  readonly confidence: 'low' | 'medium' | 'high'
  /** Una frase. La narrativa se construye desde el código, no al revés. */
  readonly claim: string
  readonly evidenceIds: readonly string[]
  readonly affectedWeight?: number
  readonly affectedValue?: number
  readonly actionType: FindingAction
  readonly route: string
  readonly limitations: readonly string[]
}

export interface AnalysisLimitation {
  readonly code: string
  readonly message: string
  /** Qué parte del informe queda afectada. */
  readonly affects: readonly string[]
}

/**
 * Orden de prioridad de los hallazgos.
 *
 * Los datos que invalidan cálculos van primero **siempre**: enseñar una
 * conclusión sobre concentración antes de avisar de que falta la mitad de los
 * precios es dar por buena una cifra que no lo es.
 */
export const FINDING_PRIORITY: readonly FindingAction[] = [
  'complete_data',
  'define_profile',
  'review_limit',
  'review_concentration',
  'reduce_overlap',
  'review_liquidity',
  'review_goal',
  'research_diversifier',
  'reject_unstable_optimization',
]

/* ── Entrada y salida ──────────────────────────────────────────────────────── */

/** Posición ya normalizada, con su valor resuelto en divisa de presentación. */
export interface AnalysisPosition {
  readonly assetId: string
  readonly symbol: string
  readonly assetType: string
  readonly accountId: string
  /** Valor en divisa de presentación, o `null` si no se pudo valorar. */
  readonly value: number | null
  readonly quantity: number
}

export interface PortfolioSnapshot {
  readonly asOf: string
  readonly baseCurrency: Currency
  readonly positions: readonly AnalysisPosition[]
  readonly totalValue: number
  /** Símbolos sin precio. Se nombran, no se cuentan como cero. */
  readonly unvalued: readonly string[]
  readonly weights: readonly number[]
}

export interface ConcentrationSummary {
  readonly top1: number
  readonly top5: number
  readonly hhi: number
  readonly effectivePositions: number
  readonly positions: number
}

export interface DataQualitySummary {
  /** Fracción del valor con precio conocido. */
  readonly pricedCoverage: number
  /** Fracción del valor con historia suficiente. */
  readonly historyCoverage: number
  readonly missingSeries: readonly string[]
  readonly stalestPriceDays: number | null
}

export interface RiskSummary {
  readonly annualizedVolatility: number
  readonly maxDrawdown: number
  readonly observations: number
}

/**
 * El informe.
 *
 * Lleva dentro **todo lo necesario para reproducirlo**: qué cartera, qué
 * ámbito, en qué fecha, con qué versiones. Un informe que no se puede volver a
 * producir no se puede defender ante uno mismo dentro de seis meses.
 */
export interface PortfolioHealthReport {
  readonly runId: string
  readonly fingerprint: string
  readonly scope: AnalysisScope
  readonly asOf: string
  readonly createdAt: string
  readonly modelVersion: string
  readonly status: AnalysisStatus
  /** Etapas ya terminadas, en orden de finalización. */
  readonly completedStages: readonly AnalysisStage[]
  readonly snapshot: ResultState<PortfolioSnapshot>
  readonly concentration: ResultState<ConcentrationSummary>
  readonly quality: ResultState<DataQualitySummary>
  readonly risk: ResultState<RiskSummary>
  readonly findings: readonly PortfolioFinding[]
  readonly limitations: readonly AnalysisLimitation[]
}

export const FULL_ANALYSIS_MODEL_VERSION = 'full-analysis-v1'
