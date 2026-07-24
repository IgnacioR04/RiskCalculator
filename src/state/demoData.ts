/**
 * Datos de demostración FICTICIOS. Símbolos reales, precios inventados.
 * Todo lleva isDemo: true y la UI lo etiqueta como «Datos demo».
 * Permiten usar la aplicación completa sin claves de ningún proveedor.
 */
import type { Asset, BrokerAccount, Quote, Transaction } from '../lib/domain'

export const DEMO_ACCOUNTS: BrokerAccount[] = [
  {
    id: 'demo-acc-broker',
    brokerName: 'Bróker Demo',
    accountLabel: 'Cuenta de valores (demo)',
    defaultCurrency: 'EUR',
    country: 'ES',
  },
  {
    id: 'demo-acc-exchange',
    brokerName: 'Exchange Demo',
    accountLabel: 'Cripto (demo)',
    defaultCurrency: 'EUR',
  },
]

export const DEMO_ASSETS: Asset[] = [
  {
    id: 'demo-btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    assetType: 'crypto',
    quoteCurrency: 'USD',
    providerIds: { coingecko: 'bitcoin', twelvedata: 'BTC/USD' },
    isDemo: true,
  },
  {
    id: 'demo-spx-etf',
    symbol: 'SXR8',
    name: 'iShares Core S&P 500 UCITS ETF (Acc)',
    assetType: 'etf',
    quoteCurrency: 'EUR',
    isin: 'IE00B5BMR087',
    exchange: 'XETRA',
    country: 'US',
    sector: 'Diversificado',
    providerIds: { twelvedata: 'SXR8' },
    isDemo: true,
  },
  {
    id: 'demo-gold',
    symbol: 'ORO',
    name: 'Oro (posición en Revolut, demo)',
    assetType: 'commodity',
    quoteCurrency: 'EUR',
    manualPrice: { price: '68.40', currency: 'EUR', updatedAt: '2026-07-20T10:00:00Z' },
    isDemo: true,
  },
  {
    id: 'demo-cash-eur',
    symbol: 'EUR',
    name: 'Efectivo EUR',
    assetType: 'cash',
    quoteCurrency: 'EUR',
    isDemo: true,
  },
]

/**
 * La posición demo de BTC reproduce el caso de aceptación:
 * 100 € comprados a 70.000, precio demo actual 58.000.
 */
export const DEMO_TRANSACTIONS: Transaction[] = [
  {
    id: 'demo-tx-btc-1',
    accountId: 'demo-acc-exchange',
    assetId: 'demo-btc',
    type: 'buy',
    datetime: '2026-01-15T09:30:00Z',
    investedAmount: '100',
    investedCurrency: 'EUR',
    quantity: '0.00142857',
    executionPrice: '70000',
    quoteCurrency: 'EUR',
    fee: null,
    feeCurrency: null,
    sourceType: 'exact',
    confidence: 'exact',
    isDemo: true,
  },
  {
    id: 'demo-tx-etf-1',
    accountId: 'demo-acc-broker',
    assetId: 'demo-spx-etf',
    type: 'buy',
    datetime: '2025-11-03T14:00:00Z',
    investedAmount: '300',
    investedCurrency: 'EUR',
    quantity: '0.55',
    executionPrice: '545.45',
    quoteCurrency: 'EUR',
    fee: null,
    feeCurrency: null,
    sourceType: 'exact',
    confidence: 'exact',
    isDemo: true,
  },
  {
    id: 'demo-tx-etf-2',
    accountId: 'demo-acc-broker',
    assetId: 'demo-spx-etf',
    type: 'buy',
    datetime: '2026-03-03T14:05:00Z',
    investedAmount: '200',
    investedCurrency: 'EUR',
    quantity: '0.34',
    executionPrice: '588.24',
    quoteCurrency: 'EUR',
    fee: null,
    feeCurrency: null,
    sourceType: 'historical_estimate',
    confidence: 'medium',
    estimationNotes:
      'Estimado con el cierre diario del 2026-03-03 (datos demo); rango del día 583–592.',
    isDemo: true,
  },
  {
    id: 'demo-tx-gold-1',
    accountId: 'demo-acc-broker',
    assetId: 'demo-gold',
    type: 'buy',
    datetime: '2026-02-10T11:00:00Z',
    investedAmount: '100',
    investedCurrency: 'EUR',
    quantity: '1.5432',
    executionPrice: '64.80',
    quoteCurrency: 'EUR',
    fee: null,
    feeCurrency: null,
    sourceType: 'return_estimate',
    confidence: 'low',
    estimationNotes: 'Derivado de «tengo unos 100 € en oro»; cantidad estimada (demo).',
    isDemo: true,
  },
  {
    id: 'demo-tx-cash-1',
    accountId: 'demo-acc-broker',
    assetId: 'demo-cash-eur',
    type: 'buy',
    datetime: '2026-01-02T09:00:00Z',
    investedAmount: '150',
    investedCurrency: 'EUR',
    quantity: '150',
    executionPrice: '1',
    quoteCurrency: 'EUR',
    fee: null,
    feeCurrency: null,
    sourceType: 'exact',
    confidence: 'exact',
    isDemo: true,
  },
]

const DEMO_FETCHED_AT = '2026-07-20T10:00:00Z'

export const DEMO_QUOTES: Quote[] = [
  {
    assetId: 'demo-btc',
    price: '58000',
    currency: 'USD',
    timestamp: DEMO_FETCHED_AT,
    provider: 'demo',
    quality: 'demo',
    fetchedAt: DEMO_FETCHED_AT,
  },
  {
    assetId: 'demo-spx-etf',
    price: '561.20',
    currency: 'EUR',
    timestamp: DEMO_FETCHED_AT,
    provider: 'demo',
    quality: 'demo',
    fetchedAt: DEMO_FETCHED_AT,
  },
  {
    assetId: 'demo-gold',
    price: '68.40',
    currency: 'EUR',
    timestamp: DEMO_FETCHED_AT,
    provider: 'demo',
    quality: 'demo',
    fetchedAt: DEMO_FETCHED_AT,
  },
  {
    assetId: 'demo-cash-eur',
    price: '1',
    currency: 'EUR',
    timestamp: DEMO_FETCHED_AT,
    provider: 'demo',
    quality: 'demo',
    fetchedAt: DEMO_FETCHED_AT,
  },
]

export const DEMO_FX_EURUSD = {
  base: 'EUR' as const,
  quote: 'USD' as const,
  rate: '1.0850',
  date: '2026-07-20',
  provider: 'demo',
  quality: 'demo' as const,
  fetchedAt: DEMO_FETCHED_AT,
}
