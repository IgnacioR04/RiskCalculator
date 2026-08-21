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
  /**
   * Momento del precio usado para valorarla, ISO 8601.
   *
   * `undefined` cuando no hay precio, o cuando lo hay pero sin fecha —un precio
   * escrito a mano hace meses y otro de hace un minuto no se pueden distinguir
   * sin esto, y la antigüedad del dato es justo lo que hay que saber para
   * decidir cuánto fiarse del informe.
   */
  readonly priceAsOf?: string
}

export interface PortfolioSnapshot {
  readonly asOf: string
  readonly baseCurrency: Currency
  readonly positions: readonly AnalysisPosition[]
  /** Suma del valor **conocido**. No es el valor de la cartera si falta alguno. */
  readonly knownValue: number
  /** Símbolos sin precio. Se nombran, no se cuentan como cero. */
  readonly unvalued: readonly string[]
  /**
   * Peso de cada posición, `null` cuando no se conoce su valor.
   *
   * Un peso de 0 diría que esa posición no pesa nada en la cartera. Lo que
   * ocurre es que no se sabe cuánto pesa, y son cosas distintas: la primera
   * invita a ignorarla, la segunda a completarla.
   */
  readonly weights: readonly (number | null)[]
  /** Identidad de la valoración usada, para no mezclar dos conjuntos de precios. */
  readonly valuationVersion: string
}

/**
 * Concentración.
 *
 * Los campos son anulables **a propósito**. `concentration()` devuelve `null`
 * cuando no hay valores positivos, y la primera versión de este módulo
 * convertía ese `null` en `0`. Un HHI de 0 significaría «reparto infinitamente
 * diversificado», que es lo contrario de «no se sabe»: exactamente el tipo de
 * cero inventado que el resto del Laboratorio existe para evitar.
 */
export interface ConcentrationSummary {
  readonly top1: number | null
  readonly top5: number | null
  readonly hhi: number | null
  readonly effectivePositions: number | null
  /** Cuántas posiciones entraron en el cálculo, con valor conocido. */
  readonly positions: number
  /** Por qué falta lo que falta. Vacío si está todo. */
  readonly reasonCode?: string
}

export interface DataQualitySummary {
  /**
   * Cobertura por valor, o `null` si no se puede calcular.
   *
   * `null` cuando hay posiciones sin valorar: el denominador tendría que ser el
   * valor total de la cartera, y precisamente ese es el que no se conoce.
   * Dividir el valor conocido entre sí mismo daba **100 % con la mitad de la
   * cartera sin precio**, que es la peor cifra posible: tranquilizadora y falsa.
   */
  readonly pricedCoverage: number | null
  /** Cobertura por número de posiciones. Siempre calculable. */
  readonly pricedCoverageByCount: number
  /** Fracción del valor conocido con historia suficiente. */
  readonly historyCoverage: number
  readonly missingSeries: readonly string[]
  /** Instrumentos que se pidieron y no llegaron, con su motivo. */
  readonly failures: readonly { readonly symbol: string; readonly reason: string }[]
  readonly stalestPriceDays: number | null
}

export interface RiskSummary {
  readonly annualizedVolatility: number
  /**
   * Caída máxima, o `null` si no se pudo medir.
   *
   * Un fallo de `maxDrawdown` no puede convertirse en `0`: diría que la cartera
   * nunca ha caído, que es una afirmación fuerte y probablemente falsa.
   */
  readonly maxDrawdown: number | null
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
  /**
   * Identidad completa: estructura, valoración y configuración de modelo.
   *
   * Dos informes con pesos distintos **no pueden** compartirla. Es lo que
   * garantiza que un informe nuevo no se guarde encima de otro que respondía a
   * otra pregunta.
   */
  readonly fingerprint: string
  readonly structuralFingerprint: string
  readonly valuationVersion: string
  readonly modelConfigFingerprint: string
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
