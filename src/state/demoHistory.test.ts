import { describe, expect, it } from 'vitest'
import { alignManyReturns, covarianceMatrix } from '../lib/finance/portfolioRisk'
import { dailyReturns, MIN_OBSERVATIONS } from '../lib/finance/historical'
import { DEMO_QUOTES } from './demoData'
import { getDemoHistoricalSeries, hasDemoHistoricalSeries } from './demoHistory'

describe('demoHistory', () => {
  it('provides synthetic history for every risky demo asset', () => {
    for (const assetId of ['demo-btc', 'demo-spx-etf', 'demo-world-etf', 'demo-gold']) {
      const series = getDemoHistoricalSeries(assetId, 365)
      const quote = DEMO_QUOTES.find((candidate) => candidate.assetId === assetId)

      expect(hasDemoHistoricalSeries(assetId)).toBe(true)
      expect(series.length).toBeGreaterThanOrEqual(MIN_OBSERVATIONS + 1)
      expect(series.at(-1)?.date).toBe('2026-07-20')
      expect(series.at(-1)?.close).toBeCloseTo(Number(quote?.price), 6)
    }
  })

  it('aligns into a usable covariance sample for risk analysis', () => {
    const returns = ['demo-btc', 'demo-spx-etf', 'demo-world-etf', 'demo-gold'].map((assetId) =>
      dailyReturns(getDemoHistoricalSeries(assetId, 365)),
    )
    const aligned = alignManyReturns(returns)
    const covariance = covarianceMatrix(aligned.columns, 252)

    expect(aligned.dates.length).toBeGreaterThanOrEqual(MIN_OBSERVATIONS)
    expect(covariance.ok).toBe(true)
  })

  it('does not invent history for cash', () => {
    expect(hasDemoHistoricalSeries('demo-cash-eur')).toBe(false)
    expect(getDemoHistoricalSeries('demo-cash-eur', 365)).toEqual([])
  })
})
