/**
 * LAB-1205. Las pruebas de automatización: lo que tiene que ocurrir **sin que
 * nadie pulse nada**.
 *
 * Se monta el hook directamente, sin renderizar ninguna pantalla del
 * Laboratorio. Eso ya es parte de lo que se comprueba: si hiciera falta visitar
 * una pantalla para que el análisis empezara, estas pruebas no pasarían.
 *
 * ## Aislamiento
 *
 * Dos detalles costaron más que el resto del archivo, y los dos son la misma
 * clase de error: una prueba que pasa por vacío.
 *
 * - **Cada prueba usa una cartera distinta.** Con la misma huella, el informe
 *   que guardó la anterior se recupera de `localStorage` y la siguiente pasa sin
 *   haber calculado nada.
 * - **Los hooks que dejan una promesa colgada se desmontan y la sueltan.** Si no,
 *   su cola sigue viva durante las pruebas siguientes.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset, BrokerAccount, Quote, Transaction } from '../../../lib/domain'
import { clearReports, countReports, loadReport } from '../../../lib/lab/fullAnalysis/reportStore'
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

let contador = 0

/** Carga una cartera con dos cuentas, distinta en cada prueba. */
function cargarCartera(): void {
  contador += 1
  useAppStore.setState({
    accounts: CUENTAS,
    assets: [activo('a1', 'AAA'), activo('a2', 'BBB')],
    transactions: [
      compra('t1', 'a1', 'c1', String(10 + contador)),
      compra('t2', 'a2', 'c2', '5'),
    ],
    // Sin cotización las posiciones salen sin valor y el pipeline no llega a
    // pedir series: las pruebas de resultados parciales pasarían por vacío.
    quotes: { a1: cotizacion('a1', '120'), a2: cotizacion('a2', '80') },
    fxRates: [],
  })
}

beforeEach(() => {
  clearReports()
  useAppStore.setState({ accounts: [], assets: [], transactions: [], quotes: {}, fxRates: [] })
})

afterEach(() => {
  clearReports()
})

/** Debounce corto: se prueba el comportamiento, no la espera. */
const OPCIONES = { debounceMs: 1 }

describe('arranque automático', () => {
  it('una cartera cargada dispara el análisis sin pulsar nada', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))

    await waitFor(() => {
      expect(result.current.reports.get('portfolio')?.status).toBe('ready')
    })
    expect(result.current.reports.get('portfolio')?.scope).toEqual({ kind: 'portfolio' })
    unmount()
  })

  it('analiza primero la cartera consolidada y después cada cuenta', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))

    await waitFor(() => {
      expect(result.current.reports.size).toBe(3)
    })
    expect([...result.current.reports.keys()]).toEqual(['portfolio', 'account:c1', 'account:c2'])
    unmount()
  })

  it('una cartera vacía no produce informes ni errores', async () => {
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => {
      expect(result.current.running).toBe(false)
    })
    expect(result.current.reports.size).toBe(0)
    unmount()
  })
})

describe('ámbito', () => {
  it('el informe de una cuenta no incluye posiciones de la otra', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))

    await waitFor(() => {
      expect(result.current.reports.get('account:c1')?.status).toBe('ready')
    })

    const c1 = result.current.reports.get('account:c1')!
    expect(c1.snapshot.status).toBe('available')
    if (c1.snapshot.status === 'available') {
      expect(c1.snapshot.value.positions.map((p) => p.symbol)).toEqual(['AAA'])
    }
    unmount()
  })
})

describe('huella', () => {
  it('un cambio en las operaciones cambia la huella', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.fingerprint).not.toBe(''))
    const antes = result.current.fingerprint

    act(() => {
      useAppStore.setState({
        transactions: [compra('t1', 'a1', 'c1', '999'), compra('t2', 'a2', 'c2', '5')],
      })
    })
    await waitFor(() => expect(result.current.fingerprint).not.toBe(antes))
    unmount()
  })

  it('cambiar la divisa de presentación cambia la huella', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.fingerprint).not.toBe(''))
    const antes = result.current.fingerprint

    act(() => {
      useAppStore.getState().setDisplayCurrency('USD')
    })
    await waitFor(() => expect(result.current.fingerprint).not.toBe(antes))
    act(() => {
      useAppStore.getState().setDisplayCurrency('EUR')
    })
    unmount()
  })

  it('un evento repetido no cambia la huella: la deduplicación sale gratis', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.fingerprint).not.toBe(''))
    const antes = result.current.fingerprint

    // Volver a escribir exactamente lo mismo es lo que hace una sincronización
    // que no trae novedades. No es una pregunta nueva, y no dispara nada.
    const mismas = useAppStore.getState().transactions.map((t) => ({ ...t }))
    act(() => {
      useAppStore.setState({ transactions: mismas })
    })
    expect(result.current.fingerprint).toBe(antes)
    unmount()
  })
})

describe('cancelación y parciales', () => {
  it('la concentración se publica antes de terminar la descarga', async () => {
    cargarCartera()
    const testigos: (() => void)[] = []
    const seriesFor = async (): Promise<ReadonlyMap<string, readonly DatedReturn[]>> => {
      await new Promise<void>((r) => testigos.push(r))
      return new Map()
    }

    const { result, unmount } = renderHook(() => useFullAnalysis({ ...OPCIONES, seriesFor }))

    // La red se queda esperando a propósito: lo que se comprueba es que la
    // concentración no la espera.
    await waitFor(() => {
      expect(result.current.reports.get('portfolio')?.concentration.status).toBe('available')
    })
    await waitFor(() => {
      expect(testigos.length).toBeGreaterThan(0)
    })
    expect(result.current.reports.get('portfolio')?.status).toBe('partial')
    expect(result.current.reports.get('portfolio')?.risk.status).toBe('insufficient')

    await act(async () => {
      for (const soltar of testigos) soltar()
      await Promise.resolve()
    })
    unmount()
  })

  it('una respuesta tardía no sobrescribe el informe nuevo', async () => {
    cargarCartera()
    const testigos: (() => void)[] = []
    let llamadas = 0
    const seriesFor = async (): Promise<ReadonlyMap<string, readonly DatedReturn[]>> => {
      llamadas += 1
      if (llamadas === 1) await new Promise<void>((r) => testigos.push(r))
      return new Map()
    }

    const { result, unmount } = renderHook(() => useFullAnalysis({ ...OPCIONES, seriesFor }))
    await waitFor(() => expect(testigos.length).toBeGreaterThan(0))

    // Mientras la primera ronda espera a la red, cambia la cartera.
    act(() => {
      useAppStore.setState({
        transactions: [compra('t1', 'a1', 'c1', '777'), compra('t2', 'a2', 'c2', '5')],
      })
    })
    const huellaNueva = result.current.fingerprint

    await act(async () => {
      for (const soltar of testigos) soltar()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.reports.get('portfolio')?.status).toBe('ready')
    })
    // El informe publicado es el de la huella nueva, no el de la que llegó tarde.
    expect(result.current.reports.get('portfolio')?.fingerprint).toBe(huellaNueva)
    unmount()
  })

  it('el riesgo insuficiente no bloquea la concentración', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.get('portfolio')?.status).toBe('ready'))

    const informe = result.current.reports.get('portfolio')!
    expect(informe.risk.status).toBe('insufficient')
    expect(informe.concentration.status).toBe('available')
    unmount()
  })
})

describe('persistencia', () => {
  it('guarda el informe terminado con su huella y ámbito', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.get('portfolio')?.status).toBe('ready'))

    const guardado = loadReport(result.current.fingerprint, { kind: 'portfolio' })
    expect(guardado).not.toBeNull()
    expect(guardado?.modelVersion).toBe('full-analysis-v1')
    unmount()
  })

  it('no devuelve el informe de otra huella', async () => {
    cargarCartera()
    const { result, unmount } = renderHook(() => useFullAnalysis(OPCIONES))
    await waitFor(() => expect(result.current.reports.get('portfolio')?.status).toBe('ready'))

    // Existe un informe, pero no responde a esta pregunta.
    expect(loadReport('otra-huella', { kind: 'portfolio' })).toBeNull()
    expect(countReports()).toBeGreaterThan(0)
    unmount()
  })

  it('un almacenamiento que falla no tumba el análisis', async () => {
    // El espía se acota a **nuestra** clave. Interceptar todas las escrituras
    // rompería también la persistencia del store, y la prueba mediría otra cosa.
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
