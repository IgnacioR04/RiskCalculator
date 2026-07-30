import { describe, expect, it } from 'vitest'
import { buildImportProposal } from './convert'
import { validateImportJson } from './schema'

/** Tu cartera real transcrita con el formato nuevo (lo que se ve en pantalla). */
const RAW = JSON.stringify({
  schema_version: 1,
  accounts: [
    { broker: 'Trade Republic', label: 'Cuenta de valores', currency: 'EUR', subtotal: 237.97 },
    { broker: 'Trade Republic', label: 'Cripto', currency: 'EUR', subtotal: 280.02 },
    { broker: 'Revolut', label: 'Cripto', currency: 'EUR', subtotal: 34.4 },
    { broker: 'Revolut', label: 'Cuenta de corretaje', currency: 'EUR', subtotal: 86.43 },
    { broker: 'Revolut', label: 'Materias primas', currency: 'EUR', subtotal: 88.16 },
  ],
  positions: [
    p('Trade Republic', null, 'Bitcoin', 'crypto', null, 280.02, null, null, 1.16),
    p('Trade Republic', null, 'Adobe', 'stock', null, 55.67, null, 9.16, null),
    p('Trade Republic', null, 'Microsoft', 'stock', null, 55.63, null, 9.08, null),
    p('Trade Republic', null, 'Nasdaq Clean Edge Smart Gr...', null, null, 45.06, null, -11.64, null),
    p('Trade Republic', null, 'Vanguard Eurozone Stock Ind...', 'other', null, 81.6, null, 0.89, null),
    p('Revolut', 'BTC', 'Bitcoin', 'crypto', 0.00061, 34.4, 56182, -9.72, null),
    p('Revolut', 'IAG', 'Iamgold Corp', 'stock', 2.9, 35.92, 14.29, -23.5, null),
    p('Revolut', 'BOY', 'Banco Bilbao Vizcaya Argentaria (BBVA)', 'stock', 1.33, 31.88, 23.92, 27.13, null),
    p('Revolut', 'GOOGL', 'Alphabet (Class A)', 'stock', 0.06, 17.98, 334.69, 9.38, null),
    p('Revolut', 'XAU', 'Oro', 'commodity', 0.0164, 57.86, 3564.54, -16.14, null),
    p('Revolut', 'XAG', 'Plata', 'commodity', 0.6038, 30.3, 50.93, -31.13, null),
  ],
  transactions: [],
})

function p(
  broker: string, symbol: string | null, name: string, type: string | null,
  quantity: number | null, value: number, unitPrice: number | null,
  returnPct: number | null, gain: number | null,
) {
  return {
    account_broker: broker,
    asset: { symbol, name, type, quote_currency: null, isin: null, exchange: null, sector: null, country: null, holdings: [] },
    quantity, current_value: value, current_unit_price: unitPrice, unit_price_currency: null,
    return_pct: returnPct, absolute_gain: gain, gain_currency: null,
    total_invested: null, average_buy_price: null, acquisition_date: null,
    currency: 'EUR', evidence: 'captura', confidence: 'high',
  }
}

describe('cartera real de dos brókeres', () => {
  /**
   * Regresión con capturas reales de Trade Republic y Revolut. Antes de
   * transcribir precio unitario y rentabilidad, esta misma cartera entraba
   * sin coste y la app mostraba «Resultado no disponible».
   */
  it('importa las 11 posiciones con su coste real', () => {
    const v = validateImportJson(RAW)
    expect(v.errors).toEqual([])
    expect(v.warnings.filter((w) => w.includes('desconocido'))).toEqual([])
    expect(v.ok).toBe(true)

    const prop = buildImportProposal(v.payload!, [], [], [])

    // Ninguna posición se queda fuera y todas traen coste verdadero.
    expect(prop.incompletePositions).toEqual([])
    expect(prop.transactions).toHaveLength(11)
    expect(prop.transactions.every((t) => t.costKnown)).toBe(true)

    const valor = JSON.parse(RAW).positions.reduce(
      (a: number, x: { current_value: number }) => a + x.current_value,
      0,
    )
    const coste = prop.transactions.reduce((a, t) => a + Number(t.investedAmount), 0)

    expect(valor).toBeCloseTo(726.32, 2)
    expect(coste).toBeCloseTo(752.3, 1)
    expect(valor - coste).toBeCloseTo(-25.98, 1)
  })

  it('el mismo Bitcoin de los dos brókeres es un solo activo', () => {
    const prop = buildImportProposal(validateImportJson(RAW).payload!, [], [], [])
    // 11 posiciones, 10 activos: «Bitcoin» de Trade Republic y «BTC» de
    // Revolut se reconocen como el mismo instrumento.
    expect(prop.newAssets).toHaveLength(10)
    expect(prop.newAssets.filter((a) => a.name === 'Bitcoin')).toHaveLength(1)
  })

  it('no aparece ningún ticker inventado', () => {
    const prop = buildImportProposal(validateImportJson(RAW).payload!, [], [], [])
    const symbols = prop.newAssets.map((a) => a.symbol)
    expect(symbols).not.toContain('NASDAQ CLEAN')
    expect(symbols).not.toContain('VANGUARD EUR')
    expect(symbols).toContain('Nasdaq Clean Edge Smart Gr...')
  })
})
