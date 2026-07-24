import { describe, expect, it } from 'vitest'
import { xirr } from './xirr'

describe('xirr', () => {
  it('inversión simple a un año: −100 → +110 ⇒ ≈ 10 %', () => {
    const r = xirr([
      { date: new Date('2025-01-01'), amount: -100 },
      { date: new Date('2026-01-01'), amount: 110 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.rate).toBeCloseTo(0.1, 3)
  })

  it('flujos múltiples con fechas irregulares', () => {
    // Caso clásico de referencia (equivalente al XIRR de hoja de cálculo).
    const r = xirr([
      { date: new Date('2008-01-01'), amount: -10000 },
      { date: new Date('2008-03-01'), amount: 2750 },
      { date: new Date('2008-10-30'), amount: 4250 },
      { date: new Date('2009-02-15'), amount: 3250 },
      { date: new Date('2009-04-01'), amount: 2750 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.rate).toBeCloseTo(0.3734, 2)
  })

  it('rentabilidad negativa', () => {
    const r = xirr([
      { date: new Date('2025-01-01'), amount: -100 },
      { date: new Date('2026-01-01'), amount: 80 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.rate).toBeCloseTo(-0.2, 3)
  })

  it('sin cambio de signo ⇒ no calculable, no un número inventado', () => {
    const r = xirr([
      { date: new Date('2025-01-01'), amount: -100 },
      { date: new Date('2026-01-01'), amount: -50 },
    ])
    expect(r).toEqual({ ok: false, reason: 'no_sign_change' })
  })

  it('menos de dos flujos ⇒ insuficiente', () => {
    expect(xirr([{ date: new Date(), amount: -100 }])).toEqual({
      ok: false,
      reason: 'insufficient_flows',
    })
  })
})
