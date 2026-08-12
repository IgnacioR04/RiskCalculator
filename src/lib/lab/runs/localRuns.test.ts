/**
 * Pruebas del registro local de cálculos (LAB-311).
 *
 * La ficha pide round-trip, migración de esquema y error de cuota; el criterio
 * de aceptación es que lo guardado conserve `modelVersion` y `asOf`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RUNS,
  RUNS_SCHEMA_VERSION,
  clearRuns,
  getRun,
  isReproducible,
  listRuns,
  migrar,
  saveRun,
  type LabRun,
} from './localRuns'

function run(cambio: Partial<LabRun> = {}): LabRun {
  return {
    id: 'run-1',
    kind: 'stability',
    modelVersion: 1,
    asOf: '2026-08-11',
    createdAt: '2026-08-11T09:00:00Z',
    inputs: { period: 365, currency: 'EUR' },
    summary: { volatility: 0.18, sharpe: 0.9 },
    ...cambio,
  }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('ACEPTACIÓN · lo guardado conserva modelVersion y asOf', () => {
  it('sobreviven a la ida y vuelta por el almacenamiento', () => {
    expect(saveRun(run()).ok).toBe(true)
    const recuperado = getRun('run-1')
    expect(recuperado?.modelVersion).toBe(1)
    expect(recuperado?.asOf).toBe('2026-08-11')
    expect(recuperado).toEqual(run())
  })

  it('un cálculo sin ellos no se guarda: no se podría explicar después', () => {
    const { modelVersion: _sinVersion, ...sinModelo } = run()
    expect(saveRun(sinModelo as LabRun)).toEqual({ ok: false, reason: 'not_reproducible' })

    const { asOf: _sinFecha, ...sinAsOf } = run()
    expect(saveRun(sinAsOf as LabRun)).toEqual({ ok: false, reason: 'not_reproducible' })
    expect(listRuns()).toEqual([])
  })

  it('una fecha que no es una fecha tampoco vale', () => {
    expect(isReproducible(run({ asOf: 'ayer' }))).toBe(false)
    expect(isReproducible(run())).toBe(true)
  })
})

describe('round-trip e índice', () => {
  it('el más reciente queda el primero', () => {
    saveRun(run({ id: 'a' }))
    saveRun(run({ id: 'b' }))
    expect(listRuns().map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('guardar el mismo identificador lo sustituye, no lo duplica', () => {
    saveRun(run({ id: 'a', summary: { volatility: 0.1 } }))
    saveRun(run({ id: 'a', summary: { volatility: 0.2 } }))
    expect(listRuns()).toHaveLength(1)
    expect(getRun('a')?.summary['volatility']).toBe(0.2)
  })

  it('el índice está acotado: no crece sin fin', () => {
    for (let i = 0; i < MAX_RUNS + 10; i += 1) saveRun(run({ id: `run-${i}` }))
    expect(listRuns()).toHaveLength(MAX_RUNS)
    // Se conservan los últimos, no los primeros.
    expect(getRun(`run-${MAX_RUNS + 9}`)).not.toBeNull()
    expect(getRun('run-0')).toBeNull()
  })

  it('limpiar deja el índice vacío', () => {
    saveRun(run())
    clearRuns()
    expect(listRuns()).toEqual([])
  })
})

describe('migración de esquema', () => {
  it('un almacén vacío o ilegible no rompe: se empieza de cero', () => {
    expect(migrar(null).runs).toEqual([])
    expect(migrar('vaya').runs).toEqual([])
    localStorage.setItem('riskcalculator-v1:lab-runs', '{ esto no es json')
    expect(listRuns()).toEqual([])
  })

  it('un formato del futuro se descarta entero, no se lee a medias', () => {
    const futuro = { schemaVersion: RUNS_SCHEMA_VERSION + 1, runs: [run()] }
    expect(migrar(futuro).runs).toEqual([])
  })

  it('al leer se filtra lo que no se puede reproducir', () => {
    const mezclado = {
      schemaVersion: RUNS_SCHEMA_VERSION,
      runs: [run({ id: 'bueno' }), { id: 'malo', kind: 'stability' }],
    }
    expect(migrar(mezclado).runs.map((r) => r.id)).toEqual(['bueno'])
  })
})

describe('error de cuota', () => {
  it('se informa en vez de tragárselo o lanzar', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(saveRun(run())).toEqual({ ok: false, reason: 'quota_exceeded' })
  })

  it('sin almacenamiento, leer devuelve vacío en vez de romper', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(listRuns()).toEqual([])
  })
})
