/**
 * Conversión de series de precios a la divisa de presentación (LAB-304).
 *
 * Extraído **sin tocar una línea de lógica** del monolito
 * `HistoricalRiskSection`. El objetivo del refactor es mover, no mejorar: si
 * además se corrigiera algo, cualquier diferencia numérica sería imposible de
 * atribuir. Lo que haya que arreglar se arregla después, con la paridad ya
 * demostrada.
 *
 * La regla que gobierna estas funciones y que conviene no perder: **un día sin
 * tipo de cambio no vale cero ni se arrastra en silencio**; se usa el último
 * conocido y, cuando no hay ninguno, el punto se descarta.
 */
import type { SeriesPoint } from '../../finance/historical'

export function rateAt(
  rates: readonly { date: string; rate: number }[],
  date: string,
): number | null {
  const candidate = [...rates].reverse().find((rate) => rate.date <= date)
  return candidate?.rate ?? null
}

export function convertPriceSeries(
  series: readonly SeriesPoint[],
  rates: readonly { date: string; rate: number }[],
): SeriesPoint[] {
  return series.flatMap((point) => {
    const rate = rateAt(rates, point.date)
    return rate === null ? [] : [{ date: point.date, close: point.close * rate }]
  })
}
