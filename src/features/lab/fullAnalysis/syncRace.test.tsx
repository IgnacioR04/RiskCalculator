/**
 * LAB-1215. La carrera entre la sincronización inicial y el primer análisis.
 *
 * ## El fallo
 *
 * `useFullAnalysis` programaba su primera ejecución a los 600 ms mientras
 * `useMarketAutoSync` seguía descargando precios **de forma secuencial**, con
 * ocho segundos entre llamadas a Twelve Data. Con varios activos esa ronda dura
 * minutos, así que el análisis capturaba una valoración a medio hacer —o
 * directamente la del día anterior— y, como después ya no reacciona a `quotes`,
 * **la congelaba durante todo el día**.
 *
 * Es el peor tipo de fallo: no rompe nada, no avisa, y el informe parece
 * correcto. Solo está calculado sobre precios viejos.
 *
 * ## Cómo se comprueba
 *
 * Se monta el proveedor real —el mismo que monta `App`— con una sincronización
 * simulada que tarda más que el debounce, y se comprueba que el precio que
 * acaba en el informe es el nuevo, no el viejo.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset, BrokerAccount, Quote, Transaction } from '../../../lib/domain'
import { clearReports } from '../../../lib/lab/fullAnalysis/reportStore'
import { useAppStore } from '../../../state/store'
import { FullAnalysisProvider, useConsolidatedReport } from './FullAnalysisProvider'

vi.mock('../../../lib/lab/stability/acquisition', () => ({
  fetchSeries: vi.fn(async () => null),
  convertDemoPriceSeries: vi.fn(() => []),
}))

const CUENTA: BrokerAccount = {
  id: 'c1',
  brokerName: 'Broker',
  accountLabel: 'Principal',
  defaultCurrency: 'EUR',
}

const ACTIVO: Asset = {
  id: 'a1',
  symbol: 'AAA',
  name: 'AAA',
  assetType: 'stock',
  quoteCurrency: 'EUR',
}

const COMPRA: Transaction = {
  id: 't1',
  accountId: 'c1',
  assetId: 'a1',
  type: 'buy',
  datetime: '2026-01-02T10:00:00Z',
  investedAmount: '1000',
  investedCurrency: 'EUR',
  quantity: '10',
  executionPrice: '100',
  quoteCurrency: 'EUR',
  fee: null,
  feeCurrency: null,
  sourceType: 'exact',
  confidence: 'high',
}

const cotizacion = (precio: string, cuando: string): Quote => ({
  assetId: 'a1',
  price: precio,
  currency: 'EUR',
  timestamp: cuando,
  provider: 'prueba',
  quality: 'real',
  fetchedAt: cuando,
})

/** Precio viejo: el que había guardado de una sesión anterior. */
const VIEJA = cotizacion('100', '2026-08-01T10:00:00Z')
/** Precio nuevo: el que trae la sincronización inicial de hoy. */
const NUEVA = cotizacion('150', '2026-08-21T10:00:00Z')

function Sonda() {
  const informe = useConsolidatedReport()
  return (
    <div>
      <span data-testid="valor">
        {informe?.snapshot.status === 'available' ? informe.snapshot.value.knownValue : '-'}
      </span>
      <span data-testid="ejecuciones">{informe?.runId ?? '-'}</span>
      <span data-testid="antiguedad">
        {informe?.quality.status === 'available'
          ? String(informe.quality.value.stalestPriceDays)
          : '-'}
      </span>
    </div>
  )
}

beforeEach(() => {
  clearReports()
  useAppStore.setState({
    accounts: [CUENTA],
    assets: [ACTIVO],
    transactions: [COMPRA],
    quotes: { a1: VIEJA },
    fxRates: [],
    marketSync: { phase: 'idle', completedAt: null, failures: {} },
  })
})

afterEach(() => {
  clearReports()
  useAppStore.setState({ marketSync: { phase: 'idle', completedAt: null, failures: {} } })
})

describe('carrera entre sincronización y primer análisis', () => {
  it('no congela la cotización vieja: espera a que termine la sincronización', async () => {
    // La shell anuncia que empieza a sincronizar antes de descargar nada.
    act(() => {
      useAppStore.getState().setMarketSync({ phase: 'loading', completedAt: null, failures: {} })
    })

    const idsVistos = new Set<string>()
    render(
      <FullAnalysisProvider>
        <Sonda />
      </FullAnalysisProvider>,
    )

    // Más que el debounce de 600 ms: aquí es donde la versión anterior
    // capturaba la valoración vieja.
    await new Promise((r) => setTimeout(r, 900))
    expect(screen.getByTestId('valor')).toHaveTextContent('-')

    // La sincronización termina y publica el precio nuevo.
    act(() => {
      useAppStore.setState({ quotes: { a1: NUEVA } })
      useAppStore
        .getState()
        .setMarketSync({ phase: 'settled', completedAt: new Date().toISOString(), failures: {} })
    })

    await waitFor(() => expect(screen.getByTestId('valor')).not.toHaveTextContent('-'), {
      timeout: 5000,
    })
    // 10 unidades × 150 = 1500. Con la cotización vieja habrían sido 1000.
    expect(screen.getByTestId('valor')).toHaveTextContent('1500')
    for (const id of idsVistos) expect(id).toBeDefined()
  })

  it('una sincronización con fallos también deja arrancar el análisis', async () => {
    // `settled` significa terminada, no terminada bien. Esperar a un éxito que
    // no va a llegar dejaría el diagnóstico colgado para siempre.
    act(() => {
      useAppStore.getState().setMarketSync({ phase: 'loading', completedAt: null, failures: {} })
    })

    render(
      <FullAnalysisProvider>
        <Sonda />
      </FullAnalysisProvider>,
    )
    await new Promise((r) => setTimeout(r, 700))
    expect(screen.getByTestId('valor')).toHaveTextContent('-')

    act(() => {
      useAppStore.getState().setMarketSync({
        phase: 'settled',
        completedAt: new Date().toISOString(),
        failures: { a1: 'Límite del proveedor.' },
      })
    })

    await waitFor(() => expect(screen.getByTestId('valor')).not.toHaveTextContent('-'), {
      timeout: 5000,
    })
  })

  it('un tick posterior del mismo día no relanza el análisis', async () => {
    act(() => {
      useAppStore.setState({ quotes: { a1: NUEVA } })
      useAppStore
        .getState()
        .setMarketSync({ phase: 'settled', completedAt: new Date().toISOString(), failures: {} })
    })

    render(
      <FullAnalysisProvider>
        <Sonda />
      </FullAnalysisProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('valor')).toHaveTextContent('1500'), {
      timeout: 5000,
    })
    const primerRun = screen.getByTestId('ejecuciones').textContent

    // Refresco horario: cambia el precio pero no la fecha de valoración.
    act(() => {
      useAppStore.setState({ quotes: { a1: cotizacion('160', '2026-08-21T11:00:00Z') } })
    })
    await new Promise((r) => setTimeout(r, 900))

    // Mismo `runId`: no ha habido ejecución nueva, y el valor sigue congelado.
    expect(screen.getByTestId('ejecuciones')).toHaveTextContent(primerRun!)
    expect(screen.getByTestId('valor')).toHaveTextContent('1500')
  })

  it('un cambio estructural sí relanza, con los datos más recientes', async () => {
    act(() => {
      useAppStore.setState({ quotes: { a1: NUEVA } })
      useAppStore
        .getState()
        .setMarketSync({ phase: 'settled', completedAt: new Date().toISOString(), failures: {} })
    })

    render(
      <FullAnalysisProvider>
        <Sonda />
      </FullAnalysisProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('valor')).toHaveTextContent('1500'), {
      timeout: 5000,
    })

    // Se compran diez unidades más: la cartera cambia, así que hay pregunta
    // nueva, y se usa el precio más reciente disponible.
    act(() => {
      useAppStore.setState({
        transactions: [COMPRA, { ...COMPRA, id: 't2', quantity: '10' }],
        quotes: { a1: cotizacion('200', '2026-08-21T12:00:00Z') },
      })
    })

    await waitFor(() => expect(screen.getByTestId('valor')).toHaveTextContent('4000'), {
      timeout: 5000,
    })
  })
})

describe('antigüedad del precio', () => {
  it('se mide con los precios realmente usados', async () => {
    act(() => {
      useAppStore.setState({ quotes: { a1: VIEJA } })
      useAppStore
        .getState()
        .setMarketSync({ phase: 'settled', completedAt: new Date().toISOString(), failures: {} })
    })

    render(
      <FullAnalysisProvider>
        <Sonda />
      </FullAnalysisProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('antiguedad')).not.toHaveTextContent('-'), {
      timeout: 5000,
    })

    // El precio es del 1 de agosto: la antigüedad es un número de días, no un
    // cero inventado ni un `null` de relleno.
    const dias = Number(screen.getByTestId('antiguedad').textContent)
    expect(Number.isFinite(dias)).toBe(true)
    expect(dias).toBeGreaterThan(0)
  })
})
