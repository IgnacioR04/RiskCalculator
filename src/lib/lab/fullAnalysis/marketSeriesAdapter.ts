/**
 * Adaptador de históricos de producción (LAB-1211).
 *
 * ## Lo que faltaba
 *
 * El orquestador nacía con un proveedor de series inyectable y **sin nadie que
 * inyectara el de verdad**: `FullAnalysisProvider` llamaba al hook sin
 * `seriesFor`, así que en producción caía al respaldo vacío. El análisis
 * arrancaba solo, sí, y el riesgo salía `insufficient` siempre. Un automatismo
 * que llega hasta el borde y no cruza.
 *
 * Esto es el puente. No reimplementa la adquisición: llama a `fetchSeries`, que
 * es la misma función que usa `useStabilityAnalysis`, con su caché por día, su
 * cola de Twelve Data, sus series de demostración y su conversión de divisa.
 * Escribir aquí una segunda forma de descargar sería garantizar que las dos se
 * desincronizan.
 *
 * ## Lo que sí añade
 *
 * - **Caché entre ámbitos.** La serie diaria de un instrumento es la misma para
 *   la cartera consolidada y para cada cuenta. Sin esto, una cartera con cuatro
 *   cuentas pediría cinco veces lo mismo.
 * - **Cancelación de verdad.** Entre instrumento e instrumento se mira el
 *   `AbortSignal`. Con la cola de Twelve Data espaciando ocho segundos, dejar de
 *   pedir es la diferencia entre abortar y esperar dos minutos a algo que ya no
 *   interesa.
 * - **Fallos por instrumento.** Que una serie no llegue no puede tumbar el
 *   análisis: se anota y se sigue.
 */
import type { Asset, Currency } from '../../domain'
import { historicalFxSeries } from '../../market/service'
import { hasDemoHistoricalSeries } from '../../../state/demoHistory'
import { fetchSeries } from '../stability/acquisition'
import { marketDataCacheKey } from './fingerprint'
import type { DatedReturn } from './runFullAnalysis'

export const MARKET_ADAPTER_VERSION = 'market-series-adapter-v1'

/** Ventana por defecto. Un año hábil: lo que pide el riesgo anualizado. */
export const DIAS_POR_DEFECTO = 365

export class AnalysisAbortedError extends Error {
  constructor() {
    super('El análisis se abortó porque la cartera cambió.')
    this.name = 'AnalysisAbortedError'
  }
}

export interface MarketSeriesAdapter {
  readonly seriesFor: (
    assetIds: readonly string[],
  ) => Promise<ReadonlyMap<string, readonly DatedReturn[]>>
  /** Instrumentos que se pidieron y no llegaron, con su motivo. */
  readonly failures: ReadonlyMap<string, string>
  readonly version: string
}

export interface AdapterOptions {
  readonly assets: readonly Asset[]
  readonly baseCurrency: Currency
  readonly days?: number
  readonly signal?: AbortSignal
  /** Inyectable para las pruebas; en producción se usa el real. */
  readonly fetchSeriesImpl?: typeof fetchSeries
  readonly fxImpl?: typeof historicalFxSeries
}

/**
 * Crea un adaptador con caché propia.
 *
 * La caché es **por adaptador**, y el adaptador se crea una vez por ejecución.
 * Así todos los ámbitos de una misma ejecución la comparten, y una ejecución
 * nueva no arrastra series de una valoración anterior.
 */
export function createMarketSeriesAdapter(opciones: AdapterOptions): MarketSeriesAdapter {
  const dias = opciones.days ?? DIAS_POR_DEFECTO
  const traer = opciones.fetchSeriesImpl ?? fetchSeries
  const traerFx = opciones.fxImpl ?? historicalFxSeries
  const porId = new Map(opciones.assets.map((a) => [a.id, a]))

  const cache = new Map<string, readonly DatedReturn[]>()
  const fallos = new Map<string, string>()
  let fx: { date: string; rate: number }[] | null = null

  /**
   * El tipo de cambio se descarga **una vez por ejecución** y solo si hace
   * falta. Un activo en la divisa de presentación no necesita conversión, y
   * pedir la serie de FX para una cartera enteramente en euros sería gastar una
   * llamada para no usarla.
   */
  async function fxSiHaceFalta(activos: readonly Asset[]): Promise<typeof fx> {
    if (fx !== null) return fx

    const necesita = activos.some(
      (a) =>
        a.quoteCurrency !== opciones.baseCurrency &&
        !(a.isDemo === true && hasDemoHistoricalSeries(a.id)),
    )
    if (!necesita) {
      fx = []
      return fx
    }

    const fin = new Date()
    const inicio = new Date(fin.getTime() - (dias + 10) * 86_400_000)
    try {
      fx = await traerFx(
        opciones.baseCurrency === 'EUR' ? 'USD' : 'EUR',
        opciones.baseCurrency,
        inicio.toISOString().slice(0, 10),
        fin.toISOString().slice(0, 10),
      )
    } catch {
      // Sin FX, los activos en la otra divisa se quedan fuera y se anotan; los
      // que ya están en la divisa de presentación siguen su camino.
      fx = []
    }
    return fx
  }

  async function seriesFor(
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DatedReturn[]>> {
    const salida = new Map<string, readonly DatedReturn[]>()
    const pendientes: Asset[] = []

    for (const id of assetIds) {
      const clave = marketDataCacheKey(id, opciones.baseCurrency, 'auto', dias)
      const enCache = cache.get(clave)
      if (enCache !== undefined) {
        salida.set(id, enCache)
        continue
      }
      const activo = porId.get(id)
      if (activo === undefined) {
        fallos.set(id, 'El activo ya no está en la cartera.')
        continue
      }
      pendientes.push(activo)
    }

    if (pendientes.length === 0) return salida

    const cambios = (await fxSiHaceFalta(pendientes)) ?? []

    for (const activo of pendientes) {
      // Se mira antes de cada descarga, no solo al principio: con la cola de
      // Twelve Data espaciando ocho segundos, una ronda de quince instrumentos
      // dura dos minutos, y en dos minutos la cartera puede cambiar dos veces.
      if (opciones.signal?.aborted === true) throw new AnalysisAbortedError()

      try {
        const serie = await traer(activo, dias, opciones.baseCurrency, cambios)
        if (serie === null || serie.returns.length === 0) {
          fallos.set(activo.id, 'No llegó historial de este instrumento.')
          continue
        }
        const rendimientos: DatedReturn[] = serie.returns.map((r) => ({
          date: r.date,
          value: r.value,
        }))
        cache.set(marketDataCacheKey(activo.id, opciones.baseCurrency, 'auto', dias), rendimientos)
        salida.set(activo.id, rendimientos)
      } catch (error) {
        if (error instanceof AnalysisAbortedError) throw error
        // Un instrumento que falla no puede tumbar el análisis de los demás.
        fallos.set(activo.id, error instanceof Error ? error.message : 'Error desconocido.')
      }
    }

    return salida
  }

  return { seriesFor, failures: fallos, version: MARKET_ADAPTER_VERSION }
}

/**
 * Respaldo vacío.
 *
 * **Solo para pruebas y para cuando no hay cartera.** Que exista es cómodo y es
 * exactamente lo que hizo que producción se quedara sin históricos durante toda
 * la fase 2: el respaldo era el camino por defecto y nadie lo notó porque no
 * falla, solo devuelve nada.
 */
export const ADAPTADOR_VACIO: MarketSeriesAdapter = {
  seriesFor: async () => new Map(),
  failures: new Map(),
  version: 'market-series-adapter-empty',
}
