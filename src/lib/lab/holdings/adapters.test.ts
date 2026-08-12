/**
 * Pruebas de los adaptadores de composición (LAB-404, LAB-406).
 */
import { describe, expect, it } from 'vitest'
import type { Asset } from '../../domain'
import { compositionFromAsset, compositionsFromAssets, isWrapper } from './adapters'

const HOY = '2026-08-12'

function activo(cambio: Partial<Asset> = {}): Asset {
  return {
    id: 'iwda',
    symbol: 'IWDA',
    name: 'iShares Core MSCI World',
    assetType: 'etf',
    quoteCurrency: 'EUR',
    ...cambio,
  }
}

describe('composición escrita a mano', () => {
  it('traduce los pesos y declara cuánto del fondo se conoce', () => {
    const c = compositionFromAsset(
      activo({
        holdings: [
          { symbol: 'aapl', name: 'Apple', weight: '0.05' },
          { symbol: 'msft', weight: '0.04' },
        ],
      }),
      HOY,
    )
    expect(c?.holdings.map((h) => h.symbol)).toEqual(['AAPL', 'MSFT'])
    // Diez y cuatro por ciento: se conoce el 9 % del fondo, y se dice.
    expect(c?.coverage).toBeCloseTo(0.09, 6)
    expect(c?.source).toBe('manual')
    expect(c?.asOf).toBe(HOY)
  })

  it('una posición sin peso se descarta, no se le inventa uno', () => {
    const c = compositionFromAsset(
      activo({ holdings: [{ symbol: 'AAPL', weight: '0.05' }, { symbol: 'MSFT' }] }),
      HOY,
    )
    expect(c?.holdings).toHaveLength(1)
    expect(c?.coverage).toBeCloseTo(0.05, 6)
  })

  it('un peso fuera de rango tampoco entra', () => {
    for (const weight of ['0', '-0.1', '1.5', 'mucho']) {
      const c = compositionFromAsset(activo({ holdings: [{ symbol: 'AAPL', weight }] }), HOY)
      expect(c, weight).toBeNull()
    }
  })

  it('sin posiciones no hay composición: null, no una vacía', () => {
    expect(compositionFromAsset(activo(), HOY)).toBeNull()
    expect(compositionFromAsset(activo({ holdings: [] }), HOY)).toBeNull()
  })

  it('los datos de demostración se marcan como tales', () => {
    const c = compositionFromAsset(
      activo({ isDemo: true, holdings: [{ symbol: 'AAPL', weight: '0.05' }] }),
      HOY,
    )
    expect(c?.source).toBe('demo')
  })

  it('la cobertura nunca pasa de uno', () => {
    const c = compositionFromAsset(
      activo({ holdings: [{ symbol: 'A', weight: '0.6' }, { symbol: 'B', weight: '0.7' }] }),
      HOY,
    )
    expect(c?.coverage).toBe(1)
  })
})

describe('recolección sobre la cartera', () => {
  it('solo devuelve los activos que declaran algo', () => {
    const salida = compositionsFromAssets(
      [
        activo({ id: 'a', holdings: [{ symbol: 'AAPL', weight: '0.05' }] }),
        activo({ id: 'b' }),
      ],
      HOY,
    )
    expect(Object.keys(salida)).toEqual(['a'])
  })
})

describe('qué activos tienen algo dentro', () => {
  it('los ETF e índices sí; una acción suelta no', () => {
    expect(isWrapper(activo({ assetType: 'etf' }))).toBe(true)
    expect(isWrapper(activo({ assetType: 'index' }))).toBe(true)
    expect(isWrapper(activo({ assetType: 'stock' }))).toBe(false)
    expect(isWrapper(activo({ assetType: 'crypto' }))).toBe(false)
  })
})
