/**
 * LAB-1205 / LAB-1213. Las pruebas de automatización: lo que tiene que ocurrir
 * **sin que nadie pulse nada**, y la política de precios que antes se
 * contradecía.
 *
 * Se monta el hook directamente, sin renderizar ninguna pantalla del
 * Laboratorio. Eso ya es parte de lo que se comprueba.
 *
 * ## Aislamiento
 *
 * Cada prueba usa una cartera distinta: con la misma identidad, el informe que
 * guardó la anterior se recupera de `localStorage` y la siguiente pasaría **sin
 * haber calculado nada**. Y los hooks se desmontan, porque uno que deja una
 * promesa colgada sigue vivo durante las pruebas siguientes.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset, BrokerAccount, Quote, Transaction } from '../../../lib/domain'
import { clearReports, loadReport } from '../../../lib/lab/fullAnalysis/reportStore'
import type { MarketSeriesAdapter } from '../../../lib/lab/fullAnalysis/marketSeriesAdapter'
import type { DatedReturn } from '../../../lib/lab/fullAnalysis/runFullAnalysis'
import { useAppStore } from '../../../state/store'
import { useFullAnalysis } from './useFullAnalysis'

const CUENTAS: BrokerAccount[] = [
  { id: 'c1', brokerName: 'Broker A', accountLabel: 'Principal', defaultCurrency: 'EUR' },
  { id: 'c2', brokerName: 'Broker B', accountLabel: 'Segunda', defaultCurrency: 'EUR' },
]

const activo = (id: string, symbol: string): Asset => ({
  id,
  symbol,
  name: symbol,
  assetType: 'stock',
  quoteCurrency: 'EUR',
})

const compra = (id: string, assetId: string, accountId: string, cantidad: string): Transaction => ({
  id,
  accountId,
  assetId,
  type: 'buy',
  datetime: '2026-01-02T10:00:00Z',
  investedAmount: '1000',
  investedCurrency: 'EUR',
  quantity: cantidad,
  executionPrice: '100',
  quoteCurrency: 'EUR',
  fee: null,
  feeCurrency: null,
  sourceType: 'exact',
  confidence: 'high',
})

const cotizacion = (assetId: string, precio: string): Quote => ({
  assetId,
  price: precio,
  currency: 'EUR',
  timestamp: '2026-08-21T10:00:00Z',
  provider: 'prueba',
  quality: 'real',
  fetchedAt: '2026-08-21T10:00:00Z',
})

/** Serie con observaciones suficientes para que el riesgo salga `available`. */
function serie(n: number, semilla: number): DatedReturn[] {
  const base = new Date('2025-01-01T00:00:00Z').getTime()
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    value: Math.sin((i + 1) * semilla) * 0.01,
  }))
}

let contador = 0

function cargarCartera(): void {
  contador += 1
  useAppStore.setState({
    accounts: CUENTAS,
    assets: [activo('a1', 'AAA'), activo('a2', 'BBB')],
    transactions: [compra('t1', 'a1', 'c1', String(10 + contador)), compra('t2', 'a2', 'c2', '5')],
    quotes: { a1: cotizacion('a1', '120'), a2: cotizacion('a2', '80') },
    fxRates: [],
  })
}

/** Adaptador de prueba que devuelve series completas. */
function adaptadorConSeries(): { adapter: MarketSeriesAdapter; llamadas: string[][] } {
  const llamadas: string[][] = []
  return {
    llamadas,
    adapter: {
      version: 'test',
      failures: new Map(),
      seriesFor: async (ids) => {
        llamadas.push([...ids])
        return new Map(ids.map((id, i) => [id, serie(120, i + 1)]))
      },
    },
  }
}

beforeEach(() => {
  clearReports()
  useAppStore.setState({ accounts: [], assets: [], transactions: [], quotes: {}, fxRates: [] })
})

afterEach(() => {
  clearReports()
})

const OPCIONES = { debounceMs: 1 }

describe('arranque automático', () => {
  it('una cartera cargada dispara el análisis sin pulsar nada', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.get('portfolio')?.status).toBe('ready'))
    unmount()
  })

  it('analiza la consolidada primero y después cada cuenta', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.size).toBe(3))
    expect([...result.current.reports.keys()]).toEqual(['portfolio', 'account:c1', 'account:c2'])
    unmount()
  })

  it('visibleAccountId cambia realmente la prioridad', async () => {
    cargarCartera()
    const publicados: string[] = []
    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, visibleAccountId: 'c2' }),
    )
    await waitFor(() => expect(result.current.reports.size).toBe(3))
    for (const clave of result.current.reports.keys()) publicados.push(clave)
    // La cuenta visible va la segunda, no la última.
    expect(publicados[1]).toBe('account:c2')
    unmount()
  })
})

describe('con históricos, el riesgo se calcula solo', () => {
  it('una cartera con series produce volatilidad y drawdown sin visitar Lab', async () => {
    cargarCartera()
    const { adapter } = adaptadorConSeries()
    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, adapterFactory: () => adapter }),
    )

    await waitFor(() => expect(result.current.reports.get('portfolio')?.risk.status).toBe('available'))
    const riesgo = result.current.reports.get('portfolio')!.risk
    expect(riesgo.status).toBe('available')
    if (riesgo.status !== 'available') return
    expect(riesgo.value.annualizedVolatility).toBeGreaterThan(0)
    expect(riesgo.value.maxDrawdown).not.toBeNull()
    unmount()
  })

  it('los tres ámbitos comparten un único adaptador', async () => {
    // La caché vive dentro del adaptador —y `marketSeriesAdapter.test.ts`
    // comprueba que funciona—, así que lo que importa aquí es que el hook cree
    // **uno solo por ejecución**. Con uno por ámbito, la caché no serviría de
    // nada y cada cuenta volvería a descargar lo mismo.
    cargarCartera()
    const { adapter } = adaptadorConSeries()
    let creados = 0
    const { result, unmount } = renderHook(() =>
      useFullAnalysis({
        ...OPCIONES,
        adapterFactory: () => {
          creados += 1
          return adapter
        },
      }),
    )
    await waitFor(() => expect(result.current.reports.size).toBe(3))
    expect(creados).toBe(1)
    unmount()
  })
})

describe('política de precios', () => {
  it('un tick intradía NO relanza el análisis', async () => {
    // La política es congelar la valoración del día. Si esto fallara, cada
    // actualización de precio lanzaría una ronda completa de descargas.
    cargarCartera()
    let ejecuciones = 0
    const adapter: MarketSeriesAdapter = {
      version: 'test',
      failures: new Map(),
      seriesFor: async () => {
        ejecuciones += 1
        return new Map()
      },
    }
    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, adapterFactory: () => adapter }),
    )
    await waitFor(() => expect(result.current.reports.get('portfolio')?.status).toBe('ready'))
    const antes = ejecuciones

    act(() => {
      useAppStore.setState({ quotes: { a1: cotizacion('a1', '999'), a2: cotizacion('a2', '80') } })
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(ejecuciones).toBe(antes)
    unmount()
  })

  it('la identidad incluye la valoración, así que nunca se pisan pesos distintos', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.get('portfolio')?.status).toBe('ready'))

    const informe = result.current.reports.get('portfolio')!
    expect(informe.valuationVersion).not.toBe('')
    expect(informe.fingerprint).toContain(informe.valuationVersion)
    expect(informe.runId).toContain(informe.fingerprint)
    unmount()
  })

  it('cambiar la divisa base sí relanza y cambia la identidad', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.fingerprint).not.toBe(''))
    const antes = result.current.fingerprint

    act(() => useAppStore.getState().setDisplayCurrency('USD'))
    await waitFor(() => expect(result.current.fingerprint).not.toBe(antes))
    act(() => useAppStore.getState().setDisplayCurrency('EUR'))
    unmount()
  })

  it('un evento repetido no cambia la identidad estructural', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.structuralFingerprint).not.toBe(''))
    const antes = result.current.structuralFingerprint

    const mismas = useAppStore.getState().transactions.map((t) => ({ ...t }))
    act(() => useAppStore.setState({ transactions: mismas }))
    expect(result.current.structuralFingerprint).toBe(antes)
    unmount()
  })
})

describe('cancelación y errores', () => {
  it('un cambio de cartera aborta las descargas pendientes', async () => {
    cargarCartera()
    const señales: AbortSignal[] = []
    const adapter: MarketSeriesAdapter = {
      version: 'test',
      failures: new Map(),
      seriesFor: async () => new Map(),
    }
    const { unmount } = renderHook(() =>
      useFullAnalysis({
        ...OPCIONES,
        adapterFactory: ({ signal }) => {
          señales.push(signal)
          return adapter
        },
      }),
    )
    await waitFor(() => expect(señales.length).toBeGreaterThan(0))
    const primera = señales[0]!
    expect(primera.aborted).toBe(false)

    act(() => {
      useAppStore.setState({
        transactions: [compra('t1', 'a1', 'c1', '555'), compra('t2', 'a2', 'c2', '5')],
      })
    })
    // `requestAborted`, que es distinto de descartar el resultado.
    await waitFor(() => expect(primera.aborted).toBe(true))
    unmount()
  })

  it('un fallo del proveedor no detiene el análisis, y se anota por instrumento', async () => {
    cargarCartera()
    const adapter: MarketSeriesAdapter = {
      version: 'test',
      failures: new Map([['a2', 'Límite del proveedor.']]),
      seriesFor: async (ids) =>
        new Map(ids.filter((id) => id !== 'a2').map((id, i) => [id, serie(120, i + 1)])),
    }
    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, adapterFactory: () => adapter }),
    )

    await waitFor(() => expect(result.current.reports.size).toBe(3))
    // Las tres publican, incluida la cuenta cuyo instrumento falló.
    for (const informe of result.current.reports.values()) {
      expect(['ready', 'insufficient']).toContain(informe.status)
    }
    const consolidado = result.current.reports.get('portfolio')!
    expect(consolidado.quality.status === 'available' && consolidado.quality.value.failures).toEqual(
      [{ symbol: 'BBB', reason: 'Límite del proveedor.' }],
    )
    unmount()
  })

  it('running termina aunque una etapa falle', async () => {
    cargarCartera()
    const adapter: MarketSeriesAdapter = {
      version: 'test',
      failures: new Map(),
      seriesFor: async () => {
        throw new Error('proveedor caído')
      },
    }
    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, adapterFactory: () => adapter }),
    )
    // Se espera al fallo primero: `running` arranca en `false`, así que
    // esperarlo a él pasaría antes de que el análisis empezara siquiera.
    await waitFor(() => expect(result.current.failures.size).toBeGreaterThan(0))
    // Dejarlo encendido convertiría un fallo puntual en una barra eterna.
    expect(result.current.running).toBe(false)
    unmount()
  })

  it('no deja promesas rechazadas sin manejar', async () => {
    const sinManejar: unknown[] = []
    const captor = (e: PromiseRejectionEvent) => sinManejar.push(e.reason)
    globalThis.addEventListener?.('unhandledrejection', captor as unknown as EventListener)

    cargarCartera()
    const adapter: MarketSeriesAdapter = {
      version: 'test',
      failures: new Map(),
      seriesFor: async () => {
        throw new Error('proveedor caído')
      },
    }
    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, adapterFactory: () => adapter }),
    )
    await waitFor(() => expect(result.current.running).toBe(false))
    await new Promise((r) => setTimeout(r, 20))

    globalThis.removeEventListener?.('unhandledrejection', captor as unknown as EventListener)
    expect(sinManejar).toEqual([])
    unmount()
  })
})

describe('persistencia', () => {
  it('guarda cada informe con su identidad y ámbito', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.size).toBe(3))

    for (const scope of [
      { kind: 'portfolio' } as const,
      { kind: 'account', accountId: 'c1' } as const,
      { kind: 'account', accountId: 'c2' } as const,
    ]) {
      expect(loadReport(result.current.fingerprint, scope)).not.toBeNull()
    }
    unmount()
  })

  it('al recargar recupera todas las cuentas, no solo la consolidada', async () => {
    cargarCartera()
    const primera = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(primera.result.current.reports.size).toBe(3))
    primera.unmount()

    // Segundo montaje con la misma cartera: es lo que ocurre al recargar.
    const segunda = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(segunda.result.current.reports.size).toBe(3))
    expect([...segunda.result.current.reports.keys()].sort()).toEqual([
      'account:c1',
      'account:c2',
      'portfolio',
    ])
    segunda.unmount()
  })

  it('un almacenamiento que falla no tumba el análisis', async () => {
    const real = Storage.prototype.setItem
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, clave: string, valor: string) {
        if (clave.startsWith('riskcalculator.lab.reports')) throw new Error('cuota llena')
        real.call(this, clave, valor)
      })

    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.get('portfolio')?.status).toBe('ready'))

    setItem.mockRestore()
    unmount()
  })
})
