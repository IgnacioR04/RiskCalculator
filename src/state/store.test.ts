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
    importBatches: [],
    riskProfile: null,
    riskResults: [],
    demoLoaded: false,
    cloudSync: {
      userId: null,
      email: null,
      status: 'local',
      message: 'Datos guardados en este dispositivo.',
      lastSyncedAt: null,
    },
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
    expect(state.accounts.filter((account) => account.id.startsWith('demo-'))).toHaveLength(4)
    expect(state.assets.filter((asset) => asset.isDemo === true)).toHaveLength(6)
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
        assets: [
          userAsset,
          { ...userAsset, id: 'demo-world-etf', symbol: 'VWCE', isDemo: true },
          { ...userAsset, id: 'demo-gold', symbol: 'ORO', isDemo: true },
        ],
        transactions: [
          userTransaction,
          { ...userTransaction, id: 'demo-old-world', assetId: 'demo-world-etf', isDemo: true },
          { ...userTransaction, id: 'demo-old-gold', assetId: 'demo-gold', isDemo: true },
        ],
        quotes: {
          [userQuote.assetId]: userQuote,
          'demo-world-etf': { ...userQuote, assetId: 'demo-world-etf', quality: 'demo' },
          'demo-gold': { ...userQuote, assetId: 'demo-gold', quality: 'demo' },
        },
        fxRates: [],
        scenarios: [],
        importBatches: [],
        riskProfile: null,
        riskResults: [],
        demoLoaded: true,
      },
      2,
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
    expect(migrated.assets.some((asset) => asset.id === 'demo-world-etf')).toBe(false)
    expect(migrated.assets.some((asset) => asset.id === 'demo-gold')).toBe(false)
    expect(migrated.assets.find((asset) => asset.symbol === 'IWDA')).toBeDefined()
    expect(migrated.assets.find((asset) => asset.symbol === 'AAPL')).toBeDefined()
    expect(migrated.assets.find((asset) => asset.symbol === 'TSLA')).toBeDefined()
    expect(migrated.demoLoaded).toBe(true)
    expect(view.totalValue.minus(110).toFixed(2)).toBe(DEMO_PORTFOLIO_TARGET_EUR)
  })
})
