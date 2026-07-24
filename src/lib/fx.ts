/**
 * Conversión EUR↔USD con registro explícito del tipo aplicado.
 * Cambiar la divisa de presentación NUNCA es cambiar el símbolo: cada
 * conversión devuelve tipo, fecha, fuente y calidad para mostrarlos.
 */
import type { Currency, DataQuality, FxRate } from './domain'
import { Decimal, dec, type DecimalValue } from './finance/decimal'

export interface FxConversion {
  amount: Decimal
  /** Tipo aplicado, expresado como `to` por unidad de `from`. */
  rate: Decimal
  rateDate: string
  provider: string
  /** 'real' solo si el tipo es del mismo día solicitado (o actual). */
  quality: DataQuality
  from: Currency
  to: Currency
}

function ratesForPair(rates: readonly FxRate[], from: Currency, to: Currency) {
  return rates
    .flatMap((r) => {
      if (r.base === from && r.quote === to) {
        return [{ rate: dec(r.rate), date: r.date, provider: r.provider, quality: r.quality }]
      }
      if (r.base === to && r.quote === from) {
        const value = dec(r.rate)
        if (value.isZero()) return []
        return [
          { rate: new Decimal(1).div(value), date: r.date, provider: r.provider, quality: r.quality },
        ]
      }
      return []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Convierte un importe entre divisas.
 * - Sin `onDate`: usa el cambio más reciente disponible.
 * - Con `onDate` (YYYY-MM-DD): usa el del día exacto; si no existe, el más
 *   cercano anterior (o el más antiguo posterior) marcado como 'estimated'.
 * - Devuelve null si no hay ningún cambio disponible: el llamante decide
 *   (mostrar en divisa original con aviso, pedir entrada manual, …).
 */
export function convertAmount(
  amount: DecimalValue,
  from: Currency,
  to: Currency,
  rates: readonly FxRate[],
  onDate?: string,
): FxConversion | null {
  const value = dec(amount)
  if (from === to) {
    return {
      amount: value,
      rate: new Decimal(1),
      rateDate: onDate ?? new Date().toISOString().slice(0, 10),
      provider: 'identity',
      quality: 'real',
      from,
      to,
    }
  }

  const candidates = ratesForPair(rates, from, to)
  if (candidates.length === 0) return null

  let chosen = candidates[candidates.length - 1]!
  let quality: DataQuality = chosen.quality

  if (onDate !== undefined) {
    const exact = candidates.find((c) => c.date === onDate)
    if (exact !== undefined) {
      chosen = exact
      quality = exact.quality
    } else {
      const before = [...candidates].reverse().find((c) => c.date < onDate)
      chosen = before ?? candidates[0]!
      // Un cambio de otra fecha siempre se presenta como estimación.
      quality = quality === 'demo' ? 'demo' : 'estimated'
    }
  }

  return {
    amount: value.times(chosen.rate),
    rate: chosen.rate,
    rateDate: chosen.date,
    provider: chosen.provider,
    quality,
    from,
    to,
  }
}
