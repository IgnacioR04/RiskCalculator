/**
 * XIRR: tasa interna de retorno con fechas irregulares (rendimiento
 * ponderado por dinero). Newton-Raphson con respaldo de bisección.
 * Si no es calculable se devuelve el motivo; la UI nunca muestra un número
 * inventado.
 */

export interface CashFlow {
  /** Fecha del flujo (solo se usa el día). */
  date: Date
  /** Negativo = dinero que sale del bolsillo (aportación); positivo = entra. */
  amount: number
}

export type XirrResult =
  | { ok: true; rate: number; iterations: number }
  | {
      ok: false
      reason: 'insufficient_flows' | 'no_sign_change' | 'no_convergence' | 'missing_data'
    }

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

function npv(rate: number, flows: readonly CashFlow[], t0: number): number {
  let sum = 0
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / MS_PER_YEAR
    sum += f.amount / Math.pow(1 + rate, years)
  }
  return sum
}

/**
 * XIRR se calcula sobre number (no Decimal): es un resultado iterativo
 * aproximado, no aritmética de importes; la precisión de double es sobrada.
 */
export function xirr(flows: readonly CashFlow[]): XirrResult {
  if (flows.length < 2) return { ok: false, reason: 'insufficient_flows' }
  const hasNegative = flows.some((f) => f.amount < 0)
  const hasPositive = flows.some((f) => f.amount > 0)
  if (!hasNegative || !hasPositive) return { ok: false, reason: 'no_sign_change' }

  const t0 = Math.min(...flows.map((f) => f.date.getTime()))

  // Newton-Raphson con derivada numérica.
  let rate = 0.1
  for (let i = 0; i < 100; i++) {
    const value = npv(rate, flows, t0)
    if (Math.abs(value) < 1e-9) return { ok: true, rate, iterations: i }
    const h = 1e-6
    const derivative = (npv(rate + h, flows, t0) - value) / h
    if (!Number.isFinite(derivative) || derivative === 0) break
    const next = rate - value / derivative
    if (!Number.isFinite(next) || next <= -0.999999) break
    if (Math.abs(next - rate) < 1e-10) return { ok: true, rate: next, iterations: i }
    rate = next
  }

  // Respaldo: bisección en (−99,99 %, 1000 %).
  let lo = -0.9999
  let hi = 10
  let fLo = npv(lo, flows, t0)
  const fHi = npv(hi, flows, t0)
  if (fLo * fHi > 0) return { ok: false, reason: 'no_convergence' }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid, flows, t0)
    if (Math.abs(fMid) < 1e-9 || (hi - lo) / 2 < 1e-10) {
      return { ok: true, rate: mid, iterations: i }
    }
    if (fLo * fMid < 0) {
      hi = mid
    } else {
      lo = mid
      fLo = fMid
    }
  }
  return { ok: false, reason: 'no_convergence' }
}
