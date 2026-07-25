import type { AssetType } from '../lib/domain'
import type { SeriesPoint } from '../lib/finance/historical'

interface DemoSeriesConfig {
  assetType: AssetType
  endPrice: number
  trend: number
  cycle: number
  shock: number
}

const END_DATE = '2026-07-20'
const CALENDAR_DAYS = 560

const DEMO_SERIES_CONFIG: Record<string, DemoSeriesConfig> = {
  'demo-btc': { assetType: 'crypto', endPrice: 66500, trend: 0.66, cycle: 0.105, shock: 0.18 },
  'demo-spx-etf': { assetType: 'etf', endPrice: 575.85, trend: 0.78, cycle: 0.045, shock: 0.08 },
  'demo-world-etf': { assetType: 'etf', endPrice: 121.44, trend: 0.81, cycle: 0.036, shock: 0.06 },
  'demo-gold': { assetType: 'commodity', endPrice: 76.4, trend: 0.86, cycle: 0.03, shock: 0.035 },
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

function shapePrice(config: DemoSeriesConfig, index: number, count: number): number {
  const progress = count <= 1 ? 1 : index / (count - 1)
  const trend = config.trend + (1 - config.trend) * progress
  const cycle =
    1 +
    Math.sin(index * 0.11) * config.cycle +
    Math.cos(index * 0.037) * (config.cycle / 2)
  const drawdownCenter = 0.62
  const drawdownWidth = 0.055
  const drawdown =
    1 - config.shock * Math.exp(-((progress - drawdownCenter) ** 2) / (2 * drawdownWidth ** 2))
  return config.endPrice * trend * cycle * drawdown
}

function buildSeries(config: DemoSeriesConfig): SeriesPoint[] {
  const dates = buildDates(config.assetType)
  const raw = dates.map((date, index) => ({
    date,
    close: shapePrice(config, index, dates.length),
  }))
  const scale = config.endPrice / raw[raw.length - 1]!.close
  return raw.map((point) => ({
    date: point.date,
    close: Number((point.close * scale).toFixed(6)),
  }))
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
