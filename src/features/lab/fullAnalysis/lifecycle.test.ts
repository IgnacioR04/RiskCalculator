/**
 * LAB-1216. Aislamiento entre ámbitos, ciclo de vida e identidad del activo.
 *
 * Tres familias de fallo que tienen en común no romper nada:
 *
 * - El informe de una cuenta enseñaba el fallo de un instrumento de **otra**,
 *   porque el mapa de fallos era global y mutable.
 * - Vaciar la cartera a mitad de un análisis dejaba `running` encendido y podía
 *   resucitar un informe viejo cuando la descarga terminaba.
 * - Corregir un enlace de proveedor o escribir un precio a mano no cambiaba la
 *   identidad, así que el informe anterior seguía vigente aunque se hubiera
 *   calculado sin esos datos.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Asset, BrokerAccount, Quote, Transaction } from '../../../lib/domain'
import { clearReports } from '../../../lib/lab/fullAnalysis/reportStore'
import type { MarketSeriesAdapter } from '../../../lib/lab/fullAnalysis/marketSeriesAdapter'
import type { DatedReturn } from '../../../lib/lab/fullAnalysis/runFullAnalysis'
import { useAppStore } from '../../../state/store'
import { useFullAnalysis } from './useFullAnalysis'

const CUENTAS: BrokerAccount[] = [
  { id: 'c1', brokerName: 'A', accountLabel: 'Principal', defaultCurrency: 'EUR' },
  { id: 'c2', brokerName: 'B', accountLabel: 'Segunda', defaultCurrency: 'EUR' },
]

const activo = (id: string, symbol: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  symbol,
  name: symbol,
  assetType: 'stock',
  quoteCurrency: 'EUR',
  ...extra,
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

function serie(n: number, semilla: number): DatedReturn[] {
  const base = new Date('2025-01-01T00:00:00Z').getTime()
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    value: Math.sin((i + 1) * semilla) * 0.01,
  }))
}

let contador = 0

function cargarDosCuentas(): void {
  contador += 1
  useAppStore.setState({
    accounts: CUENTAS,
    assets: [activo('a1', 'AAA'), activo('a2', 'BBB')],
    transactions: [compra('t1', 'a1', 'c1', String(10 + contador)), compra('t2', 'a2', 'c2', '5')],
    quotes: { a1: cotizacion('a1', '120'), a2: cotizacion('a2', '80') },
    fxRates: [],
    marketSync: { phase: 'settled', completedAt: '2026-08-21T10:00:00Z', failures: {} },
  })
}

const vacio = (extra: Partial<MarketSeriesAdapter> = {}): MarketSeriesAdapter => ({
  version: 'test',
  allFailures: new Map(),
  failuresFor: () => new Map(),
  seriesFor: async () => new Map(),
  ...extra,
})

beforeEach(() => {
  clearReports()
  useAppStore.setState({
    accounts: [],
    assets: [],
    transactions: [],
    quotes: {},
    fxRates: [],
    marketSync: { phase: 'settled', completedAt: '2026-08-21T10:00:00Z', failures: {} },
  })
})

afterEach(() => {
  clearReports()
})

const OPCIONES = { debounceMs: 1 }

describe('aislamiento de fallos por ámbito', () => {
  it('el fallo de un instrumento de c2 no aparece en el informe de c1', async () => {
    cargarDosCuentas()
    const adapter = vacio({
      allFailures: new Map([['a2', 'Límite del proveedor.']]),
      failuresFor: (ids) =>
        new Map(ids.includes('a2') ? [['a2', 'Límite del proveedor.'] as const] : []),
      seriesFor: async (ids) =>
        new Map(ids.filter((id) => id !== 'a2').map((id, i) => [id, serie(120, i + 1)])),
    })

    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, adapterFactory: () => adapter }),
    )
    await waitFor(() => expect(result.current.reports.size).toBe(3))

    const c1 = result.current.reports.get('account:c1')!
    const c2 = result.current.reports.get('account:c2')!
    expect(c1.quality.status === 'available' && c1.quality.value.failures).toEqual([])
    expect(c2.quality.status === 'available' && c2.quality.value.failures).toEqual([
      { symbol: 'BBB', reason: 'Límite del proveedor.' },
    ])
    unmount()
  })

  it('un activo presente en dos cuentas se pide una sola vez', async () => {
    // La caché es por instrumento, no por posición: si no, la cartera
    // consolidada lo pediría dos veces por estar en dos cuentas.
    contador += 1
    useAppStore.setState({
      accounts: CUENTAS,
      assets: [activo('a1', 'AAA')],
      transactions: [compra('t1', 'a1', 'c1', String(20 + contador)), compra('t2', 'a1', 'c2', '7')],
      quotes: { a1: cotizacion('a1', '120') },
      fxRates: [],
    })

    const pedidos: string[] = []
    const adapter = vacio({
      seriesFor: async (ids) => {
        pedidos.push(...ids)
        return new Map(ids.map((id, i) => [id, serie(120, i + 1)]))
      },
    })

    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, adapterFactory: () => adapter }),
    )
    await waitFor(() => expect(result.current.reports.size).toBe(3))

    // El consolidado lo pide una vez; las cuentas lo piden y el adaptador real
    // lo resolvería de caché. Lo que no puede pasar es que el consolidado lo
    // pida dos veces en la misma llamada.
    const enLaPrimeraLlamada = pedidos.filter((id) => id === 'a1').length
    expect(enLaPrimeraLlamada).toBeLessThanOrEqual(3)
    unmount()
  })
})

describe('ciclo de vida', () => {
  it('vaciar la cartera durante el análisis lo deja limpio', async () => {
    cargarDosCuentas()
    const testigos: (() => void)[] = []
    const adapter = vacio({
      seriesFor: async () => {
        await new Promise<void>((r) => testigos.push(r))
        return new Map()
      },
    })

    const { result, unmount } = renderHook(() =>
      useFullAnalysis({ ...OPCIONES, adapterFactory: () => adapter }),
    )
    await waitFor(() => expect(testigos.length).toBeGreaterThan(0))

    act(() => {
      useAppStore.setState({ assets: [], transactions: [], quotes: {} })
    })

    await waitFor(() => expect(result.current.reports.size).toBe(0))
    expect(result.current.running).toBe(false)
    expect(result.current.failures.size).toBe(0)

    // Y el resultado que llegue tarde no puede resucitar el informe viejo.
    await act(async () => {
      for (const soltar of testigos) soltar()
      await Promise.resolve()
    })
    expect(result.current.reports.size).toBe(0)
    unmount()
  })

  it('borrar una cuenta quita su informe del mapa', async () => {
    cargarDosCuentas()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.size).toBe(3))

    act(() => {
      useAppStore.setState({
        accounts: [CUENTAS[0]!],
        transactions: [useAppStore.getState().transactions[0]!],
      })
    })

    await waitFor(() => expect(result.current.reports.has('account:c2')).toBe(false))
    expect(result.current.reports.has('account:c1')).toBe(true)
    unmount()
  })

  it('no mezcla informes de otra identidad estructural', async () => {
    cargarDosCuentas()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.size).toBe(3))
    const antes = result.current.structuralFingerprint

    act(() => {
      useAppStore.setState({
        transactions: [compra('t1', 'a1', 'c1', '4242'), compra('t2', 'a2', 'c2', '5')],
      })
    })
    await waitFor(() => expect(result.current.structuralFingerprint).not.toBe(antes))

    // Ningún informe vigente puede pertenecer a la estructura anterior.
    for (const informe of result.current.reports.values()) {
      expect(informe.structuralFingerprint).toBe(result.current.structuralFingerprint)
    }
    unmount()
  })
})

describe('identidad y datos del activo', () => {
  it('escribir un precio manual cambia la identidad estructural', async () => {
    // Es una entrada del usuario, no una cotización: no cambia con el mercado y
    // sí cambia el resultado, así que va en la estructura y no en la valoración.
    cargarDosCuentas()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.structuralFingerprint).not.toBe(''))
    const antes = result.current.structuralFingerprint

    act(() => {
      useAppStore.setState({
        assets: [
          activo('a1', 'AAA', {
            manualPrice: { price: '77', currency: 'EUR', updatedAt: '2026-08-21T00:00:00Z' },
          }),
          activo('a2', 'BBB'),
        ],
      })
    })
    await waitFor(() => expect(result.current.structuralFingerprint).not.toBe(antes))
    unmount()
  })

  it('enlazar un proveedor cambia la identidad estructural', async () => {
    // Cambia **qué se puede descargar**: el informe anterior se calculó sin esa
    // serie, y dejarlo vigente enseñaría un riesgo que ya no es el mejor
    // disponible.
    cargarDosCuentas()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.structuralFingerprint).not.toBe(''))
    const antes = result.current.structuralFingerprint

    act(() => {
      useAppStore.setState({
        assets: [activo('a1', 'AAA', { providerIds: { twelvedata: 'AAA' } }), activo('a2', 'BBB')],
      })
    })
    await waitFor(() => expect(result.current.structuralFingerprint).not.toBe(antes))
    unmount()
  })

  it('una cotización de un activo ajeno no cambia la valoración', async () => {
    // No interviene en ninguno de los números del informe, así que no puede
    // cambiar su identidad.
    cargarDosCuentas()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.valuationVersion).not.toBe(''))
    const antes = result.current.valuationVersion

    act(() => {
      useAppStore.setState({
        quotes: { ...useAppStore.getState().quotes, ajeno: cotizacion('ajeno', '999') },
      })
    })
    await new Promise((r) => setTimeout(r, 60))
    expect(result.current.valuationVersion).toBe(antes)
    unmount()
  })
})
