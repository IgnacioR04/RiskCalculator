import { describe, expect, it } from 'vitest'
import {
  breakevenContribution,
  breakevenFromValues,
  growthFromPrices,
  outcomeAtPrice,
  restoreValueContribution,
  targetPriceWithBudget,
} from './recovery'

describe('restoreValueContribution — restaurar el valor inicial', () => {
  it('criterio de aceptación 1: C_ref=100, V=90, g=5 %', () => {
    const r = restoreValueContribution({
      referenceValue: 100,
      currentValue: 90,
      expectedGrowth: '0.05',
    })
    // A = 100/1,05 − 90 = 5,238095…
    expect(r.contribution.toFixed(6)).toBe('5.238095')
    expect(r.alreadyRestored).toBe(false)
    // La posición vuelve a valer exactamente 100 en el objetivo.
    expect(r.valueAtTarget.toFixed(6)).toBe('100.000000')
    // Capital histórico total aportado.
    expect(r.totalCapital.toFixed(6)).toBe('105.238095')
    // Pérdida neta en ese objetivo: restaurar el valor NO es equilibrio.
    expect(r.netResultAtTarget.toFixed(6)).toBe('-5.238095')
  })

  it('devuelve 0 (no negativo) si el objetivo ya restaura el valor', () => {
    const r = restoreValueContribution({
      referenceValue: 100,
      currentValue: 99,
      expectedGrowth: '0.05', // 99·1,05 = 103,95 > 100
    })
    expect(r.contribution.isZero()).toBe(true)
    expect(r.alreadyRestored).toBe(true)
    expect(r.valueAtTarget.toFixed(2)).toBe('103.95')
  })

  it('con subida 0 la aportación es la diferencia exacta', () => {
    const r = restoreValueContribution({
      referenceValue: 100,
      currentValue: 90,
      expectedGrowth: 0,
    })
    expect(r.contribution.toFixed(2)).toBe('10.00')
  })

  it('admite capital histórico distinto del valor de referencia', () => {
    const r = restoreValueContribution({
      referenceValue: 100,
      currentValue: 90,
      expectedGrowth: '0.05',
      historicCapital: 120,
    })
    expect(r.totalCapital.toFixed(6)).toBe('125.238095')
    expect(r.netResultAtTarget.toFixed(6)).toBe('-25.238095')
  })

  it('rechaza dominios inválidos', () => {
    expect(() =>
      restoreValueContribution({ referenceValue: 100, currentValue: 90, expectedGrowth: -1 }),
    ).toThrow(RangeError)
    expect(() =>
      restoreValueContribution({ referenceValue: -1, currentValue: 90, expectedGrowth: 0.05 }),
    ).toThrow(RangeError)
    expect(() =>
      restoreValueContribution({ referenceValue: 100, currentValue: -1, expectedGrowth: 0.05 }),
    ).toThrow(RangeError)
  })
})

describe('caso de aceptación 2 — Bitcoin (sin divisas ni comisiones)', () => {
  // Inversión de 100 a 70.000 → q = 100/70000; actual 58.000; objetivo 62.000.
  const q = '0.001428571428571428571428571429' // 100/70000 con 28 dígitos
  const cost = 100
  const currentPrice = 58000
  const targetPrice = 62000

  it('restaurar el valor inicial requiere ≈ 10,69', () => {
    const g = growthFromPrices(currentPrice, targetPrice)
    const r = restoreValueContribution({
      referenceValue: 100,
      currentValue: '82.85714285714285714285714286', // q·58000
      expectedGrowth: g,
    })
    expect(r.contribution.toFixed(2)).toBe('10.69')
    expect(r.contribution.toFixed(6)).toBe('10.691244')
    expect(r.valueAtTarget.toDP(10).toString()).toBe('100')
  })

  it('el equilibrio real requiere ≈ 165,71 — y NO es equivalente', () => {
    const r = breakevenContribution({ quantity: q, cost, currentPrice, targetPrice })
    expect(r.status).toBe('achievable')
    expect(r.contribution!.toFixed(2)).toBe('165.71')
    expect(r.contribution!.toFixed(4)).toBe('165.7143')
    // Verificación de la definición: (q + A/P)·P_obj = C + A
    const check = outcomeAtPrice({
      quantity: q,
      cost,
      currentPrice,
      contribution: r.contribution!,
      evaluationPrice: targetPrice,
    })
    expect(check.netResult.toDP(10).toString()).toBe('0')
  })
})

describe('breakevenContribution — análisis de dominio', () => {
  it('already_achieved cuando q·P_obj ≥ C', () => {
    const r = breakevenContribution({ quantity: 2, cost: 100, currentPrice: 49, targetPrice: 60 })
    expect(r.status).toBe('already_achieved')
    expect(r.contribution).toBeNull()
    expect(r.netWithoutContribution.toFixed(2)).toBe('20.00')
  })

  it('unreachable con objetivo igual al precio actual y posición en pérdidas', () => {
    const r = breakevenContribution({ quantity: 1, cost: 100, currentPrice: 90, targetPrice: 90 })
    expect(r.status).toBe('unreachable')
    expect(r.contribution).toBeNull()
  })

  it('unreachable con objetivo por debajo del precio actual y posición en pérdidas', () => {
    const r = breakevenContribution({ quantity: 1, cost: 100, currentPrice: 90, targetPrice: 80 })
    expect(r.status).toBe('unreachable')
  })

  it('nunca devuelve aportaciones negativas', () => {
    // Posición en beneficios con objetivo alcista: la fórmula bruta daría A < 0.
    const r = breakevenContribution({ quantity: 1, cost: 80, currentPrice: 90, targetPrice: 100 })
    expect(r.status).toBe('already_achieved')
    expect(r.contribution).toBeNull()
  })

  it('valida precios no positivos', () => {
    expect(() =>
      breakevenContribution({ quantity: 1, cost: 100, currentPrice: 0, targetPrice: 100 }),
    ).toThrow(RangeError)
    expect(() =>
      breakevenContribution({ quantity: 1, cost: 100, currentPrice: 90, targetPrice: 0 }),
    ).toThrow(RangeError)
  })
})

describe('targetPriceWithBudget — precio de equilibrio con presupuesto', () => {
  it('P_be = (C+A)/(q + A/P) y coincide con el nuevo precio medio', () => {
    // 1 unidad comprada a 100, ahora a 60, presupuesto 60 → 2 uds, coste 160.
    const r = targetPriceWithBudget({ quantity: 1, cost: 100, currentPrice: 60, contribution: 60 })
    expect(r.breakevenPrice.toFixed(2)).toBe('80.00')
    expect(r.newAveragePrice.eq(r.breakevenPrice)).toBe(true)
    expect(r.requiredGrowth.toFixed(4)).toBe('0.3333')
  })

  it('con presupuesto 0 devuelve el precio medio actual', () => {
    const r = targetPriceWithBudget({ quantity: 2, cost: 100, currentPrice: 30, contribution: 0 })
    expect(r.breakevenPrice.toFixed(2)).toBe('50.00')
  })

  it('rechaza el caso degenerado sin unidades ni aportación', () => {
    expect(() =>
      targetPriceWithBudget({ quantity: 0, cost: 0, currentPrice: 10, contribution: 0 }),
    ).toThrow(RangeError)
  })

  it('consistencia con breakevenContribution (ida y vuelta)', () => {
    const q = '0.001428571428571428571428571429'
    const be = breakevenContribution({ quantity: q, cost: 100, currentPrice: 58000, targetPrice: 62000 })
    const round = targetPriceWithBudget({
      quantity: q,
      cost: 100,
      currentPrice: 58000,
      contribution: be.contribution!,
    })
    expect(round.breakevenPrice.toDP(6).toString()).toBe('62000')
  })
})

describe('outcomeAtPrice — resultado en un objetivo posterior', () => {
  it('separa P&L de la posición previa y de la aportación nueva', () => {
    // 1 ud a 100 (coste 100), actual 60, aporto 60 (1 ud más), evalúo a 90.
    const r = outcomeAtPrice({
      quantity: 1,
      cost: 100,
      currentPrice: 60,
      contribution: 60,
      evaluationPrice: 90,
    })
    expect(r.newQuantity.toFixed(0)).toBe('2')
    expect(r.futureValue.toFixed(2)).toBe('180.00')
    expect(r.totalCapital.toFixed(2)).toBe('160.00')
    expect(r.netResult.toFixed(2)).toBe('20.00')
    expect(r.netReturnPct!.toFixed(4)).toBe('0.1250')
    expect(r.newAveragePrice!.toFixed(2)).toBe('80.00')
    expect(r.previousPositionPnl.toFixed(2)).toBe('-10.00') // 90 − 100
    expect(r.newContributionPnl.toFixed(2)).toBe('30.00') // 90 − 60
    // La suma de partes es el neto total.
    expect(r.previousPositionPnl.plus(r.newContributionPnl).eq(r.netResult)).toBe(true)
  })

  it('sin capital total la rentabilidad porcentual es null', () => {
    const r = outcomeAtPrice({
      quantity: 0,
      cost: 0,
      currentPrice: 10,
      contribution: 0,
      evaluationPrice: 12,
    })
    expect(r.netReturnPct).toBeNull()
    expect(r.newAveragePrice).toBeNull()
  })
})

describe('breakevenFromValues — equilibrio real sin unidades ni precios', () => {
  it('tesis del producto (README): BTC 58.000 → 62.000 comprado con 100 a 70.000', () => {
    // V = 100 · 58.000/70.000 = 82,857… · g = 62.000/58.000 − 1
    const currentValue = '82.857142857142857142857143'
    const expectedGrowth = growthFromPrices(58000, 62000)

    const restore = restoreValueContribution({
      referenceValue: 100,
      currentValue,
      expectedGrowth,
    })
    const breakeven = breakevenFromValues({
      historicCapital: 100,
      currentValue,
      expectedGrowth,
    })

    // Las dos cifras que el producto debe mostrar juntas.
    expect(restore.contribution.toFixed(2)).toBe('10.69')
    expect(breakeven.status).toBe('achievable')
    expect(breakeven.contribution!.toFixed(2)).toBe('165.71')
    // La diferencia es la razón de existir de la comparación.
    expect(breakeven.contribution!.gt(restore.contribution)).toBe(true)
  })

  it('coincide con breakevenContribution a partir de unidades y precios', () => {
    const quantity = 2
    const cost = 200
    const currentPrice = 80
    const targetPrice = 95

    const fromPosition = breakevenContribution({ quantity, cost, currentPrice, targetPrice })
    const fromValues = breakevenFromValues({
      historicCapital: cost,
      currentValue: quantity * currentPrice,
      expectedGrowth: growthFromPrices(currentPrice, targetPrice),
    })

    expect(fromValues.status).toBe(fromPosition.status)
    expect(fromValues.contribution!.toFixed(6)).toBe(fromPosition.contribution!.toFixed(6))
    expect(fromValues.netWithoutContribution.toFixed(6)).toBe(
      fromPosition.netWithoutContribution.toFixed(6),
    )
  })

  it('ya alcanzado cuando el objetivo cubre todo el capital', () => {
    const r = breakevenFromValues({ historicCapital: 100, currentValue: 100, expectedGrowth: 0.1 })
    expect(r.status).toBe('already_achieved')
    expect(r.contribution).toBeNull()
    expect(r.netWithoutContribution.toFixed(2)).toBe('10.00')
  })

  it('inalcanzable sin subida: el capital nuevo ni gana ni pierde', () => {
    const r = breakevenFromValues({ historicCapital: 100, currentValue: 90, expectedGrowth: 0 })
    expect(r.status).toBe('unreachable')
    expect(r.contribution).toBeNull()
    expect(r.netWithoutContribution.toFixed(2)).toBe('-10.00')
  })

  it('inalcanzable con subida negativa', () => {
    const r = breakevenFromValues({ historicCapital: 100, currentValue: 90, expectedGrowth: -0.05 })
    expect(r.status).toBe('unreachable')
  })

  it('valor actual 0: ninguna aportación puede revalorizarse', () => {
    const r = breakevenFromValues({ historicCapital: 100, currentValue: 0, expectedGrowth: 0.2 })
    expect(r.status).toBe('unreachable')
    expect(r.netWithoutContribution.toFixed(2)).toBe('-100.00')
  })

  it('valida las entradas', () => {
    expect(() => breakevenFromValues({ historicCapital: -1, currentValue: 10, expectedGrowth: 0.1 })).toThrow(
      RangeError,
    )
    expect(() => breakevenFromValues({ historicCapital: 10, currentValue: -1, expectedGrowth: 0.1 })).toThrow(
      RangeError,
    )
    expect(() => breakevenFromValues({ historicCapital: 10, currentValue: 10, expectedGrowth: -1 })).toThrow(
      RangeError,
    )
  })
})

describe('growthFromPrices', () => {
  it('calcula la subida implícita', () => {
    expect(growthFromPrices(58000, 62000).toFixed(6)).toBe('0.068966')
    expect(growthFromPrices(100, 95).toFixed(2)).toBe('-0.05')
  })
  it('valida precios', () => {
    expect(() => growthFromPrices(0, 10)).toThrow(RangeError)
    expect(() => growthFromPrices(10, 0)).toThrow(RangeError)
  })
})
