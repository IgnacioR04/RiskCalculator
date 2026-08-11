/**
 * Adquisición de series históricas (LAB-303).
 *
 * Trae precios de los proveedores y los deja convertidos a la divisa de
 * presentación. **Aquí sí hay red**, y por eso vive separado de `fx.ts`, que es
 * puro: mezclarlos obligaría a levantar mocks para probar una división.
 *
 * Extraído sin tocar una línea de lógica del monolito `HistoricalRiskSection`.
 * El nombre viene de allí y se conserva: renombrar en el mismo cambio que se
 * mueve hace imposible leer el diff.
 */
import type { Asset, Currency } from '../../domain'
import { dailyReturns, type SeriesPoint } from '../../finance/historical'
import { DEMO_FX_EURUSD } from '../../../state/demoData'
import type { AssetSeries } from './twr'
import { coingeckoProvider } from '../../market/coingecko'
import { twelveDataProvider } from '../../market/twelvedata'
import {
  colaCoinGecko,
  colaTwelveData,
  escribirSerie,
  leerSerie,
} from '../../market/seriesCache'
import { getDemoHistoricalSeries, hasDemoHistoricalSeries } from '../../../state/demoHistory'
import { convertPriceSeries } from './fx'


export function convertDemoPriceSeries(
  series: readonly SeriesPoint[],
  from: Currency,
  to: Currency,
): SeriesPoint[] {
  if (from === to) return series.map((point) => ({ ...point }))
  const eurUsd = Number(DEMO_FX_EURUSD.rate)
  if (!Number.isFinite(eurUsd) || eurUsd <= 0) return []
  const rate = from === 'USD' && to === 'EUR' ? 1 / eurUsd : eurUsd
  return series.map((point) => ({ date: point.date, close: point.close * rate }))
}

export async function fetchSeries(
  asset: Asset,
  days: number,
  displayCurrency: Currency,
  fxSeries: readonly { date: string; rate: number }[],
): Promise<AssetSeries | null> {
  if (asset.isDemo === true && hasDemoHistoricalSeries(asset.id)) {
    const demoSeries = getDemoHistoricalSeries(asset.id, days)
    const series = convertDemoPriceSeries(demoSeries, asset.quoteCurrency, displayCurrency)
    if (series.length > 0) {
      return {
        asset,
        series,
        returns: dailyReturns(series),
        provider:
          asset.quoteCurrency === displayCurrency
            ? 'Demostración sintética'
            : 'Demostración sintética + FX demo',
      }
    }
  }

  /* Una serie diaria no cambia hasta el cierre siguiente: si ya se descargó
     hoy se reutiliza. Antes se volvía a pedir en cada visita y eso agota la
     cuota diaria del proveedor en unas pocas recargas. */
  const enCache = leerSerie(asset.id, days, displayCurrency)
  if (enCache !== null) {
    return {
      asset,
      series: enCache.puntos,
      returns: dailyReturns(enCache.puntos),
      provider: `${enCache.proveedor} (en caché)`,
    }
  }

  const twelveDataId = asset.providerIds?.['twelvedata']
  if (twelveDataId !== undefined && twelveDataProvider.isConfigured()) {
    try {
      const candles = await colaTwelveData(() =>
        twelveDataProvider.getDailyOHLC(twelveDataId, days, asset.quoteCurrency),
      )
      if (candles.length > 0) {
        let series = candles.map((candle) => ({
          date: candle.time,
          close: Number(candle.close),
        }))
        if (asset.quoteCurrency !== displayCurrency) {
          series = convertPriceSeries(series, fxSeries)
        }
        const proveedor =
          asset.quoteCurrency === displayCurrency ? 'Twelve Data' : 'Twelve Data + BCE FX'
        escribirSerie(asset.id, days, displayCurrency, series, proveedor)
        return { asset, series, returns: dailyReturns(series), provider: proveedor }
      }
    } catch {
      // Continúa con el siguiente proveedor.
    }
  }

  const coinGeckoId = asset.providerIds?.['coingecko']
  if (coinGeckoId !== undefined && asset.assetType === 'crypto') {
    try {
      // CoinGecko puede devolver directamente la divisa de presentación.
      const candles = await colaCoinGecko(() =>
        coingeckoProvider.getDailyOHLC(coinGeckoId, days, displayCurrency),
      )
      if (candles.length > 0) {
        const series = candles.map((candle) => ({
          date: candle.time,
          close: Number(candle.close),
        }))
        escribirSerie(asset.id, days, displayCurrency, series, 'CoinGecko')
        return { asset, series, returns: dailyReturns(series), provider: 'CoinGecko' }
      }
    } catch {
      // Sin datos.
    }
  }
  return null
}
