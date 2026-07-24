/**
 * Importación JSON asistida por un LLM externo.
 *
 * Reglas de seguridad:
 * - Validación estricta con Zod y límites de tamaño/complejidad.
 * - Los campos desconocidos se reportan, no se aceptan en silencio.
 * - El JSON JAMÁS puede aportar user_id, permisos, SQL ni nada ejecutable.
 * - Nada se persiste hasta la confirmación explícita del usuario.
 */
import { z } from 'zod'

export const IMPORT_SCHEMA_VERSION = 1
export const MAX_IMPORT_BYTES = 200_000
export const MAX_IMPORT_TRANSACTIONS = 500

/** Claves que nunca se aceptan, aparezcan donde aparezcan. */
const FORBIDDEN_KEYS = ['user_id', 'userid', 'sql', 'query', 'script', 'eval', 'permissions', 'role']

const currencySchema = z.enum(['EUR', 'USD'])
const confidenceSchema = z.enum(['high', 'medium', 'low'])

/** Número como número o string («123,45» no: el LLM debe usar punto decimal). */
const numericSchema = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/, 'Número inválido')])
  .transform((v) => String(v))

const importAssetSchema = z.object({
  symbol: z.string().trim().min(1).max(20).nullable(),
  name: z.string().trim().max(120).nullable(),
  type: z.enum(['stock', 'etf', 'crypto', 'commodity', 'index', 'cash', 'other']).nullable(),
  quote_currency: currencySchema.nullable(),
  isin: z.string().trim().max(12).nullable(),
})

const importAccountSchema = z.object({
  broker: z.string().trim().min(1).max(60),
  label: z.string().trim().max(60).nullable(),
  currency: currencySchema.nullable(),
})

const importTransactionSchema = z.object({
  account_broker: z.string().trim().max(60).nullable(),
  asset: importAssetSchema,
  type: z.enum(['buy', 'sell']),
  datetime: z.string().trim().max(40).nullable(),
  invested_amount: numericSchema.nullable(),
  invested_currency: currencySchema.nullable(),
  quantity: numericSchema.nullable(),
  execution_price: numericSchema.nullable(),
  evidence: z.string().trim().max(300).nullable(),
  confidence: confidenceSchema,
})

const importPositionSchema = z.object({
  account_broker: z.string().trim().max(60).nullable(),
  asset: importAssetSchema,
  quantity: numericSchema.nullable(),
  current_value: numericSchema.nullable(),
  currency: currencySchema.nullable(),
  evidence: z.string().trim().max(300).nullable(),
  confidence: confidenceSchema,
})

export const importPayloadSchema = z.object({
  schema_version: z.literal(IMPORT_SCHEMA_VERSION),
  accounts: z.array(importAccountSchema).max(50).default([]),
  positions: z.array(importPositionSchema).max(200).default([]),
  transactions: z.array(importTransactionSchema).max(MAX_IMPORT_TRANSACTIONS).default([]),
})

export type ImportPayload = z.infer<typeof importPayloadSchema>
export type ImportTransaction = z.infer<typeof importTransactionSchema>
export type ImportPosition = z.infer<typeof importPositionSchema>

export interface ImportValidation {
  ok: boolean
  payload: ImportPayload | null
  errors: string[]
  /** Avisos no bloqueantes: campos desconocidos, datos inferidos, etc. */
  warnings: string[]
}

/** Recoge claves desconocidas o prohibidas en cualquier nivel del JSON. */
function scanKeys(value: unknown, path: string, warnings: string[], errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanKeys(v, `${path}[${i}]`, warnings, errors))
    return
  }
  if (value === null || typeof value !== 'object') return
  const KNOWN = new Set([
    'schema_version',
    'accounts',
    'positions',
    'transactions',
    'broker',
    'label',
    'currency',
    'account_broker',
    'asset',
    'symbol',
    'name',
    'type',
    'quote_currency',
    'isin',
    'datetime',
    'invested_amount',
    'invested_currency',
    'quantity',
    'execution_price',
    'evidence',
    'confidence',
    'current_value',
  ])
  for (const [key, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
      errors.push(`Clave no permitida: «${path}.${key}». El JSON no puede definirla.`)
      continue
    }
    if (!KNOWN.has(key)) {
      warnings.push(`Campo desconocido ignorado: «${path}.${key}»`)
    }
    scanKeys(v, `${path}.${key}`, warnings, errors)
  }
}

export function validateImportJson(raw: string): ImportValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (new Blob([raw]).size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      payload: null,
      errors: [`El JSON supera el límite de ${Math.round(MAX_IMPORT_BYTES / 1000)} kB.`],
      warnings,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return {
      ok: false,
      payload: null,
      errors: [`No es JSON válido: ${e instanceof Error ? e.message : String(e)}`],
      warnings,
    }
  }

  scanKeys(parsed, '$', warnings, errors)
  if (errors.length > 0) return { ok: false, payload: null, errors, warnings }

  const result = importPayloadSchema.safeParse(parsed)
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.') || '$'}: ${issue.message}`)
    }
    return { ok: false, payload: null, errors, warnings }
  }

  const payload = result.data
  if (
    payload.transactions.length === 0 &&
    payload.positions.length === 0 &&
    payload.accounts.length === 0
  ) {
    errors.push('El JSON no contiene cuentas, posiciones ni operaciones.')
    return { ok: false, payload: null, errors, warnings }
  }

  // Avisos de datos incompletos que la preview destacará.
  payload.transactions.forEach((t, i) => {
    if (t.asset.symbol === null && t.asset.name === null) {
      warnings.push(`transactions[${i}]: activo sin símbolo ni nombre.`)
    }
    if (t.invested_amount === null && (t.quantity === null || t.execution_price === null)) {
      warnings.push(
        `transactions[${i}]: faltan datos para derivar el importe (necesito importe, o cantidad y precio).`,
      )
    }
    if (t.datetime === null) warnings.push(`transactions[${i}]: sin fecha; se pedirá al confirmar.`)
    if (t.asset.type === 'index') {
      warnings.push(
        `transactions[${i}]: el activo es un índice; recuerda que un índice no siempre es invertible — selecciona el ETF o fondo concreto si procede.`,
      )
    }
  })
  payload.positions.forEach((p, i) => {
    if (p.current_value === null && p.quantity === null) {
      warnings.push(`positions[${i}]: sin valor ni cantidad; no se puede importar.`)
    }
  })

  return { ok: true, payload, errors, warnings }
}

/** Prompt listo para copiar en un LLM externo. */
export const EXTRACTION_PROMPT = `Eres un extractor de datos de inversiones. Te adjunto capturas de pantalla de mis aplicaciones de inversión (con mis datos personales ocultos).

INSTRUCCIONES ESTRICTAS:
1. Extrae SOLAMENTE la información visible en las imágenes. No inventes NADA: ni tickers, ni fechas, ni precios, ni divisas, ni cantidades, ni brókeres.
2. Usa null para cualquier dato que no puedas leer con claridad.
3. Separa cuentas, posiciones actuales y operaciones (compras/ventas).
4. Para cada dato incluye una evidencia textual breve (el texto visible del que lo sacaste) y un nivel de confianza: "high", "medium" o "low".
5. Números SIEMPRE con punto decimal y sin separador de miles (ej. 1234.56).
6. Fechas en formato ISO 8601 (YYYY-MM-DD o YYYY-MM-DDTHH:mm) solo si son visibles.
7. Divisas: solo "EUR" o "USD"; si es otra o no se ve, usa null.
8. Devuelve EXCLUSIVAMENTE un JSON válido conforme a este esquema, sin texto adicional, sin markdown:

{
  "schema_version": 1,
  "accounts": [
    { "broker": "string", "label": "string|null", "currency": "EUR|USD|null" }
  ],
  "positions": [
    {
      "account_broker": "string|null",
      "asset": { "symbol": "string|null", "name": "string|null", "type": "stock|etf|crypto|commodity|index|cash|other|null", "quote_currency": "EUR|USD|null", "isin": "string|null" },
      "quantity": "number|null",
      "current_value": "number|null",
      "currency": "EUR|USD|null",
      "evidence": "string|null",
      "confidence": "high|medium|low"
    }
  ],
  "transactions": [
    {
      "account_broker": "string|null",
      "asset": { "symbol": "string|null", "name": "string|null", "type": "stock|etf|crypto|commodity|index|cash|other|null", "quote_currency": "EUR|USD|null", "isin": "string|null" },
      "type": "buy|sell",
      "datetime": "string|null",
      "invested_amount": "number|null",
      "invested_currency": "EUR|USD|null",
      "quantity": "number|null",
      "execution_price": "number|null",
      "evidence": "string|null",
      "confidence": "high|medium|low"
    }
  ]
}`

/** Ejemplo válido (para la UI y las pruebas del importador). */
export const EXAMPLE_VALID_JSON = `{
  "schema_version": 1,
  "accounts": [
    { "broker": "Revolut", "label": "Cuenta personal", "currency": "EUR" }
  ],
  "positions": [
    {
      "account_broker": "Revolut",
      "asset": { "symbol": "XAU", "name": "Oro", "type": "commodity", "quote_currency": "EUR", "isin": null },
      "quantity": null,
      "current_value": "102.35",
      "currency": "EUR",
      "evidence": "Oro · 102,35 €",
      "confidence": "high"
    }
  ],
  "transactions": [
    {
      "account_broker": "Revolut",
      "asset": { "symbol": "BTC", "name": "Bitcoin", "type": "crypto", "quote_currency": "EUR", "isin": null },
      "type": "buy",
      "datetime": "2026-01-15",
      "invested_amount": "100",
      "invested_currency": "EUR",
      "quantity": "0.00142857",
      "execution_price": "70000",
      "evidence": "Compra BTC 100,00 € · 15 ene 2026",
      "confidence": "high"
    }
  ]
}`

/** Ejemplo inválido (claves prohibidas y tipos erróneos) para probar el importador. */
export const EXAMPLE_INVALID_JSON = `{
  "schema_version": 1,
  "user_id": "otro-usuario",
  "transactions": [
    {
      "asset": { "symbol": "BTC" },
      "type": "transfer",
      "invested_amount": "cien euros",
      "confidence": "alta"
    }
  ]
}`
