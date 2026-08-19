/**
 * Pruebas de los contratos de escenario (LAB-501).
 *
 * El criterio de aceptación: **un escenario no puede existir sin horizonte ni
 * tipo**. En el código lo impide el tipo; aquí se comprueba que también lo
 * impide la frontera, que es por donde entra lo que no ha escrito TypeScript.
 */
import { describe, expect, it } from 'vitest'
import { horizonInTradingDays, isStochastic, type ScenarioDefinition } from './contracts'
import { parseScenarioDefinition, parseScenarioResult } from './schema'

const BASE: ScenarioDefinition = {
  id: 'recesion',
  name: 'Recesión profunda',
  version: 1,
  horizon: { amount: 1, unit: 'years' },
  params: { kind: 'deterministic', byType: { stock: -0.4, crypto: -0.65 } },
  assumptions: [
    { label: 'Shock instantáneo', detail: 'Se aplica sobre la valoración de hoy, sin trayectoria.' },
  ],
  source: 'builtin',
}

describe('un escenario no existe sin horizonte ni tipo', () => {
  it('el escenario completo entra', () => {
    expect(parseScenarioDefinition(BASE).ok).toBe(true)
  })

  it('sin horizonte no entra', () => {
    const { horizon: _horizon, ...sinHorizonte } = BASE
    expect(parseScenarioDefinition(sinHorizonte).ok).toBe(false)
  })

  it('sin tipo no entra', () => {
    const r = parseScenarioDefinition({ ...BASE, params: { byType: { stock: -0.4 } } })
    expect(r.ok).toBe(false)
  })

  it('un tipo inventado no entra', () => {
    expect(parseScenarioDefinition({ ...BASE, params: { kind: 'adivinacion' } }).ok).toBe(false)
  })

  it('un horizonte de cero o negativo no entra', () => {
    for (const amount of [0, -1]) {
      expect(parseScenarioDefinition({ ...BASE, horizon: { amount, unit: 'years' } }).ok).toBe(false)
    }
  })

  it('sin versión no entra: dos resultados no serían comparables', () => {
    const { version: _version, ...sinVersion } = BASE
    expect(parseScenarioDefinition(sinVersion).ok).toBe(false)
  })
})

describe('el azar exige semilla', () => {
  const bootstrap = {
    ...BASE,
    id: 'bootstrap',
    params: { kind: 'bootstrap', blockDays: 20, paths: 1000 },
  }

  it('un escenario con azar sin semilla se rechaza', () => {
    const r = parseScenarioDefinition(bootstrap)
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('debería haberse rechazado')
    expect(r.error).toMatch(/semilla/)
  })

  it('con semilla entra', () => {
    expect(parseScenarioDefinition({ ...bootstrap, seed: 42 }).ok).toBe(true)
  })

  it('un escenario determinista no necesita semilla', () => {
    expect(parseScenarioDefinition(BASE).ok).toBe(true)
  })

  it('se sabe qué tipos llevan azar', () => {
    expect(isStochastic('bootstrap')).toBe(true)
    expect(isStochastic('goal')).toBe(true)
    expect(isStochastic('deterministic')).toBe(false)
    expect(isStochastic('historical')).toBe(false)
  })
})

describe('los shocks son fracciones, nunca porcentajes', () => {
  it('un −30 en vez de −0,3 se rechaza', () => {
    // Sin este tope, la cartera saldría con valor negativo.
    const r = parseScenarioDefinition({
      ...BASE,
      params: { kind: 'deterministic', general: -30 },
    })
    expect(r.ok).toBe(false)
  })

  it('perderlo todo es el suelo, y es válido', () => {
    expect(
      parseScenarioDefinition({ ...BASE, params: { kind: 'deterministic', general: -1 } }).ok,
    ).toBe(true)
  })

  it('un shock no finito no entra', () => {
    for (const valor of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        parseScenarioDefinition({ ...BASE, params: { kind: 'deterministic', general: valor } }).ok,
      ).toBe(false)
    }
  })

  it('no hace falta declarar un shock para cada clase de activo', () => {
    const r = parseScenarioDefinition({
      ...BASE,
      params: { kind: 'deterministic', byType: { crypto: -0.7 } },
    })
    expect(r.ok).toBe(true)
  })
})

describe('parámetros con sentido por tipo', () => {
  it('un periodo histórico al revés se rechaza', () => {
    const r = parseScenarioDefinition({
      ...BASE,
      params: { kind: 'historical', from: '2026-01-01', to: '2025-01-01' },
    })
    expect(r.ok).toBe(false)
  })

  it('una fecha que no existe en el calendario se rechaza', () => {
    const r = parseScenarioDefinition({
      ...BASE,
      params: { kind: 'historical', from: '2025-02-30', to: '2026-01-01' },
    })
    expect(r.ok).toBe(false)
  })

  it('un bloque de un día destruiría lo que el bootstrap conserva', () => {
    const r = parseScenarioDefinition({
      ...BASE,
      seed: 1,
      params: { kind: 'bootstrap', blockDays: 1, paths: 1000 },
    })
    expect(r.ok).toBe(false)
  })

  it('un objetivo no positivo no tiene sentido', () => {
    const r = parseScenarioDefinition({
      ...BASE,
      seed: 1,
      params: { kind: 'goal', target: 0 },
    })
    expect(r.ok).toBe(false)
  })
})

describe('horizonte en días de mercado', () => {
  it('un año son 252 días de mercado', () => {
    expect(horizonInTradingDays({ amount: 1, unit: 'years' })).toBe(252)
  })

  it('seis meses son la mitad', () => {
    expect(horizonInTradingDays({ amount: 6, unit: 'months' })).toBe(126)
  })

  it('los días se toman tal cual', () => {
    expect(horizonInTradingDays({ amount: 30, unit: 'days' })).toBe(30)
  })
})

describe('un resultado guardado se puede reproducir', () => {
  const RESULTADO = {
    definitionId: 'recesion',
    definitionVersion: 1,
    modelVersion: 'scenario-v1',
    asOf: '2026-08-12',
    baseValue: 10_000,
    baseCurrency: 'EUR',
    outcome: { finalValue: 6_500, changePct: -0.35 },
    contributions: [
      { assetId: 'a', symbol: 'AAPL', before: 5000, after: 3000, shareOfChange: 0.57 },
    ],
    assumptions: [{ label: 'Shock instantáneo', detail: 'Sin trayectoria.' }],
    notCovered: [],
  }

  it('el resultado completo entra', () => {
    expect(parseScenarioResult(RESULTADO).ok).toBe(true)
  })

  it('sin versión de modelo no entra: no se sabría qué lo calculó', () => {
    const { modelVersion: _modelVersion, ...sinModelo } = RESULTADO
    expect(parseScenarioResult(sinModelo).ok).toBe(false)
  })

  it('sin fecha de los datos no entra: no se sabría de cuándo es', () => {
    const { asOf: _asOf, ...sinFecha } = RESULTADO
    expect(parseScenarioResult(sinFecha).ok).toBe(false)
  })

  it('sin supuestos no entra: el número no puede viajar solo', () => {
    const { assumptions: _assumptions, ...sinSupuestos } = RESULTADO
    expect(parseScenarioResult(sinSupuestos).ok).toBe(false)
  })

  it('una caída máxima positiva no es una caída', () => {
    const r = parseScenarioResult({
      ...RESULTADO,
      outcome: { ...RESULTADO.outcome, maxDrawdown: 0.2 },
    })
    expect(r.ok).toBe(false)
  })

  it('una frecuencia de éxito fuera de 0–1 no entra', () => {
    const r = parseScenarioResult({
      ...RESULTADO,
      outcome: { ...RESULTADO.outcome, successRate: 1.4 },
    })
    expect(r.ok).toBe(false)
  })

  it('«no se pudo calcular» es una lista, no un hueco', () => {
    const r = parseScenarioResult({ ...RESULTADO, notCovered: ['BTC: sin historial'] })
    expect(r.ok).toBe(true)
  })
})
