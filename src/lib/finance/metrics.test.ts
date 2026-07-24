import { describe, expect, it } from 'vitest'
import { concentration, simpleReturn, weights } from './metrics'

describe('weights', () => {
  it('reparte pesos sobre el total', () => {
    const w = weights([
      { key: 'a', value: 50 },
      { key: 'b', value: 30 },
      { key: 'c', value: 20 },
    ])
    expect(w[0]!.weight!.toFixed(2)).toBe('0.50')
    expect(w[1]!.weight!.toFixed(2)).toBe('0.30')
    expect(w[2]!.weight!.toFixed(2)).toBe('0.20')
  })

  it('total 0 ⇒ pesos null, no NaN ni división por cero', () => {
    const w = weights([{ key: 'a', value: 0 }])
    expect(w[0]!.weight).toBeNull()
  })
})

describe('concentration', () => {
  it('HHI y número efectivo para pesos iguales', () => {
    const c = concentration([25, 25, 25, 25])
    expect(c.hhi!.toFixed(2)).toBe('0.25')
    expect(c.effectivePositions!.toFixed(0)).toBe('4')
    expect(c.maxWeight!.toFixed(2)).toBe('0.25')
  })

  it('una sola posición ⇒ HHI = 1', () => {
    const c = concentration([100])
    expect(c.hhi!.toFixed(0)).toBe('1')
    expect(c.effectivePositions!.toFixed(0)).toBe('1')
  })

  it('cartera vacía o sin valor ⇒ null (nunca números engañosos)', () => {
    expect(concentration([]).hhi).toBeNull()
    expect(concentration([0, 0]).hhi).toBeNull()
  })
})

describe('simpleReturn', () => {
  it('rentabilidad simple', () => {
    expect(simpleReturn(110, 100)!.toFixed(2)).toBe('0.10')
    expect(simpleReturn(90, 100)!.toFixed(2)).toBe('-0.10')
  })
  it('capital aportado ≤ 0 ⇒ null', () => {
    expect(simpleReturn(110, 0)).toBeNull()
    expect(simpleReturn(110, -5)).toBeNull()
  })
})
