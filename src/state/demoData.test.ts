import { describe, expect, it } from 'vitest'
import { buildPortfolioView, type PortfolioView } from '../lib/portfolio'
import {
  DEMO_ACCOUNTS,
  DEMO_ASSETS,
  DEMO_FX_EURUSD,
  DEMO_PORTFOLIO_TARGET_EUR,
  DEMO_QUOTES,
  DEMO_TOTAL_PNL_EUR,
  DEMO_TRANSACTIONS,
} from './demoData'

function buildDemoView(): PortfolioView {
  const quotes = Object.fromEntries(DEMO_QUOTES.map((quote) => [quote.assetId, quote]))
  return buildPortfolioView({
    accounts: DEMO_ACCOUNTS,
    assets: DEMO_ASSETS,
    transactions: DEMO_TRANSACTIONS,
    quotes,
    fxRates: [DEMO_FX_EURUSD],
    displayCurrency: 'EUR',
  })
}

describe('demoData', () => {
  it('builds the phase 1 demo portfolio with exact reference totals', () => {
    const view = buildDemoView()

    expect(view.totalValue.toFixed(2)).toBe(DEMO_PORTFOLIO_TARGET_EUR)
    expect(view.totalPnl?.toFixed(2)).toBe(DEMO_TOTAL_PNL_EUR)
    expect(view.totalReturnPct?.times(100).toFixed(2)).toBe('3.11')
    expect(view.totalInvested?.toFixed(2)).toBe('22812.00')
    expect(view.totalProceeds?.toFixed(2)).toBe('472.20')
    expect(view.hasDemoData).toBe(true)
    expect(view.valuationComplete).toBe(true)
    expect(view.financialsComplete).toBe(true)
  })

  it('contains exactly the requested six assets and approximate weights', () => {
    const view = buildDemoView()
    const weights = new Map(
      view.positions.map((position) => [
        position.asset.symbol,
        position.value!.div(view.totalValue).times(100).toDecimalPlaces(1).toString(),
      ]),
    )

    expect(view.positions.map((position) => position.asset.symbol).sort()).toEqual([
      'AAPL',
      'BTC',
      'EUR',
      'IWDA',
      'SXR8',
      'TSLA',
    ])
    expect(weights).toEqual(
      new Map([
        ['BTC', '35.9'],
        ['IWDA', '25'],
        ['SXR8', '8.3'],
        ['AAPL', '16'],
        ['TSLA', '10.5'],
        ['EUR', '4.3'],
      ]),
    )
    expect(DEMO_ASSETS.some((asset) => asset.symbol === 'VWCE' || asset.symbol === 'ORO')).toBe(
      false,
    )
  })

  it('keeps Apple as a direct position split across two accounts', () => {
    const apple = buildDemoView().positions.find((position) => position.asset.symbol === 'AAPL')

    expect(apple).toBeDefined()
    expect(apple!.asset.assetType).toBe('stock')
    expect(apple!.accountBreakdown).toHaveLength(2)
    expect(apple!.accountBreakdown.map((part) => part.accountId).sort()).toEqual([
      'demo-acc-broker',
      'demo-acc-broker-2',
    ])
  })

  it('exposes Apple and Tesla overlaps inside IWDA and SXR8', () => {
    const funds = DEMO_ASSETS.filter((asset) => asset.assetType === 'etf')

    expect(funds.map((asset) => asset.symbol).sort()).toEqual(['IWDA', 'SXR8'])
    for (const fund of funds) {
      const holdings = new Set(fund.holdings?.map((holding) => holding.symbol))
      expect(holdings.has('AAPL')).toBe(true)
      expect(holdings.has('TSLA')).toBe(true)
    }
  })

  it('marks every demo record as demo quality or demo owned', () => {
    expect(DEMO_ACCOUNTS.every((account) => account.id.startsWith('demo-'))).toBe(true)
    expect(DEMO_ASSETS.every((asset) => asset.isDemo === true)).toBe(true)
    expect(DEMO_TRANSACTIONS.every((transaction) => transaction.isDemo === true)).toBe(true)
    expect(DEMO_QUOTES.every((quote) => quote.quality === 'demo')).toBe(true)
    expect(DEMO_FX_EURUSD.quality).toBe('demo')
  })

  it('converts USD demo quotes with explicit demo FX instead of parity', () => {
    const view = buildDemoView()
    const btc = view.positions.find((position) => position.asset.symbol === 'BTC')!
    const apple = view.positions.find((position) => position.asset.symbol === 'AAPL')!

    expect(btc.value?.toFixed(2)).toBe('8274.69')
    expect(apple.value?.toFixed(2)).toBe('3687.88')
    expect(btc.value?.toFixed(2)).not.toBe(btc.quantity.times(66500).toFixed(2))
    expect(apple.value?.toFixed(2)).not.toBe(apple.quantity.times(220).toFixed(2))
  })
})
