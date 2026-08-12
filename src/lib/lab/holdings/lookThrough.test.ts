/**
 * Pruebas del motor de exposición real (LAB-405, LAB-407, LAB-408).
 *
 * El caso que da sentido a todo esto es el de la cartera de demostración: un
 * ETF del MSCI World, otro del S&P 500 y acciones de Apple. Parecen tres cosas
 * y no lo son.
 */
import { describe, expect, it } from 'vitest'
import type { FundComposition } from './contracts'
import { allFundOverlaps, fundOverlap, lookThrough, type PositionValue } from './lookThrough'

function accion(symbol: string, value: number): PositionValue {
  return { assetId: symbol.toLowerCase(), symbol, value, isWrapper: false }
}

function fondo(symbol: string, value: number): PositionValue {
  return { assetId: symbol.toLowerCase(), symbol, value, isWrapper: true }
}

function composicion(
  assetId: string,
  holdings: readonly { symbol: string; weight: number }[],
  coverage: number,
  asOf = '2026-06-30',
): FundComposition {
  return { assetId, source: 'sec_edgar', asOf, holdings, coverage }
}

describe('el caso que justifica el look-through', () => {
  // 1.000 € en un mundial, 1.000 € en un S&P y 500 € en Apple directa.
  // Los dos fondos llevan Apple dentro.
  const entrada = {
    positions: [fondo('IWDA', 1000), fondo('SXR8', 1000), accion('AAPL', 500)],
    compositions: {
      iwda: composicion('iwda', [
        { symbol: 'AAPL', weight: 0.05 },
        { symbol: 'MSFT', weight: 0.04 },
      ], 1),
      sxr8: composicion('sxr8', [
        { symbol: 'AAPL', weight: 0.07 },
        { symbol: 'NVDA', weight: 0.06 },
      ], 1),
    },
    baseCurrency: 'EUR' as const,
  }

  const resultado = lookThrough(entrada)

  it('suma lo directo y lo que viene dentro de los fondos', () => {
    const apple = resultado.exposures.find((e) => e.symbol === 'AAPL')
    expect(apple?.directValue).toBe(500)
    // 1000 × (0,05/0,09) + 1000 × (0,07/0,13): los pesos se renormalizan sobre
    // lo declarado en cada fondo.
    expect(apple?.indirectValue).toBeGreaterThan(1000)
    expect(apple?.totalValue).toBe((apple?.directValue ?? 0) + (apple?.indirectValue ?? 0))
  })

  it('Apple resulta ser la mayor exposición, y a simple vista no lo parecía', () => {
    expect(resultado.exposures[0]?.symbol).toBe('AAPL')
  })

  it('dice a través de qué fondos la tienes', () => {
    const apple = resultado.exposures.find((e) => e.symbol === 'AAPL')
    expect(apple?.viaFunds).toEqual(['IWDA', 'SXR8'])
  })

  it('los fondos desaparecen como tales: lo que queda son empresas', () => {
    expect(resultado.exposures.map((e) => e.symbol)).not.toContain('IWDA')
    expect(resultado.exposures.map((e) => e.symbol)).toContain('MSFT')
  })
})

describe('lo que no se conoce no se reparte', () => {
  it('un fondo sin composición cuenta como no mirado, no se distribuye', () => {
    const r = lookThrough({
      positions: [fondo('IWDA', 1000), accion('AAPL', 1000)],
      compositions: {},
      baseCurrency: 'EUR',
    })

    expect(r.fundsWithoutComposition).toEqual(['IWDA'])
    expect(r.unresolvedValue).toBe(1000)
    expect(r.lookThroughCoverage).toBe(0.5)
    // Apple no ha crecido por el camino: sigue siendo lo que se tiene directo.
    expect(r.exposures.find((e) => e.symbol === 'AAPL')?.totalValue).toBe(1000)
  })

  it('una composición parcial solo reparte la parte cubierta', () => {
    // Se conoce el 25 % del fondo: el 75 % restante queda sin resolver.
    const r = lookThrough({
      positions: [fondo('IWDA', 1000)],
      compositions: { iwda: composicion('iwda', [{ symbol: 'AAPL', weight: 0.25 }], 0.25) },
      baseCurrency: 'EUR',
    })

    expect(r.exposures.find((e) => e.symbol === 'AAPL')?.totalValue).toBeCloseTo(250, 6)
    expect(r.unresolvedValue).toBeCloseTo(750, 6)
    expect(r.lookThroughCoverage).toBeCloseTo(0.25, 6)
  })

  it('una posición sin valor conocido no entra como cero', () => {
    const r = lookThrough({
      positions: [accion('AAPL', 1000), { ...accion('MSFT', 0), value: null }],
      compositions: {},
      baseCurrency: 'EUR',
    })
    expect(r.exposures.map((e) => e.symbol)).toEqual(['AAPL'])
  })

  it('sin nada que analizar, la cobertura es cero y no rompe', () => {
    const r = lookThrough({ positions: [], compositions: {}, baseCurrency: 'EUR' })
    expect(r.exposures).toEqual([])
    expect(r.lookThroughCoverage).toBe(0)
  })
})

describe('procedencia y fecha', () => {
  it('la fecha del conjunto es la de la composición más antigua', () => {
    const r = lookThrough({
      positions: [fondo('A', 100), fondo('B', 100)],
      compositions: {
        a: composicion('a', [{ symbol: 'X', weight: 1 }], 1, '2026-06-30'),
        b: composicion('b', [{ symbol: 'Y', weight: 1 }], 1, '2025-12-31'),
      },
      baseCurrency: 'EUR',
    })
    // El conjunto es tan viejo como su pieza más vieja.
    expect(r.oldestAsOf).toBe('2025-12-31')
  })

  it('sin composiciones no hay fecha, y se dice con null', () => {
    const r = lookThrough({
      positions: [accion('AAPL', 100)],
      compositions: {},
      baseCurrency: 'EUR',
    })
    expect(r.oldestAsOf).toBeNull()
  })
})

describe('solapamiento entre fondos (LAB-408)', () => {
  const mundial = composicion('a', [
    { symbol: 'AAPL', weight: 0.05 },
    { symbol: 'MSFT', weight: 0.04 },
    { symbol: 'NESN', weight: 0.01 },
  ], 0.1)

  const sp500 = composicion('b', [
    { symbol: 'AAPL', weight: 0.07 },
    { symbol: 'MSFT', weight: 0.06 },
    { symbol: 'NVDA', weight: 0.05 },
  ], 0.18)

  it('el solape es la suma de los mínimos', () => {
    const r = fundOverlap(mundial, sp500, 'IWDA', 'SXR8')
    // min(5,7) + min(4,6) = 5 + 4 = 9 %.
    expect(r.overlap).toBeCloseTo(0.09, 6)
  })

  it('enseña qué posiciones producen ese solape', () => {
    const r = fundOverlap(mundial, sp500, 'IWDA', 'SXR8')
    expect(r.sharedTop.map((s) => s.symbol)).toEqual(['AAPL', 'MSFT'])
  })

  it('lo que solo está en uno no cuenta', () => {
    const r = fundOverlap(mundial, sp500, 'IWDA', 'SXR8')
    expect(r.sharedTop.map((s) => s.symbol)).not.toContain('NESN')
    expect(r.sharedTop.map((s) => s.symbol)).not.toContain('NVDA')
  })

  it('dos fondos sin nada en común no solapan', () => {
    const otro = composicion('c', [{ symbol: 'ZZZZ', weight: 0.5 }], 0.5)
    expect(fundOverlap(mundial, otro, 'IWDA', 'OTRO').overlap).toBe(0)
  })

  it('los pares salen ordenados de más a menos solape', () => {
    const pares = allFundOverlaps(
      { a: mundial, b: sp500, c: composicion('c', [{ symbol: 'AAPL', weight: 0.01 }], 0.01) },
      { a: 'IWDA', b: 'SXR8', c: 'OTRO' },
    )
    expect(pares).toHaveLength(3)
    expect(pares[0]?.overlap).toBeGreaterThanOrEqual(pares[1]?.overlap ?? 0)
    expect(pares[1]?.overlap).toBeGreaterThanOrEqual(pares[2]?.overlap ?? 0)
  })

  it('el resultado no depende del orden de los fondos', () => {
    expect(fundOverlap(mundial, sp500, 'A', 'B').overlap).toBeCloseTo(
      fundOverlap(sp500, mundial, 'B', 'A').overlap,
      12,
    )
  })
})

describe('determinismo', () => {
  it('los mismos datos dan exactamente el mismo resultado', () => {
    const entrada = {
      positions: [fondo('IWDA', 1000), accion('AAPL', 500)],
      compositions: { iwda: composicion('iwda', [{ symbol: 'AAPL', weight: 0.05 }], 0.5) },
      baseCurrency: 'EUR' as const,
    }
    expect(lookThrough(entrada)).toEqual(lookThrough(entrada))
  })
})
