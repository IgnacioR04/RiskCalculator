/**
 * Pruebas de sensibilidad (LAB-506).
 *
 * El criterio de aceptación: **muestra los supuestos que más cambian el
 * resultado**, y sin explosión combinatoria.
 */
import { describe, expect, it } from 'vitest'
import { applyStress, type StressPosition } from '../../finance/stress'
import type { ScenarioDefinition } from './contracts'
import {
  SENSITIVITY_GRID,
  scenarioSensitivity,
  type ScenarioRunner,
} from './scenarioSensitivity'

/** Cartera con mucha cripto y poca bolsa: cripto tiene que salir como driver. */
const CARTERA: StressPosition[] = [
  { assetId: 'btc', symbol: 'BTC', assetType: 'crypto', quoteCurrency: 'EUR', value: '8000' },
  { assetId: 'aapl', symbol: 'AAPL', assetType: 'stock', quoteCurrency: 'EUR', value: '2000' },
]

const ejecutor: ScenarioRunner = (definition) => {
  if (definition.params.kind !== 'deterministic') return null
  const p = definition.params
  const r = applyStress(CARTERA, {
    ...(p.general === undefined ? {} : { general: p.general }),
    ...(p.byType === undefined ? {} : { byType: p.byType }),
    ...(p.fxForeign === undefined ? {} : { fxForeign: p.fxForeign }),
    displayCurrency: 'EUR',
  })
  return r.totalChangePct?.toNumber() ?? null
}

const DEF: ScenarioDefinition = {
  id: 'mixto',
  name: 'Mixto',
  version: 1,
  horizon: { amount: 1, unit: 'days' },
  params: { kind: 'deterministic', byType: { crypto: -0.5, stock: -0.1 } },
  assumptions: [{ label: 'Supuesto', detail: 'Detalle.' }],
  source: 'builtin',
}

describe('encuentra de qué depende el resultado', () => {
  const r = scenarioSensitivity(DEF, ejecutor)

  it('el supuesto que más mueve el resultado va primero', () => {
    // La cartera es 80 % cripto: el shock de cripto manda sobre el de acciones.
    expect(r.drivers[0]!.label).toBe('Shock de cripto')
  })

  it('mide cuánto mueve cada supuesto', () => {
    expect(r.drivers[0]!.swing).toBeGreaterThan(r.drivers[1]!.swing)
    expect(r.drivers[0]!.swing).toBeGreaterThan(0)
  })

  it('el punto central es el escenario tal y como está', () => {
    const central = r.drivers[0]!.points.find((p) => p.factor === 1)!
    expect(central.changePct).toBe(r.baseChangePct)
    expect(central.value).toBe(-0.5)
  })

  it('un shock mayor empeora el resultado', () => {
    const puntos = r.drivers[0]!.points
    const suave = puntos.find((p) => p.factor === 0.5)!.changePct!
    const duro = puntos.find((p) => p.factor === 2)!.changePct!
    expect(duro).toBeLessThan(suave)
  })
})

describe('sin explosión combinatoria', () => {
  it('el coste es lineal en el número de supuestos, no exponencial', () => {
    const r = scenarioSensitivity(DEF, ejecutor)
    // 2 supuestos × 4 variaciones + 1 base = 9. Una rejilla completa serían 25.
    expect(r.runs).toBe(9)
  })

  it('cada supuesto se prueba en toda la rejilla', () => {
    const r = scenarioSensitivity(DEF, ejecutor)
    for (const d of r.drivers) {
      expect(d.points.map((p) => p.factor)).toEqual([...SENSITIVITY_GRID])
    }
  })

  it('el ejecutor se llama exactamente las veces declaradas', () => {
    let llamadas = 0
    const contador: ScenarioRunner = (d) => {
      llamadas += 1
      return ejecutor(d)
    }
    const r = scenarioSensitivity(DEF, contador)
    expect(llamadas).toBe(r.runs)
  })
})

describe('no se inventan supuestos que no existen', () => {
  it('una clase que el escenario no menciona no se varía', () => {
    const r = scenarioSensitivity(DEF, ejecutor)
    // El escenario no dice nada de materias primas: no aparece.
    expect(r.drivers.some((d) => /materias primas/.test(d.label))).toBe(false)
  })

  it('un shock de cero no es un supuesto que variar', () => {
    const conCero: ScenarioDefinition = {
      ...DEF,
      params: { kind: 'deterministic', byType: { crypto: -0.5, commodity: 0 } },
    }
    expect(scenarioSensitivity(conCero, ejecutor).drivers).toHaveLength(1)
  })

  it('un escenario que no es determinista no tiene supuestos que variar', () => {
    const historico: ScenarioDefinition = {
      ...DEF,
      params: { kind: 'historical', from: '2020-02-19', to: '2020-03-23' },
    }
    const r = scenarioSensitivity(historico, () => null)
    expect(r.drivers).toEqual([])
    expect(r.runs).toBe(1)
  })
})

describe('límites declarados', () => {
  it('un shock no baja de perderlo todo por multiplicarlo', () => {
    const fuerte: ScenarioDefinition = {
      ...DEF,
      params: { kind: 'deterministic', byType: { crypto: -0.7 } },
    }
    const r = scenarioSensitivity(fuerte, ejecutor)
    // −0,7 × 2 sería −1,4: una cartera de valor negativo. Se recorta en −1.
    expect(Math.min(...r.drivers[0]!.points.map((p) => p.value))).toBe(-1)
  })

  it('dice lo que este análisis no ve', () => {
    const r = scenarioSensitivity(DEF, ejecutor)
    expect(r.limitations.some((l) => /interacciones/.test(l))).toBe(true)
    expect(r.limitations.some((l) => /no dicen qué valores son probables/.test(l))).toBe(true)
  })

  it('si el ejecutor no puede calcular, no se inventa un swing', () => {
    const r = scenarioSensitivity(DEF, () => null)
    expect(r.baseChangePct).toBeNull()
    expect(r.drivers.every((d) => d.swing === 0)).toBe(true)
  })
})

describe('determinismo', () => {
  it('el orden no depende del recorrido de las claves', () => {
    const a = scenarioSensitivity(DEF, ejecutor)
    const b = scenarioSensitivity(
      { ...DEF, params: { kind: 'deterministic', byType: { stock: -0.1, crypto: -0.5 } } },
      ejecutor,
    )
    expect(b.drivers.map((d) => d.path)).toEqual(a.drivers.map((d) => d.path))
  })
})
