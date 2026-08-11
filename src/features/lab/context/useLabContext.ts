/**
 * Contexto real del Laboratorio, leído del store (LAB-213).
 *
 * Un solo sitio produce la cabecera de **todas** las pantallas del Laboratorio:
 * `LabShell` lo usa por defecto, así que añadir una pantalla no obliga a
 * acordarse de conectar nada.
 *
 * No recalcula: reutiliza el informe de calidad de LAB-211 y la política de
 * LAB-209, y solo traduce a etiquetas. Y responde a cambios de cartera porque
 * depende de los mismos datos que la cartera.
 */
import { useMemo } from 'react'
import { leerSerie } from '../../../lib/market/seriesCache'
import type { SeriesPoint } from '../../../lib/market/seriesCache'
import { buildPortfolioView } from '../../../lib/portfolio'
import { assessPortfolioQuality } from '../../../lib/lab/data/portfolioQuality'
import { useAppStore } from '../../../state/store'
import { buildLabContext, type LabContextViewModel } from './labContext'

/** Los mismos días que pide la pantalla de calidad, para leer su misma caché. */
const DIAS_DE_SERIE = 365

export function useLabContext(): LabContextViewModel {
  const assets = useAppStore((s) => s.assets)
  const accounts = useAppStore((s) => s.accounts)
  const transactions = useAppStore((s) => s.transactions)
  const quotes = useAppStore((s) => s.quotes)
  const fxRates = useAppStore((s) => s.fxRates)
  const currency = useAppStore((s) => s.settings.displayCurrency)
  const activa = useAppStore((s) => s.labPolicyActive)
  const borrador = useAppStore((s) => s.labPolicyDraft)

  return useMemo(() => {
    const vista = buildPortfolioView({
      assets,
      accounts,
      transactions,
      quotes,
      fxRates,
      displayCurrency: currency,
    })

    const series: Record<string, readonly SeriesPoint[]> = {}
    for (const posicion of vista.positions) {
      const guardada = leerSerie(posicion.asset.id, DIAS_DE_SERIE, currency)
      if (guardada !== null) series[posicion.asset.id] = guardada.puntos
    }

    const ahora = new Date().toISOString()
    const calidad =
      vista.positions.length === 0
        ? null
        : assessPortfolioQuality(
            { positions: vista.positions, quotes, fxRates, displayCurrency: currency, series },
            ahora,
          )

    return buildLabContext({
      assetIds: vista.positions.map((p) => p.asset.id),
      currency,
      // La vigente manda sobre el borrador: es la que rige los resultados.
      policy: activa ?? borrador,
      quality: calidad,
      today: ahora.slice(0, 10),
    })
  }, [assets, accounts, transactions, quotes, fxRates, currency, activa, borrador])
}
