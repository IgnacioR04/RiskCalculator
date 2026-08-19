/**
 * Biblioteca de escenarios (LAB-507).
 *
 * Junta los escenarios que trae la aplicación con los que escribe el usuario, y
 * gobierna las dos reglas que hacen que un catálogo mixto no se convierta en un
 * lío:
 *
 * 1. **Un escenario de la aplicación no se edita: se deriva.** Cambiar los
 *    shocks de «Recesión» y seguir llamándolo «Recesión» haría que dos
 *    resultados guardados con el mismo nombre no fueran comparables. Editar uno
 *    de fábrica crea una copia del usuario, con su propio identificador.
 * 2. **Editar uno propio sube su versión.** Es lo que permite mirar un resultado
 *    de hace tres meses y saber si la definición ha cambiado desde entonces.
 *
 * Función pura: recibe la lista del usuario y devuelve otra. No persiste nada.
 */
import type { ScenarioDefinition } from './contracts'
import { builtinDeterministicScenarios } from './deterministicScenario'
import { HISTORICAL_PERIODS, periodToDefinition } from './historicalScenario'

/** Prefijo de los escenarios derivados, para que se vean como tales. */
const PREFIJO_USUARIO = 'user:'

/** Todo lo que trae la aplicación de serie. */
export function builtinScenarios(): readonly ScenarioDefinition[] {
  return [...builtinDeterministicScenarios(), ...HISTORICAL_PERIODS.map(periodToDefinition)]
}

/**
 * El catálogo completo: lo de fábrica primero, lo del usuario después.
 *
 * Un escenario del usuario **no sustituye** a uno de fábrica con el mismo
 * identificador, porque no puede tenerlo: al derivar se le pone prefijo. Si aun
 * así llegara una colisión —un fichero importado a mano—, gana el de fábrica y
 * el otro se descarta: entre dos definiciones con el mismo nombre, la que se
 * puede reproducir es la que viene versionada con la aplicación.
 */
export function scenarioLibrary(
  userScenarios: readonly ScenarioDefinition[],
): readonly ScenarioDefinition[] {
  const fabrica = builtinScenarios()
  const ocupados = new Set(fabrica.map((d) => d.id))
  return [...fabrica, ...userScenarios.filter((d) => !ocupados.has(d.id))]
}

/**
 * Deriva un escenario editable a partir de cualquier otro.
 *
 * `sufijo` distingue la copia cuando se deriva varias veces del mismo origen;
 * quien llama es responsable de que sea único, y `addScenario` lo comprueba.
 */
export function deriveScenario(
  origen: ScenarioDefinition,
  cambios: Partial<Pick<ScenarioDefinition, 'name' | 'horizon' | 'params' | 'seed' | 'description'>>,
  sufijo: string,
): ScenarioDefinition {
  return {
    ...origen,
    ...cambios,
    id: `${PREFIJO_USUARIO}${origen.id}:${sufijo}`,
    // La copia arranca en 1: es una definición nueva, no la versión 2 de la
    // original. Heredar la versión mezclaría dos historias distintas.
    version: 1,
    name: cambios.name ?? `${origen.name} (copia)`,
    source: 'user',
  }
}

export function isUserScenario(definition: ScenarioDefinition): boolean {
  return definition.source === 'user'
}

export type LibraryError = 'duplicate_id' | 'builtin_not_editable' | 'not_found'

export type LibraryResult =
  | { readonly ok: true; readonly scenarios: readonly ScenarioDefinition[] }
  | { readonly ok: false; readonly reason: LibraryError }

/** Añade un escenario del usuario. Un identificador repetido se rechaza. */
export function addScenario(
  userScenarios: readonly ScenarioDefinition[],
  nuevo: ScenarioDefinition,
): LibraryResult {
  const ocupados = new Set([...builtinScenarios(), ...userScenarios].map((d) => d.id))
  if (ocupados.has(nuevo.id)) return { ok: false, reason: 'duplicate_id' }
  return { ok: true, scenarios: [...userScenarios, nuevo] }
}

/**
 * Modifica un escenario del usuario **subiendo su versión**.
 *
 * Uno de fábrica se rechaza: para cambiarlo hay que derivarlo primero. Sin esta
 * regla, dos resultados con el mismo `definitionId` y la misma `version` podrían
 * venir de definiciones distintas, y comparar sería mentir.
 */
export function updateScenario(
  userScenarios: readonly ScenarioDefinition[],
  id: string,
  cambios: Partial<Pick<ScenarioDefinition, 'name' | 'horizon' | 'params' | 'seed' | 'description'>>,
): LibraryResult {
  if (builtinScenarios().some((d) => d.id === id)) {
    return { ok: false, reason: 'builtin_not_editable' }
  }
  const indice = userScenarios.findIndex((d) => d.id === id)
  if (indice === -1) return { ok: false, reason: 'not_found' }

  const anterior = userScenarios[indice]!
  const actualizado: ScenarioDefinition = {
    ...anterior,
    ...cambios,
    version: anterior.version + 1,
  }
  return {
    ok: true,
    scenarios: userScenarios.map((d, i) => (i === indice ? actualizado : d)),
  }
}

/** Quita un escenario del usuario. Uno de fábrica no se puede quitar. */
export function removeScenario(
  userScenarios: readonly ScenarioDefinition[],
  id: string,
): LibraryResult {
  if (builtinScenarios().some((d) => d.id === id)) {
    return { ok: false, reason: 'builtin_not_editable' }
  }
  if (!userScenarios.some((d) => d.id === id)) return { ok: false, reason: 'not_found' }
  return { ok: true, scenarios: userScenarios.filter((d) => d.id !== id) }
}

/** Busca en el catálogo completo. */
export function findScenario(
  userScenarios: readonly ScenarioDefinition[],
  id: string,
): ScenarioDefinition | null {
  return scenarioLibrary(userScenarios).find((d) => d.id === id) ?? null
}
