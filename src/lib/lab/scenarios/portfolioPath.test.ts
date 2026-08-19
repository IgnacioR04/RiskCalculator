/**
 * Pruebas de la evolución contable (LAB-504).
 *
 * El criterio de aceptación: **conservación de valor explicable**. En cada
 * periodo tiene que cumplirse `final = inicial·(1+r) + flujo − coste`, sin
 * residuos que nadie sepa de dónde salen.
 *
 * Los casos están calculados a mano en los comentarios: si el motor cambia, la
 * prueba dice cuál era la respuesta correcta y por qué.
 */
import { describe, expect, it } from 'vitest'
import { portfolioPath, type PathAsset } from './portfolioPath'

const UNO: PathAsset[] = [{ id: 'a', targetWeight: 1, initialValue: 1000 }]

const MITADES: PathAsset[] = [
  { id: 'a', targetWeight: 0.5, initialValue: 500 },
  { id: 'b', targetWeight: 0.5, initialValue: 500 },
]

describe('conservación: nada aparece ni desaparece', () => {
  it('cada periodo cuadra con final = inicial·(1+r) + flujo − coste', () => {
    const r = portfolioPath({
      assets: MITADES,
      returns: [
        [0.1, -0.05],
        [-0.02, 0.03],
        [0.01, 0.01],
      ],
      flow: { amount: 100, everyPeriods: 1 },
      costs: { holdingFee: 0.001, tradingFee: 0.002 },
      rebalance: { kind: 'calendar', everyPeriods: 2 },
    })

    for (const p of r.periods) {
      expect(p.endValue).toBeCloseTo(p.startValue + p.grossReturn + p.flow - p.cost, 9)
    }
  })

  it('el rebalanceo no cambia el total, solo lo reparte', () => {
    const r = portfolioPath({
      assets: MITADES,
      returns: [[0.5, -0.3]],
      rebalance: { kind: 'calendar', everyPeriods: 1 },
    })
    // 500·1,5 + 500·0,7 = 750 + 350 = 1.100. Rebalancear no lo toca.
    expect(r.finalValue).toBeCloseTo(1100, 9)
    expect(r.finalByAsset['a']).toBeCloseTo(550, 9)
    expect(r.finalByAsset['b']).toBeCloseTo(550, 9)
  })

  it('sin flujo ni coste, el final es el compuesto de los rendimientos', () => {
    const r = portfolioPath({ assets: UNO, returns: [[0.1], [0.1]] })
    // 1000 · 1,1 · 1,1 = 1.210
    expect(r.finalValue).toBeCloseTo(1210, 9)
    expect(r.totalFlow).toBe(0)
    expect(r.totalCost).toBe(0)
  })

  it('cero periodos deja la cartera intacta', () => {
    const r = portfolioPath({ assets: MITADES, returns: [] })
    expect(r.finalValue).toBe(1000)
    expect(r.periods).toEqual([])
  })
})

describe('el orden importa tanto como la aritmética', () => {
  it('la aportación NO participa del periodo en que entra', () => {
    const r = portfolioPath({
      assets: UNO,
      returns: [[0.1]],
      flow: { amount: 1000, everyPeriods: 1 },
    })
    // Correcto: 1000·1,1 + 1000 = 2.100.
    // El error clásico sería (1000 + 1000)·1,1 = 2.200, que infla la
    // rentabilidad haciendo participar a un dinero que no estaba.
    expect(r.finalValue).toBeCloseTo(2100, 9)
    expect(r.finalValue).not.toBeCloseTo(2200, 2)
  })

  it('el rendimiento del periodo se mide sobre lo que había al empezar', () => {
    const r = portfolioPath({
      assets: UNO,
      returns: [[0.1]],
      flow: { amount: 500, everyPeriods: 1 },
    })
    expect(r.periods[0]!.grossReturn).toBeCloseTo(100, 9)
    expect(r.periods[0]!.startValue).toBe(1000)
  })

  it('el coste se cobra sobre el patrimonio ya con la aportación dentro', () => {
    const r = portfolioPath({
      assets: UNO,
      returns: [[0]],
      flow: { amount: 1000, everyPeriods: 1 },
      costs: { holdingFee: 0.01 },
    })
    // Base = 1000 + 1000 = 2.000; coste = 20; final = 1.980.
    expect(r.periods[0]!.cost).toBeCloseTo(20, 9)
    expect(r.finalValue).toBeCloseTo(1980, 9)
  })
})

describe('flujos', () => {
  it('una aportación cada tres periodos entra solo tres veces en nueve', () => {
    const r = portfolioPath({
      assets: UNO,
      returns: Array.from({ length: 9 }, () => [0]),
      flow: { amount: 100, everyPeriods: 3 },
    })
    expect(r.totalFlow).toBe(300)
    expect(r.periods.filter((p) => p.flow > 0).map((p) => p.period)).toEqual([2, 5, 8])
  })

  it('una retirada resta y se contabiliza como flujo negativo', () => {
    const r = portfolioPath({
      assets: UNO,
      returns: [[0]],
      flow: { amount: -200, everyPeriods: 1 },
    })
    expect(r.finalValue).toBeCloseTo(800, 9)
    expect(r.totalFlow).toBe(-200)
  })

  it('aportación cero no cambia nada', () => {
    const conCero = portfolioPath({
      assets: MITADES,
      returns: [[0.05, 0.02]],
      flow: { amount: 0, everyPeriods: 1 },
    })
    const sinFlujo = portfolioPath({ assets: MITADES, returns: [[0.05, 0.02]] })
    expect(conCero.finalValue).toBeCloseTo(sinFlujo.finalValue, 12)
  })

  it('la aportación se reparte según los pesos objetivo', () => {
    const r = portfolioPath({
      assets: [
        { id: 'a', targetWeight: 0.8, initialValue: 0 },
        { id: 'b', targetWeight: 0.2, initialValue: 0 },
      ],
      returns: [[0, 0]],
      flow: { amount: 1000, everyPeriods: 1 },
    })
    expect(r.finalByAsset['a']).toBeCloseTo(800, 9)
    expect(r.finalByAsset['b']).toBeCloseTo(200, 9)
  })
})

describe('políticas de rebalanceo', () => {
  const derivan = { assets: MITADES, returns: [[0.5, -0.3]] as number[][] }

  it('sin política, los pesos derivan con el mercado', () => {
    const r = portfolioPath({ ...derivan, rebalance: { kind: 'none' } })
    expect(r.finalByAsset['a']).toBeCloseTo(750, 9)
    expect(r.finalByAsset['b']).toBeCloseTo(350, 9)
    expect(r.periods[0]!.rebalanced).toBe(false)
  })

  it('por calendario se rebalancea aunque no haga falta', () => {
    const r = portfolioPath({
      assets: MITADES,
      returns: [[0.001, 0], [0.001, 0]],
      rebalance: { kind: 'calendar', everyPeriods: 1 },
    })
    expect(r.periods.every((p) => p.rebalanced)).toBe(true)
  })

  it('por bandas solo se rebalancea si alguien se sale', () => {
    // Deriva mínima: 500,5 sobre 1000,5 es un 50,02 %, dentro de una banda del 5 %.
    const dentro = portfolioPath({
      assets: MITADES,
      returns: [[0.001, 0]],
      rebalance: { kind: 'bands', tolerance: 0.05 },
    })
    expect(dentro.periods[0]!.rebalanced).toBe(false)

    // 750 sobre 1.100 es un 68 %: fuera de banda.
    const fuera = portfolioPath({ ...derivan, rebalance: { kind: 'bands', tolerance: 0.05 } })
    expect(fuera.periods[0]!.rebalanced).toBe(true)
  })

  it('la comisión se cobra sobre lo movido, no sobre el patrimonio', () => {
    const r = portfolioPath({
      ...derivan,
      rebalance: { kind: 'calendar', everyPeriods: 1 },
      costs: { tradingFee: 0.01 },
    })
    // Para volver a 550/550 hay que mover 200 de «a» a «b»: comisión = 2.
    // Sobre el patrimonio serían 11, cinco veces más.
    expect(r.totalCost).toBeCloseTo(2, 9)
  })

  it('una cartera ya en su sitio no genera comisión de rebalanceo', () => {
    const r = portfolioPath({
      assets: MITADES,
      returns: [[0.1, 0.1]],
      rebalance: { kind: 'calendar', everyPeriods: 1 },
      costs: { tradingFee: 0.01 },
    })
    // Los dos suben igual: los pesos no se mueven, no hay nada que mover.
    expect(r.totalCost).toBeCloseTo(0, 9)
  })
})

describe('caída máxima', () => {
  it('mide sobre el valor, no sobre el rendimiento', () => {
    const r = portfolioPath({ assets: UNO, returns: [[-0.2], [-0.1], [0.5]] })
    // 1000 → 800 → 720 → 1080. La peor caída es 720/1000 − 1 = −28 %.
    expect(r.maxDrawdown).toBeCloseTo(-0.28, 9)
  })

  it('una cartera que solo sube no tiene caída', () => {
    const r = portfolioPath({ assets: UNO, returns: [[0.1], [0.1]] })
    expect(r.maxDrawdown).toBe(0)
  })

  it('una aportación en un mal periodo no se cuenta como recuperación', () => {
    const r = portfolioPath({
      assets: UNO,
      returns: [[-0.3], [0]],
      flow: { amount: 1000, everyPeriods: 2 },
    })
    // El valor sube en el periodo 1 por la aportación, pero la caída del
    // periodo 0 ya ocurrió y sigue siendo el mínimo alcanzado.
    expect(r.maxDrawdown).toBeCloseTo(-0.3, 9)
  })
})

describe('casos límite', () => {
  it('una cartera vacía no rompe', () => {
    const r = portfolioPath({ assets: [], returns: [[]] })
    expect(r.finalValue).toBe(0)
    expect(r.maxDrawdown).toBe(0)
  })

  it('sin pesos objetivo, el flujo entra en la proporción actual', () => {
    const r = portfolioPath({
      assets: [
        { id: 'a', targetWeight: 0, initialValue: 750 },
        { id: 'b', targetWeight: 0, initialValue: 250 },
      ],
      returns: [[0, 0]],
      flow: { amount: 100, everyPeriods: 1 },
    })
    expect(r.finalByAsset['a']).toBeCloseTo(825, 9)
    expect(r.finalByAsset['b']).toBeCloseTo(275, 9)
  })

  it('un rendimiento que falta se trata como cero, no como NaN', () => {
    const r = portfolioPath({ assets: MITADES, returns: [[0.1]] })
    expect(Number.isFinite(r.finalValue)).toBe(true)
    expect(r.finalByAsset['b']).toBe(500)
  })

  it('los mismos datos dan exactamente el mismo recorrido', () => {
    const entrada = {
      assets: MITADES,
      returns: [[0.1, -0.05], [0.02, 0.03]],
      flow: { amount: 50, everyPeriods: 1 },
      costs: { holdingFee: 0.001, tradingFee: 0.002 },
      rebalance: { kind: 'bands' as const, tolerance: 0.02 },
    }
    expect(portfolioPath(entrada)).toEqual(portfolioPath(entrada))
  })
})
