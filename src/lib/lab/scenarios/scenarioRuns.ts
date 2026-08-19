/**
 * Guardar y comparar resultados de escenario (LAB-511).
 *
 * Se apoya en el registro local de `LAB-311` en vez de crear otro almacén: un
 * cálculo de escenario es exactamente lo mismo que un cálculo de estabilidad
 * —material reconstruible, con `modelVersion` y `asOf` obligatorios— y tener dos
 * registros con reglas parecidas pero no idénticas es cómo se acaba con dos
 * verdades.
 *
 * ## Qué significa comparar
 *
 * Dos resultados solo son comparables si vienen de la **misma definición en la
 * misma versión**. Comparar «Recesión v1» con «Recesión v2» daría una diferencia
 * que parece del mercado y es de la definición: alguien cambió los shocks. Por
 * eso la comparación devuelve un motivo cuando no procede, en vez de restar dos
 * números que no se pueden restar.
 *
 * Función pura salvo `saveScenarioRun`, que delega la escritura en `localRuns`.
 */
import { saveRun, listRuns, type LabRun, type SaveOutcome } from '../runs/localRuns'
import type { ScenarioResult } from './contracts'

/**
 * Convierte un resultado de escenario en un registro guardable.
 *
 * `modelVersion` del registro es numérico y el del escenario es texto
 * (`scenario-deterministic-v1`), así que el texto viaja en `inputs`, donde no se
 * pierde. Cambiar el tipo del registro obligaría a migrar los ya guardados por
 * `LAB-311`, y eso no lo justifica una diferencia de formato.
 */
export function toRun(result: ScenarioResult, id: string): LabRun {
  return {
    id,
    kind: 'scenario',
    modelVersion: 1,
    asOf: result.asOf,
    createdAt: new Date().toISOString(),
    inputs: {
      definitionId: result.definitionId,
      definitionVersion: result.definitionVersion,
      engine: result.modelVersion,
      baseCurrency: result.baseCurrency,
      ...(result.seed === undefined ? {} : { seed: result.seed }),
    },
    summary: {
      baseValue: result.baseValue,
      finalValue: result.outcome.finalValue,
      changePct: result.outcome.changePct,
      notCovered: result.notCovered.length,
    },
  }
}

export function saveScenarioRun(result: ScenarioResult, id: string): SaveOutcome {
  return saveRun(toRun(result, id))
}

/** Registros de escenario guardados, del más reciente al más antiguo. */
export function listScenarioRuns(): readonly LabRun[] {
  return listRuns()
    .filter((r) => r.kind === 'scenario')
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/* ── Comparación ───────────────────────────────────────────────────────────── */

export type ComparisonRefusal =
  /** Definiciones distintas: no miden lo mismo. */
  | 'different_definition'
  /** Misma definición, versión distinta: alguien cambió qué significa. */
  | 'different_version'
  /** A alguno le falta el resultado. */
  | 'incomplete'

export type ScenarioComparison =
  | {
      readonly ok: true
      /** Diferencia de cambio porcentual, en puntos. Positivo = el nuevo va mejor. */
      readonly changeDelta: number
      /** Diferencia de valor final, en divisa de presentación. */
      readonly valueDelta: number
      /** `true` si el valor de partida también cambió: la cartera no es la misma. */
      readonly portfolioChanged: boolean
      readonly older: LabRun
      readonly newer: LabRun
    }
  | { readonly ok: false; readonly reason: ComparisonRefusal }

const numero = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

/**
 * Compara dos ejecuciones del mismo escenario.
 *
 * Se niega —con motivo— cuando la comparación no significaría nada. Restar dos
 * números siempre da un número; que ese número quiera decir algo es otra cosa.
 */
export function compareScenarioRuns(a: LabRun, b: LabRun): ScenarioComparison {
  if (a.inputs['definitionId'] !== b.inputs['definitionId']) {
    return { ok: false, reason: 'different_definition' }
  }
  if (a.inputs['definitionVersion'] !== b.inputs['definitionVersion']) {
    return { ok: false, reason: 'different_version' }
  }

  const [older, newer] = a.createdAt <= b.createdAt ? [a, b] : [b, a]

  const cambioViejo = numero(older.summary['changePct'])
  const cambioNuevo = numero(newer.summary['changePct'])
  const valorViejo = numero(older.summary['finalValue'])
  const valorNuevo = numero(newer.summary['finalValue'])

  if (cambioViejo === null || cambioNuevo === null || valorViejo === null || valorNuevo === null) {
    return { ok: false, reason: 'incomplete' }
  }

  return {
    ok: true,
    changeDelta: cambioNuevo - cambioViejo,
    valueDelta: valorNuevo - valorViejo,
    // Si el valor de partida cambió, la diferencia no es «el escenario duele
    // menos»: es que la cartera es otra. Sin este aviso se leerían como lo
    // mismo.
    portfolioChanged: numero(older.summary['baseValue']) !== numero(newer.summary['baseValue']),
    older,
    newer,
  }
}

/** Motivo en palabras, para poder enseñarlo sin traducirlo en cada pantalla. */
export const REFUSAL_TEXT: Readonly<Record<ComparisonRefusal, string>> = {
  different_definition: 'Son escenarios distintos: no miden lo mismo.',
  different_version:
    'Es el mismo escenario pero la definición cambió entre las dos ejecuciones. La diferencia sería de los supuestos, no del mercado.',
  incomplete: 'A alguna de las dos ejecuciones le falta el resultado.',
}
