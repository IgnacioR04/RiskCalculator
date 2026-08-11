/**
 * Dominio de la calidad de datos (LAB-210).
 *
 * Implementa el contrato del documento 02 §8. Son tipos puros: sin React, sin
 * red y sin conocer de dónde salen los datos. Quién los evalúa de verdad son los
 * adaptadores de LAB-211, que sí saben de precios, FX e historia.
 *
 * La idea que sostiene todo el modelo: **un dato ausente no es un cero**. Un
 * activo sin precio conocido no vale 0 €, y una serie sin observaciones no tiene
 * volatilidad 0. Tratar la ausencia como un número es el error que convierte una
 * cartera mal medida en una cartera aparentemente perfecta, y por eso aquí la
 * ausencia tiene tipo propio en todas partes.
 */

/* ── Dimensiones ──────────────────────────────────────────────────────────── */

/** Las ocho dimensiones del documento 02 §8.1. */
export type DataQualityDimension =
  /** ¿Existe el dato? */
  | 'availability'
  /** ¿Está entero, o faltan piezas? */
  | 'completeness'
  /** ¿Es lo bastante reciente para lo que se va a hacer con él? */
  | 'freshness'
  /** ¿Encaja con el resto de los datos? */
  | 'consistency'
  /** ¿Cumple su contrato: rangos, formatos, signos? */
  | 'validity'
  /** ¿Cubre el periodo que el cálculo necesita? */
  | 'temporalCoverage'
  /** ¿De dónde viene y cuánto se puede confiar en esa fuente? */
  | 'sourceReliability'
  /**
   * ¿Refleja lo que se sabía entonces, o lo que se sabe ahora? Un dato
   * revisado a posteriori usado como si hubiera estado disponible en su día
   * produce resultados que nadie podría haber obtenido.
   */
  | 'pointInTime'

export const DATA_QUALITY_DIMENSIONS: readonly DataQualityDimension[] = [
  'availability',
  'completeness',
  'freshness',
  'consistency',
  'validity',
  'temporalCoverage',
  'sourceReliability',
  'pointInTime',
]

/* ── Estado ───────────────────────────────────────────────────────────────── */

/**
 * Estado agregado de un cálculo (documento 02 §8.2).
 *
 * `insufficient` e `invalid` son distintos a propósito: al primero le faltan
 * datos y se arregla consiguiéndolos; el segundo tiene datos que se contradicen,
 * y conseguir más no lo arregla.
 */
export type DataQualityStatus = 'good' | 'partial' | 'insufficient' | 'stale' | 'invalid'

/** Cómo se lee cada estado. Nunca se enseña el identificador a secas. */
export const DATA_QUALITY_STATUS_INFO: Readonly<
  Record<DataQualityStatus, { readonly nombre: string; readonly lectura: string }>
> = {
  good: {
    nombre: 'Suficiente',
    lectura: 'Los datos cubren lo que este cálculo necesita.',
  },
  partial: {
    nombre: 'Parcial',
    lectura: 'Se puede calcular, pero el resultado no cubre toda la cartera.',
  },
  insufficient: {
    nombre: 'Insuficiente',
    lectura: 'Faltan datos para calcularlo sin inventar nada.',
  },
  stale: {
    nombre: 'Desactualizado',
    lectura: 'Los datos existen pero son viejos para lo que se va a hacer con ellos.',
  },
  invalid: {
    nombre: 'Incoherente',
    lectura: 'Los datos se contradicen entre sí. Más datos no lo arreglan.',
  },
}

/* ── Incidencias ──────────────────────────────────────────────────────────── */

export type DataQualityScope =
  | 'portfolio'
  | 'instrument'
  | 'series'
  | 'classification'
  | 'model'

/**
 * Códigos estables. Son parte del contrato: la interfaz traduce el código a
 * texto, y reescribir el mensaje no debe cambiar el código.
 */
export type DataQualityIssueCode =
  /** La cobertura en capital no llega al mínimo del cálculo. */
  | 'coverage_below_minimum'
  /** La muestra no llega al mínimo exigido. */
  | 'sample_below_minimum'
  /** Hay muestra suficiente para calcular, pero menos de la deseable. */
  | 'sample_below_preferred'
  /** Hay posiciones cuyo valor se desconoce: la cobertura no se puede afirmar. */
  | 'value_unknown'
  /** No hay nada que medir. */
  | 'no_data'
  /** El dato existe pero es viejo para el uso previsto. */
  | 'data_stale'
  /** Los datos se contradicen: una cobertura mayor que el total, un valor negativo. */
  | 'inconsistent_values'

/**
 * Qué puede hacer el usuario para desbloquearlo (documento 01 §6.2, «Acciones»).
 *
 * Es un código y no una frase suelta por el mismo motivo que los demás: el texto
 * cambia, la acción no.
 */
export type RemediationCode =
  | 'update_prices'
  | 'enter_manually'
  | 'add_history'
  | 'exclude_asset'
  | 'complete_portfolio'
  | 'review_inputs'
  | 'wait_for_data'

export const REMEDIATION_TEXT: Readonly<Record<RemediationCode, string>> = {
  update_prices: 'Actualiza los precios de la cartera.',
  enter_manually: 'Introduce el dato a mano si lo conoces.',
  add_history: 'Añade más historial de precios, o elige un periodo más corto.',
  exclude_asset: 'Excluye del análisis los activos sin datos, sabiendo qué parte dejas fuera.',
  complete_portfolio: 'Completa las posiciones que faltan para que el total cuadre.',
  review_inputs: 'Revisa los datos introducidos: hay valores que no encajan entre sí.',
  wait_for_data: 'Vuelve a intentarlo cuando haya datos nuevos.',
}

/** Valores comparables que caben en un mensaje. Nada de objetos opacos. */
export type ObservedValue = number | string

interface DataQualityIssueBase {
  readonly code: DataQualityIssueCode
  readonly dimension: DataQualityDimension
  readonly scope: DataQualityScope
  /** A qué se refiere, cuando el alcance no es la cartera entera. */
  readonly entityId?: string
  /** Clave de traducción. El texto vive en la interfaz, no aquí. */
  readonly messageKey: string
  readonly observed?: ObservedValue
  readonly required?: ObservedValue
}

/**
 * Incidencia de calidad.
 *
 * El tipo está partido por severidad a propósito: **una incidencia que bloquea
 * obliga a declarar cómo se desbloquea**. Es el criterio de aceptación de
 * LAB-210, y aquí no depende de que alguien se acuerde de rellenarlo: sin
 * `remediation`, un `severity: 'blocking'` no compila.
 *
 * Los avisos también pueden traerla, pero no se les exige: hay avisos que solo
 * describen, como «esta serie es más corta de lo deseable».
 */
export type DataQualityIssue =
  | (DataQualityIssueBase & {
      readonly severity: 'info' | 'warning'
      readonly remediation?: RemediationCode
    })
  | (DataQualityIssueBase & {
      readonly severity: 'blocking'
      readonly remediation: RemediationCode
    })

export type DataQualitySeverity = DataQualityIssue['severity']

/** ¿Impide este conjunto de incidencias seguir adelante? */
export function hasBlockingIssues(issues: readonly DataQualityIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'blocking')
}
