/**
 * Métricas básicas de cartera: pesos, concentración y rentabilidad simple.
 * Las métricas históricas (volatilidad, drawdown, Sharpe…) viven en
 * `historical.ts` y declaran sus requisitos de muestra.
 */
import { Decimal, dec, type DecimalValue } from './decimal'

export interface WeightedItem<T = string> {
  key: T
  value: Decimal
  /** Peso sobre el total (0–1); null si el total es 0. */
  weight: Decimal | null
}

/** Pesos de una lista de valores no negativos sobre su total. */
export function weights<T>(items: readonly { key: T; value: DecimalValue }[]): WeightedItem<T>[] {
  const values = items.map((i) => ({ key: i.key, value: dec(i.value) }))
  const total = values.reduce((acc, i) => acc.plus(Decimal.max(i.value, 0)), new Decimal(0))
  return values.map((i) => ({
    key: i.key,
    value: i.value,
    weight: total.gt(0) ? Decimal.max(i.value, 0).div(total) : null,
  }))
}

export interface ConcentrationResult {
  /** Índice Herfindahl-Hirschman: Σ w_i² ∈ (0, 1]. */
  hhi: Decimal | null
  /** Número efectivo de posiciones: 1/HHI. */
  effectivePositions: Decimal | null
  /** Peso de la mayor posición. */
  maxWeight: Decimal | null
}

export function concentration(values: readonly DecimalValue[]): ConcentrationResult {
  const positive = values.map(dec).filter((v) => v.gt(0))
  const total = positive.reduce((a, v) => a.plus(v), new Decimal(0))
  if (positive.length === 0 || total.lte(0)) {
    return { hhi: null, effectivePositions: null, maxWeight: null }
  }
  let hhi = new Decimal(0)
  let maxWeight = new Decimal(0)
  for (const v of positive) {
    const w = v.div(total)
    hhi = hhi.plus(w.times(w))
    if (w.gt(maxWeight)) maxWeight = w
  }
  return { hhi, effectivePositions: new Decimal(1).div(hhi), maxWeight }
}

/**
 * Rentabilidad simple sobre el capital neto aportado.
 * null si el capital neto aportado es ≤ 0 (no tiene interpretación fiable).
 */
export function simpleReturn(currentValue: DecimalValue, netContributed: DecimalValue): Decimal | null {
  const contributed = dec(netContributed)
  if (contributed.lte(0)) return null
  return dec(currentValue).minus(contributed).div(contributed)
}
