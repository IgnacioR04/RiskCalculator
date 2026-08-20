/**
 * Pruebas del backtest walk-forward (LAB-709).
 *
 * Un backtest de señal es el sitio del proyecto donde es más fácil producir un
 * número bonito y falso. Estas pruebas comprueban las cuatro cosas que lo
 * impiden, y sobre todo la primera: **la muestra manda sobre el resultado**.
 */
import { describe, expect, it } from 'vitest'
import {
  MIN_PERIODS,
  assessHypothesis,
  runBacktest,
  type BacktestPeriod,
} from './backtest'

const fecha = (i: number) => `2026-${String((i % 12) + 1).padStart(2, '0')}-01`

/**
 * Periodos en que la señal **sí** predice: el sector con más señal tiene más
 * rentabilidad después.
 */
function periodosBuenos(n: number): BacktestPeriod[] {
  return Array.from({ length: n }, (_, i) => ({
    formedAt: fecha(i),
    observations: [
      { sector: 'a', signal: 0.9, forwardReturn: 0.05 },
      { sector: 'b', signal: 0.6, forwardReturn: 0.03 },
      { sector: 'c', signal: 0.3, forwardReturn: 0.01 },
      { sector: 'd', signal: 0.1, forwardReturn: -0.02 },
    ],
  }))
}

/** Periodos en que la señal no predice nada: la relación se invierte a mitad. */
function periodosNulos(n: number): BacktestPeriod[] {
  return Array.from({ length: n }, (_, i) => {
    const invertido = i % 2 === 0
    return {
      formedAt: fecha(i),
      observations: [
        { sector: 'a', signal: 0.9, forwardReturn: invertido ? -0.04 : 0.04 },
        { sector: 'b', signal: 0.6, forwardReturn: 0.01 },
        { sector: 'c', signal: 0.3, forwardReturn: -0.01 },
        { sector: 'd', signal: 0.1, forwardReturn: invertido ? 0.04 : -0.04 },
      ],
    }
  })
}

const correr = (periods: BacktestPeriod[], costPerTurnover = 0) =>
  runBacktest({ periods, groupSize: 1, costPerTurnover })

describe('la muestra manda sobre el resultado', () => {
  it('con doce periodos y un resultado espectacular, el veredicto sigue siendo «muestra insuficiente»', () => {
    // Es el error más común al leer un backtest: mirar el número antes que la
    // muestra. Aquí se corta antes de mirarlo.
    const r = correr(periodosBuenos(12))
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.result.meanNetSpread).toBeGreaterThan(0)
    expect(r.result.hitRate).toBe(1)

    const veredicto = assessHypothesis(r.result)
    expect(veredicto.verdict).toBe('insufficient_sample')
    expect(veredicto.explanation).toMatch(/no sostiene ninguna conclusión/)
  })

  it('dice qué haría falta para cambiar de veredicto', () => {
    const r = correr(periodosBuenos(12))
    if (!r.ok) return
    expect(assessHypothesis(r.result).whatWouldChangeIt).toMatch(new RegExp(String(MIN_PERIODS)))
  })

  it('el número de periodos utilizables va en el resultado, no en una nota al pie', () => {
    const r = correr(periodosBuenos(30))
    if (!r.ok) return
    expect(r.result.usablePeriods).toBe(30)
    expect(r.result.sampleSufficient).toBe(true)
  })
})

describe('con muestra suficiente, el veredicto sigue al dato', () => {
  it('una señal que predice se declara sostenida', () => {
    const r = correr(periodosBuenos(30))
    if (!r.ok) return
    expect(assessHypothesis(r.result).verdict).toBe('supported')
  })

  it('una señal que no predice nada se declara no sostenida', () => {
    const r = correr(periodosNulos(30))
    if (!r.ok) return
    const v = assessHypothesis(r.result)
    expect(['not_supported', 'weak_support']).toContain(v.verdict)
  })

  it('acertar la mitad de las veces es compatible con la suerte, y se dice', () => {
    const r = correr(periodosNulos(30))
    if (!r.ok) return
    if (assessHypothesis(r.result).verdict === 'weak_support') {
      expect(assessHypothesis(r.result).explanation).toMatch(/compatible con la suerte/)
    }
  })
})

describe('los costes se descuentan, y cambian el veredicto', () => {
  it('una señal que solo gana antes de costes no gana', () => {
    // El que encabeza gana siempre 0,006 y el último 0,004: diferencia bruta
    // de +0,002 por periodo. Pero el que encabeza **alterna**, así que hay que
    // rotar la cartera entera cada mes.
    const alternando: BacktestPeriod[] = Array.from({ length: 30 }, (_, i) => {
      const mandaA = i % 2 === 0
      return {
        formedAt: fecha(i),
        observations: [
          { sector: 'a', signal: mandaA ? 0.9 : 0.1, forwardReturn: mandaA ? 0.006 : 0.004 },
          { sector: 'b', signal: mandaA ? 0.1 : 0.9, forwardReturn: mandaA ? 0.004 : 0.006 },
        ],
      }
    })

    const sinCoste = runBacktest({ periods: alternando, groupSize: 1, costPerTurnover: 0 })
    const conCoste = runBacktest({ periods: alternando, groupSize: 1, costPerTurnover: 0.01 })
    expect(sinCoste.ok && conCoste.ok).toBe(true)
    if (!sinCoste.ok || !conCoste.ok) return

    expect(sinCoste.result.meanNetSpread).toBeGreaterThan(0)
    expect(conCoste.result.meanNetSpread).toBeLessThan(0)
    expect(assessHypothesis(conCoste.result).verdict).toBe('not_supported')
  })

  it('la rotación se mide y se publica', () => {
    const r = correr(periodosBuenos(30))
    if (!r.ok) return
    // Siempre gana el mismo sector: tras el primer periodo no rota nada.
    expect(r.result.meanTurnover).toBeLessThan(0.1)
  })

  it('el primer periodo cuenta rotación completa: hay que construir la cartera', () => {
    const r = correr(periodosBuenos(30))
    if (!r.ok) return
    expect(r.result.periods[0]!.turnover).toBe(1)
  })
})

describe('lo que no se puede medir no se mezcla', () => {
  it('un periodo sin bastantes sectores utilizables se descarta entero', () => {
    // Mezclar periodos con cuatro sectores y periodos con uno daría una media
    // que no describe ninguno de los dos.
    const mixtos: BacktestPeriod[] = [
      ...periodosBuenos(3),
      {
        formedAt: '2026-09-01',
        observations: [{ sector: 'a', signal: 0.9, forwardReturn: 0.5 }],
      },
    ]
    const r = runBacktest({ periods: mixtos, groupSize: 2, costPerTurnover: 0 })
    if (!r.ok) return
    expect(r.result.usablePeriods).toBe(3)
  })

  it('una señal nula no se trata como cero', () => {
    const conHuecos: BacktestPeriod[] = [
      {
        formedAt: '2026-01-01',
        observations: [
          { sector: 'a', signal: null, forwardReturn: 0.05 },
          { sector: 'b', signal: 0.1, forwardReturn: 0.01 },
        ],
      },
    ]
    const r = runBacktest({ periods: conHuecos, groupSize: 1, costPerTurnover: 0 })
    expect(r.ok).toBe(false)
  })

  it('una rentabilidad futura desconocida descarta esa observación', () => {
    const sinFuturo: BacktestPeriod[] = [
      {
        formedAt: '2026-01-01',
        observations: [
          { sector: 'a', signal: 0.9, forwardReturn: null },
          { sector: 'b', signal: 0.1, forwardReturn: 0.01 },
        ],
      },
    ]
    expect(runBacktest({ periods: sinFuturo, groupSize: 1, costPerTurnover: 0 }).ok).toBe(false)
  })

  it('sin ningún periodo utilizable se dice, no se devuelve una media de nada', () => {
    const r = runBacktest({ periods: [], groupSize: 1, costPerTurnover: 0 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('no_usable_periods')
  })
})

describe('honestidad sobre el método', () => {
  it('declara que elegir parámetros tras ver los datos sería ajustar al ruido', () => {
    const r = correr(periodosBuenos(30))
    if (!r.ok) return
    expect(r.result.limitations.some((l) => /antes de medir/.test(l))).toBe(true)
  })

  it('declara que el coste modelado es un suelo', () => {
    const r = correr(periodosBuenos(30))
    if (!r.ok) return
    expect(r.result.limitations.some((l) => /suelo del coste real/.test(l))).toBe(true)
  })

  it('declara que no hay corrección por múltiples pruebas', () => {
    const r = correr(periodosBuenos(30))
    if (!r.ok) return
    expect(r.result.limitations.some((l) => /veinte variantes/.test(l))).toBe(true)
  })
})

describe('reproducibilidad', () => {
  it('los mismos periodos dan exactamente el mismo resultado', () => {
    expect(correr(periodosBuenos(30))).toEqual(correr(periodosBuenos(30)))
  })

  it('el empate de señal se rompe por nombre, no por orden de entrada', () => {
    const empatados: BacktestPeriod[] = Array.from({ length: 3 }, (_, i) => ({
      formedAt: fecha(i),
      observations: [
        { sector: 'zeta', signal: 0.5, forwardReturn: 0.01 },
        { sector: 'alfa', signal: 0.5, forwardReturn: 0.02 },
      ],
    }))
    const directo = runBacktest({ periods: empatados, groupSize: 1, costPerTurnover: 0 })
    const inverso = runBacktest({
      periods: empatados.map((p) => ({ ...p, observations: [...p.observations].reverse() })),
      groupSize: 1,
      costPerTurnover: 0,
    })
    expect(directo.ok && inverso.ok).toBe(true)
    if (!directo.ok || !inverso.ok) return
    expect(directo.result.periods[0]!.topSectors).toEqual(inverso.result.periods[0]!.topSectors)
  })
})
