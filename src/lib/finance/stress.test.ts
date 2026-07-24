import { describe, expect, it } from 'vitest'
import { applyStress, contributionImpact, type StressPosition } from './stress'

const POSITIONS: StressPosition[] = [
  { assetId: 'btc', symbol: 'BTC', assetType: 'crypto', quoteCurrency: 'USD', value: 100 },
  { assetId: 'etf', symbol: 'SXR8', assetType: 'etf', quoteCurrency: 'EUR', value: 300 },
  { assetId: 'cash', symbol: 'EUR', assetType: 'cash', quoteCurrency: 'EUR', value: 100 },
]

describe('applyStress', () => {
  it('caída general del 20 %', () => {
    const r = applyStress(POSITIONS, { general: '-0.2', displayCurrency: 'EUR' })
    expect(r.totalBefore.toFixed(0)).toBe('500')
    expect(r.totalAfter.toFixed(0)).toBe('400')
    expect(r.totalChangePct!.toFixed(2)).toBe('-0.20')
  })

  it('shock por clase solo afecta a esa clase', () => {
    const r = applyStress(POSITIONS, { byType: { crypto: '-0.5' }, displayCurrency: 'EUR' })
    expect(r.positions.find((p) => p.assetId === 'btc')!.stressedValue.toFixed(0)).toBe('50')
    expect(r.positions.find((p) => p.assetId === 'etf')!.stressedValue.toFixed(0)).toBe('300')
    expect(r.totalAfter.toFixed(0)).toBe('450')
  })

  it('shock de un activo concreto', () => {
    const r = applyStress(POSITIONS, { byAsset: { etf: '-0.1' }, displayCurrency: 'EUR' })
    expect(r.positions.find((p) => p.assetId === 'etf')!.stressedValue.toFixed(0)).toBe('270')
    expect(r.totalAfter.toFixed(0)).toBe('470')
  })

  it('shock FX solo sobre divisas distintas a la de presentación', () => {
    const r = applyStress(POSITIONS, { fxForeign: '-0.1', displayCurrency: 'EUR' })
    expect(r.positions.find((p) => p.assetId === 'btc')!.stressedValue.toFixed(0)).toBe('90')
    expect(r.positions.find((p) => p.assetId === 'cash')!.stressedValue.toFixed(0)).toBe('100')
  })

  it('shocks combinados se componen multiplicativamente', () => {
    const r = applyStress(POSITIONS, {
      general: '-0.1',
      byType: { crypto: '-0.5' },
      fxForeign: '0.1',
      displayCurrency: 'EUR',
    })
    // BTC: 100 · 0,9 · 0,5 · 1,1 = 49,5
    expect(r.positions.find((p) => p.assetId === 'btc')!.stressedValue.toFixed(1)).toBe('49.5')
  })

  it('recalcula la concentración después del shock', () => {
    const r = applyStress(POSITIONS, { byType: { etf: '-0.9' }, displayCurrency: 'EUR' })
    expect(
      r.concentrationAfter.maxWeight!.toNumber(),
    ).toBeLessThan(r.concentrationBefore.maxWeight!.toNumber())
  })
})

describe('contributionImpact — simulador antes/después', () => {
  it('la aportación cambia peso y concentración', () => {
    const r = contributionImpact(POSITIONS, 'btc', 100)
    expect(r.before.weight!.toFixed(2)).toBe('0.20') // 100/500
    expect(r.after.weight!.toFixed(2)).toBe('0.33') // 200/600
    expect(r.after.concentration.hhi!.toNumber()).not.toBeCloseTo(
      r.before.concentration.hhi!.toNumber(),
      10,
    )
  })

  it('aportar a un activo nuevo lo incluye en el después', () => {
    const r = contributionImpact(POSITIONS, 'nuevo', 500)
    expect(r.before.weight!.toFixed(2)).toBe('0.00')
    expect(r.after.weight!.toFixed(2)).toBe('0.50')
  })
})
