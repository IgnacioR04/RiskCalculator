/**
 * Contratos de escenario (LAB-501).
 *
 * Un escenario es **una pregunta con supuestos declarados**, no una predicción.
 * «¿Qué le pasa a mi cartera si la bolsa cae un 30 %?» es una pregunta legítima;
 * «la bolsa va a caer un 30 %» no es algo que esta aplicación diga nunca.
 *
 * Todo lo que hay aquí existe para que un resultado se pueda **volver a
 * producir** meses después y se pueda **explicar**. Eso exige cuatro cosas, y
 * las cuatro son obligatorias por tipo, no por convención:
 *
 * 1. **Tipo y horizonte.** Sin ellos un escenario no significa nada: «cae un
 *    30 %» no es lo mismo en un día que en cinco años. El tipo `ScenarioDefinition`
 *    hace **imposible** construir uno sin las dos cosas, que es el criterio de
 *    aceptación de LAB-501.
 * 2. **Versión de la definición.** Si mañana se cambia qué significa
 *    «Recesión 2008», el resultado guardado ayer deja de ser comparable. Con
 *    versión se sabe; sin versión, se comparan cosas distintas creyendo que son
 *    la misma.
 * 3. **Semilla**, cuando hay azar. Sin ella «he vuelto a ejecutarlo y sale otra
 *    cosa» es indistinguible de un error.
 * 4. **Supuestos escritos.** No en un comentario del código: en el dato, para
 *    que la pantalla no pueda enseñar el número sin ellos.
 */
import type { AssetType, Currency } from '../../domain'

/** Versión del formato de escenarios. Un cambio incompatible la sube. */
export const SCENARIO_SCHEMA_VERSION = 1

/* ── Horizonte ─────────────────────────────────────────────────────────────── */

/**
 * Cuánto dura el escenario.
 *
 * Se guarda en días **y** con su unidad original: «12 meses» y «365 días» se
 * calculan igual pero no se leen igual, y quien lo escribió eligió una de las
 * dos por algo.
 */
export interface ScenarioHorizon {
  readonly amount: number
  readonly unit: 'days' | 'months' | 'years'
}

/** Días de mercado que representa un horizonte. Aproximación declarada. */
export function horizonInTradingDays(horizon: ScenarioHorizon): number {
  const PORaÑO = 252
  switch (horizon.unit) {
    case 'days':
      return Math.round(horizon.amount)
    case 'months':
      return Math.round((horizon.amount * PORaÑO) / 12)
    case 'years':
      return Math.round(horizon.amount * PORaÑO)
  }
}

/* ── Supuestos ─────────────────────────────────────────────────────────────── */

/**
 * Un supuesto del escenario, en palabras.
 *
 * Existe como dato y no como comentario para que la interfaz **no pueda**
 * enseñar el resultado sin enseñar de qué depende. Es el mismo mecanismo que
 * `VAR_DISCLAIMER` en `LAB-309` y `DOWNSIDE_CONDITION` en `LAB-411`.
 */
export interface ScenarioAssumption {
  readonly label: string
  readonly detail: string
}

/* ── Parámetros por tipo ───────────────────────────────────────────────────── */

/** Shock instantáneo sobre la valoración actual. No hay trayectoria. */
export interface DeterministicParams {
  readonly kind: 'deterministic'
  /** Caída o subida aplicada a todo, como fracción. −0,2 es −20 %. */
  readonly general?: number
  readonly byType?: Partial<Record<AssetType, number>>
  readonly byAsset?: Readonly<Record<string, number>>
  /** Movimiento de la divisa extranjera frente a la de presentación. */
  readonly fxForeign?: number
}

/** Reproducir un tramo del pasado sobre la cartera de hoy. */
export interface HistoricalParams {
  readonly kind: 'historical'
  readonly from: string
  readonly to: string
}

/** Remuestreo por bloques de la historia disponible. */
export interface BootstrapParams {
  readonly kind: 'bootstrap'
  /** Longitud del bloque en días. Conserva la dependencia dentro del bloque. */
  readonly blockDays: number
  readonly paths: number
}

/** ¿Llego a mi objetivo? Se responde con frecuencia de cumplimiento. */
export interface GoalParams {
  readonly kind: 'goal'
  /** Importe objetivo en divisa de presentación. */
  readonly target: number
  /** Aportación periódica, si la hay. */
  readonly contribution?: { readonly amount: number; readonly everyDays: number }
}

export type ScenarioParams =
  | DeterministicParams
  | HistoricalParams
  | BootstrapParams
  | GoalParams

export type ScenarioKind = ScenarioParams['kind']

/* ── Definición ────────────────────────────────────────────────────────────── */

/**
 * La definición completa de un escenario.
 *
 * El tipo hace estructuralmente imposible que exista sin `params` (que lleva el
 * tipo dentro) y sin `horizon`. No hay ninguna ruta que construya uno a medias:
 * es el criterio de aceptación garantizado por construcción, no por acordarse.
 */
export interface ScenarioDefinition {
  readonly id: string
  readonly name: string
  /** Sube cuando cambia lo que el escenario significa. */
  readonly version: number
  readonly horizon: ScenarioHorizon
  readonly params: ScenarioParams
  /** Semilla del generador. Obligatoria si el escenario tiene azar. */
  readonly seed?: number
  readonly assumptions: readonly ScenarioAssumption[]
  readonly description?: string
  /** De dónde salió: un preset de la aplicación o el usuario. */
  readonly source: 'builtin' | 'user'
}

/** ¿Este tipo de escenario usa azar? Si sí, la semilla es obligatoria. */
export function isStochastic(kind: ScenarioKind): boolean {
  return kind === 'bootstrap' || kind === 'goal'
}

/* ── Resultado ─────────────────────────────────────────────────────────────── */

/** Una trayectoria resumida por percentiles, no punto a punto. */
export interface PathSummary {
  readonly p05: number
  readonly p25: number
  readonly p50: number
  readonly p75: number
  readonly p95: number
}

export interface ScenarioOutcome {
  /** Valor de la cartera al final, en divisa de presentación. */
  readonly finalValue: number | null
  /** Cambio sobre el valor de partida, como fracción. */
  readonly changePct: number | null
  /** Distribución de valores finales, si el escenario produce muchas. */
  readonly distribution?: PathSummary
  /** Fracción de trayectorias que alcanzan el objetivo, en escenarios `goal`. */
  readonly successRate?: number
  /** Peor caída dentro del recorrido, si hay trayectoria. */
  readonly maxDrawdown?: number
}

/**
 * El resultado de ejecutar un escenario.
 *
 * Lleva dentro **todo lo necesario para reproducirlo**: qué definición, en qué
 * versión, con qué modelo, sobre qué valor de partida y en qué fecha. Un
 * resultado sin esos campos no se puede volver a producir, y uno que no se
 * puede reproducir no se puede defender ante uno mismo dentro de seis meses.
 */
export interface ScenarioResult {
  readonly definitionId: string
  readonly definitionVersion: number
  /** Versión del motor que lo calculó. */
  readonly modelVersion: string
  /** Fecha de los datos usados, `YYYY-MM-DD`. */
  readonly asOf: string
  /** Semilla efectivamente usada, si el escenario tenía azar. */
  readonly seed?: number
  readonly baseValue: number
  readonly baseCurrency: Currency
  readonly outcome: ScenarioOutcome
  /** Contribución de cada posición al resultado. */
  readonly contributions: readonly ScenarioContribution[]
  /** Supuestos vigentes, copiados de la definición en el momento del cálculo. */
  readonly assumptions: readonly ScenarioAssumption[]
  /** Lo que no se ha podido calcular, nombrado en vez de omitido. */
  readonly notCovered: readonly string[]
}

export interface ScenarioContribution {
  readonly assetId: string
  readonly symbol: string
  readonly before: number
  readonly after: number
  /** Cuánto del cambio total viene de esta posición, como fracción. */
  readonly shareOfChange: number | null
}
