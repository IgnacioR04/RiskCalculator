/**
 * Formateo de presentación (es-ES). El redondeo ocurre SOLO aquí;
 * la lógica financiera trabaja con decimal.js sin redondeos intermedios.
 */
import type { Decimal } from './finance/decimal'

export type Currency = 'EUR' | 'USD'

export type Numeric = Decimal | number | string

function toNumber(value: Numeric): number {
  return typeof value === 'number' ? value : Number(value.toString())
}

export function formatMoney(value: Numeric, currency: Currency, maxDecimals = 2): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  }).format(toNumber(value))
}

/**
 * Separa un importe en cifra y símbolo de divisa. El sistema visual exige que
 * el símbolo vaya en Archivo, ~30 % menor y en texto secundario, mientras la
 * cifra va en serif tabular.
 */
export function formatMoneyParts(
  value: Numeric,
  currency: Currency,
  maxDecimals = 2,
): { amount: string; symbol: string } {
  const parts = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  }).formatToParts(toNumber(value))
  let amount = ''
  let symbol = ''
  for (const part of parts) {
    if (part.type === 'currency') symbol = part.value
    else if (part.type !== 'literal') amount += part.value
  }
  return { amount: amount.trim(), symbol }
}

/** Porcentaje a partir de una fracción (0,05 → «5,00 %»). */
export function formatPct(fraction: Numeric, decimals = 2): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(fraction))
}

/** Cantidad de unidades: hasta 8 decimales (cripto), sin ceros de relleno. */
export function formatQty(value: Numeric): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(toNumber(value))
}

export function formatNumber(value: Numeric, maxDecimals = 2): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(toNumber(value))
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(d)
}

/**
 * Parsea números escritos por el usuario en formato español o anglosajón
 * («1.234,56», «1234.56», «1 234,56»). Devuelve null si no es interpretable.
 */
export function parseUserNumber(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s/g, '')
  if (trimmed === '') return null
  const hasComma = trimmed.includes(',')
  const hasDot = trimmed.includes('.')
  let normalized: string
  if (hasComma && hasDot) {
    // El último separador es el decimal; el otro, de miles.
    normalized =
      trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')
        ? trimmed.replace(/\./g, '').replace(',', '.')
        : trimmed.replace(/,/g, '')
  } else if (hasComma) {
    normalized = trimmed.replace(',', '.')
  } else {
    normalized = trimmed
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  return normalized
}
