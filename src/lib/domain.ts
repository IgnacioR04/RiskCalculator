/**
 * Modelo de dominio del cliente. Espejo del esquema SQL (supabase/migrations)
 * pero serializable: los importes viajan como string y se convierten a
 * Decimal solo dentro de la lógica financiera.
 */

export type Currency = 'EUR' | 'USD'

export type AssetType =
  | 'stock'
  | 'etf'
  | 'crypto'
  | 'commodity'
  | 'index' // solo referencia/benchmark; no siempre invertible directamente
  | 'cash'
  | 'manual'

export type DataQuality = 'real' | 'delayed' | 'estimated' | 'demo' | 'manual'

export interface BrokerAccount {
  id: string
  brokerName: string
  accountLabel: string
  defaultCurrency: Currency
  country?: string
  /**
   * Regla de comisión elegida por el usuario. Las reglas de catálogo son
   * sugerencias editables: el plan real del bróker siempre prevalece.
   */
  feePolicy?: BrokerFeePolicy
}

export type FeePolicyMode = 'catalog' | 'custom' | 'none'

export interface BrokerFeePolicy {
  mode: FeePolicyMode
  /** Identificador estable de la regla de catálogo, si procede. */
  catalogId?: string
  label: string
  /** Porcentaje expresado como fracción: 0.0025 = 0,25 %. */
  rate: string
  /** Cargo fijo y mínimo en `currency`. */
  fixed: string
  minimum: string
  currency: Currency
  /** Operaciones gratuitas restantes del ciclo, si el usuario las conoce. */
  freeTradesRemaining?: number
  /** Fecha de referencia de la regla y fuente informativa. */
  asOf?: string
  sourceUrl?: string
}

export interface AssetHolding {
  symbol: string
  name?: string
  /** Peso dentro del ETF/fondo como fracción 0–1; opcional si no se conoce. */
  weight?: string
}

export interface Asset {
  id: string
  symbol: string
  name: string
  assetType: AssetType
  quoteCurrency: Currency
  isin?: string
  exchange?: string
  sector?: string
  country?: string
  /** Componentes conocidos de un ETF/fondo para detectar solapamientos. */
  holdings?: AssetHolding[]
  /** Identificadores por proveedor (p. ej. { twelvedata: 'AAPL', coingecko: 'bitcoin' }). */
  providerIds?: Record<string, string>
  /** Último precio introducido a mano (respaldo universal). */
  manualPrice?: { price: string; currency: Currency; updatedAt: string }
  /** true en los datos de demostración. */
  isDemo?: boolean
}

export type TransactionSource =
  | 'exact'
  | 'historical_estimate'
  | 'return_estimate'
  | 'json_import'
  | 'position_snapshot'
export type Confidence = 'exact' | 'high' | 'medium' | 'low'

export interface Transaction {
  id: string
  accountId: string
  assetId: string
  type: 'buy' | 'sell'
  /** ISO 8601. */
  datetime: string
  /** Dinero movido: invertido (compra) u obtenido (venta), en investedCurrency. */
  investedAmount: string
  investedCurrency: Currency
  quantity: string
  /** Precio de ejecución por unidad en quoteCurrency; null si no se conoce. */
  executionPrice: string | null
  quoteCurrency: Currency
  /** Comisión real o estimada aplicada a la operación. */
  fee: string | null
  feeCurrency: Currency | null
  sourceType: TransactionSource
  confidence: Confidence
  estimationNotes?: string
  /**
   * false cuando una captura solo permite conocer unidades/valor actual pero
   * no el coste histórico. La posición se muestra, pero no se calcula P&L.
   */
  costKnown?: boolean
  isDemo?: boolean
}

export interface Quote {
  assetId: string
  price: string
  currency: Currency
  /** Instante del dato, ISO 8601. */
  timestamp: string
  provider: string
  quality: DataQuality
  /** Momento en que se obtuvo. */
  fetchedAt: string
}

export interface FxRate {
  base: Currency
  quote: Currency
  rate: string
  /** Fecha del cambio (YYYY-MM-DD). */
  date: string
  provider: string
  quality: DataQuality
  fetchedAt: string
}

/** Escenario guardado desde la calculadora. Nunca ejecuta compras. */
export interface SavedScenario {
  id: string
  name: string
  createdAt: string
  mode: 'restore' | 'breakeven'
  currency: Currency
  inputs: {
    referenceValue?: string
    currentValue?: string
    investedAmount?: string
    averagePrice?: string
    currentPrice?: string
    targetPrice?: string
    expectedGrowthPct?: string
    budget?: string
  }
}

export type RiskCategory = 'conservador' | 'moderado' | 'dinamico'

export interface RiskProfile {
  version: number
  answers: Record<string, string>
  score: number
  category: RiskCategory
  completedAt: string
}

export interface ImportBatch {
  id: string
  rawJson: unknown
  validationStatus: 'valid' | 'invalid'
  warnings: string[]
  confirmedAt: string | null
  createdAt: string
}

export interface Settings {
  displayCurrency: Currency
  locale: 'es-ES'
  /** Tasa libre de riesgo anual usada en Sharpe/Sortino (fracción). */
  riskFreeRate: string
}

export function uid(): string {
  return crypto.randomUUID()
}
