import { describe, expect, it } from 'vitest'
import { buildImportProposal } from './convert'
import { validateImportJson } from './schema'

function proposalFrom(json: string) {
  const v = validateImportJson(json)
  if (!v.ok || v.payload === null) throw new Error('JSON de prueba inválido: ' + v.errors.join(', '))
  return buildImportProposal(v.payload, [], [])
}

describe('buildImportProposal — aviso de incoherencias', () => {
  it('avisa de una venta sin compra previa en las notas', () => {
    const json = JSON.stringify({
      schema_version: 1,
      transactions: [
        {
          account_broker: 'Test',
          asset: { symbol: 'ZZZ', name: 'Prueba', type: 'stock', quote_currency: 'EUR', isin: null },
          type: 'sell',
          datetime: '2026-03-01',
          invested_amount: '100',
          invested_currency: 'EUR',
          quantity: '2',
          execution_price: '50',
          evidence: 'venta sin compra',
          confidence: 'high',
        },
      ],
    })
    const proposal = proposalFrom(json)
    expect(proposal.notes.some((n) => n.includes('ZZZ') && n.includes('venta sin su compra'))).toBe(true)
  })

  it('una compra seguida de venta válida NO genera aviso de incoherencia', () => {
    const json = JSON.stringify({
      schema_version: 1,
      transactions: [
        {
          account_broker: 'Test',
          asset: { symbol: 'AAA', name: 'A', type: 'stock', quote_currency: 'EUR', isin: null },
          type: 'buy',
          datetime: '2026-01-01',
          invested_amount: '100',
          invested_currency: 'EUR',
          quantity: '5',
          execution_price: '20',
          evidence: null,
          confidence: 'high',
        },
        {
          account_broker: 'Test',
          asset: { symbol: 'AAA', name: 'A', type: 'stock', quote_currency: 'EUR', isin: null },
          type: 'sell',
          datetime: '2026-02-01',
          invested_amount: '60',
          invested_currency: 'EUR',
          quantity: '2',
          execution_price: '30',
          evidence: null,
          confidence: 'high',
        },
      ],
    })
    const proposal = proposalFrom(json)
    expect(proposal.notes.some((n) => n.includes('incoherente') || n.includes('venta sin'))).toBe(false)
    expect(proposal.transactions).toHaveLength(2)
  })
})
