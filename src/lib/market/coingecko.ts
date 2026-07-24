/**
 * Adaptador CoinGecko (API pública, sin clave). Solo criptoactivos.
 * Límites estrictos de peticiones: se usa como respaldo y con caché.
 * https://docs.coingecko.com/reference/introduction
 */
import type { Currency } from '../domain'
import { fetchJson } from './http'
import {
  ProviderError,
  type AssetMatch,
  type Candle,
  type MarketDataProvider,
  type MarketQuote,
} from './provider'

const BASE = 'https://api.coingecko.com/api/v3'

interface SearchResponse {
  coins: { id: string; symbol: string; name: string }[]
}

interface SimplePriceResponse {
  [id: string]: { eur?: number; usd?: number; last_updated_at?: number }
}

interface MarketChartResponse {
  prices: [number, number][]
}

interface HistoryResponse {
  market_data?: { current_price?: { eur?: number; usd?: number } }
}

export const coingeckoProvider: MarketDataProvider = {
  id: 'coingecko',
  label: 'CoinGecko (cripto, sin clave)',

  isConfigured: () => true,

  async searchAssets(query: string): Promise<AssetMatch[]> {
    const data = await fetchJson<SearchResponse>(
      `${BASE}/search?query=${encodeURIComponent(query)}`,
    )
    return data.coins.slice(0, 8).map((c) => ({
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      assetType: 'crypto',
      quoteCurrency: null,
      providerIds: { coingecko: c.id },
      provider: 'coingecko',
    }))
  },

  async getQuote(providerId: string, preferredCurrency: Currency): Promise<MarketQuote> {
    const vs = preferredCurrency.toLowerCase() as 'eur' | 'usd'
    const data = await fetchJson<SimplePriceResponse>(
      `${BASE}/simple/price?ids=${encodeURIComponent(providerId)}&vs_currencies=eur,usd&include_last_updated_at=true`,
    )
    const entry = data[providerId]
    const price = entry?.[vs]
    if (entry === undefined || price === undefined) {
      throw new ProviderError(`CoinGecko no tiene precio para «${providerId}»`, 'not_found')
    }
    return {
      price: String(price),
      currency: preferredCurrency,
      timestamp:
        entry.last_updated_at !== undefined
          ? new Date(entry.last_updated_at * 1000).toISOString()
          : new Date().toISOString(),
      provider: 'coingecko',
      quality: 'real',
    }
  },

  async getDailyOHLC(providerId: string, days: number, currency: Currency): Promise<Candle[]> {
    const vs = currency.toLowerCase()
    const data = await fetchJson<MarketChartResponse>(
      `${BASE}/coins/${encodeURIComponent(providerId)}/market_chart?vs_currency=${vs}&days=${days}&interval=daily`,
    )
    // market_chart entrega precios puntuales diarios; se usan como cierre.
    return data.prices.map(([ms, price]) => {
      const date = new Date(ms).toISOString().slice(0, 10)
      const p = String(price)
      return { time: date, open: p, high: p, low: p, close: p }
    })
  },

  async getHistoricalDaily(providerId: string, date: string, currency: Currency) {
    // /coins/{id}/history espera dd-mm-yyyy y devuelve el precio de ese día.
    const [y, m, d] = date.split('-')
    if (y === undefined || m === undefined || d === undefined) {
      throw new ProviderError('Fecha inválida (se espera YYYY-MM-DD)', 'invalid_response')
    }
    const data = await fetchJson<HistoryResponse>(
      `${BASE}/coins/${encodeURIComponent(providerId)}/history?date=${d}-${m}-${y}&localization=false`,
    )
    const price = data.market_data?.current_price?.[currency.toLowerCase() as 'eur' | 'usd']
    if (price === undefined) return null
    // CoinGecko /history no da rango del día: se declara solo el cierre.
    return { close: String(price), low: null, high: null }
  },
}
