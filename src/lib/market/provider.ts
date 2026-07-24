/**
 * Abstracción de proveedores de datos de mercado. Ningún componente de UI
 * habla con un proveedor concreto: siempre a través de estas interfaces.
 */
import type { AssetType, Currency, DataQuality } from '../domain'

export interface AssetMatch {
  symbol: string
  name: string
  assetType: AssetType
  quoteCurrency: Currency | null
  exchange?: string
  isin?: string
  /** Identificadores por proveedor para futuras consultas. */
  providerIds: Record<string, string>
  provider: string
}

export interface MarketQuote {
  price: string
  currency: Currency
  /** Instante del dato (ISO). */
  timestamp: string
  provider: string
  quality: DataQuality
  /** Demora conocida en segundos, si el proveedor la declara. */
  delaySeconds?: number
}

export interface Candle {
  /** Fecha (YYYY-MM-DD) o instante ISO para intradía. */
  time: string
  open: string
  high: string
  low: string
  close: string
}

export interface FxRateResult {
  base: Currency
  quote: Currency
  rate: string
  date: string
  provider: string
  quality: DataQuality
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_configured' | 'not_found' | 'rate_limited' | 'network' | 'invalid_response',
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export interface MarketDataProvider {
  readonly id: string
  readonly label: string
  /** true si el proveedor puede usarse en el entorno actual. */
  isConfigured(): boolean
  searchAssets(query: string): Promise<AssetMatch[]>
  getQuote(providerId: string, preferredCurrency: Currency): Promise<MarketQuote>
  getDailyOHLC(providerId: string, days: number, currency: Currency): Promise<Candle[]>
  /** Precio de cierre (y rango del día) en una fecha concreta, si existe. */
  getHistoricalDaily(
    providerId: string,
    date: string,
    currency: Currency,
  ): Promise<{ close: string; low: string | null; high: string | null } | null>
}

export interface FxProvider {
  readonly id: string
  readonly label: string
  getRate(base: Currency, quote: Currency, date?: string): Promise<FxRateResult>
}
