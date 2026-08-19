/**
 * Pruebas del escenario histórico (LAB-503).
 *
 * El criterio de aceptación: **no se afirma que el usuario tuviera esa cartera
 * entonces**. Se comprueba donde vive esa afirmación —los supuestos, que viajan
 * dentro del resultado— y en el trato de lo que no tiene historia.
 */
import { describe, expect, it } from 'vitest'
import { parseScenarioDefinition, parseScenarioResult } from './schema'
import {
  HISTORICAL_MODEL_VERSION,
  HISTORICAL_PERIODS,
  periodReturn,
  periodToDefinition,
  runHistoricalScenario,
  type HistoricalPosition,
} from './historicalScenario'

const DEF = periodToDefinition(HISTORICAL_PERIODS[0]!)

/** Serie que va de `desde` a `hasta` en línea recta entre dos precios. */
function serie(inicio: number, fin: number, dias = 10) {
  return Array.from({ length: dias }, (_, i) => ({
    date: new Date(Date.UTC(2020, 1, 19 + i)).toISOString().slice(0, 10),
    close: inicio + ((fin - inicio) * i) / (dias - 1),
  }))
}

const posicion = (
  symbol: string,
  value: number,
  serieDeCierres: HistoricalPosition['series'],
): HistoricalPosition => ({ assetId: symbol.toLowerCase(), symbol, value, series: serieDeCierres })

describe('el rendimiento del periodo', () => {
  it('se mide del primer al último cierre dentro de la ventana', () => {
    const r = periodReturn(serie(100, 70), '2020-02-19', '2020-03-23')
    expect(r?.value).toBeCloseTo(-0.3, 9)
  })

  it('lo de fuera de la ventana no cuenta', () => {
    const conCola = [
      { date: '2019-01-01', close: 1000 },
      ...serie(100, 70),
      { date: '2021-01-01', close: 5 },
    ]
    expect(periodReturn(conCola, '2020-02-19', '2020-03-23')?.value).toBeCloseTo(-0.3, 9)
  })

  it('con un solo punto no hay variación que medir', () => {
    // No es un cero: es que no se sabe.
    expect(periodReturn([{ date: '2020-03-01', close: 100 }], '2020-02-19', '2020-03-23')).toBeNull()
  })

  it('sin ningún punto en la ventana devuelve null', () => {
    expect(periodReturn(serie(100, 70), '2010-01-01', '2010-12-31')).toBeNull()
  })

  it('un precio no positivo no se usa para dividir', () => {
    const conCero = [
      { date: '2020-02-19', close: 0 },
      { date: '2020-02-20', close: 50 },
      { date: '2020-02-21', close: 40 },
    ]
    // Ignora el 0 y mide 50 → 40.
    expect(periodReturn(conCero, '2020-02-19', '2020-03-23')?.value).toBeCloseTo(-0.2, 9)
  })
})

describe('se aplica a la cartera de hoy, y se dice', () => {
  const cartera = [
    posicion('AAPL', 6000, serie(100, 70)),
    posicion('IWDA', 4000, serie(100, 80)),
  ]

  const r = runHistoricalScenario({
    definition: DEF,
    positions: cartera,
    baseCurrency: 'EUR',
    asOf: '2026-08-12',
  })

  it('aplica el rendimiento de cada activo a su valor actual', () => {
    // 6.000·0,7 + 4.000·0,8 = 4.200 + 3.200 = 7.400
    expect(r.outcome.finalValue).toBeCloseTo(7400, 6)
    expect(r.outcome.changePct).toBeCloseTo(-0.26, 6)
  })

  it('el supuesto de que no tenías esta cartera viaja con el resultado', () => {
    expect(r.assumptions.some((a) => /No tenías esta cartera entonces/.test(a.label))).toBe(true)
  })

  it('avisa de que la historia no se repite igual', () => {
    expect(r.assumptions.some((a) => /no dice nada sobre su probabilidad/.test(a.detail))).toBe(true)
  })

  it('dice qué modelo y qué versión de definición lo calculó', () => {
    expect(r.modelVersion).toBe(HISTORICAL_MODEL_VERSION)
    expect(r.definitionVersion).toBe(1)
  })

  it('reparte el cambio entre quienes lo produjeron', () => {
    const suma = r.contributions.reduce((s, c) => s + (c.shareOfChange ?? 0), 0)
    expect(suma).toBeCloseTo(1, 9)
  })

  it('es un resultado válido según el contrato', () => {
    expect(parseScenarioResult(r).ok).toBe(true)
  })
})

describe('lo que no tiene historia no se rellena', () => {
  const conHueco = [
    posicion('AAPL', 6000, serie(100, 70)),
    posicion('NUEVA', 4000, []),
  ]

  const r = runHistoricalScenario({
    definition: DEF,
    positions: conHueco,
    baseCurrency: 'EUR',
    asOf: '2026-08-12',
  })

  it('se nombra en vez de sustituirse por su índice o por cero', () => {
    expect(r.notCovered).toEqual(['NUEVA: sin historial entre 2020-02-19 y 2020-03-23'])
  })

  it('no entra en el resultado ni como si no se moviera', () => {
    expect(r.contributions.map((c) => c.symbol)).toEqual(['AAPL'])
  })

  it('el cambio se calcula sobre lo cubierto, no sobre el patrimonio entero', () => {
    // 6.000 → 4.200 es un −30 % de lo cubierto. Decir −18 % sobre los 10.000
    // daría por hecho que la parte sin historia tampoco cae, y eso no se sabe.
    expect(r.outcome.changePct).toBeCloseTo(-0.3, 9)
    expect(r.baseValue).toBe(6000)
  })

  it('la cobertura dice qué parte se ha podido mirar', () => {
    expect(r.coverage).toBeCloseTo(0.6, 9)
  })

  it('sin ninguna posición con historia, no se inventa un resultado', () => {
    const vacio = runHistoricalScenario({
      definition: DEF,
      positions: [posicion('NUEVA', 4000, [])],
      baseCurrency: 'EUR',
      asOf: '2026-08-12',
    })
    expect(vacio.outcome.finalValue).toBeNull()
    expect(vacio.outcome.changePct).toBeNull()
    expect(vacio.coverage).toBe(0)
  })
})

describe('la ventana efectiva puede no ser la pedida', () => {
  it('se declara el tramo realmente usado', () => {
    const r = runHistoricalScenario({
      definition: DEF,
      positions: [posicion('AAPL', 1000, serie(100, 70, 5))],
      baseCurrency: 'EUR',
      asOf: '2026-08-12',
    })
    expect(r.effectiveFrom).toBe('2020-02-19')
    expect(r.effectiveTo).toBe('2020-02-23')
  })

  it('con series de distinto alcance se toma la intersección', () => {
    const corta = serie(100, 90, 4)
    const larga = serie(100, 70, 10)
    const r = runHistoricalScenario({
      definition: DEF,
      positions: [posicion('A', 1000, larga), posicion('B', 1000, corta)],
      baseCurrency: 'EUR',
      asOf: '2026-08-12',
    })
    // El tramo común acaba donde acaba la serie más corta.
    expect(r.effectiveTo).toBe('2020-02-22')
  })
})

describe('catálogo de periodos', () => {
  it('todos producen definiciones válidas', () => {
    for (const p of HISTORICAL_PERIODS) {
      const r = parseScenarioDefinition(periodToDefinition(p))
      expect(r.ok, `${p.id}: ${r.ok ? '' : r.error}`).toBe(true)
    }
  })

  it('el horizonte sale de las fechas, no de un número inventado', () => {
    const covid = periodToDefinition(HISTORICAL_PERIODS[0]!)
    // Del 19 de febrero al 23 de marzo de 2020 hay 33 días.
    expect(covid.horizon).toEqual({ amount: 33, unit: 'days' })
  })

  it('ninguno viaja sin supuestos', () => {
    for (const p of HISTORICAL_PERIODS) {
      expect(periodToDefinition(p).assumptions.length).toBeGreaterThan(0)
    }
  })

  it('un escenario de otro tipo se rechaza', () => {
    expect(() =>
      runHistoricalScenario({
        definition: { ...DEF, params: { kind: 'deterministic', general: -0.2 } },
        positions: [],
        baseCurrency: 'EUR',
        asOf: '2026-08-12',
      }),
    ).toThrow(/deterministic/)
  })
})
