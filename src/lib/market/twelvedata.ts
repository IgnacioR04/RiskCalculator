/**
 * Adaptador Twelve Data. La clave NUNCA está en el navegador: las llamadas
 * pasan por la Edge Function `market-proxy` de Supabase, que añade la clave
 * y aplica rate limiting por usuario (supabase/functions/market-proxy).
 * Si Supabase no está configurado, el proveedor se declara no disponible y
 * la cadena cae a CoinGecko / manual.
 */
import type { AssetType, Currency } from '../domain'
import { fetchJson } from './http'
import {
  ProviderError,
  type AssetMatch,
  type Candle,
  type MarketDataProvider,
  type MarketQuote,
} from './provider'

function proxyBase(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (url === undefined || url === '') return null
  return `${url.replace(/\/$/, '')}/functions/v1/market-proxy`
}

function authHeaders(): Record<string, string> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return anon !== undefined && anon !== '' ? { Authorization: `Bearer ${anon}` } : {}
}

const TYPE_MAP: Record<string, AssetType> = {
  'Common Stock': 'stock',
  ETF: 'etf',
  'Digital Currency': 'crypto',
  Index: 'index',
  Commodity: 'commodity',
}

interface TdSymbolSearch {
  data?: {
    symbol: string
    instrument_name: string
    exchange: string
    currency: string
    instrument_type: string
  }[]
}

interface TdQuote {
  symbol?: string
  close?: string
  currency?: string
  timestamp?: number
  code?: number
  message?: string
}

interface TdTimeSeries {
  values?: { datetime: string; open: string; high: string; low: string; close: string }[]
  code?: number
  message?: string
}

function ensureOk<T extends { code?: number; message?: string }>(data: T): T {
  if (data.code !== undefined && data.code !== 200) {
    const kind = data.code === 429 ? 'rate_limited' : data.code === 404 ? 'not_found' : 'network'
    throw new ProviderError(data.message ?? `Twelve Data devolvió ${data.code}`, kind)
  }
  return data
}

export const twelveDataProvider: MarketDataProvider = {
  id: 'twelvedata',
  label: 'Twelve Data (vía proxy seguro)',

  isConfigured: () => proxyBase() !== null,

  async searchAssets(query: string): Promise<AssetMatch[]> {
    const base = proxyBase()
    if (base === null) throw new ProviderError('Twelve Data no está configurado', 'not_configured')
    const data = await fetchJson<TdSymbolSearch>(
      `${base}?endpoint=symbol_search&symbol=${encodeURIComponent(query)}`,
      { headers: authHeaders() },
    )
    return (data.data ?? []).slice(0, 10).map((r) => ({
      symbol: r.symbol,
      name: r.instrument_name,
      assetType: TYPE_MAP[r.instrument_type] ?? 'stock',
      quoteCurrency: r.currency === 'EUR' || r.currency === 'USD' ? r.currency : null,
      exchange: r.exchange,
      providerIds: { twelvedata: r.symbol },
      provider: 'twelvedata',
    }))
  },

  async getQuote(providerId: string, _preferredCurrency: Currency): Promise<MarketQuote> {
    const base = proxyBase()
    if (base === null) throw new ProviderError('Twelve Data no está configurado', 'not_configured')
    const data = ensureOk(
      await fetchJson<TdQuote>(`${base}?endpoint=quote&symbol=${encodeURIComponent(providerId)}`, {
        headers: authHeaders(),
      }),
    )
    if (data.close === undefined || data.currency === undefined) {
      throw new ProviderError('Respuesta de Twelve Data sin precio', 'invalid_response')
    }
    if (data.currency !== 'EUR' && data.currency !== 'USD') {
      throw new ProviderError(
        `Divisa ${data.currency} no soportada en el MVP (solo EUR/USD)`,
        'invalid_response',
      )
    }
    return {
      price: data.close,
      currency: data.currency,
      timestamp:
        data.timestamp !== undefined
          ? new Date(data.timestamp * 1000).toISOString()
          : new Date().toISOString(),
      provider: 'twelvedata',
      // El plan gratuito sirve datos que pueden ir con demora: se declara.
      quality: 'delayed',
    }
  },

  async getDailyOHLC(providerId: string, days: number, _currency: Currency): Promise<Candle[]> {
    const base = proxyBase()
    if (base === null) throw new ProviderError('Twelve Data no está configurado', 'not_configured')
    const data = ensureOk(
      await fetchJson<TdTimeSeries>(
        `${base}?endpoint=time_series&symbol=${encodeURIComponent(providerId)}&interval=1day&outputsize=${days}`,
        { headers: authHeaders() },
      ),
    )
    return (data.values ?? [])
      .map((v) => ({
        time: v.datetime.slice(0, 10),
        open: v.open,
        high: v.high,
        low: v.low,
        close: v.close,
      }))
      .reverse()
  },

  async getHistoricalDaily(providerId: string, date: string, currency: Currency) {
    const candles = await this.getDailyOHLC(providerId, 5000, currency)
    const match = candles.find((c) => c.time === date)
    if (match === undefined) return null
    return { close: match.close, low: match.low, high: match.high }
  },
}
