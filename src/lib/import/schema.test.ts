import { describe, expect, it } from 'vitest'
import {
  EXAMPLE_INVALID_JSON,
  EXAMPLE_VALID_JSON,
  MAX_IMPORT_BYTES,
  validateImportJson,
} from './schema'

describe('validateImportJson', () => {
  it('acepta el ejemplo válido', () => {
    const r = validateImportJson(EXAMPLE_VALID_JSON)
    expect(r.ok).toBe(true)
    expect(r.payload!.transactions).toHaveLength(1)
    expect(r.payload!.positions).toHaveLength(1)
    expect(r.payload!.accounts).toHaveLength(1)
    expect(r.errors).toHaveLength(0)
  })

  it('rechaza el ejemplo inválido con errores descriptivos (criterio 7)', () => {
    const r = validateImportJson(EXAMPLE_INVALID_JSON)
    expect(r.ok).toBe(false)
    expect(r.payload).toBeNull()
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('rechaza user_id y claves peligrosas aunque el resto sea válido', () => {
    const withUserId = JSON.parse(EXAMPLE_VALID_JSON) as Record<string, unknown>
    withUserId['user_id'] = 'x'
    const r = validateImportJson(JSON.stringify(withUserId))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('user_id'))).toBe(true)
  })

  it('reporta campos desconocidos como aviso, no los acepta en silencio', () => {
    const extra = JSON.parse(EXAMPLE_VALID_JSON) as Record<string, unknown>
    extra['campo_sorpresa'] = 42
    const r = validateImportJson(JSON.stringify(extra))
    expect(r.warnings.some((w) => w.includes('campo_sorpresa'))).toBe(true)
  })

  it('rechaza JSON sintácticamente inválido', () => {
    const r = validateImportJson('{ esto no es json')
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('No es JSON válido')
  })

  it('rechaza JSON por encima del límite de tamaño', () => {
    const big = `{"schema_version":1,"transactions":[],"positions":[],"accounts":[],"x":"${'a'.repeat(MAX_IMPORT_BYTES)}"}`
    const r = validateImportJson(big)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('límite')
  })

  it('rechaza un JSON vacío de contenido', () => {
    const r = validateImportJson('{"schema_version":1}')
    expect(r.ok).toBe(false)
  })

  it('avisa de operaciones con datos insuficientes', () => {
    const payload = {
      schema_version: 1,
      transactions: [
        {
          account_broker: null,
          asset: { symbol: 'BTC', name: null, type: 'crypto', quote_currency: null, isin: null },
          type: 'buy',
          datetime: null,
          invested_amount: null,
          invested_currency: null,
          quantity: null,
          execution_price: null,
          evidence: null,
          confidence: 'low',
        },
      ],
    }
    const r = validateImportJson(JSON.stringify(payload))
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => w.includes('derivar el importe'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('sin fecha'))).toBe(true)
  })

  it('rechaza una versión de esquema distinta', () => {
    const r = validateImportJson('{"schema_version":2,"transactions":[]}')
    expect(r.ok).toBe(false)
  })
})
