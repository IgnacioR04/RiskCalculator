import { describe, expect, it } from 'vitest'
import { alignManyReturns, covarianceMatrix, portfolioRisk } from '../lib/finance/portfolioRisk'
import { dailyReturns, MIN_OBSERVATIONS } from '../lib/finance/historical'
import { DEMO_QUOTES } from './demoData'
import { getDemoHistoricalSeries, hasDemoHistoricalSeries } from './demoHistory'

const DEMO_ASSET_IDS = [
  'demo-btc',
  'demo-msci-world-etf',
  'demo-spx-etf',
  'demo-aapl',
  'demo-tsla',
  'demo-cash-eur',
]

describe('demoHistory', () => {
  it('provides synthetic history for all six demo assets', () => {
    for (const assetId of DEMO_ASSET_IDS) {
      const series = getDemoHistoricalSeries(assetId, 365)

      expect(hasDemoHistoricalSeries(assetId)).toBe(true)
      expect(series.length).toBeGreaterThanOrEqual(MIN_OBSERVATIONS + 1)
      expect(series.at(-1)?.date).toBe('2026-07-20')
    }
  })

  it('matches the last historical point with each demo quote', () => {
    for (const quote of DEMO_QUOTES) {
      const last = getDemoHistoricalSeries(quote.assetId, 365).at(-1)

      expect(last?.close).toBeCloseTo(Number(quote.price), 6)
    }
  })

  it('aligns every demo asset into a complete covariance and risk sample', () => {
    const returns = DEMO_ASSET_IDS.map((assetId) =>
      dailyReturns(getDemoHistoricalSeries(assetId, 365)),
    )
    const aligned = alignManyReturns(returns)
    const covariance = covarianceMatrix(aligned.columns, 252)

    expect(aligned.dates.length).toBeGreaterThanOrEqual(MIN_OBSERVATIONS)
    expect(covariance.ok).toBe(true)
    if (covariance.ok) {
      expect(covariance.value).toHaveLength(DEMO_ASSET_IDS.length)
      expect(covariance.value.every((row) => row.length === DEMO_ASSET_IDS.length)).toBe(true)
      const risk = portfolioRisk([0.359, 0.25, 0.083, 0.16, 0.105, 0.043], covariance.value)
      expect(risk).not.toBeNull()
      expect(risk!.volatility).toBeGreaterThan(0)
      expect(risk!.percentageContributions).toHaveLength(DEMO_ASSET_IDS.length)
      expect(
        risk!.percentageContributions.every((value) => Number.isFinite(value)),
      ).toBe(true)
      expect(risk!.percentageContributions.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
        1,
        10,
      )
    }
  })
})
