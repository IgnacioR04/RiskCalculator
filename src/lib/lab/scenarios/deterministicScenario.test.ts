/**
 * Pruebas del escenario determinista (LAB-502).
 *
 * El criterio de aceptación tiene dos mitades: los presets **conservan
 * paridad** y **adquieren definición versionada**. La primera es la que
 * importa: si el envoltorio cambiara un número, el refactor habría fallado
 * aunque todo lo demás funcionara.
 */
import { describe, expect, it } from 'vitest'
import { applyStress, type StressPosition } from '../../finance/stress'
import { STRESS_PRESETS } from '../../finance/stressPresets'
import { parseScenarioDefinition, parseScenarioResult } from './schema'
import {
  DETERMINISTIC_MODEL_VERSION,
  builtinDeterministicScenarios,
  presetToDefinition,
  runDeterministicScenario,
} from './deterministicScenario'

const CARTERA: StressPosition[] = [
  { assetId: 'aapl', symbol: 'AAPL', assetType: 'stock', quoteCurrency: 'USD', value: '5000' },
  { assetId: 'iwda', symbol: 'IWDA', assetType: 'etf', quoteCurrency: 'EUR', value: '3000' },
  { assetId: 'btc', symbol: 'BTC', assetType: 'crypto', quoteCurrency: 'EUR', value: '2000' },
]

const ejecutar = (id: string) =>
  runDeterministicScenario({
    definition: presetToDefinition(STRESS_PRESETS.find((p) => p.id === id)!),
    positions: CARTERA,
    displayCurrency: 'EUR',
    asOf: '2026-08-12',
  })

/* ── Paridad: la condición del envoltorio ─────────────────────────────────── */

describe('el envoltorio no cambia ni un número', () => {
  it('cada preset da exactamente lo mismo que el motor de siempre', () => {
    for (const preset of STRESS_PRESETS) {
      const directo = applyStress(CARTERA, {
        ...(preset.general === undefined ? {} : { general: preset.general }),
        ...(preset.byType === undefined ? {} : { byType: preset.byType }),
        ...(preset.fxForeign === undefined ? {} : { fxForeign: preset.fxForeign }),
        displayCurrency: 'EUR',
      })
      const viaEscenario = ejecutar(preset.id)

      expect(viaEscenario.outcome.finalValue).toBe(directo.totalAfter.toNumber())
      expect(viaEscenario.baseValue).toBe(directo.totalBefore.toNumber())
      expect(viaEscenario.outcome.changePct).toBe(directo.totalChangePct?.toNumber() ?? null)
    }
  })

  it('el valor por posición también coincide', () => {
    const directo = applyStress(CARTERA, {
      byType: { crypto: -0.7, stock: -0.03, etf: -0.03, index: -0.03 },
      displayCurrency: 'EUR',
    })
    const viaEscenario = ejecutar('cripto-invierno')

    for (const p of directo.positions) {
      const contribucion = viaEscenario.contributions.find((c) => c.assetId === p.assetId)!
      expect(contribucion.after).toBe(p.stressedValue.toNumber())
    }
  })

  it('el shock de divisa sigue afectando solo a lo cotizado en otra moneda', () => {
    const r = ejecutar('euro-fuerte')
    const aapl = r.contributions.find((c) => c.symbol === 'AAPL')!
    const iwda = r.contributions.find((c) => c.symbol === 'IWDA')!

    // AAPL cotiza en USD y sufre; IWDA cotiza en EUR y no.
    expect(aapl.after).toBeLessThan(aapl.before)
    expect(iwda.after).toBe(iwda.before)
  })
})

/* ── Definición versionada ────────────────────────────────────────────────── */

describe('los presets adquieren definición versionada', () => {
  it('todos los presets producen definiciones válidas', () => {
    for (const definicion of builtinDeterministicScenarios()) {
      const r = parseScenarioDefinition(definicion)
      expect(r.ok, `${definicion.id}: ${r.ok ? '' : r.error}`).toBe(true)
    }
  })

  it('cada uno lleva horizonte, tipo y versión', () => {
    for (const d of builtinDeterministicScenarios()) {
      expect(d.horizon.amount).toBeGreaterThan(0)
      expect(d.params.kind).toBe('deterministic')
      expect(d.version).toBeGreaterThanOrEqual(1)
    }
  })

  it('se declaran como de la aplicación, no del usuario', () => {
    for (const d of builtinDeterministicScenarios()) expect(d.source).toBe('builtin')
  })

  it('ninguno viaja sin supuestos escritos', () => {
    for (const d of builtinDeterministicScenarios()) {
      expect(d.assumptions.length).toBeGreaterThan(0)
      // El más importante: que quede dicho que esto no es una previsión.
      expect(d.assumptions.some((a) => /previsión/i.test(a.label))).toBe(true)
    }
  })

  it('el catálogo no pierde ni añade escenarios por el camino', () => {
    expect(builtinDeterministicScenarios().map((d) => d.id)).toEqual(
      STRESS_PRESETS.map((p) => p.id),
    )
  })
})

/* ── El resultado se puede reproducir y explicar ──────────────────────────── */

describe('el resultado lleva su contexto', () => {
  it('es un resultado válido según el contrato', () => {
    expect(parseScenarioResult(ejecutar('recesion')).ok).toBe(true)
  })

  it('dice qué definición, en qué versión y con qué modelo', () => {
    const r = ejecutar('recesion')
    expect(r.definitionId).toBe('recesion')
    expect(r.definitionVersion).toBe(1)
    expect(r.modelVersion).toBe(DETERMINISTIC_MODEL_VERSION)
    expect(r.asOf).toBe('2026-08-12')
  })

  it('los supuestos viajan dentro del resultado, no en la pantalla', () => {
    expect(ejecutar('recesion').assumptions.length).toBeGreaterThan(0)
  })

  it('reparte el cambio entre las posiciones que lo produjeron', () => {
    const r = ejecutar('recesion')
    const suma = r.contributions.reduce((s, c) => s + (c.shareOfChange ?? 0), 0)
    // El reparto es exhaustivo: las partes suman el todo.
    expect(suma).toBeCloseTo(1, 10)
  })

  it('sin cambio total no se inventa un reparto', () => {
    const r = runDeterministicScenario({
      definition: presetToDefinition({ id: 'nada', name: 'Nada', description: '', general: 0 }),
      positions: CARTERA,
      displayCurrency: 'EUR',
      asOf: '2026-08-12',
    })
    // Dividir entre cero daría infinitos con pinta de dato.
    expect(r.contributions.every((c) => c.shareOfChange === null)).toBe(true)
  })

  it('lo que se quedó fuera se nombra', () => {
    const r = runDeterministicScenario({
      definition: presetToDefinition(STRESS_PRESETS[0]!),
      positions: CARTERA,
      displayCurrency: 'EUR',
      asOf: '2026-08-12',
      unvalued: ['XYZ'],
    })
    expect(r.notCovered).toEqual(['XYZ: sin valoración'])
  })

  it('sin posiciones no rompe y no inventa un cambio', () => {
    const r = runDeterministicScenario({
      definition: presetToDefinition(STRESS_PRESETS[0]!),
      positions: [],
      displayCurrency: 'EUR',
      asOf: '2026-08-12',
    })
    expect(r.baseValue).toBe(0)
    expect(r.outcome.changePct).toBeNull()
  })

  it('un escenario de otro tipo se rechaza en vez de calcularse mal', () => {
    expect(() =>
      runDeterministicScenario({
        definition: {
          ...presetToDefinition(STRESS_PRESETS[0]!),
          params: { kind: 'historical', from: '2020-01-01', to: '2020-04-01' },
        },
        positions: CARTERA,
        displayCurrency: 'EUR',
        asOf: '2026-08-12',
      }),
    ).toThrow(/historical/)
  })
})

describe('determinismo', () => {
  it('los mismos datos dan exactamente el mismo resultado', () => {
    expect(ejecutar('recesion')).toEqual(ejecutar('recesion'))
  })
})
