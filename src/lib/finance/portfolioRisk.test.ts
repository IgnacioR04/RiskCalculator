import { describe, expect, it } from 'vitest'
import {
  alignManyReturns,
  covarianceMatrix,
  portfolioRisk,
  timeWeightedReturn,
  tradingDaysForAsset,
  tradingDaysForPortfolio,
} from './portfolioRisk'

describe('analítica de riesgo de cartera', () => {
  it('alinea todas las series por una única muestra común', () => {
    const aligned = alignManyReturns([
      [
        { date: '2026-01-01', value: 0.01 },
        { date: '2026-01-02', value: 0.02 },
      ],
      [
        { date: '2026-01-02', value: -0.01 },
        { date: '2026-01-03', value: 0.03 },
      ],
    ])
    expect(aligned.dates).toEqual(['2026-01-02'])
    expect(aligned.columns).toEqual([[0.02], [-0.01]])
  })

  it('calcula volatilidad y contribuciones que suman el total', () => {
    const covariance = [
      [0.04, 0.006],
      [0.006, 0.09],
    ]
    const result = portfolioRisk([0.6, 0.4], covariance)
    expect(result).not.toBeNull()
    expect(
      result!.componentContributions.reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(result!.volatility, 12)
    expect(
      result!.percentageContributions.reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(1, 12)
  })

  it('anualiza una matriz de covarianzas con muestra suficiente', () => {
    const a = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 0.01 : -0.005))
    const b = a.map((value) => value * 0.5)
    const result = covarianceMatrix([a, b], 252)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value[0]![1]).toBeCloseTo(result.value[0]![0]! * 0.5, 12)
    }
  })

  it('encadena TWR neutralizando aportaciones y retiradas', () => {
    const twr = timeWeightedReturn([
      { openingValue: 100, closingValue: 110, contributions: 0, withdrawals: 0 },
      { openingValue: 110, closingValue: 165, contributions: 40, withdrawals: 0 },
      { openingValue: 165, closingValue: 150, contributions: 0, withdrawals: 30 },
    ])
    expect(twr).toBeCloseTo(0.32, 10)
  })

  it('usa 365 para cripto y 252 para mercados con sesiones', () => {
    expect(tradingDaysForAsset('crypto')).toBe(365)
    expect(tradingDaysForAsset('stock')).toBe(252)
    expect(tradingDaysForPortfolio(['crypto', 'crypto'])).toBe(365)
    expect(tradingDaysForPortfolio(['crypto', 'etf'])).toBe(252)
  })
})
