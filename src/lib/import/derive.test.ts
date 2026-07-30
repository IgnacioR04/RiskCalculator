/**
 * Derivaciones del importador sobre datos reales.
 *
 * Los números vienen de capturas de Trade Republic y Revolut: valor,
 * rentabilidad y precio unitario estaban impresos en pantalla, pero el
 * formato anterior no tenía dónde ponerlos y la cartera entraba sin coste,
 * dejando la rentabilidad sin calcular.
 */
import { describe, expect, it } from 'vitest'
import { buildImportProposal } from './convert'
import { validateImportJson } from './schema'

interface PosInput {
  broker: string
  name: string
  symbol?: string | null
  type?: string | null
  quantity?: number | null
  value: number
  unitPrice?: number | null
  returnPct?: number | null
  gain?: number | null
}

function payload(positions: PosInput[], brokers: string[]): string {
  return JSON.stringify({
    schema_version: 1,
    accounts: brokers.map((b) => ({ broker: b, label: null, currency: 'EUR', subtotal: null })),
    positions: positions.map((p) => ({
      account_broker: p.broker,
      asset: {
        symbol: p.symbol ?? null,
        name: p.name,
        type: p.type ?? 'stock',
        quote_currency: null,
        isin: null,
        exchange: null,
        sector: null,
        country: null,
        holdings: [],
      },
      quantity: p.quantity ?? null,
      current_value: p.value,
      current_unit_price: p.unitPrice ?? null,
      unit_price_currency: null,
      return_pct: p.returnPct ?? null,
      absolute_gain: p.gain ?? null,
      gain_currency: null,
      total_invested: null,
      average_buy_price: null,
      acquisition_date: null,
      currency: 'EUR',
      evidence: 'captura',
      confidence: 'high',
    })),
    transactions: [],
  })
}

function proposalFor(positions: PosInput[], brokers: string[]) {
  const v = validateImportJson(payload(positions, brokers))
  expect(v.errors).toEqual([])
  expect(v.ok).toBe(true)
  return buildImportProposal(v.payload!, [], [], [])
}

describe('el formato nuevo valida sin avisos de campo desconocido', () => {
  it('acepta subtotal, precio unitario, rentabilidad y ganancia', () => {
    const v = validateImportJson(
      payload([{ broker: 'Revolut', name: 'Oro', symbol: 'XAU', quantity: 0.0164, value: 57.86, unitPrice: 3564.54, returnPct: -16.14 }], ['Revolut']),
    )
    expect(v.ok).toBe(true)
    expect(v.warnings.filter((w) => w.includes('desconocido'))).toEqual([])
  })

  it('sigue aceptando el formato anterior, sin los campos nuevos', () => {
    const antiguo = JSON.stringify({
      schema_version: 1,
      accounts: [{ broker: 'Revolut', label: null, currency: 'EUR' }],
      positions: [
        {
          account_broker: 'Revolut',
          asset: { symbol: 'XAU', name: 'Oro', type: 'commodity', quote_currency: 'EUR', isin: null, exchange: null, sector: null, country: null, holdings: [] },
          quantity: 0.0164,
          current_value: 57.86,
          total_invested: null,
          average_buy_price: null,
          acquisition_date: null,
          currency: 'EUR',
          evidence: 'captura',
          confidence: 'medium',
        },
      ],
      transactions: [],
    })
    const v = validateImportJson(antiguo)
    expect(v.ok).toBe(true)
    expect(v.errors).toEqual([])
  })
})

describe('coste derivado de lo que estaba impreso', () => {
  it('valor ÷ (1 + rentabilidad): las tres posiciones de 51,00 € de Trade Republic', () => {
    const p = proposalFor(
      [
        { broker: 'Trade Republic', name: 'Adobe', quantity: 1, value: 55.67, returnPct: 9.16 },
        { broker: 'Trade Republic', name: 'Microsoft', quantity: 1, value: 55.63, returnPct: 9.08 },
        { broker: 'Trade Republic', name: 'Nasdaq Clean Edge Smart Gr...', quantity: 1, value: 45.06, returnPct: -11.64 },
      ],
      ['Trade Republic'],
    )

    expect(p.transactions).toHaveLength(3)
    for (const t of p.transactions) {
      expect(t.costKnown).toBe(true)
      expect(Number(t.investedAmount)).toBeCloseTo(51.0, 1)
    }
  })

  it('valor − ganancia absoluta: el Bitcoin de 280,02 € con ▲ 1,16 €', () => {
    const p = proposalFor(
      [{ broker: 'Trade Republic', name: 'Bitcoin', type: 'crypto', quantity: 1, value: 280.02, gain: 1.16 }],
      ['Trade Republic'],
    )
    expect(p.transactions).toHaveLength(1)
    expect(p.transactions[0]!.costKnown).toBe(true)
    expect(Number(p.transactions[0]!.investedAmount)).toBeCloseTo(278.86, 2)
  })

  it('unidades derivadas de valor ÷ precio unitario cuando no hay cantidad', () => {
    // Oro: 57,86 € a 3564,54 €/XAU -> 0,016232… unidades
    const p = proposalFor(
      [{ broker: 'Revolut', name: 'Oro', symbol: 'XAU', type: 'commodity', value: 57.86, unitPrice: 3564.54, returnPct: -16.14 }],
      ['Revolut'],
    )
    expect(p.transactions).toHaveLength(1)
    expect(Number(p.transactions[0]!.quantity)).toBeCloseTo(0.01623, 4)
    expect(Number(p.transactions[0]!.investedAmount)).toBeCloseTo(69.0, 1)
  })

  it('sin rentabilidad ni ganancia el coste NO se inventa', () => {
    const p = proposalFor(
      [{ broker: 'Revolut', name: 'Plata', symbol: 'XAG', type: 'commodity', quantity: 0.6038, value: 30.3 }],
      ['Revolut'],
    )
    expect(p.transactions).toHaveLength(1)
    // Se usa el valor actual como importe, pero marcado como coste desconocido.
    expect(p.transactions[0]!.costKnown).toBe(false)
  })
})

describe('no se inventan identificadores', () => {
  it('sin ticker visible se guarda el nombre, no un ticker recortado', () => {
    const p = proposalFor(
      [{ broker: 'Trade Republic', name: 'Nasdaq Clean Edge Smart Gr...', quantity: 1, value: 45.06 }],
      ['Trade Republic'],
    )
    const asset = p.newAssets[0]!
    expect(asset.symbol).toBe('Nasdaq Clean Edge Smart Gr...')
    expect(asset.symbol).not.toBe('NASDAQ CLEAN')
    expect(p.notes.some((n) => n.includes('no muestra su ticker'))).toBe(true)
  })
})

describe('el mismo activo no se duplica', () => {
  it('«Bitcoin» sin ticker y «BTC» con ticker son el mismo activo', () => {
    const p = proposalFor(
      [
        { broker: 'Trade Republic', name: 'Bitcoin', type: 'crypto', quantity: 1, value: 280.02 },
        { broker: 'Revolut', name: 'Bitcoin', symbol: 'BTC', type: 'crypto', quantity: 0.00061, value: 34.4 },
      ],
      ['Trade Republic', 'Revolut'],
    )
    expect(p.newAssets).toHaveLength(1)
  })

  it('la divisa de cotización no parte el activo en dos', () => {
    const existente = {
      id: 'btc-usd',
      symbol: 'BTC',
      name: 'Bitcoin',
      assetType: 'crypto' as const,
      quoteCurrency: 'USD' as const,
    }
    const v = validateImportJson(
      payload([{ broker: 'Revolut', name: 'Bitcoin', symbol: 'BTC', type: 'crypto', quantity: 0.00061, value: 34.4 }], ['Revolut']),
    )
    const p = buildImportProposal(v.payload!, [], [existente], [])
    // Cotiza en USD y la captura dice EUR: sigue siendo el mismo Bitcoin.
    expect(p.newAssets).toHaveLength(0)
  })
})

describe('el mismo instrumento en dos brókeres', () => {
  /**
   * Caso real: Trade Republic muestra «Bitcoin · 280,02 € · ▲ 1,16 €» sin
   * ticker ni unidades, y Revolut «BTC · 0,00061 BTC · 56.182 €». Además la
   * operación de compra solo trae el ticker, sin nombre.
   *
   * Tienen que acabar en UN activo, y las unidades de Trade Republic salen del
   * precio que Revolut sí imprime. Registrarla como «1 unidad» la sumaría a
   * los 0,00061 BTC reales y daría 1,00061 BTC.
   */
  const raw = JSON.stringify({
    schema_version: 1,
    accounts: [
      { broker: 'Trade Republic', label: 'Valores', currency: 'EUR', subtotal: null },
      { broker: 'Revolut', label: 'Cripto', currency: 'EUR', subtotal: null },
    ],
    positions: [
      {
        account_broker: 'Trade Republic',
        asset: { symbol: null, name: 'Bitcoin', type: 'crypto', quote_currency: null, isin: null, exchange: null, sector: null, country: null, holdings: [] },
        quantity: null, current_value: 280.02, current_unit_price: null, unit_price_currency: null,
        return_pct: null, absolute_gain: 1.16, gain_currency: 'EUR',
        total_invested: null, average_buy_price: null, acquisition_date: null,
        currency: 'EUR', evidence: 'Bitcoin 280,02', confidence: 'high',
      },
      {
        account_broker: 'Revolut',
        asset: { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', quote_currency: 'EUR', isin: null, exchange: null, sector: null, country: null, holdings: [] },
        quantity: 0.00061, current_value: 34.4, current_unit_price: 56182, unit_price_currency: 'EUR',
        return_pct: -9.72, absolute_gain: null, gain_currency: null,
        total_invested: null, average_buy_price: null, acquisition_date: null,
        currency: 'EUR', evidence: 'BTC 0,00061', confidence: 'high',
      },
    ],
    transactions: [
      {
        account_broker: 'Revolut',
        asset: { symbol: 'BTC', name: null, type: 'crypto', quote_currency: null, isin: null, exchange: null, sector: null, country: null, holdings: [] },
        type: 'buy', datetime: null, invested_amount: 44.6, invested_currency: null,
        quantity: 0.00061, execution_price: null, fee: null, fee_currency: null,
        evidence: 'USDT -> BTC', confidence: 'medium',
      },
    ],
  })

  it('es un solo activo, no dos ni descartado por ambiguo', () => {
    const v = validateImportJson(raw)
    expect(v.ok).toBe(true)
    const p = buildImportProposal(v.payload!, [], [], [])
    expect(p.newAssets).toHaveLength(1)
    expect(p.newAssets[0]!.symbol).toBe('BTC')
    expect(p.notes.some((n) => n.includes('coincide con varios instrumentos'))).toBe(false)
    expect(p.incompletePositions).toEqual([])
  })

  it('las unidades sin ticker se derivan del precio que muestra el otro bróker', () => {
    const p = buildImportProposal(validateImportJson(raw).payload!, [], [], [])
    const total = p.transactions.reduce((a, t) => a + Number(t.quantity), 0)
    // 0,00061 de Revolut + 280,02/56182 de Trade Republic = 0,005594 BTC
    expect(total).toBeCloseTo(0.005594, 5)
    // Nunca la unidad indivisible en un activo que ya tiene unidades reales.
    expect(p.transactions.some((t) => t.quantity === '1')).toBe(false)
  })
})
