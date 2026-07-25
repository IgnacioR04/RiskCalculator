import { describe, expect, it } from 'vitest'
import { buildPortfolioView } from '../lib/portfolio'
import {
  DEMO_ACCOUNTS,
  DEMO_ASSETS,
  DEMO_FX_EURUSD,
  DEMO_PORTFOLIO_TARGET_EUR,
  DEMO_QUOTES,
  DEMO_TRANSACTIONS,
} from './demoData'

describe('demoData', () => {
  it('builds the realistic demo portfolio at 23,049.26 EUR', () => {
    const quotes = Object.fromEntries(DEMO_QUOTES.map((quote) => [quote.assetId, quote]))
    const view = buildPortfolioView({
      accounts: DEMO_ACCOUNTS,
      assets: DEMO_ASSETS,
      transactions: DEMO_TRANSACTIONS,
      quotes,
      fxRates: [DEMO_FX_EURUSD],
      displayCurrency: 'EUR',
    })

    expect(view.totalValue.toFixed(2)).toBe(DEMO_PORTFOLIO_TARGET_EUR)
    expect(view.hasDemoData).toBe(true)
    expect(view.valuationComplete).toBe(true)
    expect(view.financialsComplete).toBe(true)
    expect(view.positions.map((position) => position.asset.id).sort()).toEqual([
      'demo-btc',
      'demo-cash-eur',
      'demo-gold',
      'demo-spx-etf',
      'demo-world-etf',
    ])
  })

  it('marks every demo record as demo quality or demo owned', () => {
    expect(DEMO_ACCOUNTS.every((account) => account.id.startsWith('demo-'))).toBe(true)
    expect(DEMO_ASSETS.every((asset) => asset.isDemo === true)).toBe(true)
    expect(DEMO_TRANSACTIONS.every((transaction) => transaction.isDemo === true)).toBe(true)
    expect(DEMO_QUOTES.every((quote) => quote.quality === 'demo')).toBe(true)
    expect(DEMO_FX_EURUSD.quality).toBe('demo')
  })
})
