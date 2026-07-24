import { describe, expect, it } from 'vitest'
import type { Asset, BrokerAccount, Transaction } from './domain'
import { buildPortfolioView } from './portfolio'

const account: BrokerAccount = {
  id: 'acc1',
  brokerName: 'Test',
  accountLabel: 'Cuenta',
  defaultCurrency: 'EUR',
}

function tx(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'quantity' | 'investedAmount'>): Transaction {
  return {
    accountId: 'acc1',
    assetId: 'a1',
    datetime: '2026-01-01T00:00:00Z',
    investedCurrency: 'EUR',
    quoteCurrency: 'EUR',
    executionPrice: null,
    fee: null,
    feeCurrency: null,
    sourceType: 'exact',
    confidence: 'exact',
    ...partial,
  }
}

const asset: Asset = {
  id: 'a1',
  symbol: 'AAA',
  name: 'Activo A',
  assetType: 'stock',
  quoteCurrency: 'EUR',
}

const asset2: Asset = { ...asset, id: 'a2', symbol: 'BBB' }

describe('buildPortfolioView — resiliencia ante datos incoherentes', () => {
  it('una venta de más unidades NO tumba la vista: marca el activo y sigue', () => {
    const transactions: Transaction[] = [
      tx({ id: 't1', assetId: 'a1', type: 'sell', quantity: '2', investedAmount: '100' }),
      // Otro activo correcto que debe seguir valorándose.
      tx({ id: 't2', assetId: 'a2', type: 'buy', quantity: '10', investedAmount: '100', datetime: '2026-01-02T00:00:00Z' }),
    ]
    const view = buildPortfolioView({
      assets: [asset, asset2],
      accounts: [account],
      transactions,
      quotes: {
        a2: {
          assetId: 'a2',
          price: '12',
          currency: 'EUR',
          timestamp: '2026-02-01T00:00:00Z',
          provider: 'manual',
          quality: 'manual',
          fetchedAt: '2026-02-01T00:00:00Z',
        },
      },
      fxRates: [],
      displayCurrency: 'EUR',
    })

    const bad = view.positions.find((p) => p.asset.id === 'a1')
    const good = view.positions.find((p) => p.asset.id === 'a2')
    expect(bad?.inconsistent).toBe(true)
    expect(bad?.value).toBeNull()
    expect(view.warnings.some((w) => w.includes('incoherentes'))).toBe(true)
    // El activo correcto se valora con normalidad.
    expect(good?.value?.toFixed(0)).toBe('120')
    expect(view.totalValue.toFixed(0)).toBe('120')
  })

  it('un portfolio consistente no marca nada como incoherente', () => {
    const view = buildPortfolioView({
      assets: [asset],
      accounts: [account],
      transactions: [tx({ id: 't1', assetId: 'a1', type: 'buy', quantity: '5', investedAmount: '100' })],
      quotes: {},
      fxRates: [],
      displayCurrency: 'EUR',
    })
    expect(view.positions[0]!.inconsistent).toBeUndefined()
  })
})
