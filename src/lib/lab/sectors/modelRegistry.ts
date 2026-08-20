/**
 * Registro de modelos (LAB-702).
 *
 * Una señal no es código: es **una hipótesis con una versión**. Y las hipótesis
 * se invalidan.
 *
 * Este módulo existe para poder decir «la señal de momentum estuvo activa entre
 * marzo y septiembre, con esta fórmula, y se retiró porque su validación dejó de
 * sostenerla». Sin él, retirar una señal sería borrar código, y todos los
 * resultados que produjo se quedarían sin explicación.
 *
 * ## Las dos reglas
 *
 * 1. **Una sola versión activa por señal.** Dos activas a la vez significan que
 *    dos resultados con la misma etiqueta vienen de fórmulas distintas, y
 *    compararlos sería mentir.
 * 2. **Retirar no es borrar.** Una versión retirada conserva su hipótesis, su
 *    fórmula y las fechas en que rigió. Los resultados antiguos siguen siendo
 *    explicables.
 *
 * ## Alcance
 *
 * `LAB-702` pedía una tabla en Supabase con escritura de servicio.
 * [`ADR-006`](../../../../docs/adr/ADR-006-scenario-persistence-and-execution.md)
 * ya estableció que este proyecto es local primero y que la cartera no viaja;
 * un registro de modelos que solo consume el propio usuario no es una excepción
 * a eso. Se implementa **puro**, sobre el estado local, y la migración queda
 * pospuesta hasta que haya más de un consumidor.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export const MODEL_REGISTRY_VERSION = 'model-registry-v1'

/**
 * Ciclo de vida de una versión.
 *
 * El orden importa y solo se avanza: un modelo retirado no vuelve a `draft`. Si
 * hace falta reintentarlo, se registra una versión nueva, y así queda constancia
 * de que hubo dos intentos.
 */
export type ModelState = 'draft' | 'validated' | 'active' | 'retired'

export interface ModelVersion {
  /** Qué señal es. Estable entre versiones: `sector.momentum`. */
  readonly modelKey: string
  /** Versión dentro de esa señal. Empieza en 1. */
  readonly version: number
  readonly state: ModelState
  /**
   * La hipótesis, en una frase falsable.
   *
   * Es obligatoria. Una señal sin hipótesis no se puede invalidar, y una señal
   * que no se puede invalidar no es una señal.
   */
  readonly hypothesis: string
  /** Cómo se falsa. También obligatorio, por el mismo motivo. */
  readonly falsification: string
  /** Commit del repositorio en que se definió, para poder volver a leerlo. */
  readonly commitSha?: string
  /** Fecha de registro, `YYYY-MM-DD`. */
  readonly createdAt: string
  /** Desde cuándo rige, si llegó a activarse. */
  readonly activatedAt?: string
  /** Cuándo se retiró y por qué. */
  readonly retiredAt?: string
  readonly retiredReason?: string
}

export type Registry = readonly ModelVersion[]

export type RegistryError =
  | 'duplicate_version'
  | 'missing_hypothesis'
  | 'invalid_transition'
  | 'not_found'
  | 'already_active'

export type RegistryResult =
  | { readonly ok: true; readonly registry: Registry }
  | { readonly ok: false; readonly reason: RegistryError }

export const REGISTRY_ERROR_TEXT: Readonly<Record<RegistryError, string>> = {
  duplicate_version: 'Ya existe esa versión de esa señal.',
  missing_hypothesis:
    'Una señal sin hipótesis falsable no se puede invalidar, así que no se puede registrar.',
  invalid_transition: 'Ese cambio de estado no está permitido.',
  not_found: 'No existe esa versión de esa señal.',
  already_active:
    'Ya hay otra versión activa de esa señal. Retírala primero: dos activas harían incomparables dos resultados con la misma etiqueta.',
}

/** Transiciones permitidas. Solo se avanza. */
const TRANSICIONES: Readonly<Record<ModelState, readonly ModelState[]>> = {
  draft: ['validated', 'retired'],
  validated: ['active', 'retired'],
  active: ['retired'],
  retired: [],
}

export function canTransition(desde: ModelState, hacia: ModelState): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/** Registra una versión nueva, siempre en `draft`. */
export function registerModel(
  registry: Registry,
  modelo: Omit<ModelVersion, 'state'>,
): RegistryResult {
  if (modelo.hypothesis.trim() === '' || modelo.falsification.trim() === '') {
    return { ok: false, reason: 'missing_hypothesis' }
  }
  if (registry.some((m) => m.modelKey === modelo.modelKey && m.version === modelo.version)) {
    return { ok: false, reason: 'duplicate_version' }
  }
  return { ok: true, registry: [...registry, { ...modelo, state: 'draft' }] }
}

/**
 * Cambia el estado de una versión.
 *
 * Activar exige que no haya otra activa de la misma señal. No se retira la otra
 * automáticamente: retirar es una decisión con motivo, y hacerlo de tapadillo
 * dejaría un modelo retirado sin explicación de por qué.
 */
export function transitionModel(
  registry: Registry,
  modelKey: string,
  version: number,
  hacia: ModelState,
  extra: { readonly on: string; readonly reason?: string },
): RegistryResult {
  const indice = registry.findIndex((m) => m.modelKey === modelKey && m.version === version)
  if (indice === -1) return { ok: false, reason: 'not_found' }

  const actual = registry[indice]!
  if (!canTransition(actual.state, hacia)) return { ok: false, reason: 'invalid_transition' }

  if (hacia === 'active' && registry.some((m) => m.modelKey === modelKey && m.state === 'active')) {
    return { ok: false, reason: 'already_active' }
  }

  const actualizado: ModelVersion = {
    ...actual,
    state: hacia,
    ...(hacia === 'active' ? { activatedAt: extra.on } : {}),
    ...(hacia === 'retired'
      ? { retiredAt: extra.on, retiredReason: extra.reason ?? 'Sin motivo declarado' }
      : {}),
  }

  return { ok: true, registry: registry.map((m, i) => (i === indice ? actualizado : m)) }
}

/** La versión activa de una señal, si la hay. */
export function activeModel(registry: Registry, modelKey: string): ModelVersion | null {
  return registry.find((m) => m.modelKey === modelKey && m.state === 'active') ?? null
}

/** Todas las versiones de una señal, de más reciente a más antigua. */
export function historyFor(registry: Registry, modelKey: string): Registry {
  return registry
    .filter((m) => m.modelKey === modelKey)
    .slice()
    .sort((a, b) => b.version - a.version)
}

/**
 * ¿Se puede publicar un resultado de esta señal?
 *
 * Solo si hay una versión activa. Un modelo en borrador o validado se puede
 * calcular para evaluarlo, pero **no se enseña como resultado**: la diferencia
 * entre probar algo y publicarlo es justo lo que este registro protege.
 */
export function isPublishable(registry: Registry, modelKey: string): boolean {
  return activeModel(registry, modelKey) !== null
}
