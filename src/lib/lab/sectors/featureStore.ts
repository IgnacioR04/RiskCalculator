/**
 * Almacén de observaciones sectoriales (LAB-704).
 *
 * Guarda el valor de una señal para un sector en una fecha, **con las tres
 * fechas que hacen falta para no mentir después**:
 *
 * - `observedAt`: a qué fecha se refiere el dato.
 * - `availableAt`: cuándo estuvo disponible para quien lo consultara. Nunca
 *   anterior a `observedAt`.
 * - `ingestedAt`: cuándo entró en el almacén.
 *
 * ## Por qué tres y no una
 *
 * El precio de cierre del 31 de marzo se refiere al 31 de marzo, pero no está
 * disponible hasta que el mercado cierra, y no entra en el almacén hasta que
 * alguien lo descarga. Si solo se guardara una fecha, un backtest podría usar el
 * cierre del 31 a las nueve de la mañana del 31, que es información que nadie
 * tenía.
 *
 * ## La regla que gobierna el módulo
 *
 * **No se reescribe el pasado que ya usó una ejecución.** Es el criterio de
 * aceptación de LAB-704. Cuando un proveedor corrige un dato, la corrección
 * entra como una **observación nueva** con su propia `availableAt`; la anterior
 * se marca como corregida pero no desaparece.
 *
 * Si se sobrescribiera, un resultado calculado ayer dejaría de ser reproducible
 * hoy, y nadie sabría por qué cambió.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export const FEATURE_STORE_VERSION = 'sector-features-v1'

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

export interface FeatureObservation {
  /** Qué señal. Coincide con `modelKey` del registro de modelos. */
  readonly modelKey: string
  /** Versión de la señal que produjo el valor. */
  readonly featureVersion: number
  readonly sector: string
  /** A qué fecha se refiere el dato. */
  readonly observedAt: string
  /** Desde cuándo estuvo disponible. Nunca anterior a `observedAt`. */
  readonly availableAt: string
  /** Cuándo entró en el almacén. */
  readonly ingestedAt: string
  /**
   * El valor, o `null` si la señal no se pudo calcular.
   *
   * `null` es un dato: significa «se intentó y no había muestra». Distinto de
   * que la observación no exista, que significa «no se intentó».
   */
  readonly value: number | null
  /** Por qué no hay valor, cuando no lo hay. */
  readonly missingReason?: string
  /** De dónde salió el precio con que se calculó. */
  readonly source: string
  /** `true` si una observación posterior la corrigió. */
  readonly corrected?: boolean
}

export type FeatureStore = readonly FeatureObservation[]

export type FeatureError =
  | 'invalid_date'
  | 'available_before_observed'
  | 'duplicate_observation'
  | 'missing_reason'

export type FeatureResult =
  | { readonly ok: true; readonly store: FeatureStore }
  | { readonly ok: false; readonly reason: FeatureError; readonly detail: string }

export const FEATURE_ERROR_TEXT: Readonly<Record<FeatureError, string>> = {
  invalid_date: 'Las fechas tienen que ser YYYY-MM-DD y existir en el calendario.',
  available_before_observed:
    'Un dato no puede estar disponible antes de la fecha a la que se refiere: eso sería información del futuro.',
  duplicate_observation:
    'Ya existe esa observación con esa fecha de disponibilidad. Para corregirla, registra una corrección.',
  missing_reason: 'Una observación sin valor tiene que decir por qué: «null» sin motivo no informa.',
}

function fechaValida(valor: string): boolean {
  if (!ES_FECHA.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

const mismaClave = (a: FeatureObservation, b: FeatureObservation) =>
  a.modelKey === b.modelKey &&
  a.sector === b.sector &&
  a.observedAt === b.observedAt &&
  a.featureVersion === b.featureVersion

/** Añade una observación. No sobrescribe nada. */
export function putObservation(
  store: FeatureStore,
  observacion: FeatureObservation,
): FeatureResult {
  for (const fecha of [observacion.observedAt, observacion.availableAt, observacion.ingestedAt]) {
    if (!fechaValida(fecha)) {
      return { ok: false, reason: 'invalid_date', detail: FEATURE_ERROR_TEXT.invalid_date }
    }
  }
  if (observacion.availableAt < observacion.observedAt) {
    return {
      ok: false,
      reason: 'available_before_observed',
      detail: FEATURE_ERROR_TEXT.available_before_observed,
    }
  }
  if (observacion.value === null && (observacion.missingReason ?? '').trim() === '') {
    return { ok: false, reason: 'missing_reason', detail: FEATURE_ERROR_TEXT.missing_reason }
  }
  if (
    store.some((o) => mismaClave(o, observacion) && o.availableAt === observacion.availableAt)
  ) {
    return {
      ok: false,
      reason: 'duplicate_observation',
      detail: FEATURE_ERROR_TEXT.duplicate_observation,
    }
  }

  return { ok: true, store: [...store, observacion] }
}

/**
 * Registra una corrección de un dato anterior.
 *
 * La observación corregida **se conserva** y se marca; la nueva entra con una
 * `availableAt` posterior. Así, una consulta a la fecha en que se calculó un
 * resultado antiguo sigue devolviendo el dato que se usó entonces.
 */
export function correctObservation(
  store: FeatureStore,
  correccion: FeatureObservation,
): FeatureResult {
  const alta = putObservation(store, correccion)
  if (!alta.ok) return alta

  return {
    ok: true,
    store: alta.store.map((o) =>
      mismaClave(o, correccion) && o.availableAt < correccion.availableAt
        ? { ...o, corrected: true }
        : o,
    ),
  }
}

/**
 * El valor que alguien habría visto en `asOf`.
 *
 * Devuelve la observación con la `availableAt` más reciente **que no sea
 * posterior a `asOf`**. Es lo que hace el almacén point-in-time: una corrección
 * publicada mañana no altera lo que se sabía ayer.
 */
export function observationAsOf(
  store: FeatureStore,
  modelKey: string,
  sector: string,
  observedAt: string,
  asOf: string,
): FeatureObservation | null {
  const candidatas = store
    .filter(
      (o) =>
        o.modelKey === modelKey &&
        o.sector === sector &&
        o.observedAt === observedAt &&
        o.availableAt <= asOf,
    )
    .slice()
    .sort((a, b) => a.availableAt.localeCompare(b.availableAt))

  return candidatas.at(-1) ?? null
}

/** Todos los sectores con observación disponible en `asOf`, para una señal. */
export function snapshotAsOf(
  store: FeatureStore,
  modelKey: string,
  observedAt: string,
  asOf: string,
): readonly FeatureObservation[] {
  const sectores = [...new Set(store.filter((o) => o.modelKey === modelKey).map((o) => o.sector))]
  return sectores
    .flatMap((sector) => {
      const o = observationAsOf(store, modelKey, sector, observedAt, asOf)
      return o === null ? [] : [o]
    })
    .sort((a, b) => a.sector.localeCompare(b.sector))
}

/** Historial completo de una observación, incluidas sus correcciones. */
export function historyOf(
  store: FeatureStore,
  modelKey: string,
  sector: string,
  observedAt: string,
): readonly FeatureObservation[] {
  return store
    .filter((o) => o.modelKey === modelKey && o.sector === sector && o.observedAt === observedAt)
    .slice()
    .sort((a, b) => a.availableAt.localeCompare(b.availableAt))
}
