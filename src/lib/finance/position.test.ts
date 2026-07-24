import { describe, expect, it } from 'vitest'
import { aggregatePosition, PositionError, unrealizedPnl } from './position'

describe('aggregatePosition — varias compras (criterio de aceptación 3)', () => {
  it('acumula cantidad, coste y precio medio correctos', () => {
    const pos = aggregatePosition([
      { type: 'buy', datetime: '2026-01-10T10:00:00Z', quantity: 2, amount: 200 }, // a 100
      { type: 'buy', datetime: '2026-02-10T10:00:00Z', quantity: 3, amount: 240 }, // a 80
    ])
    expect(pos.quantity.toFixed(0)).toBe('5')
    expect(pos.cost.toFixed(2)).toBe('440.00')
    expect(pos.averagePrice!.toFixed(2)).toBe('88.00')
    expect(pos.totalInvested.toFixed(2)).toBe('440.00')
    expect(pos.realizedPnl.isZero()).toBe(true)
  })

  it('P&L no realizado a un precio dado', () => {
    const pos = aggregatePosition([
      { type: 'buy', datetime: '2026-01-10T10:00:00Z', quantity: 2, amount: 200 },
      { type: 'buy', datetime: '2026-02-10T10:00:00Z', quantity: 3, amount: 240 },
    ])
    expect(unrealizedPnl(pos, 90).toFixed(2)).toBe('10.00') // 5·90 − 440
    expect(unrealizedPnl(pos, 80).toFixed(2)).toBe('-40.00')
  })

  it('venta parcial con método de coste medio', () => {
    const pos = aggregatePosition([
      { type: 'buy', datetime: '2026-01-10T10:00:00Z', quantity: 2, amount: 200 },
      { type: 'buy', datetime: '2026-02-10T10:00:00Z', quantity: 2, amount: 120 }, // medio: 80
      { type: 'sell', datetime: '2026-03-10T10:00:00Z', quantity: 1, amount: 90 },
    ])
    // Coste medio antes de vender: 320/4 = 80 → realizado = 90 − 80 = 10.
    expect(pos.realizedPnl.toFixed(2)).toBe('10.00')
    expect(pos.quantity.toFixed(0)).toBe('3')
    expect(pos.cost.toFixed(2)).toBe('240.00')
    expect(pos.averagePrice!.toFixed(2)).toBe('80.00')
    expect(pos.totalProceeds.toFixed(2)).toBe('90.00')
  })

  it('ordena por fecha aunque lleguen desordenadas', () => {
    const pos = aggregatePosition([
      { type: 'sell', datetime: '2026-03-01T00:00:00Z', quantity: 1, amount: 50 },
      { type: 'buy', datetime: '2026-01-01T00:00:00Z', quantity: 2, amount: 80 },
    ])
    expect(pos.quantity.toFixed(0)).toBe('1')
    expect(pos.realizedPnl.toFixed(2)).toBe('10.00') // 50 − 40
  })

  it('rechaza vender más de lo disponible con error explícito', () => {
    expect(() =>
      aggregatePosition([
        { type: 'buy', datetime: '2026-01-01T00:00:00Z', quantity: 1, amount: 100 },
        { type: 'sell', datetime: '2026-02-01T00:00:00Z', quantity: 2, amount: 250 },
      ]),
    ).toThrow(PositionError)
  })

  it('rechaza cantidades e importes inválidos', () => {
    expect(() =>
      aggregatePosition([{ type: 'buy', datetime: '2026-01-01T00:00:00Z', quantity: 0, amount: 10 }]),
    ).toThrow(PositionError)
    expect(() =>
      aggregatePosition([{ type: 'buy', datetime: '2026-01-01T00:00:00Z', quantity: 1, amount: -5 }]),
    ).toThrow(PositionError)
  })

  it('posición vacía', () => {
    const pos = aggregatePosition([])
    expect(pos.quantity.isZero()).toBe(true)
    expect(pos.averagePrice).toBeNull()
  })

  it('cerrar la posición deja coste 0 sin residuos', () => {
    const pos = aggregatePosition([
      { type: 'buy', datetime: '2026-01-01T00:00:00Z', quantity: 3, amount: 100 },
      { type: 'sell', datetime: '2026-02-01T00:00:00Z', quantity: 3, amount: 120 },
    ])
    expect(pos.quantity.isZero()).toBe(true)
    expect(pos.cost.isZero()).toBe(true)
    expect(pos.realizedPnl.toFixed(2)).toBe('20.00')
  })

  it('incorpora comisiones al coste de compra y a la venta neta', () => {
    const pos = aggregatePosition([
      { type: 'buy', datetime: '2026-01-01', quantity: 2, amount: 100, fee: 2 },
      { type: 'sell', datetime: '2026-02-01', quantity: 1, amount: 70, fee: 1 },
    ])
    expect(pos.totalInvested.toString()).toBe('102')
    expect(pos.totalProceeds.toString()).toBe('69')
    expect(pos.totalFees.toString()).toBe('3')
    expect(pos.realizedPnl.toString()).toBe('18')
    expect(pos.cost.toString()).toBe('51')
  })
})
