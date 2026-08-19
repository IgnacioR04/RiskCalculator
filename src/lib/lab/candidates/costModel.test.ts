/**
 * Pruebas del modelo de costes y rotación (LAB-608).
 *
 * El criterio de aceptación: **un coste desconocido no se representa como cero**.
 * Un cero se suma, se compara y acaba en un «te cuesta 40 €» que el usuario se
 * cree; un desconocido obliga a decir «no se sabe».
 */
import { describe, expect, it } from 'vitest'
import {
  CAPITAL_GAINS_BRACKETS,
  TAX_ASSUMPTION,
  capitalGainsTax,
  estimateCost,
  tradesFor,
  turnover,
  type TradeLine,
} from './costModel'

const compra = (symbol: string, amount: number, extra: Partial<TradeLine> = {}): TradeLine => ({
  assetId: symbol.toLowerCase(),
  symbol,
  amount,
  ...extra,
})

describe('lo que no se sabe no vale cero', () => {
  it('una venta sin precio de compra deja el total en «no se sabe»', () => {
    const r = estimateCost([compra('AAPL', -1000)], { proportional: 0.001 })
    expect(r.tax).toBeNull()
    expect(r.total).toBeNull()
    expect(r.unknown[0]).toMatch(/no se conoce el precio de compra/)
  })

  it('las comisiones sí se calculan aunque el impuesto no se sepa', () => {
    // No saber el impuesto no impide saber la comisión: se informa de lo que hay.
    const r = estimateCost([compra('AAPL', -1000)], { proportional: 0.002 })
    expect(r.proportional).toBeCloseTo(2, 9)
    expect(r.total).toBeNull()
  })

  it('con la plusvalía conocida sí hay total', () => {
    const r = estimateCost([compra('AAPL', -1000, { realizedGain: 200 })], { proportional: 0.001 })
    expect(r.tax).toBeCloseTo(200 * 0.19, 9)
    expect(r.total).toBeCloseTo(1 + 200 * 0.19, 9)
    expect(r.unknown).toEqual([])
  })

  it('una compra no necesita plusvalía: no realiza nada', () => {
    const r = estimateCost([compra('AAPL', 1000)], { proportional: 0.001 })
    expect(r.tax).toBe(0)
    expect(r.total).toBeCloseTo(1, 9)
  })

  it('sin operaciones no hay coste, y eso sí es un cero legítimo', () => {
    const r = estimateCost([], { proportional: 0.001, fixed: 5 })
    expect(r.total).toBe(0)
  })

  it('una operación de importe cero no genera comisión fija', () => {
    // Si no se opera, no se paga: una orden de 0 € no existe.
    expect(estimateCost([compra('AAPL', 0)], { fixed: 5 }).fixed).toBe(0)
  })
})

describe('impuesto por tramos', () => {
  it('una plusvalía pequeña va al primer tramo', () => {
    expect(capitalGainsTax(1000)).toBeCloseTo(190, 9)
  })

  it('el tramo se aplica por partes, no de golpe', () => {
    // 10.000 = 6.000 al 19 % + 4.000 al 21 %.
    expect(capitalGainsTax(10_000)).toBeCloseTo(6000 * 0.19 + 4000 * 0.21, 9)
  })

  it('una pérdida no genera impuesto', () => {
    expect(capitalGainsTax(-5000)).toBe(0)
    expect(capitalGainsTax(0)).toBe(0)
  })

  it('el impuesto crece con la plusvalía, sin saltos hacia abajo', () => {
    let anterior = 0
    for (const ganancia of [1000, 6000, 6001, 50_000, 200_000, 400_000]) {
      const actual = capitalGainsTax(ganancia)
      expect(actual).toBeGreaterThanOrEqual(anterior)
      anterior = actual
    }
  })

  it('los tramos están declarados como dato, no escondidos', () => {
    expect(CAPITAL_GAINS_BRACKETS.length).toBeGreaterThan(1)
    expect(TAX_ASSUMPTION).toMatch(/España/)
    // Y se declara lo que NO tiene en cuenta.
    expect(TAX_ASSUMPTION).toMatch(/no tiene en cuenta/i)
  })
})

describe('comisiones', () => {
  it('la proporcional se cobra sobre el importe, compre o venda', () => {
    const r = estimateCost([compra('A', 1000), compra('B', -500, { realizedGain: 0 })], {
      proportional: 0.01,
    })
    expect(r.proportional).toBeCloseTo(15, 9)
  })

  it('la fija se cobra por operación', () => {
    const r = estimateCost([compra('A', 1000), compra('B', 2000)], { fixed: 3 })
    expect(r.fixed).toBeCloseTo(6, 9)
  })

  it('el mínimo por operación se aplica cuando la proporcional no llega', () => {
    const r = estimateCost([compra('A', 100)], { proportional: 0.001, minimum: 2 })
    // 100 × 0,1 % = 0,10, por debajo del mínimo de 2.
    expect(r.proportional).toBeCloseTo(2, 9)
  })

  it('el cambio de divisa solo se cobra a quien lo cruza', () => {
    const r = estimateCost(
      [compra('A', 1000, { crossesCurrency: true }), compra('B', 1000)],
      { fxSpread: 0.005 },
    )
    expect(r.fx).toBeCloseTo(5, 9)
  })
})

describe('rotación', () => {
  it('es la mitad de la suma de diferencias: cada euro sale de un sitio y entra en otro', () => {
    // Mover 20 puntos de A a B es un 20 % de rotación, no un 40 %.
    expect(turnover([0.5, 0.5], [0.3, 0.7])).toBeCloseTo(0.2, 9)
  })

  it('no moverse es rotación cero', () => {
    expect(turnover([0.5, 0.5], [0.5, 0.5])).toBe(0)
  })

  it('cambiarlo todo es rotación uno', () => {
    expect(turnover([1, 0], [0, 1])).toBeCloseTo(1, 9)
  })

  it('un vector más corto se trata como ceros, no rompe', () => {
    expect(turnover([0.5, 0.5], [1])).toBeCloseTo(0.5, 9)
  })
})

describe('de pesos a operaciones', () => {
  const universo = [
    { id: 'a', symbol: 'A' },
    { id: 'b', symbol: 'B' },
  ]

  it('traduce la diferencia de pesos a euros', () => {
    const t = tradesFor([0.5, 0.5], [0.3, 0.7], 10_000, universo)
    expect(t.find((x) => x.symbol === 'A')!.amount).toBeCloseTo(-2000, 9)
    expect(t.find((x) => x.symbol === 'B')!.amount).toBeCloseTo(2000, 9)
  })

  it('lo que no se mueve no genera operación', () => {
    expect(tradesFor([0.5, 0.5], [0.5, 0.5], 10_000, universo)).toEqual([])
  })

  it('las operaciones cuadran: lo que sale entra', () => {
    const t = tradesFor([0.6, 0.4], [0.25, 0.75], 8000, universo)
    expect(t.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(0, 9)
  })
})

describe('no se inventa impacto de mercado', () => {
  it('el desglose no incluye ninguna partida de impacto', () => {
    const r = estimateCost([compra('A', 1_000_000, { realizedGain: 0 })], { proportional: 0.001 })
    // Una orden enorme cuesta exactamente su comisión: no hay penalización
    // inventada por tamaño, porque no hay datos de profundidad de libro.
    expect(r.total).toBeCloseTo(1000, 9)
  })
})
