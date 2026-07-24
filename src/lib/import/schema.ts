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
  exchange: z.string().trim().max(40).nullable().default(null),
  sector: z.string().trim().max(80).nullable().default(null),
  country: z.string().trim().max(80).nullable().default(null),
  holdings: z
    .array(
      z.object({
        symbol: z.string().trim().min(1).max(20),
        name: z.string().trim().max(120).nullable().default(null),
        weight: numericSchema.nullable().default(null),
      }),
    )
    .max(100)
    .default([]),
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
  fee: numericSchema.nullable().default(null),
  fee_currency: currencySchema.nullable().default(null),
  evidence: z.string().trim().max(300).nullable(),
  confidence: confidenceSchema,
})

const importPositionSchema = z.object({
  account_broker: z.string().trim().max(60).nullable(),
  asset: importAssetSchema,
  quantity: numericSchema.nullable(),
  current_value: numericSchema.nullable(),
  total_invested: numericSchema.nullable().default(null),
  average_buy_price: numericSchema.nullable().default(null),
  acquisition_date: z.string().trim().max(40).nullable().default(null),
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
    'exchange',
    'sector',
    'country',
    'holdings',
    'weight',
    'datetime',
    'invested_amount',
    'invested_currency',
    'quantity',
    'execution_price',
    'fee',
    'fee_currency',
    'evidence',
    'confidence',
    'current_value',
    'total_invested',
    'average_buy_price',
    'acquisition_date',
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

/**
 * Limpia lo que suele acompañar al JSON de un asistente de IA:
 * - vallas de código markdown ```json … ``` (o ``` … ```),
 * - texto anterior/posterior: se queda con el primer bloque {...} equilibrado,
 * - espacios sobrantes.
 * Nunca lanza: si no encuentra un bloque, devuelve el texto original recortado.
 */
export function stripToJson(raw: string): string {
  let s = raw.trim()

  // Quita una valla de código que envuelva todo el contenido.
  const fenced = s.match(/^```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fenced?.[1] !== undefined) s = fenced[1].trim()

  // Si aún hay ruido alrededor, recorta al primer objeto {...} equilibrado.
  if (!s.startsWith('{')) {
    const start = s.indexOf('{')
    if (start >= 0) {
      let depth = 0
      let inString = false
      let escaped = false
      for (let i = start; i < s.length; i++) {
        const ch = s[i]!
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
        } else if (ch === '"') inString = true
        else if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            s = s.slice(start, i + 1)
            break
          }
        }
      }
    }
  }
  return s.trim()
}

export function validateImportJson(rawInput: string): ImportValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (new Blob([rawInput]).size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      payload: null,
      errors: [`El JSON supera el límite de ${Math.round(MAX_IMPORT_BYTES / 1000)} kB.`],
      warnings,
    }
  }

  const raw = stripToJson(rawInput)
  if (raw !== rawInput.trim()) {
    warnings.push(
      'Se ignoró el texto que rodeaba al JSON (vallas ``` o comentarios del asistente).',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return {
      ok: false,
      payload: null,
      errors: [
        `No es JSON válido: ${e instanceof Error ? e.message : String(e)}. Pega solo el JSON que te dio el asistente (puedes incluir las vallas \`\`\`; se quitan solas).`,
      ],
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
    if (p.quantity !== null && p.total_invested === null && p.average_buy_price === null) {
      warnings.push(
        `positions[${i}]: se conocen las unidades pero no el coste histórico; la rentabilidad quedará sin calcular hasta completarlo.`,
      )
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
8. En holdings, weight es la fracción entre 0 y 1 (6,5 % = 0.065), nunca el porcentaje 6.5.
9. Devuelve EXCLUSIVAMENTE un JSON válido conforme a este esquema, sin texto adicional, sin markdown:

{
  "schema_version": 1,
  "accounts": [
    { "broker": "string", "label": "string|null", "currency": "EUR|USD|null" }
  ],
  "positions": [
    {
      "account_broker": "string|null",
      "asset": { "symbol": "string|null", "name": "string|null", "type": "stock|etf|crypto|commodity|index|cash|other|null", "quote_currency": "EUR|USD|null", "isin": "string|null", "exchange": "string|null", "sector": "string|null", "country": "string|null", "holdings": [{"symbol":"string","name":"string|null","weight":"number|null"}] },
      "quantity": "number|null",
      "current_value": "number|null",
      "total_invested": "number|null",
      "average_buy_price": "number|null",
      "acquisition_date": "ISO 8601|null",
      "currency": "EUR|USD|null",
      "evidence": "string|null",
      "confidence": "high|medium|low"
    }
  ],
  "transactions": [
    {
      "account_broker": "string|null",
      "asset": { "symbol": "string|null", "name": "string|null", "type": "stock|etf|crypto|commodity|index|cash|other|null", "quote_currency": "EUR|USD|null", "isin": "string|null", "exchange": "string|null", "sector": "string|null", "country": "string|null", "holdings": [] },
      "type": "buy|sell",
      "datetime": "string|null",
      "invested_amount": "number|null",
      "invested_currency": "EUR|USD|null",
      "quantity": "number|null",
      "execution_price": "number|null",
      "fee": "number|null",
      "fee_currency": "EUR|USD|null",
      "evidence": "string|null",
      "confidence": "high|medium|low"
    }
  ]
}`

export function buildPortfolioUpdatePrompt(context: {
  accounts: { broker: string; label: string }[]
  assets: { symbol: string; name: string; exchange?: string; accounts: string[] }[]
}): string {
  return `Eres un actualizador estricto de una cartera de inversión. Recibirás:
1) El contexto actual de la cartera.
2) Un texto libre del usuario (por ejemplo: "vendí 100 € de BTC a 65000") y, opcionalmente, capturas nuevas.

CONTEXTO ACTUAL (solo para identificar cuentas y activos; no inventes operaciones):
${JSON.stringify(context, null, 2)}

REGLAS:
- Convierte únicamente cambios explícitos: compras y ventas. No vuelvas a importar las posiciones existentes.
- Resuelve el activo contra el contexto por ISIN o por símbolo + mercado/divisa. Si hay ambigüedad, usa null y explícalo en evidence; no elijas por tu cuenta.
- Si el usuario no indica cuenta y el activo aparece en varias, deja account_broker en null.
- Puedes derivar cantidad = importe / precio o importe = cantidad × precio. No derives ambos si solo hay un dato.
- Si hay imágenes, extrae solo datos visibles y oculta/ignora datos personales.
- Fechas ISO 8601. Si no se indica fecha, usa null.
- Números con punto decimal, sin separadores de miles.
- Devuelve exclusivamente JSON válido, sin markdown, con schema_version 1, accounts: [], positions: [] y transactions conforme a este formato:
{
  "schema_version": 1,
  "accounts": [],
  "positions": [],
  "transactions": [{
    "account_broker": "string|null",
    "asset": {
      "symbol": "string|null", "name": "string|null",
      "type": "stock|etf|crypto|commodity|index|cash|other|null",
      "quote_currency": "EUR|USD|null", "isin": "string|null",
      "exchange": "string|null", "sector": "string|null", "country": "string|null",
      "holdings": []
    },
    "type": "buy|sell",
    "datetime": "ISO 8601|null",
    "invested_amount": "number|null",
    "invested_currency": "EUR|USD|null",
    "quantity": "number|null",
    "execution_price": "number|null",
    "fee": "number|null",
    "fee_currency": "EUR|USD|null",
    "evidence": "frase breve que justifica cada inferencia",
    "confidence": "high|medium|low"
  }]
}`
}

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
