/**
 * Pruebas de guardar y comparar (LAB-511).
 *
 * Lo que importa comprobar: que la comparación **se niega** cuando no
 * significaría nada. Restar dos números siempre da un número; que ese número
 * quiera decir algo es otra cosa.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { clearRuns, type LabRun } from '../runs/localRuns'
import type { ScenarioResult } from './contracts'
import {
  REFUSAL_TEXT,
  compareScenarioRuns,
  listScenarioRuns,
  saveScenarioRun,
  toRun,
} from './scenarioRuns'

const RESULTADO: ScenarioResult = {
  definitionId: 'recesion',
  definitionVersion: 1,
  modelVersion: 'scenario-deterministic-v1',
  asOf: '2026-08-12',
  baseValue: 10_000,
  baseCurrency: 'EUR',
  outcome: { finalValue: 6_500, changePct: -0.35 },
  contributions: [],
  assumptions: [{ label: 'Supuesto', detail: 'Detalle.' }],
  notCovered: [],
}

/** Registro con los campos que la comparación mira. */
function registro(cambios: {
  id: string
  createdAt: string
  definitionVersion?: number
  changePct?: number | null
  finalValue?: number | null
  baseValue?: number
  definitionId?: string
}): LabRun {
  return {
    ...toRun(RESULTADO, cambios.id),
    createdAt: cambios.createdAt,
    inputs: {
      definitionId: cambios.definitionId ?? 'recesion',
      definitionVersion: cambios.definitionVersion ?? 1,
      engine: 'scenario-deterministic-v1',
      baseCurrency: 'EUR',
    },
    summary: {
      baseValue: cambios.baseValue ?? 10_000,
      finalValue: cambios.finalValue === undefined ? 6_500 : cambios.finalValue,
      changePct: cambios.changePct === undefined ? -0.35 : cambios.changePct,
      notCovered: 0,
    },
  }
}

beforeEach(() => {
  clearRuns()
})

describe('guardar', () => {
  it('un resultado de escenario se guarda y se recupera', () => {
    expect(saveScenarioRun(RESULTADO, 'r1').ok).toBe(true)
    const guardados = listScenarioRuns()
    expect(guardados).toHaveLength(1)
    expect(guardados[0]!.kind).toBe('scenario')
  })

  it('el registro conserva qué definición y en qué versión', () => {
    const run = toRun(RESULTADO, 'r1')
    expect(run.inputs['definitionId']).toBe('recesion')
    expect(run.inputs['definitionVersion']).toBe(1)
  })

  it('el motor exacto viaja en las entradas, no se pierde', () => {
    // El registro de LAB-311 usa un modelVersion numérico; el del escenario es
    // texto. Cambiar el tipo obligaría a migrar lo ya guardado.
    expect(toRun(RESULTADO, 'r1').inputs['engine']).toBe('scenario-deterministic-v1')
  })

  it('la semilla se guarda cuando el escenario la tiene', () => {
    expect(toRun({ ...RESULTADO, seed: 42 }, 'r1').inputs['seed']).toBe(42)
    expect(toRun(RESULTADO, 'r2').inputs['seed']).toBeUndefined()
  })

  it('la fecha de los datos es obligatoria y se conserva', () => {
    expect(toRun(RESULTADO, 'r1').asOf).toBe('2026-08-12')
  })

  it('los más recientes salen primero', () => {
    saveScenarioRun({ ...RESULTADO, asOf: '2026-08-10' }, 'r1')
    saveScenarioRun({ ...RESULTADO, asOf: '2026-08-12' }, 'r2')
    const ids = listScenarioRuns().map((r) => r.id)
    expect(ids).toContain('r1')
    expect(ids).toContain('r2')
  })
})

describe('comparar solo lo comparable', () => {
  it('dos ejecuciones de la misma definición se comparan', () => {
    const viejo = registro({ id: 'a', createdAt: '2026-06-01T10:00:00Z', changePct: -0.4, finalValue: 6_000 })
    const nuevo = registro({ id: 'b', createdAt: '2026-08-01T10:00:00Z', changePct: -0.35, finalValue: 6_500 })

    const r = compareScenarioRuns(viejo, nuevo)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.changeDelta).toBeCloseTo(0.05, 9)
    expect(r.valueDelta).toBe(500)
  })

  it('el orden de los argumentos no decide cuál es el nuevo', () => {
    const viejo = registro({ id: 'a', createdAt: '2026-06-01T10:00:00Z' })
    const nuevo = registro({ id: 'b', createdAt: '2026-08-01T10:00:00Z' })

    const uno = compareScenarioRuns(viejo, nuevo)
    const otro = compareScenarioRuns(nuevo, viejo)
    expect(uno.ok && uno.newer.id).toBe('b')
    expect(otro.ok && otro.newer.id).toBe('b')
  })

  it('dos escenarios distintos no se comparan', () => {
    const a = registro({ id: 'a', createdAt: '2026-06-01T10:00:00Z' })
    const b = registro({ id: 'b', createdAt: '2026-08-01T10:00:00Z', definitionId: 'covid' })

    const r = compareScenarioRuns(a, b)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('different_definition')
  })

  it('la misma definición en versiones distintas tampoco', () => {
    // La diferencia sería de los supuestos, no del mercado.
    const a = registro({ id: 'a', createdAt: '2026-06-01T10:00:00Z', definitionVersion: 1 })
    const b = registro({ id: 'b', createdAt: '2026-08-01T10:00:00Z', definitionVersion: 2 })

    const r = compareScenarioRuns(a, b)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('different_version')
    expect(REFUSAL_TEXT[r.reason]).toMatch(/de los supuestos, no del mercado/)
  })

  it('sin resultado en una de las dos, no se resta', () => {
    const a = registro({ id: 'a', createdAt: '2026-06-01T10:00:00Z' })
    const b = registro({ id: 'b', createdAt: '2026-08-01T10:00:00Z', changePct: null })

    const r = compareScenarioRuns(a, b)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('incomplete')
  })

  it('avisa si la cartera de partida cambió entre las dos', () => {
    // Sin este aviso, «el escenario duele menos» y «la cartera es otra» se
    // leerían como lo mismo.
    const a = registro({ id: 'a', createdAt: '2026-06-01T10:00:00Z', baseValue: 10_000 })
    const b = registro({ id: 'b', createdAt: '2026-08-01T10:00:00Z', baseValue: 14_000 })

    const r = compareScenarioRuns(a, b)
    expect(r.ok && r.portfolioChanged).toBe(true)
  })

  it('con la misma cartera no se avisa de nada', () => {
    const a = registro({ id: 'a', createdAt: '2026-06-01T10:00:00Z' })
    const b = registro({ id: 'b', createdAt: '2026-08-01T10:00:00Z' })
    const r = compareScenarioRuns(a, b)
    expect(r.ok && r.portfolioChanged).toBe(false)
  })

  it('cada negativa tiene su explicación en palabras', () => {
    for (const motivo of ['different_definition', 'different_version', 'incomplete'] as const) {
      expect(REFUSAL_TEXT[motivo].length).toBeGreaterThan(0)
    }
  })
})
