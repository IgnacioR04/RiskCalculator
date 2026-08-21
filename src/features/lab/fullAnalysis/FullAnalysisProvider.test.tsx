/**
 * LAB-1214. La prueba que faltaba: **que producción use el adaptador real**.
 *
 * `FullAnalysisProvider` llamaba al hook sin proveedor de series, así que caía
 * al respaldo vacío. Todo lo demás funcionaba —el análisis arrancaba solo, las
 * etapas se publicaban, los informes se guardaban— y el riesgo salía
 * `insufficient` siempre, en cada cartera, para siempre. Ninguna prueba lo veía
 * porque todas inyectaban su propio doble.
 *
 * Aquí se monta el proveedor **como lo monta `App`**, sin inyectar nada, y se
 * espía la capa de adquisición para comprobar que se la llama de verdad.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset, BrokerAccount, Quote, Transaction } from '../../../lib/domain'
import { clearReports } from '../../../lib/lab/fullAnalysis/reportStore'
import { useAppStore } from '../../../state/store'
import { FullAnalysisProvider, useConsolidatedReport } from './FullAnalysisProvider'

// Se espía la adquisición real, que es justo la pieza que el proveedor tenía
// que estar usando y no usaba.
vi.mock('../../../lib/lab/stability/acquisition', () => ({
  fetchSeries: vi.fn(async (asset: Asset) => {
    const base = new Date('2025-01-01T00:00:00Z').getTime()
    const puntos = Array.from({ length: 120 }, (_, i) => ({
      date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
      close: 100 + Math.sin(i * 0.3) * 5,
    }))
    return {
      asset,
      series: puntos,
      returns: puntos.slice(1).map((p, i) => ({ date: p.date, value: Math.sin(i * 0.3) * 0.01 })),
      provider: 'prueba',
    }
  }),
  convertDemoPriceSeries: vi.fn(() => []),
}))

import { fetchSeries } from '../../../lib/lab/stability/acquisition'

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
  providerIds: { twelvedata: 'AAA' },
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

const COTIZACION: Quote = {
  assetId: 'a1',
  price: '120',
  currency: 'EUR',
  timestamp: '2026-08-21T10:00:00Z',
  provider: 'prueba',
  quality: 'real',
  fetchedAt: '2026-08-21T10:00:00Z',
}

/** Consumidor mínimo: solo enseña lo que hace falta para afirmar algo. */
function Sonda() {
  const informe = useConsolidatedReport()
  return (
    <div>
      <span data-testid="estado">{informe?.status ?? 'sin-informe'}</span>
      <span data-testid="riesgo">{informe?.risk.status ?? '-'}</span>
      <span data-testid="volatilidad">
        {informe?.risk.status === 'available'
          ? informe.risk.value.annualizedVolatility.toFixed(4)
          : '-'}
      </span>
      <span data-testid="drawdown">
        {informe?.risk.status === 'available' ? String(informe.risk.value.maxDrawdown !== null) : '-'}
      </span>
    </div>
  )
}

beforeEach(() => {
  clearReports()
  vi.mocked(fetchSeries).mockClear()
  useAppStore.setState({ accounts: [], assets: [], transactions: [], quotes: {}, fxRates: [] })
})

afterEach(() => {
  clearReports()
})

describe('FullAnalysisProvider · integración con producción', () => {
  it('usa el adaptador real: llama a la adquisición de verdad', async () => {
    useAppStore.setState({
      accounts: [CUENTA],
      assets: [ACTIVO],
      transactions: [COMPRA],
      quotes: { a1: COTIZACION },
      fxRates: [],
    })

    render(
      <FullAnalysisProvider>
        <Sonda />
      </FullAnalysisProvider>,
    )

    // Esto es lo que antes no pasaba nunca en producción.
    await waitFor(() => expect(vi.mocked(fetchSeries)).toHaveBeenCalled(), { timeout: 5000 })
    expect(vi.mocked(fetchSeries).mock.calls[0]![0]!.id).toBe('a1')
  })

  it('una cartera real llega a volatilidad y caída máxima sin visitar Lab', async () => {
    useAppStore.setState({
      accounts: [CUENTA],
      assets: [ACTIVO],
      transactions: [COMPRA],
      quotes: { a1: COTIZACION },
      fxRates: [],
    })

    render(
      <FullAnalysisProvider>
        <Sonda />
      </FullAnalysisProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('riesgo')).toHaveTextContent('available'), {
      timeout: 5000,
    })
    expect(Number(screen.getByTestId('volatilidad').textContent)).toBeGreaterThan(0)
    // `true` significa que hay caída máxima medida, no un cero inventado.
    expect(screen.getByTestId('drawdown')).toHaveTextContent('true')
  })

  it('sin cartera no se pide nada al proveedor', async () => {
    render(
      <FullAnalysisProvider>
        <Sonda />
      </FullAnalysisProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('sin-informe'))
    expect(vi.mocked(fetchSeries)).not.toHaveBeenCalled()
  })
})
