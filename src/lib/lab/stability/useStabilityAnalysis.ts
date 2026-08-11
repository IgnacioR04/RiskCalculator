/**
 * Orquestación del análisis histórico (LAB-306).
 *
 * Saca del componente todo el estado de carga: qué ventana se pide, si hay una
 * descarga en curso, qué series llegaron y cuáles faltaron. La interfaz deja de
 * saber que existen proveedores.
 *
 * Lo importante de este archivo no es mover código, es **cerrar una carrera que
 * el monolito tenía abierta**. Antes, dos ejecuciones solapadas —cambiar de
 * ventana y volver a pedir antes de que terminara la anterior, o cambiar de
 * cartera— podían resolverse en orden inverso, y la respuesta vieja pisaba a la
 * nueva sin que nada fallara. El usuario veía datos de otra petición creyendo
 * que eran los suyos.
 *
 * La solución es un **testigo de petición**: cada ejecución se queda con un
 * número, y al terminar comprueba que sigue siendo la última. Si no lo es, tira
 * su resultado. Es más barato que cancelar de verdad y consigue lo mismo que
 * importa: nunca se publica una respuesta que ya no corresponde.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset, Currency } from '../../domain'
import { historicalFxSeries } from '../../market/service'
import { hasDemoHistoricalSeries } from '../../../state/demoHistory'
import { fetchSeries } from './acquisition'
import type { AssetSeries } from './twr'

export type StabilityPeriod = '90' | '180' | '365'

export interface StabilityAnalysisState {
  readonly period: StabilityPeriod
  readonly busy: boolean
  /** `null` mientras no haya resultado publicado. No es lo mismo que vacío. */
  readonly loaded: readonly AssetSeries[] | null
  readonly downloadedFx: readonly { date: string; rate: number }[]
  /** Símbolos que se pidieron y no llegaron. */
  readonly missing: readonly string[]
  readonly benchmarkId: string
}

export interface StabilityAnalysis extends StabilityAnalysisState {
  readonly setPeriod: (period: StabilityPeriod) => void
  readonly setBenchmarkId: (id: string) => void
  readonly run: () => Promise<void>
}

export function useStabilityAnalysis(
  candidates: readonly Asset[],
  displayCurrency: Currency,
): StabilityAnalysis {
  const [period, setPeriod] = useState<StabilityPeriod>('365')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState<readonly AssetSeries[] | null>(null)
  const [downloadedFx, setDownloadedFx] = useState<readonly { date: string; rate: number }[]>([])
  const [missing, setMissing] = useState<readonly string[]>([])
  const [benchmarkId, setBenchmarkId] = useState('')

  /** Número de la última petición lanzada. Solo esa puede publicar. */
  const peticion = useRef(0)
  const autoRan = useRef(false)

  const run = useCallback(async () => {
    const mia = peticion.current + 1
    peticion.current = mia

    setBusy(true)
    setLoaded(null)
    setMissing([])

    try {
      const days = Number(period)
      const end = new Date()
      const start = new Date(end.getTime() - (days + 10) * 86_400_000)

      let fx: { date: string; rate: number }[] = []
      const needsDownloadedFx = candidates.some(
        (asset) =>
          asset.quoteCurrency !== displayCurrency &&
          !(asset.isDemo === true && hasDemoHistoricalSeries(asset.id)),
      )
      if (needsDownloadedFx) {
        try {
          fx = await historicalFxSeries(
            displayCurrency === 'EUR' ? 'USD' : 'EUR',
            displayCurrency,
            start.toISOString().slice(0, 10),
            end.toISOString().slice(0, 10),
          )
        } catch {
          // Solo será bloqueante para los activos en la otra divisa.
        }
      }

      const results = await Promise.all(
        candidates.map((asset) => fetchSeries(asset, days, displayCurrency, fx)),
      )

      // Aquí es donde se corta la carrera: si mientras se descargaba alguien
      // pidió otra cosa, esto ya no es la respuesta a la pregunta actual.
      if (peticion.current !== mia) return

      const available = results.filter((r): r is AssetSeries => r !== null)
      setDownloadedFx(fx)
      setLoaded(available)
      setMissing(
        candidates
          .filter((asset) => !available.some((item) => item.asset.id === asset.id))
          .map((asset) => asset.symbol),
      )

      const porDefecto = available.find((item) => item.asset.symbol === 'SXR8') ?? available[0]
      if (porDefecto !== undefined) setBenchmarkId(porDefecto.asset.id)
    } finally {
      // El indicador de carga solo lo apaga la petición vigente: si lo apagara
      // una vieja, la pantalla diría «listo» con otra descarga en marcha.
      if (peticion.current === mia) setBusy(false)
    }
  }, [candidates, displayCurrency, period])

  useEffect(() => {
    if (autoRan.current || candidates.length === 0) return
    autoRan.current = true
    void run()
    // Solo en el primer montaje: después manda el usuario con la ventana.
  }, [candidates.length, run])

  return {
    period,
    busy,
    loaded,
    downloadedFx,
    missing,
    benchmarkId,
    setPeriod,
    setBenchmarkId,
    run,
  }
}
