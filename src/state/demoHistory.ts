import type { AssetType } from '../lib/domain'
import type { SeriesPoint } from '../lib/finance/historical'

interface DemoSeriesConfig {
  assetType: AssetType
  endPrice: number
  startPrice: number
  marketBeta: number
  techBeta: number
  cryptoBeta: number
  idiosyncratic: number
}

const END_DATE = '2026-07-20'
const CALENDAR_DAYS = 560

const DEMO_SERIES_CONFIG: Record<string, DemoSeriesConfig> = {
  'demo-btc': {
    assetType: 'crypto',
    endPrice: 66500,
    startPrice: 41200,
    marketBeta: 0.85,
    techBeta: 0.35,
    cryptoBeta: 1.55,
    idiosyncratic: 0.016,
  },
  'demo-msci-world-etf': {
    assetType: 'etf',
    endPrice: 98.5,
    startPrice: 86.4,
    marketBeta: 0.95,
    techBeta: 0.28,
    cryptoBeta: 0.02,
    idiosyncratic: 0.004,
  },
  'demo-spx-etf': {
    assetType: 'etf',
    endPrice: 575.85,
    startPrice: 514,
    marketBeta: 1.06,
    techBeta: 0.38,
    cryptoBeta: 0.03,
    idiosyncratic: 0.0045,
  },
  'demo-aapl': {
    assetType: 'stock',
    endPrice: 220,
    startPrice: 178,
    marketBeta: 1.05,
    techBeta: 0.78,
    cryptoBeta: 0.04,
    idiosyncratic: 0.010,
  },
  'demo-tsla': {
    assetType: 'stock',
    endPrice: 330,
    startPrice: 238,
    marketBeta: 1.12,
    techBeta: 1.05,
    cryptoBeta: 0.16,
    idiosyncratic: 0.019,
  },
  'demo-cash-eur': {
    assetType: 'cash',
    endPrice: 1,
    startPrice: 1,
    marketBeta: 0,
    techBeta: 0,
    cryptoBeta: 0,
    idiosyncratic: 0,
  },
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildDates(assetType: AssetType): string[] {
  const end = new Date(`${END_DATE}T00:00:00Z`)
  const dates: string[] = []
  for (let index = CALENDAR_DAYS - 1; index >= 0; index--) {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - index)
    if (assetType !== 'crypto' && isWeekend(date)) continue
    dates.push(isoDate(date))
  }
  return dates
}

function marketFactor(index: number): number {
  const cycle = Math.sin(index * 0.071) * 0.0045 + Math.cos(index * 0.019) * 0.002
  const correction = -0.018 * Math.exp(-((index - 245) ** 2) / (2 * 16 ** 2))
  const rebound = 0.011 * Math.exp(-((index - 294) ** 2) / (2 * 18 ** 2))
  return cycle + correction + rebound
}

function techFactor(index: number): number {
  return Math.sin(index * 0.113 + 1.3) * 0.006 + Math.cos(index * 0.041) * 0.0025
}

function cryptoFactor(index: number): number {
  return Math.sin(index * 0.173 + 0.4) * 0.012 + Math.cos(index * 0.057) * 0.006
}

function idiosyncraticFactor(index: number, amplitude: number): number {
  return (
    Math.sin(index * 0.227 + amplitude * 41) * amplitude +
    Math.cos(index * 0.097 + amplitude * 19) * amplitude * 0.45
  )
}

function buildSeries(config: DemoSeriesConfig): SeriesPoint[] {
  const dates = buildDates(config.assetType)
  if (config.assetType === 'cash') {
    return dates.map((date) => ({ date, close: 1 }))
  }

  const raw = dates.map((date, index) => {
    const progress = dates.length <= 1 ? 1 : index / (dates.length - 1)
    const structuralGrowth = Math.log(config.endPrice / config.startPrice) / dates.length
    const seasonalReturn =
      structuralGrowth +
      config.marketBeta * marketFactor(index) +
      config.techBeta * techFactor(index) +
      config.cryptoBeta * cryptoFactor(index) +
      idiosyncraticFactor(index, config.idiosyncratic)
    return { date, seasonalReturn, progress }
  })

  const prices: SeriesPoint[] = [{ date: raw[0]!.date, close: config.startPrice }]
  for (let index = 1; index < raw.length; index++) {
    const previous = prices[index - 1]!
    const shapedReturn = raw[index]!.seasonalReturn
    prices.push({
      date: raw[index]!.date,
      close: previous.close * Math.exp(shapedReturn),
    })
  }

  const scale = config.endPrice / prices[prices.length - 1]!.close
  return prices.map((point, index) => {
    const progress = prices.length <= 1 ? 1 : index / (prices.length - 1)
    const progressiveScale = 1 + (scale - 1) * progress
    return {
      date: point.date,
      close: Number((point.close * progressiveScale).toFixed(6)),
    }
  })
}

export const DEMO_HISTORICAL_SERIES: Record<string, SeriesPoint[]> = Object.fromEntries(
  Object.entries(DEMO_SERIES_CONFIG).map(([assetId, config]) => [assetId, buildSeries(config)]),
)

export function hasDemoHistoricalSeries(assetId: string): boolean {
  return DEMO_HISTORICAL_SERIES[assetId] !== undefined
}

export function getDemoHistoricalSeries(assetId: string, observations: number): SeriesPoint[] {
  const series = DEMO_HISTORICAL_SERIES[assetId] ?? []
  return series.slice(-observations).map((point) => ({ ...point }))
}
