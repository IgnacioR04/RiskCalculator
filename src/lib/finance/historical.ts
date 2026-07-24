/**
 * Métricas históricas sobre series de cierres diarios.
 *
 * Reglas comunes (especificación):
 * - Nunca se rellenan huecos en silencio: las series se alinean por fechas
 *   comunes y se informa del número de observaciones.
 * - Con muestra insuficiente se devuelve un estado explícito, no un número.
 * - La tasa libre de riesgo usada se declara (parámetro, 0 por defecto).
 *
 * Las métricas iterativas usan `number`: son estadísticos aproximados, no
 * aritmética de importes.
 */

export interface SeriesPoint {
  /** Fecha YYYY-MM-DD. */
  date: string
  close: number
}

export type MetricResult<T> =
  | { ok: true; value: T; observations: number }
  | { ok: false; reason: 'insufficient_data'; observations: number; required: number }

/** Por defecto se usan sesiones bursátiles; cripto pasa 365 explícitamente. */
const TRADING_DAYS = 252

/** Mínimo de observaciones para publicar una métrica de riesgo. */
export const MIN_OBSERVATIONS = 30

/** Varianza acumulada por debajo de esto se trata como serie constante. */
const VARIANCE_EPSILON = 1e-18

/** Retornos logarítmicos diarios de una serie de cierres ordenada por fecha. */
export function dailyReturns(series: readonly SeriesPoint[]): { date: string; value: number }[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const out: { date: string; value: number }[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const curr = sorted[i]!
    if (prev.close > 0 && curr.close > 0) {
      out.push({ date: curr.date, value: Math.log(curr.close / prev.close) })
    }
  }
  return out
}

/** Alinea dos series de retornos por fechas comunes (sin rellenar huecos). */
export function alignReturns(
  a: readonly { date: string; value: number }[],
  b: readonly { date: string; value: number }[],
): { a: number[]; b: number[]; dates: string[] } {
  const mapB = new Map(b.map((p) => [p.date, p.value]))
  const outA: number[] = []
  const outB: number[] = []
  const dates: string[] = []
  for (const p of a) {
    const vb = mapB.get(p.date)
    if (vb !== undefined) {
      outA.push(p.value)
      outB.push(vb)
      dates.push(p.date)
    }
  }
  return { a: outA, b: outB, dates }
}

function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function sampleStd(xs: readonly number[]): number {
  const m = mean(xs)
  const variance = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

/** Volatilidad anualizada (desviación típica muestral · √periodos/año). */
export function annualizedVolatility(
  returns: readonly number[],
  tradingDays: number = TRADING_DAYS,
): MetricResult<number> {
  if (returns.length < MIN_OBSERVATIONS) {
    return { ok: false, reason: 'insufficient_data', observations: returns.length, required: MIN_OBSERVATIONS }
  }
  return {
    ok: true,
    value: sampleStd(returns) * Math.sqrt(tradingDays),
    observations: returns.length,
  }
}

/** Volatilidad bajista anualizada (solo retornos por debajo del objetivo, 0). */
export function downsideVolatility(
  returns: readonly number[],
  tradingDays: number = TRADING_DAYS,
  target = 0,
): MetricResult<number> {
  if (returns.length < MIN_OBSERVATIONS) {
    return { ok: false, reason: 'insufficient_data', observations: returns.length, required: MIN_OBSERVATIONS }
  }
  const downside = returns.map((r) => Math.min(0, r - target))
  const semiVariance = downside.reduce((s, x) => s + x * x, 0) / returns.length
  return {
    ok: true,
    value: Math.sqrt(semiVariance) * Math.sqrt(tradingDays),
    observations: returns.length,
  }
}

export interface DrawdownResult {
  maxDrawdown: number
  peakDate: string
  troughDate: string
}

/** Drawdown máximo sobre la serie de cierres. */
export function maxDrawdown(series: readonly SeriesPoint[]): MetricResult<DrawdownResult> {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 2) {
    return { ok: false, reason: 'insufficient_data', observations: sorted.length, required: 2 }
  }
  let peak = sorted[0]!
  let best: DrawdownResult = { maxDrawdown: 0, peakDate: peak.date, troughDate: peak.date }
  for (const p of sorted) {
    if (p.close > peak.close) peak = p
    const dd = peak.close > 0 ? p.close / peak.close - 1 : 0
    if (dd < best.maxDrawdown) {
      best = { maxDrawdown: dd, peakDate: peak.date, troughDate: p.date }
    }
  }
  return { ok: true, value: best, observations: sorted.length }
}

/**
 * Sharpe anualizado: (retorno medio anualizado − rf) / volatilidad anualizada.
 * `riskFreeRate` es anual (fracción) y debe declararse en la UI.
 */
export function sharpeRatio(
  returns: readonly number[],
  riskFreeRate: number,
  tradingDays: number = TRADING_DAYS,
): MetricResult<number> {
  const vol = annualizedVolatility(returns, tradingDays)
  if (!vol.ok) return vol
  if (vol.value === 0) {
    return { ok: false, reason: 'insufficient_data', observations: returns.length, required: MIN_OBSERVATIONS }
  }
  const annualReturn = mean(returns) * tradingDays
  return { ok: true, value: (annualReturn - riskFreeRate) / vol.value, observations: returns.length }
}

/** Sortino anualizado: usa la volatilidad bajista como denominador. */
export function sortinoRatio(
  returns: readonly number[],
  riskFreeRate: number,
  tradingDays: number = TRADING_DAYS,
): MetricResult<number> {
  const dvol = downsideVolatility(returns, tradingDays)
  if (!dvol.ok) return dvol
  if (dvol.value === 0) {
    return { ok: false, reason: 'insufficient_data', observations: returns.length, required: MIN_OBSERVATIONS }
  }
  const annualReturn = mean(returns) * tradingDays
  return { ok: true, value: (annualReturn - riskFreeRate) / dvol.value, observations: returns.length }
}

/** Correlación de Pearson entre dos series de retornos alineadas. */
export function correlation(a: readonly number[], b: readonly number[]): MetricResult<number> {
  const n = Math.min(a.length, b.length)
  if (n < MIN_OBSERVATIONS) {
    return { ok: false, reason: 'insufficient_data', observations: n, required: MIN_OBSERVATIONS }
  }
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma
    const db = b[i]! - mb
    cov += da * db
    va += da * da
    vb += db * db
  }
  // Umbral de varianza: una serie prácticamente constante no da una
  // correlación interpretable (evita ruido de coma flotante).
  if (va < VARIANCE_EPSILON || vb < VARIANCE_EPSILON) {
    return { ok: false, reason: 'insufficient_data', observations: n, required: MIN_OBSERVATIONS }
  }
  return { ok: true, value: cov / Math.sqrt(va * vb), observations: n }
}

export interface RegressionResult {
  beta: number
  /** Alpha anualizado. */
  alpha: number
  r2: number
}

/** Regresión de retornos del activo sobre el benchmark: beta, alpha, R². */
export function betaAlpha(
  asset: readonly number[],
  benchmark: readonly number[],
  tradingDays: number = TRADING_DAYS,
): MetricResult<RegressionResult> {
  const n = Math.min(asset.length, benchmark.length)
  if (n < MIN_OBSERVATIONS) {
    return { ok: false, reason: 'insufficient_data', observations: n, required: MIN_OBSERVATIONS }
  }
  const ma = mean(asset.slice(0, n))
  const mb = mean(benchmark.slice(0, n))
  let cov = 0
  let vb = 0
  let va = 0
  for (let i = 0; i < n; i++) {
    const da = asset[i]! - ma
    const db = benchmark[i]! - mb
    cov += da * db
    vb += db * db
    va += da * da
  }
  if (vb < VARIANCE_EPSILON) {
    return { ok: false, reason: 'insufficient_data', observations: n, required: MIN_OBSERVATIONS }
  }
  const beta = cov / vb
  const alphaDaily = ma - beta * mb
  const r2 = va === 0 ? 0 : (cov * cov) / (va * vb)
  return {
    ok: true,
    value: { beta, alpha: alphaDaily * tradingDays, r2 },
    observations: n,
  }
}
