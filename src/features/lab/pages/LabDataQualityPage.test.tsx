/**
 * Pruebas de la pantalla de calidad de datos (LAB-212).
 *
 * La ficha pide cinco situaciones —completa, parcial, stale, manual y demo— y un
 * criterio de aceptación: **lo que falta se muestra como «No disponible»**,
 * nunca como un cero ni como una celda en blanco.
 */
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Asset, BrokerAccount, FxRate, Quote, Transaction } from '../../../lib/domain'
import { escribirSerie, vaciarCacheDeSeries } from '../../../lib/market/seriesCache'
import { labPath } from '../routes/labRoutes'
import { useAppStore } from '../../../state/store'
import { LabDataQualityPage } from './LabDataQualityPage'

const CUENTA: BrokerAccount = {
  id: 'c1',
  brokerName: 'Broker',
  accountLabel: 'Principal',
  defaultCurrency: 'EUR',
}

function activo(cambio: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    symbol: 'ACC',
    name: 'Acción de prueba',
    assetType: 'stock',
    quoteCurrency: 'EUR',
    sector: 'Tecnología',
    ...cambio,
  }
}

function compra(assetId: string): Transaction {
  return {
    id: `tx-${assetId}`,
    accountId: CUENTA.id,
    assetId,
    type: 'buy',
    datetime: '2026-01-02T00:00:00Z',
    investedAmount: '1000',
    investedCurrency: 'EUR',
    quantity: '10',
    executionPrice: '100',
    quoteCurrency: 'EUR',
    fee: null,
    feeCurrency: null,
    sourceType: 'exact',
    confidence: 'exact',
  }
}

function cotizacion(cambio: Partial<Quote> = {}): Quote {
  return {
    assetId: 'a1',
    price: '110',
    currency: 'EUR',
    // Reciente respecto al reloj real: la pantalla usa `new Date()` a propósito,
    // porque es el único sitio donde el «ahora» es legítimo.
    timestamp: new Date().toISOString(),
    provider: 'twelvedata',
    quality: 'real',
    fetchedAt: new Date().toISOString(),
    ...cambio,
  }
}

function montar(estado: {
  assets: Asset[]
  quotes?: Record<string, Quote>
  fxRates?: FxRate[]
}) {
  useAppStore.setState({
    assets: estado.assets,
    accounts: [CUENTA],
    transactions: estado.assets.map((a) => compra(a.id)),
    quotes: estado.quotes ?? {},
    fxRates: estado.fxRates ?? [],
  })
  return render(
    <MemoryRouter initialEntries={[labPath('lab.stability.data')]}>
      <LabDataQualityPage />
    </MemoryRouter>,
  )
}

/** Fila de la tabla de activos correspondiente a un símbolo. */
function fila(simbolo: string) {
  return screen.getByRole('row', { name: new RegExp(simbolo) })
}

beforeEach(() => {
  vaciarCacheDeSeries()
  useAppStore.setState({
    assets: [],
    accounts: [],
    transactions: [],
    quotes: {},
    fxRates: [],
    settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
  })
})

afterEach(() => {
  vaciarCacheDeSeries()
})

/* ── Aceptación: lo que falta se dice ─────────────────────────────────────── */

describe('lo que falta se muestra como «No disponible»', () => {
  it('una posición sin precio no enseña un cero ni una celda vacía', () => {
    montar({ assets: [activo()] })
    const celdas = within(fila('ACC')).getAllByRole('cell')

    // Valor y precio: los dos lo dicen con palabras.
    expect(celdas[1]).toHaveTextContent('No disponible')
    expect(celdas[2]).toHaveTextContent('No disponible')
    expect(within(fila('ACC')).queryByText('0,00 €')).toBeNull()
  })

  it('la fuente ausente también se dice', () => {
    montar({ assets: [activo()] })
    expect(within(fila('ACC')).getAllByText('No disponible').length).toBeGreaterThanOrEqual(3)
  })

  it('sin fecha del dato, la insignia lo dice en vez de quedarse en blanco', () => {
    montar({ assets: [activo()] })
    expect(within(fila('ACC')).getByText('Sin fecha')).toBeInTheDocument()
  })

  it('«no aplica» no es lo mismo que «no disponible»', () => {
    // Una acción suelta en euros no tiene componentes que mirar ni cambio que
    // aplicar: no le faltan, es que no los necesita. Son dos celdas.
    montar({ assets: [activo()], quotes: { a1: cotizacion() } })
    const celdas = within(fila('ACC')).getAllByRole('cell')
    expect(celdas[3]).toHaveTextContent('No aplica')
    expect(celdas[6]).toHaveTextContent('No aplica')
    expect(celdas[3]).not.toHaveTextContent('No disponible')
  })
})

/* ── Las cinco situaciones de la ficha ────────────────────────────────────── */

describe('estados de los datos', () => {
  it('completa: precio, clasificación e historia suficientes', () => {
    escribirSerie(
      'a1',
      365,
      'EUR',
      Array.from({ length: 120 }, (_, i) => ({
        date: new Date(Date.now() - (119 - i) * 86_400_000).toISOString().slice(0, 10),
        close: 100 + i,
      })),
      'twelvedata',
    )
    montar({ assets: [activo()], quotes: { a1: cotizacion() } })

    const celdas = within(fila('ACC')).getAllByRole('cell')
    expect(celdas[2]).toHaveTextContent('Sí')
    expect(celdas[4]).toHaveTextContent('Sí')
    expect(celdas[9]).toHaveTextContent('Suficiente')
  })

  it('parcial: falta la historia pero el valor se conoce', () => {
    montar({ assets: [activo()], quotes: { a1: cotizacion() } })
    const celdas = within(fila('ACC')).getAllByRole('cell')

    expect(celdas[2]).toHaveTextContent('Sí')
    expect(celdas[4]).toHaveTextContent('No disponible')
    expect(celdas[9]).toHaveTextContent('Parcial')
  })

  it('antiguo: un precio pasado de fecha se marca y se explica', () => {
    montar({
      assets: [activo()],
      quotes: { a1: cotizacion({ timestamp: '2020-01-01T00:00:00Z' }) },
    })
    expect(within(fila('ACC')).getAllByText(/Antiguo/).length).toBeGreaterThan(0)
  })

  it('manual: un precio introducido a mano se distingue de uno de mercado', () => {
    montar({
      assets: [
        activo({
          // Fecha **relativa**, no fija: con una fija la prueba caducaba sola.
          // Escrita el 2026-08-10, pasó a fallar el 2026-08-15, cuando el precio
          // superó la ventana de frescura y la fila empezó a decir «Antiguo» en
          // vez de «Manual». Lo que se comprueba aquí es la procedencia, no la
          // antigüedad —de eso va la prueba de arriba—, así que el precio tiene
          // que ser reciente siempre.
          manualPrice: {
            price: '110',
            currency: 'EUR',
            updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
        }),
      ],
    })
    expect(within(fila('ACC')).getByText(/Manual/)).toBeInTheDocument()
  })

  it('demostración: un precio de demo no pasa por real', () => {
    montar({ assets: [activo()], quotes: { a1: cotizacion({ quality: 'demo' }) } })
    expect(within(fila('ACC')).getByText(/Demostración/)).toBeInTheDocument()
    expect(within(fila('ACC')).getAllByRole('cell')[9]).toHaveTextContent('Insuficiente')
  })
})

/* ── Cobertura y cálculos ─────────────────────────────────────────────────── */

describe('cobertura y cálculos bloqueados', () => {
  it('enseña las tres coberturas de la cartera', () => {
    montar({ assets: [activo()], quotes: { a1: cotizacion() } })
    expect(screen.getByText('Con precio conocido')).toBeInTheDocument()
    expect(screen.getByText('Con historia suficiente')).toBeInTheDocument()
    expect(screen.getByText('Con componentes declarados')).toBeInTheDocument()
  })

  it('dice qué cálculos quedan bloqueados y por qué', () => {
    montar({ assets: [activo()], quotes: { a1: cotizacion() } })
    const volatilidad = screen.getByRole('row', { name: /Volatilidad/ })
    expect(volatilidad).toHaveTextContent('Insuficiente')
    expect(volatilidad).toHaveTextContent(/observaciones/)
  })

  it('propone acciones concretas para desbloquear', () => {
    montar({ assets: [activo()] })
    expect(screen.getByRole('heading', { name: 'Qué puedes hacer' })).toBeInTheDocument()
    expect(screen.getByText(/Actualiza los precios/)).toBeInTheDocument()
  })

  it('una cobertura que no se puede calcular no se pinta como cero', () => {
    // Sin posiciones no hay capital conocido, así que tampoco hay cobertura.
    montar({ assets: [] })
    expect(screen.getByText('Todavía no hay nada que evaluar')).toBeInTheDocument()
    expect(screen.queryByText('0 %')).toBeNull()
  })

  it('lleva la versión de umbrales con la que se evaluó', () => {
    montar({ assets: [activo()], quotes: { a1: cotizacion() } })
    expect(screen.getByText(/Umbrales de la versión/)).toBeInTheDocument()
  })
})

/* ── La pantalla no descarga nada ─────────────────────────────────────────── */

describe('la pantalla no trae datos nuevos', () => {
  it('lo dice y manda a Cartera para actualizarlos', () => {
    montar({ assets: [activo()], quotes: { a1: cotizacion() } })
    expect(screen.getByText(/no descarga nada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cartera' })).toHaveAttribute('href', '/cartera')
  })
})
