import { describe, expect, it } from 'vitest'
import {
  alignReturns,
  annualizedVolatility,
  betaAlpha,
  correlation,
  dailyReturns,
  downsideVolatility,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
  MIN_OBSERVATIONS,
} from './historical'

function makeSeries(closes: number[], startDay = 1): { date: string; close: number }[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(startDay + i).padStart(2, '0')}`,
    close,
  }))
}

describe('dailyReturns', () => {
  it('retornos logarítmicos ordenados por fecha', () => {
    const r = dailyReturns(makeSeries([100, 110, 99]))
    expect(r).toHaveLength(2)
    expect(r[0]!.value).toBeCloseTo(Math.log(1.1), 10)
    expect(r[1]!.value).toBeCloseTo(Math.log(99 / 110), 10)
  })

  it('ignora cierres no positivos sin inventar datos', () => {
    const r = dailyReturns(makeSeries([100, 0, 110]))
    expect(r).toHaveLength(0)
  })
})

describe('alignReturns', () => {
  it('solo fechas comunes, sin rellenar huecos', () => {
    const a = [
      { date: '2026-01-02', value: 0.01 },
      { date: '2026-01-03', value: 0.02 },
      { date: '2026-01-04', value: 0.03 },
    ]
    const b = [
      { date: '2026-01-02', value: -0.01 },
      { date: '2026-01-04', value: 0.05 },
    ]
    const aligned = alignReturns(a, b)
    expect(aligned.dates).toEqual(['2026-01-02', '2026-01-04'])
    expect(aligned.a).toEqual([0.01, 0.03])
    expect(aligned.b).toEqual([-0.01, 0.05])
  })
})

describe('annualizedVolatility', () => {
  it('con muestra insuficiente devuelve estado, no un número', () => {
    const r = annualizedVolatility([0.01, -0.01])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('insufficient_data')
      expect(r.required).toBe(MIN_OBSERVATIONS)
    }
  })

  it('caso conocido: retornos alternos ±1 %', () => {
    // Media 0; varianza muestral = 40·0,01²/39 ⇒ σ diaria = √(0,004/39).
    const returns = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01))
    const r = annualizedVolatility(returns, 365)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBeCloseTo(Math.sqrt((40 * 0.0001) / 39) * Math.sqrt(365), 10)
      expect(r.observations).toBe(40)
    }
  })
})

describe('downsideVolatility', () => {
  it('solo penaliza retornos negativos', () => {
    const returns = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 0.02 : -0.01))
    const r = downsideVolatility(returns, 365)
    expect(r.ok).toBe(true)
    if (r.ok) {
      // semivarianza = (20 · 0,01²)/40 = 5e-5 ⇒ √ = 0,0070710…
      expect(r.value).toBeCloseTo(Math.sqrt(5e-5) * Math.sqrt(365), 6)
    }
  })
})

describe('maxDrawdown', () => {
  it('detecta la mayor caída pico-valle', () => {
    const r = maxDrawdown(makeSeries([100, 120, 90, 95, 130, 110]))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.maxDrawdown).toBeCloseTo(90 / 120 - 1, 10) // −25 %
      expect(r.value.peakDate).toBe('2026-01-02')
      expect(r.value.troughDate).toBe('2026-01-03')
    }
  })

  it('serie monótona creciente ⇒ drawdown 0', () => {
    const r = maxDrawdown(makeSeries([100, 110, 120]))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.maxDrawdown).toBe(0)
  })
})

describe('sharpe y sortino', () => {
  const returns = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? -0.005 : 0.01))

  it('sharpe declara la tasa libre de riesgo usada (parámetro)', () => {
    const r0 = sharpeRatio(returns, 0, 365)
    const r2 = sharpeRatio(returns, 0.02, 365)
    expect(r0.ok && r2.ok).toBe(true)
    if (r0.ok && r2.ok) expect(r0.value).toBeGreaterThan(r2.value)
  })

  it('sortino usa la volatilidad bajista', () => {
    const r = sortinoRatio(returns, 0, 365)
    const s = sharpeRatio(returns, 0, 365)
    expect(r.ok && s.ok).toBe(true)
    if (r.ok && s.ok) expect(r.value).not.toBeCloseTo(s.value, 6)
  })
})

describe('correlation', () => {
  it('correlación perfecta positiva y negativa', () => {
    const a = Array.from({ length: 40 }, (_, i) => Math.sin(i) * 0.01)
    const pos = correlation(a, a)
    const neg = correlation(
      a,
      a.map((x) => -x),
    )
    expect(pos.ok && neg.ok).toBe(true)
    if (pos.ok) expect(pos.value).toBeCloseTo(1, 10)
    if (neg.ok) expect(neg.value).toBeCloseTo(-1, 10)
  })

  it('series constantes ⇒ no calculable', () => {
    const flat = Array.from({ length: 40 }, () => 0.01)
    const r = correlation(
      flat,
      Array.from({ length: 40 }, (_, i) => Math.sin(i) * 0.01),
    )
    expect(r.ok).toBe(false)
  })
})

describe('betaAlpha', () => {
  it('activo = 2·benchmark ⇒ beta 2, alpha 0, R² 1', () => {
    const benchmark = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.7) * 0.01)
    const asset = benchmark.map((x) => 2 * x)
    const r = betaAlpha(asset, benchmark, 365)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.beta).toBeCloseTo(2, 10)
      expect(r.value.alpha).toBeCloseTo(0, 10)
      expect(r.value.r2).toBeCloseTo(1, 10)
    }
  })
})
