/**
 * Orquestador de datos de mercado: cadena de proveedores con caché en el
 * store, etiquetado de calidad y respaldo manual. Un fallo de proveedor
 * NUNCA bloquea la aplicación: deja la posición «sin precio» con aviso.
 *
 * Cadena: Twelve Data (si hay proxy) → CoinGecko (cripto) → manual/demo.
 * FX: BCE (Frankfurter) → último cambio en caché → demo.
 */
import type { Asset, AssetType, Currency, Quote } from '../domain'
import { useAppStore } from '../../state/store'
import { coingeckoProvider } from './coingecko'
import { ecbFxProvider, getFxDailySeries, type FxSeriesPoint } from './ecb'
import { ProviderError, type AssetMatch, type MarketQuote } from './provider'
import { twelveDataProvider } from './twelvedata'

const QUOTE_TTL_MS = 5 * 60 * 1000

export interface RefreshResult {
  assetId: string
  ok: boolean
  message?: string
}

function isFresh(quote: Quote | undefined): boolean {
  if (quote === undefined) return false
  if (quote.quality === 'demo' || quote.quality === 'manual') return false
  return Date.now() - new Date(quote.fetchedAt).getTime() < QUOTE_TTL_MS
}

/** Actualiza la cotización de un activo siguiendo la cadena de proveedores. */
export async function refreshQuote(asset: Asset, force = false): Promise<RefreshResult> {
  const store = useAppStore.getState()
  const existing = store.quotes[asset.id]
  if (!force && isFresh(existing)) {
    return { assetId: asset.id, ok: true, message: 'Cotización reciente en caché' }
  }

  const preferred: Currency = asset.quoteCurrency

  // 1) Twelve Data a través del proxy (si está configurado)
  const tdId = asset.providerIds?.['twelvedata']
  if (tdId !== undefined && twelveDataProvider.isConfigured()) {
    try {
      const q = await twelveDataProvider.getQuote(tdId, preferred)
      store.setQuote({
        assetId: asset.id,
        price: q.price,
        currency: q.currency,
        timestamp: q.timestamp,
        provider: q.provider,
        quality: q.quality,
        fetchedAt: new Date().toISOString(),
      })
      return { assetId: asset.id, ok: true }
    } catch (e) {
      if (!(e instanceof ProviderError) || e.kind === 'not_configured') {
        // continúa con el siguiente proveedor
      }
    }
  }

  // 2) CoinGecko para cripto
  const cgId = asset.providerIds?.['coingecko']
  if (cgId !== undefined && asset.assetType === 'crypto') {
    try {
      const q = await coingeckoProvider.getQuote(cgId, preferred)
      store.setQuote({
        assetId: asset.id,
        price: q.price,
        currency: q.currency,
        timestamp: q.timestamp,
        provider: q.provider,
        quality: q.quality,
        fetchedAt: new Date().toISOString(),
      })
      return { assetId: asset.id, ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error desconocido'
      return {
        assetId: asset.id,
        ok: false,
        message: `CoinGecko: ${msg}. Puedes introducir el precio manualmente.`,
      }
    }
  }

  // 3) Precio manual como respaldo (ya se aplica en la valoración)
  if (asset.manualPrice !== undefined) {
    return { assetId: asset.id, ok: true, message: 'Usando precio manual' }
  }

  return {
    assetId: asset.id,
    ok: false,
    message: `Sin proveedor disponible para ${asset.symbol}: introduce un precio manual.`,
  }
}

/** Actualiza todas las cotizaciones (secuencial para respetar rate limits). */
export async function refreshAllQuotes(force = false): Promise<RefreshResult[]> {
  const { assets, transactions } = useAppStore.getState()
  const withPositions = assets.filter(
    (a) => !(a.isDemo === true) && transactions.some((t) => t.assetId === a.id),
  )
  const results: RefreshResult[] = []
  for (const asset of withPositions) {
    results.push(await refreshQuote(asset, force))
  }
  return results
}

/** Actualiza el cambio EUR/USD del BCE y lo guarda en el store. */
export async function refreshFx(date?: string): Promise<{ ok: boolean; message?: string }> {
  const store = useAppStore.getState()
  try {
    const r = await ecbFxProvider.getRate('EUR', 'USD', date)
    store.setFxRate({
      base: r.base,
      quote: r.quote,
      rate: r.rate,
      date: r.date,
      provider: r.provider,
      quality: r.quality,
      fetchedAt: new Date().toISOString(),
    })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    return {
      ok: false,
      message: `No se pudo obtener el cambio EUR/USD (${msg}); se usará el último disponible.`,
    }
  }
}

/**
 * Búsqueda de activos: Twelve Data si hay proxy; CoinGecko para cripto.
 *
 * `expectedType` es el tipo del activo que se está enlazando. Sin él, buscar
 * «IAG» —una minera de oro— devolvía primero una cripto homónima, y no había
 * forma de llegar a la acción. Con él, las coincidencias del tipo correcto van
 * delante y las del tipo contrario quedan al final o se descartan.
 */
export async function searchAssets(
  query: string,
  expectedType?: AssetType | null,
): Promise<AssetMatch[]> {
  const results: AssetMatch[] = []
  const errors: string[] = []
  if (twelveDataProvider.isConfigured()) {
    try {
      results.push(...(await twelveDataProvider.searchAssets(query)))
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'twelvedata')
    }
  }
  try {
    results.push(...(await coingeckoProvider.searchAssets(query)))
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'coingecko')
  }
  if (results.length === 0 && errors.length > 0) {
    throw new ProviderError(errors.join(' · '), 'network')
  }

  if (expectedType === undefined || expectedType === null) return ordenar(results, query)

  // Buscando algo que NO es cripto, una cripto homónima casi nunca es lo que
  // se quiere: se manda al final en vez de eliminarla, por si el tipo venía
  // mal clasificado desde la importación.
  const mismoTipo = results.filter((r) => r.assetType === expectedType)
  const resto = results.filter((r) => r.assetType !== expectedType)
  return [...ordenar(mismoTipo, query), ...ordenar(resto, query)]
}

/** Coincidencia exacta de ticker primero; luego por capitalización. */
function ordenar(matches: AssetMatch[], query: string): AssetMatch[] {
  const q = query.trim().toUpperCase()
  return [...matches].sort((a, b) => {
    const exactA = a.symbol.toUpperCase() === q ? 0 : 1
    const exactB = b.symbol.toUpperCase() === q ? 0 : 1
    if (exactA !== exactB) return exactA - exactB
    return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
  })
}

/**
 * Precio histórico diario para estimaciones. Si solo hay datos diarios se usa
 * el cierre y el rango del día (cuando el proveedor lo da); nunca se inventa
 * precisión horaria.
 */
export async function historicalDailyPrice(
  asset: Asset,
  date: string,
): Promise<{ close: string; low: string | null; high: string | null; provider: string } | null> {
  const tdId = asset.providerIds?.['twelvedata']
  if (tdId !== undefined && twelveDataProvider.isConfigured()) {
    try {
      const r = await twelveDataProvider.getHistoricalDaily(tdId, date, asset.quoteCurrency)
      if (r !== null) return { ...r, provider: 'twelvedata' }
    } catch {
      // cae al siguiente proveedor
    }
  }
  const cgId = asset.providerIds?.['coingecko']
  if (cgId !== undefined && asset.assetType === 'crypto') {
    try {
      const r = await coingeckoProvider.getHistoricalDaily(cgId, date, asset.quoteCurrency)
      if (r !== null) return { ...r, provider: 'coingecko' }
    } catch {
      // sin datos
    }
  }
  return null
}

export type MatchQuoteResult =
  | { ok: true; quote: MarketQuote }
  | { ok: false; reason: 'no_provider' | 'error'; message: string }

/**
 * Cotización actual de un resultado de búsqueda (sin registrarlo). Usada por
 * el buscador de la calculadora: cripto vía CoinGecko (sin clave); acciones/
 * ETF vía Twelve Data solo si el proxy está configurado.
 */
export async function getQuoteForMatch(
  match: AssetMatch,
  preferred: Currency,
): Promise<MatchQuoteResult> {
  const tdId = match.providerIds['twelvedata']
  if (tdId !== undefined && twelveDataProvider.isConfigured()) {
    try {
      return { ok: true, quote: await twelveDataProvider.getQuote(tdId, preferred) }
    } catch (e) {
      return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'error' }
    }
  }
  const cgId = match.providerIds['coingecko']
  if (cgId !== undefined && match.assetType === 'crypto') {
    try {
      return { ok: true, quote: await coingeckoProvider.getQuote(cgId, preferred) }
    } catch (e) {
      return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'error' }
    }
  }
  return {
    ok: false,
    reason: 'no_provider',
    message:
      'Este activo necesita Twelve Data (proxy con clave, no configurado). Introduce el precio a mano.',
  }
}

export function providerStatus(): { id: string; label: string; configured: boolean }[] {
  return [
    {
      id: twelveDataProvider.id,
      label: twelveDataProvider.label,
      configured: twelveDataProvider.isConfigured(),
    },
    { id: coingeckoProvider.id, label: coingeckoProvider.label, configured: true },
    { id: ecbFxProvider.id, label: ecbFxProvider.label, configured: true },
    { id: 'manual', label: 'Entrada manual (respaldo universal)', configured: true },
  ]
}

export async function historicalFxSeries(
  from: Currency,
  to: Currency,
  startDate: string,
  endDate: string,
): Promise<FxSeriesPoint[]> {
  return getFxDailySeries(from, to, startDate, endDate)
}
