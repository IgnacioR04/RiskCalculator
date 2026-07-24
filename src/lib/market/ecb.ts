/**
 * Cambios EUR de referencia del BCE, servidos vía Frankfurter
 * (https://frankfurter.dev — API abierta y mantenida que republica los tipos
 * de referencia diarios del BCE con CORS; el feed XML oficial del BCE no
 * permite peticiones desde el navegador). Decisión registrada en
 * docs/DATA_SOURCES.md. Un tipo BCE es un cambio de referencia diario
 * (~16:00 CET), no un precio ejecutable: se etiqueta 'estimated' para
 * valoración intradía y 'real' solo como referencia del día ya cerrado.
 */
import type { Currency } from '../domain'
import { fetchJson } from './http'
import { ProviderError, type FxProvider, type FxRateResult } from './provider'

const BASE = 'https://api.frankfurter.dev/v1'

interface FrankfurterResponse {
  base: string
  date: string
  rates: Record<string, number>
}

interface FrankfurterSeriesResponse {
  base: string
  start_date: string
  end_date: string
  rates: Record<string, Record<string, number>>
}

export interface FxSeriesPoint {
  date: string
  rate: number
}

/**
 * Serie de cambios de referencia. Frankfurter solo devuelve días hábiles; el
 * consumidor decide si arrastra el último dato para fines de semana.
 */
export async function getFxDailySeries(
  base: Currency,
  quote: Currency,
  startDate: string,
  endDate: string,
): Promise<FxSeriesPoint[]> {
  if (base === quote) return [{ date: startDate, rate: 1 }]
  const data = await fetchJson<FrankfurterSeriesResponse>(
    `${BASE}/${startDate}..${endDate}?base=${base}&symbols=${quote}`,
  )
  return Object.entries(data.rates)
    .flatMap(([date, rates]) => {
      const rate = rates[quote]
      return rate === undefined ? [] : [{ date, rate }]
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export const ecbFxProvider: FxProvider = {
  id: 'ecb-frankfurter',
  label: 'BCE (tipos de referencia diarios, vía Frankfurter)',

  async getRate(base: Currency, quote: Currency, date?: string): Promise<FxRateResult> {
    if (base === quote) {
      return {
        base,
        quote,
        rate: '1',
        date: date ?? new Date().toISOString().slice(0, 10),
        provider: 'ecb-frankfurter',
        quality: 'real',
      }
    }
    const path = date ?? 'latest'
    const data = await fetchJson<FrankfurterResponse>(
      `${BASE}/${path}?base=${base}&symbols=${quote}`,
    )
    const rate = data.rates[quote]
    if (rate === undefined) {
      throw new ProviderError(`Sin tipo ${base}/${quote} en el BCE`, 'not_found')
    }
    return {
      base,
      quote,
      rate: String(rate),
      // Frankfurter devuelve la fecha efectiva del tipo (último día hábil).
      date: data.date,
      provider: 'ecb-frankfurter',
      // Si se pidió una fecha y el tipo efectivo es de otro día (festivo),
      // es una estimación.
      quality: date !== undefined && data.date !== date ? 'estimated' : 'real',
    }
  },
}
