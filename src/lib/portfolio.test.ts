import { describe, expect, it } from 'vitest'
import type { Asset, BrokerAccount, Transaction } from './domain'
import { buildPortfolioView } from './portfolio'

const account: BrokerAccount = {
  id: 'acc1',
  brokerName: 'Test',
  accountLabel: 'Cuenta',
  defaultCurrency: 'EUR',
}
const account2: BrokerAccount = {
  id: 'acc2',
  brokerName: 'Otro',
  accountLabel: 'Segunda',
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

  it('no asume FX 1:1: deja costes y rentabilidad no disponibles', () => {
    const view = buildPortfolioView({
      assets: [{ ...asset, quoteCurrency: 'USD' }],
      accounts: [account],
      transactions: [
        tx({
          id: 'usd',
          type: 'buy',
          quantity: '1',
          investedAmount: '100',
          investedCurrency: 'USD',
          quoteCurrency: 'USD',
        }),
      ],
      quotes: {
        a1: {
          assetId: 'a1',
          price: '110',
          currency: 'USD',
          timestamp: '2026-01-02T00:00:00Z',
          provider: 'manual',
          quality: 'manual',
          fetchedAt: '2026-01-02T00:00:00Z',
        },
      },
      fxRates: [],
      displayCurrency: 'EUR',
    })
    expect(view.positions[0]!.cost).toBeNull()
    expect(view.totalPnl).toBeNull()
    expect(view.moneyWeighted).toEqual({ ok: false, reason: 'missing_data' })
    expect(view.warnings.some((warning) => warning.includes('Sin cambio USD→EUR'))).toBe(true)
  })

  it('reparte el mismo activo entre cuentas según sus unidades reales', () => {
    const view = buildPortfolioView({
      assets: [asset],
      accounts: [account, account2],
      transactions: [
        tx({ id: 'one', type: 'buy', quantity: '1', investedAmount: '8' }),
        tx({
          id: 'two',
          accountId: 'acc2',
          type: 'buy',
          quantity: '3',
          investedAmount: '24',
        }),
      ],
      quotes: {
        a1: {
          assetId: 'a1',
          price: '10',
          currency: 'EUR',
          timestamp: '2026-01-02T00:00:00Z',
          provider: 'manual',
          quality: 'manual',
          fetchedAt: '2026-01-02T00:00:00Z',
        },
      },
      fxRates: [],
      displayCurrency: 'EUR',
    })
    expect(view.byAccount).toHaveLength(2)
    expect(view.byAccount.find((slice) => slice.key === 'acc1')!.value.toString()).toBe('10')
    expect(view.byAccount.find((slice) => slice.key === 'acc2')!.value.toString()).toBe('30')
  })

  it('incluye ventas y comisiones en el resultado total', () => {
    const view = buildPortfolioView({
      assets: [asset],
      accounts: [account],
      transactions: [
        tx({ id: 'buy', type: 'buy', quantity: '10', investedAmount: '100', fee: '1', feeCurrency: 'EUR' }),
        tx({
          id: 'sell',
          type: 'sell',
          quantity: '5',
          investedAmount: '70',
          fee: '1',
          feeCurrency: 'EUR',
          datetime: '2026-02-01T00:00:00Z',
        }),
      ],
      quotes: {
        a1: {
          assetId: 'a1',
          price: '12',
          currency: 'EUR',
          timestamp: '2026-03-01T00:00:00Z',
          provider: 'manual',
          quality: 'manual',
          fetchedAt: '2026-03-01T00:00:00Z',
        },
      },
      fxRates: [],
      displayCurrency: 'EUR',
    })
    expect(view.totalInvested!.toString()).toBe('101')
    expect(view.totalProceeds!.toString()).toBe('69')
    expect(view.totalFees!.toString()).toBe('2')
    expect(view.totalPnl!.toFixed(2)).toBe('28.00')
    expect(view.totalRealizedPnl!.toFixed(2)).toBe('18.50')
  })
})
