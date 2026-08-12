/**
 * Pruebas de la pantalla de Exposición y del editor de composición
 * (LAB-409, LAB-404b).
 *
 * Lo que se comprueba es lo que hace útil la pantalla: que una empresa metida
 * dentro de dos fondos deje de parecer tres cosas distintas, y que lo que no se
 * conoce se diga en vez de repartirse.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Asset, BrokerAccount, Quote, Transaction } from '../../../lib/domain'
import { useAppStore } from '../../../state/store'
import { HoldingsEditor } from './HoldingsEditor'
import { LabExposurePage } from '../pages/LabExposurePage'

const CUENTA: BrokerAccount = {
  id: 'c1',
  brokerName: 'Broker',
  accountLabel: 'Principal',
  defaultCurrency: 'EUR',
}

function activo(cambio: Partial<Asset>): Asset {
  return {
    id: 'x',
    symbol: 'XXX',
    name: 'Activo',
    assetType: 'stock',
    quoteCurrency: 'EUR',
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

function cotizacion(assetId: string): Quote {
  return {
    assetId,
    price: '100',
    currency: 'EUR',
    timestamp: '2026-08-12T10:00:00Z',
    provider: 'manual',
    quality: 'manual',
    fetchedAt: '2026-08-12T10:00:00Z',
  }
}

function montarPagina(assets: Asset[]) {
  useAppStore.setState({
    assets,
    accounts: [CUENTA],
    transactions: assets.map((a) => compra(a.id)),
    quotes: Object.fromEntries(assets.map((a) => [a.id, cotizacion(a.id)])),
    fxRates: [],
  })
  return render(
    <MemoryRouter>
      <LabExposurePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAppStore.setState({
    assets: [],
    accounts: [],
    transactions: [],
    quotes: {},
    fxRates: [],
    settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
  })
})

/* ── Lo que da sentido a la pantalla ──────────────────────────────────────── */

describe('la exposición real suma lo directo y lo que viene dentro', () => {
  /** Dos fondos que llevan Apple, más Apple directa. Mil euros cada posición. */
  const cartera = [
    activo({
      id: 'iwda',
      symbol: 'IWDA',
      name: 'MSCI World',
      assetType: 'etf',
      holdings: [{ symbol: 'AAPL', name: 'Apple', weight: '0.5' }],
    }),
    activo({
      id: 'sxr8',
      symbol: 'SXR8',
      name: 'SP 500',
      assetType: 'etf',
      holdings: [{ symbol: 'AAPL', weight: '0.5' }],
    }),
    activo({ id: 'aapl', symbol: 'AAPL', name: 'Apple' }),
  ]

  /** La tabla de exposición, no las de los editores que hay más abajo. */
  const filaDe = (simbolo: RegExp) =>
    within(screen.getByRole('table', { name: 'Exposición real por empresa' })).getByRole('row', {
      name: simbolo,
    })

  it('Apple sale en una sola fila y dice por qué fondos la tienes', () => {
    montarPagina(cartera)
    expect(filaDe(/AAPL/)).toHaveTextContent('IWDA, SXR8')
  })

  it('separa lo que tienes directo de lo que viene dentro de los fondos', () => {
    montarPagina(cartera)
    const celdas = within(filaDe(/AAPL/)).getAllByRole('cell')
    // Directo e indirecto son columnas distintas, y ninguna es una raya:
    // Apple está en los dos sitios.
    expect(celdas[1]).not.toHaveTextContent('—')
    expect(celdas[2]).not.toHaveTextContent('—')
  })

  it('los fondos dejan de aparecer como tales: lo que queda son empresas', () => {
    montarPagina(cartera)
    expect(screen.queryByRole('row', { name: /MSCI World/ })).toBeNull()
    expect(screen.getByText('Tu exposición real, empresa por empresa')).toBeInTheDocument()
  })

  it('enseña cuánto se repiten los dos fondos entre sí', () => {
    montarPagina(cartera)
    expect(screen.getByText('Cuánto se repiten tus fondos entre sí')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /IWDA y SXR8/ })).toBeInTheDocument()
  })

  it('avisa de que el solape calculado es un suelo, no una medida exacta', () => {
    montarPagina(cartera)
    expect(screen.getByText(/el solape real solo puede ser mayor/)).toBeInTheDocument()
  })
})

/* ── Lo que no se conoce se dice ──────────────────────────────────────────── */

describe('lo que no se conoce no se reparte', () => {
  it('un fondo sin composición se nombra y su valor se cuenta como no mirado', () => {
    montarPagina([
      activo({ id: 'iwda', symbol: 'IWDA', assetType: 'etf' }),
      activo({ id: 'aapl', symbol: 'AAPL' }),
    ])
    expect(screen.getByText(/Sin composición declarada: IWDA/)).toBeInTheDocument()
    expect(screen.getByText(/se cuenta como no mirado/)).toBeInTheDocument()
  })

  it('sin nada en cartera lo dice en vez de enseñar una tabla vacía', () => {
    montarPagina([])
    expect(screen.getByText('Todavía no hay nada que mirar por dentro')).toBeInTheDocument()
  })

  it('explica por qué los datos los tiene que poner el usuario', () => {
    montarPagina([activo({ id: 'iwda', symbol: 'IWDA', assetType: 'etf' })])
    expect(screen.getByText(/no permiten que otra aplicación/)).toBeInTheDocument()
  })
})

/* ── Identidad canónica (LAB-402) ─────────────────────────────────────────── */

describe('un símbolo que puede ser dos empresas no se reparte', () => {
  it('lo dice en pantalla en vez de asignarlo al candidato más probable', () => {
    montarPagina([
      activo({ id: 'san-bme', symbol: 'SAN', name: 'Santander', exchange: 'BME' }),
      activo({ id: 'san-tsx', symbol: 'SAN', name: 'Sandstorm Gold', exchange: 'TSX' }),
      activo({
        id: 'iwda',
        symbol: 'IWDA',
        assetType: 'etf',
        holdings: [{ symbol: 'SAN', weight: '1' }],
      }),
    ])

    expect(screen.getByText(/más de un instrumento con ese mismo símbolo/)).toBeInTheDocument()
    expect(screen.getByText(/elegir uno sería adivinar/)).toBeInTheDocument()
  })

  it('sin homónimos no aparece ninguna advertencia', () => {
    montarPagina([
      activo({ id: 'aapl', symbol: 'AAPL', name: 'Apple' }),
      activo({
        id: 'iwda',
        symbol: 'IWDA',
        assetType: 'etf',
        holdings: [{ symbol: 'AAPL', weight: '1' }],
      }),
    ])
    expect(screen.queryByText(/elegir uno sería adivinar/)).toBeNull()
  })
})

/* ── Editor de composición ────────────────────────────────────────────────── */

describe('editor de composición (LAB-404b)', () => {
  const fondo = activo({ id: 'iwda', symbol: 'IWDA', name: 'MSCI World', assetType: 'etf' })

  function montarEditor(a: Asset = fondo) {
    useAppStore.setState({ assets: [a] })
    return render(<HoldingsEditor asset={a} />)
  }

  it('se pregunta en porcentaje y se guarda en fracción', async () => {
    const user = userEvent.setup()
    montarEditor()

    await user.type(screen.getByLabelText('Símbolo'), 'aapl')
    await user.type(screen.getByLabelText('Peso en el fondo'), '5')
    await user.click(screen.getByRole('button', { name: 'Añadir posición' }))

    // El símbolo se normaliza a mayúsculas y el 5 % se guarda como 0,05.
    expect(useAppStore.getState().assets[0]?.holdings).toEqual([
      { symbol: 'AAPL', weight: '0.05' },
    ])
  })

  it('sin símbolo o sin peso no guarda nada, y lo dice', async () => {
    const user = userEvent.setup()
    montarEditor()

    await user.click(screen.getByRole('button', { name: 'Añadir posición' }))
    expect(screen.getByRole('alert')).toBeVisible()
    expect(useAppStore.getState().assets[0]?.holdings).toBeUndefined()
  })

  it('un peso fuera de rango tampoco entra', async () => {
    const user = userEvent.setup()
    montarEditor()

    await user.type(screen.getByLabelText('Símbolo'), 'AAPL')
    await user.type(screen.getByLabelText('Peso en el fondo'), '150')
    await user.click(screen.getByRole('button', { name: 'Añadir posición' }))

    expect(screen.getByText(/como mucho 100/)).toBeVisible()
    expect(useAppStore.getState().assets[0]?.holdings).toBeUndefined()
  })

  it('no deja duplicar una posición en silencio', async () => {
    const user = userEvent.setup()
    montarEditor({ ...fondo, holdings: [{ symbol: 'AAPL', weight: '0.05' }] })

    await user.type(screen.getByLabelText('Símbolo'), 'aapl')
    await user.type(screen.getByLabelText('Peso en el fondo'), '7')
    await user.click(screen.getByRole('button', { name: 'Añadir posición' }))

    expect(screen.getByText(/ya está en la lista/)).toBeVisible()
    expect(useAppStore.getState().assets[0]?.holdings).toHaveLength(1)
  })

  it('dice qué parte del fondo llevas declarada y qué pasa con el resto', () => {
    montarEditor({
      ...fondo,
      holdings: [
        { symbol: 'AAPL', weight: '0.05' },
        { symbol: 'MSFT', weight: '0.04' },
      ],
    })
    expect(screen.getByText(/9,0 %/)).toBeInTheDocument()
    expect(screen.getByText(/no se reparte a ojo/)).toBeInTheDocument()
  })

  it('permite quitar una posición', async () => {
    const user = userEvent.setup()
    montarEditor({ ...fondo, holdings: [{ symbol: 'AAPL', weight: '0.05' }] })

    await user.click(screen.getByRole('button', { name: 'Quitar AAPL' }))
    expect(useAppStore.getState().assets[0]?.holdings).toEqual([])
  })
})
