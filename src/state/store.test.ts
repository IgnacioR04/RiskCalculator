import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Asset, BrokerAccount, Quote, Transaction } from '../lib/domain'
import { buildPortfolioView } from '../lib/portfolio'
import { DEMO_PORTFOLIO_TARGET_EUR } from './demoData'
import { migratePersistedState, useAppStore } from './store'

const userAccount: BrokerAccount = {
  id: 'user-account',
  brokerName: 'User Broker',
  accountLabel: 'User Account',
  defaultCurrency: 'EUR',
}

const userAsset: Asset = {
  id: 'user-asset',
  symbol: 'USR',
  name: 'User Asset',
  assetType: 'stock',
  quoteCurrency: 'EUR',
}

const userTransaction: Transaction = {
  id: 'user-transaction',
  accountId: 'user-account',
  assetId: 'user-asset',
  type: 'buy',
  datetime: '2026-01-01T00:00:00Z',
  investedAmount: '100',
  investedCurrency: 'EUR',
  quantity: '1',
  executionPrice: '100',
  quoteCurrency: 'EUR',
  fee: null,
  feeCurrency: null,
  sourceType: 'exact',
  confidence: 'exact',
}

const userQuote: Quote = {
  assetId: 'user-asset',
  price: '110',
  currency: 'EUR',
  timestamp: '2026-07-20T00:00:00Z',
  provider: 'manual',
  quality: 'manual',
  fetchedAt: '2026-07-20T00:00:00Z',
}

function resetStore() {
  useAppStore.setState({
    settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
    accounts: [],
    assets: [],
    transactions: [],
    quotes: {},
    fxRates: [],
    scenarios: [],
    riskProfile: null,
    demoLoaded: false,
  })
}

describe('useAppStore demo data', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStore()
  })

  afterEach(() => {
    localStorage.clear()
    resetStore()
  })

  it('loads the new demo portfolio once', () => {
    useAppStore.getState().loadDemoData()
    useAppStore.getState().loadDemoData()

    const state = useAppStore.getState()
    const view = buildPortfolioView({
      accounts: state.accounts,
      assets: state.assets,
      transactions: state.transactions,
      quotes: state.quotes,
      fxRates: state.fxRates,
      displayCurrency: state.settings.displayCurrency,
    })

    expect(state.demoLoaded).toBe(true)
    expect(state.accounts.filter((account) => account.id.startsWith('demo-'))).toHaveLength(3)
    expect(state.assets.filter((asset) => asset.isDemo === true)).toHaveLength(5)
    expect(view.totalValue.toFixed(2)).toBe(DEMO_PORTFOLIO_TARGET_EUR)
  })

  it('removes demo records while preserving user records', () => {
    useAppStore.setState({
      accounts: [userAccount],
      assets: [userAsset],
      transactions: [userTransaction],
      quotes: { [userQuote.assetId]: userQuote },
    })
    useAppStore.getState().loadDemoData()
    useAppStore.getState().removeDemoData()

    const state = useAppStore.getState()
    expect(state.demoLoaded).toBe(false)
    expect(state.accounts).toEqual([userAccount])
    expect(state.assets).toEqual([userAsset])
    expect(state.transactions).toEqual([userTransaction])
    expect(state.quotes).toEqual({ [userQuote.assetId]: userQuote })
    expect(state.fxRates).toEqual([])
  })

  it('migrates persisted v1 demo data to the fresh realistic portfolio', () => {
    const migrated = migratePersistedState(
      {
        settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
        accounts: [userAccount, { ...userAccount, id: 'demo-old-account' }],
        assets: [userAsset, { ...userAsset, id: 'demo-old-asset', isDemo: true }],
        transactions: [
          userTransaction,
          { ...userTransaction, id: 'demo-old-transaction', assetId: 'demo-old-asset', isDemo: true },
        ],
        quotes: {
          [userQuote.assetId]: userQuote,
          'demo-old-asset': { ...userQuote, assetId: 'demo-old-asset', quality: 'demo' },
        },
        fxRates: [],
        scenarios: [],
        riskProfile: null,
        demoLoaded: true,
      },
      1,
    ) as ReturnType<typeof useAppStore.getState>

    const view = buildPortfolioView({
      accounts: migrated.accounts,
      assets: migrated.assets,
      transactions: migrated.transactions,
      quotes: migrated.quotes,
      fxRates: migrated.fxRates,
      displayCurrency: migrated.settings.displayCurrency,
    })

    expect(migrated.accounts.some((account) => account.id === userAccount.id)).toBe(true)
    expect(migrated.assets.some((asset) => asset.id === 'demo-old-asset')).toBe(false)
    expect(migrated.demoLoaded).toBe(true)
    expect(view.totalValue.minus(110).toFixed(2)).toBe(DEMO_PORTFOLIO_TARGET_EUR)
  })
})
