import { MIN_OBSERVATIONS, type MetricResult } from './historical'

export interface DatedReturn {
  date: string
  value: number
}

export interface AlignedReturnMatrix {
  dates: string[]
  /** Una columna por activo, en el mismo orden de entrada. */
  columns: number[][]
}

/** Intersección estricta de fechas para que w'Σw use una única muestra. */
export function alignManyReturns(series: readonly (readonly DatedReturn[])[]): AlignedReturnMatrix {
  if (series.length === 0) return { dates: [], columns: [] }
  const maps = series.map((values) => new Map(values.map((point) => [point.date, point.value])))
  const dates = [...maps[0]!.keys()]
    .filter((date) => maps.every((map) => map.has(date)))
    .sort()
  return {
    dates,
    columns: maps.map((map) => dates.map((date) => map.get(date)!)),
  }
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function sampleCovariance(a: readonly number[], b: readonly number[]): number {
  const observations = Math.min(a.length, b.length)
  if (observations < 2) return Number.NaN
  const meanA = mean(a.slice(0, observations))
  const meanB = mean(b.slice(0, observations))
  let sum = 0
  for (let index = 0; index < observations; index++) {
    sum += (a[index]! - meanA) * (b[index]! - meanB)
  }
  return sum / (observations - 1)
}

/** Matriz de covarianzas anualizada sobre una muestra común. */
export function covarianceMatrix(
  columns: readonly (readonly number[])[],
  periodsPerYear: number,
): MetricResult<number[][]> {
  const observations = columns.length === 0 ? 0 : Math.min(...columns.map((column) => column.length))
  if (observations < MIN_OBSERVATIONS) {
    return {
      ok: false,
      reason: 'insufficient_data',
      observations,
      required: MIN_OBSERVATIONS,
    }
  }
  const matrix = columns.map((row) =>
    columns.map((column) => sampleCovariance(row, column) * periodsPerYear),
  )
  return { ok: true, value: matrix, observations }
}

export interface PortfolioRiskResult {
  volatility: number
  /** Contribución absoluta a la volatilidad, en las mismas unidades. */
  componentContributions: number[]
  /** Porcentaje del riesgo total; puede ser negativo si diversifica. */
  percentageContributions: number[]
  marginalContributions: number[]
}

/** Volatilidad √(w'Σw) y contribuciones Euler por activo. */
export function portfolioRisk(
  weights: readonly number[],
  covariance: readonly (readonly number[])[],
): PortfolioRiskResult | null {
  if (
    weights.length === 0 ||
    covariance.length !== weights.length ||
    covariance.some((row) => row.length !== weights.length)
  ) {
    return null
  }
  const sigmaTimesWeights = covariance.map((row) =>
    row.reduce((sum, value, index) => sum + value * weights[index]!, 0),
  )
  const variance = weights.reduce(
    (sum, weight, index) => sum + weight * sigmaTimesWeights[index]!,
    0,
  )
  if (!Number.isFinite(variance) || variance <= 0) return null
  const volatility = Math.sqrt(variance)
  const marginalContributions = sigmaTimesWeights.map((value) => value / volatility)
  const componentContributions = marginalContributions.map(
    (value, index) => value * weights[index]!,
  )
  return {
    volatility,
    marginalContributions,
    componentContributions,
    percentageContributions: componentContributions.map((value) => value / volatility),
  }
}

export interface TwrPeriod {
  /** Valor al cierre anterior, tras los flujos de aquel día. */
  openingValue: number
  /** Valor al cierre actual, tras los flujos del día. */
  closingValue: number
  /** Aportaciones del día, tratadas al inicio. */
  contributions: number
  /** Retiradas/ventas netas del día, tratadas al final. */
  withdrawals: number
}

/**
 * TWR encadenado diario: (cierre + retiradas) / (apertura + aportaciones) − 1.
 * Devuelve null si no existe ningún subperiodo con capital.
 */
export function timeWeightedReturn(periods: readonly TwrPeriod[]): number | null {
  let growth = 1
  let used = 0
  for (const period of periods) {
    const denominator = period.openingValue + period.contributions
    if (denominator <= 0) continue
    const factor = (period.closingValue + period.withdrawals) / denominator
    if (!Number.isFinite(factor) || factor < 0) return null
    growth *= factor
    used++
  }
  return used === 0 ? null : growth - 1
}

export function tradingDaysForAsset(assetType: string): number {
  return assetType === 'crypto' ? 365 : 252
}

/** Una cartera mixta con activos bursátiles se observa en sesiones comunes. */
export function tradingDaysForPortfolio(assetTypes: readonly string[]): number {
  return assetTypes.every((type) => type === 'crypto') ? 365 : 252
}
