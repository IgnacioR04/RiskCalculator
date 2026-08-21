/**
 * LAB-1211. El puente que faltaba entre el orquestador y los proveedores.
 *
 * La fase 2 dejó el análisis arrancando solo y **sin nadie que inyectara el
 * proveedor real**: caía al respaldo vacío, así que en producción el riesgo
 * salía `insufficient` siempre. Un automatismo que llega hasta el borde y no
 * cruza, y que además no falla — solo devuelve nada.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '../../domain'
import type { AssetSeries } from '../stability/twr'
import {
  AnalysisAbortedError,
  createMarketSeriesAdapter,
  DIAS_POR_DEFECTO,
} from './marketSeriesAdapter'

const activo = (id: string, symbol: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  symbol,
  name: symbol,
  assetType: 'stock',
  quoteCurrency: 'EUR',
  ...extra,
})

const ACTIVOS = [activo('a1', 'AAA'), activo('a2', 'BBB'), activo('a3', 'CCC')]

function serieDe(asset: Asset, n = 100): AssetSeries {
  const base = new Date('2025-01-01T00:00:00Z').getTime()
  const puntos = Array.from({ length: n }, (_, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    close: 100 + i,
  }))
  return {
    asset,
    series: puntos,
    returns: puntos.slice(1).map((p, i) => ({ date: p.date, value: 0.001 * (i + 1) })),
    provider: 'prueba',
  }
}

const sinFx = async () => []

describe('adaptador · conversión al contrato', () => {
  it('convierte las series del proveedor a rendimientos fechados', async () => {
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      fetchSeriesImpl: async (a) => serieDe(a),
      fxImpl: sinFx,
    })

    const series = await adaptador.seriesFor(['a1'])
    expect(series.get('a1')).toBeDefined()
    expect(series.get('a1')!.length).toBeGreaterThan(50)
    expect(series.get('a1')![0]).toHaveProperty('date')
    expect(series.get('a1')![0]).toHaveProperty('value')
  })

  it('pide la ventana por defecto de un año hábil', async () => {
    const espia = vi.fn(
      async (
        a: Asset,
        _dias: number,
        _divisa: string,
        _fx: readonly { date: string; rate: number }[],
      ) => serieDe(a),
    )
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      fetchSeriesImpl: espia,
      fxImpl: sinFx,
    })
    await adaptador.seriesFor(['a1'])
    expect(espia.mock.calls[0]![1]).toBe(DIAS_POR_DEFECTO)
    expect(espia.mock.calls[0]![2]).toBe('EUR')
  })
})

describe('adaptador · caché entre ámbitos', () => {
  it('no vuelve a pedir una serie que ya trajo', async () => {
    // La serie diaria de un instrumento es la misma para la cartera consolidada
    // y para cada cuenta. Sin esto, una cartera con cuatro cuentas pediría cinco
    // veces lo mismo.
    const espia = vi.fn(async (a: Asset) => serieDe(a))
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      fetchSeriesImpl: espia,
      fxImpl: sinFx,
    })

    await adaptador.seriesFor(['a1', 'a2'])
    await adaptador.seriesFor(['a1'])
    await adaptador.seriesFor(['a1', 'a2', 'a3'])

    const pedidos = espia.mock.calls.map((c) => (c[0] as Asset).id)
    expect(pedidos).toEqual(['a1', 'a2', 'a3'])
  })

  it('devuelve de caché lo ya conocido aunque se pida junto a algo nuevo', async () => {
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      fetchSeriesImpl: async (a) => serieDe(a),
      fxImpl: sinFx,
    })
    await adaptador.seriesFor(['a1'])
    const segunda = await adaptador.seriesFor(['a1', 'a2'])
    expect([...segunda.keys()].sort()).toEqual(['a1', 'a2'])
  })
})

describe('adaptador · fallos por instrumento', () => {
  it('un instrumento que falla no tumba a los demás, y se anota', async () => {
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      fetchSeriesImpl: async (a) => {
        if (a.id === 'a2') throw new Error('Límite del proveedor.')
        return serieDe(a)
      },
      fxImpl: sinFx,
    })

    const series = await adaptador.seriesFor(['a1', 'a2', 'a3'])
    expect([...series.keys()].sort()).toEqual(['a1', 'a3'])
    expect(adaptador.allFailures.get('a2')).toBe('Límite del proveedor.')
  })

  it('una serie vacía se anota en vez de pasar por buena', async () => {
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      fetchSeriesImpl: async () => null,
      fxImpl: sinFx,
    })
    const series = await adaptador.seriesFor(['a1'])
    expect(series.size).toBe(0)
    expect(adaptador.allFailures.get('a1')).toBeDefined()
  })

  it('un activo que ya no está en la cartera se anota', async () => {
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      fetchSeriesImpl: async (a) => serieDe(a),
      fxImpl: sinFx,
    })
    await adaptador.seriesFor(['fantasma'])
    expect(adaptador.allFailures.get('fantasma')).toBeDefined()
  })
})

describe('adaptador · cancelación', () => {
  it('deja de pedir en cuanto se aborta', async () => {
    // Con la cola de Twelve Data espaciando ocho segundos, una ronda de quince
    // instrumentos dura dos minutos: dejar de pedir es la diferencia entre
    // abortar y esperar a algo que ya no interesa.
    const control = new AbortController()
    const pedidos: string[] = []

    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      signal: control.signal,
      fetchSeriesImpl: async (a) => {
        pedidos.push(a.id)
        if (a.id === 'a1') control.abort()
        return serieDe(a)
      },
      fxImpl: sinFx,
    })

    await expect(adaptador.seriesFor(['a1', 'a2', 'a3'])).rejects.toBeInstanceOf(
      AnalysisAbortedError,
    )
    // Se pidió el primero y se cortó antes del segundo.
    expect(pedidos).toEqual(['a1'])
  })

  it('abortado antes de empezar no pide nada', async () => {
    const control = new AbortController()
    control.abort()
    const espia = vi.fn(async (a: Asset) => serieDe(a))
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      signal: control.signal,
      fetchSeriesImpl: espia,
      fxImpl: sinFx,
    })
    await expect(adaptador.seriesFor(['a1'])).rejects.toBeInstanceOf(AnalysisAbortedError)
    expect(espia).not.toHaveBeenCalled()
  })
})

describe('adaptador · tipo de cambio', () => {
  it('no lo pide si toda la cartera está en la divisa de presentación', async () => {
    // Gastar una llamada de FX para no usarla es exactamente lo que agota una
    // cuota diaria sin que nadie sepa por qué.
    const espiaFx = vi.fn(async () => [])
    const adaptador = createMarketSeriesAdapter({
      assets: ACTIVOS,
      baseCurrency: 'EUR',
      fetchSeriesImpl: async (a) => serieDe(a),
      fxImpl: espiaFx,
    })
    await adaptador.seriesFor(['a1', 'a2'])
    expect(espiaFx).not.toHaveBeenCalled()
  })

  it('lo pide una sola vez cuando hace falta', async () => {
    const espiaFx = vi.fn(async () => [])
    const adaptador = createMarketSeriesAdapter({
      assets: [activo('a1', 'AAA', { quoteCurrency: 'USD' }), activo('a2', 'BBB', { quoteCurrency: 'USD' })],
      baseCurrency: 'EUR',
      fetchSeriesImpl: async (a) => serieDe(a),
      fxImpl: espiaFx,
    })
    await adaptador.seriesFor(['a1'])
    await adaptador.seriesFor(['a2'])
    expect(espiaFx).toHaveBeenCalledTimes(1)
  })

  it('si el FX falla, los activos en la divisa base siguen su camino', async () => {
    const adaptador = createMarketSeriesAdapter({
      assets: [activo('a1', 'AAA', { quoteCurrency: 'USD' })],
      baseCurrency: 'EUR',
      fetchSeriesImpl: async (a) => serieDe(a),
      fxImpl: async () => {
        throw new Error('sin FX')
      },
    })
    // No revienta: el fallo de FX no puede tumbar el análisis entero.
    await expect(adaptador.seriesFor(['a1'])).resolves.toBeDefined()
  })
})
