/**
 * Escenario determinista (LAB-502).
 *
 * Envuelve el motor de estrés que ya existe (`lib/finance/stress.ts`) para que
 * hable el idioma de los escenarios: definición versionada, supuestos escritos
 * y resultado reproducible.
 *
 * **No se toca una sola línea de la aritmética.** Esa es la condición del
 * envoltorio: si además se corrigiera algo, una diferencia numérica posterior
 * sería imposible de atribuir al envoltorio o a la corrección. La paridad la
 * sostienen las pruebas doradas de `stress.test.ts`, que siguen pasando, y las
 * de aquí, que comprueban que el escenario da exactamente lo mismo que
 * `applyStress` con los mismos shocks.
 *
 * Los presets de siempre adquieren definición versionada al pasar por
 * `presetToDefinition`, que es el criterio de aceptación de LAB-502.
 */
import type { Currency } from '../../domain'
import { applyStress, type StressPosition } from '../../finance/stress'
import { STRESS_PRESETS, type StressPreset } from '../../finance/stressPresets'
import type {
  ScenarioContribution,
  ScenarioDefinition,
  ScenarioResult,
} from './contracts'

/** Versión del motor. Sube si cambia cómo se calcula, no qué se pregunta. */
export const DETERMINISTIC_MODEL_VERSION = 'scenario-deterministic-v1'

/**
 * Supuestos comunes a todo escenario determinista.
 *
 * Van en el dato y no en la interfaz para que ninguna pantalla pueda enseñar el
 * resultado sin ellos. Es lo mismo que se hizo con el aviso del VaR (LAB-309):
 * si la advertencia vive en el componente, el primer componente nuevo se la
 * deja.
 */
export const DETERMINISTIC_ASSUMPTIONS = [
  {
    label: 'Es un «qué pasaría si», no una previsión',
    detail:
      'Los shocks los eliges tú o vienen de un preset. La aplicación no afirma que vayan a ocurrir, ni con qué probabilidad.',
  },
  {
    label: 'Golpe instantáneo, sin recorrido',
    detail:
      'Se aplica sobre la valoración de hoy y se mira el resultado. No hay trayectoria intermedia, así que no hay caída máxima ni recuperación que medir.',
  },
  {
    label: 'La cartera no reacciona',
    detail:
      'Nadie vende, nadie compra y nadie rebalancea durante el golpe. Una cartera real haría alguna de las tres cosas.',
  },
  {
    label: 'La divisa se aproxima por la de cotización',
    detail:
      'El shock de divisa se aplica a lo que cotiza en moneda distinta a la de presentación, no a la exposición económica real del subyacente.',
  },
] as const

/**
 * Convierte un preset de siempre en una definición versionada.
 *
 * La versión arranca en 1 y **es del preset, no del catálogo**: cambiar los
 * shocks de «Recesión» tiene que subir su versión para que un resultado
 * guardado antes no se compare con uno de después creyendo que son lo mismo.
 */
export function presetToDefinition(preset: StressPreset): ScenarioDefinition {
  return {
    id: preset.id,
    name: preset.name,
    version: 1,
    // Un shock instantáneo no tiene duración real. Se declara un día para que
    // el horizonte exista —el contrato lo exige— y para que quede escrito que
    // esto no es un escenario a un año.
    horizon: { amount: 1, unit: 'days' },
    params: {
      kind: 'deterministic',
      ...(preset.general === undefined ? {} : { general: preset.general }),
      ...(preset.byType === undefined ? {} : { byType: preset.byType }),
      ...(preset.fxForeign === undefined ? {} : { fxForeign: preset.fxForeign }),
    },
    assumptions: [...DETERMINISTIC_ASSUMPTIONS],
    description: preset.description,
    source: 'builtin',
  }
}

/** Los presets de la aplicación, ya como definiciones de escenario. */
export function builtinDeterministicScenarios(): readonly ScenarioDefinition[] {
  return STRESS_PRESETS.map(presetToDefinition)
}

export interface RunDeterministicInput {
  readonly definition: ScenarioDefinition
  readonly positions: readonly StressPosition[]
  readonly displayCurrency: Currency
  /** Fecha de los datos usados, `YYYY-MM-DD`. Entra como argumento: sin reloj implícito. */
  readonly asOf: string
  /**
   * Posiciones que quedaron fuera por no tener valoración.
   *
   * Lo sabe quien construye la lista, no este motor: aquí solo llegan las que ya
   * tienen valor. Se pasa para que el resultado pueda **nombrar lo que no
   * cubre** en vez de presentar un total al que le falta un trozo sin decirlo.
   */
  readonly unvalued?: readonly string[]
}

/**
 * Ejecuta un escenario determinista.
 *
 * Delega la aritmética entera en `applyStress`. Lo que añade es el contexto que
 * hace el resultado reproducible y explicable.
 */
export function runDeterministicScenario(input: RunDeterministicInput): ScenarioResult {
  const { definition, positions, displayCurrency, asOf } = input

  if (definition.params.kind !== 'deterministic') {
    throw new Error(
      `runDeterministicScenario recibió un escenario de tipo «${definition.params.kind}»`,
    )
  }
  const params = definition.params

  const resultado = applyStress(positions, {
    ...(params.general === undefined ? {} : { general: params.general }),
    ...(params.byType === undefined ? {} : { byType: params.byType }),
    ...(params.byAsset === undefined ? {} : { byAsset: params.byAsset }),
    ...(params.fxForeign === undefined ? {} : { fxForeign: params.fxForeign }),
    displayCurrency,
  })

  const cambioTotal = resultado.totalChange.toNumber()

  const contributions: ScenarioContribution[] = resultado.positions.map((p) => {
    // `StressedPosition` extiende `StressPosition`, así que `p.value` sigue
    // siendo el valor de partida: no hay que ir a buscarlo a ninguna parte.
    const before = Number(p.value)
    const after = p.stressedValue.toNumber()
    return {
      assetId: p.assetId,
      symbol: p.symbol,
      before,
      after,
      // Sin cambio total no hay reparto que hacer: `null` en vez de dividir
      // entre cero y devolver un infinito con pinta de dato.
      shareOfChange: cambioTotal === 0 ? null : (after - before) / cambioTotal,
    }
  })

  const notCovered = (input.unvalued ?? []).map((symbol) => `${symbol}: sin valoración`)

  return {
    definitionId: definition.id,
    definitionVersion: definition.version,
    modelVersion: DETERMINISTIC_MODEL_VERSION,
    asOf,
    baseValue: resultado.totalBefore.toNumber(),
    baseCurrency: displayCurrency,
    outcome: {
      finalValue: resultado.totalAfter.toNumber(),
      changePct: resultado.totalChangePct === null ? null : resultado.totalChangePct.toNumber(),
    },
    contributions,
    assumptions: definition.assumptions,
    notCovered,
  }
}
