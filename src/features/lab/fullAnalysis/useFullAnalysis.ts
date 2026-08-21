/**
 * Arranque automático del análisis (LAB-1205).
 *
 * ## Dónde se engancha, y por qué no en la importación
 *
 * El encargo pide que el análisis empiece al terminar una importación. Engancharlo
 * ahí cubriría **ese** camino y dejaría fuera los otros seis: editar una
 * operación, sincronizar con la nube, cambiar de divisa, cambiar el benchmark,
 * cambiar la política o cambiar de ámbito.
 *
 * Aquí se vigila la **huella** de la cartera, que es lo que todos esos caminos
 * tienen en común. Si cambia, hay una pregunta nueva; si no cambia, no la hay,
 * venga de donde venga el evento. Un evento duplicado no dispara nada porque la
 * huella no se ha movido, así que la deduplicación sale gratis en vez de
 * hacerse con un registro de eventos vistos.
 *
 * Vive montado en la shell, no en el Laboratorio: **no hace falta visitar
 * ninguna pantalla** para que el análisis empiece.
 *
 * ## Cancelación
 *
 * Cada ejecución se queda con un número de generación. Al publicar cualquier
 * etapa comprueba que siga siendo la vigente; si no lo es, tira su resultado. Es
 * el mismo testigo que usa `useStabilityAnalysis`, y consigue lo único que
 * importa: que una respuesta tardía nunca pise a un informe nuevo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildPortfolioView } from '../../../lib/portfolio'
import type { AnalysisScope, PortfolioHealthReport } from '../../../lib/lab/fullAnalysis/contracts'
import { FULL_ANALYSIS_MODEL_VERSION, scopeKey } from '../../../lib/lab/fullAnalysis/contracts'
import { buildFingerprint } from '../../../lib/lab/fullAnalysis/fingerprint'
import { planScopes, runQueue } from '../../../lib/lab/fullAnalysis/analysisQueue'
import { loadReport, saveReport } from '../../../lib/lab/fullAnalysis/reportStore'
import {
  runFullAnalysis,
  type DatedReturn,
  type FullAnalysisInput,
} from '../../../lib/lab/fullAnalysis/runFullAnalysis'
import { useAppStore } from '../../../state/store'

/**
 * Espera antes de arrancar tras un cambio.
 *
 * Escribir una operación dispara varias actualizaciones del store seguidas
 * —cantidad, precio, fecha—, y cada una cambiaría la huella. Sin esta pausa, el
 * análisis arrancaría y se cancelaría a sí mismo cuatro veces por edición.
 */
export const DEBOUNCE_MS = 600

export interface FullAnalysisState {
  readonly fingerprint: string
  /** Informe por ámbito. El consolidado vive en la clave `portfolio`. */
  readonly reports: ReadonlyMap<string, PortfolioHealthReport>
  readonly running: boolean
}

export interface FullAnalysisOptions {
  /** Cuenta que el usuario tiene delante: se analiza la segunda, no la última. */
  readonly visibleAccountId?: string
  /**
   * Series históricas por activo. Inyectado para poder probar el orquestador
   * entero sin red y para compartir caché entre ámbitos.
   */
  readonly seriesFor?: (
    assetIds: readonly string[],
  ) => Promise<ReadonlyMap<string, readonly DatedReturn[]>>
  readonly debounceMs?: number
}

const SIN_SERIES = async (): Promise<ReadonlyMap<string, readonly DatedReturn[]>> => new Map()

export function useFullAnalysis(opciones: FullAnalysisOptions = {}): FullAnalysisState {
  const assets = useAppStore((s) => s.assets)
  const accounts = useAppStore((s) => s.accounts)
  const transactions = useAppStore((s) => s.transactions)
  const quotes = useAppStore((s) => s.quotes)
  const fxRates = useAppStore((s) => s.fxRates)
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)

  const [reports, setReports] = useState<ReadonlyMap<string, PortfolioHealthReport>>(new Map())
  const [running, setRunning] = useState(false)

  const asOf = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const fingerprint = useMemo(
    () =>
      buildFingerprint({
        scope: { kind: 'portfolio' },
        asOf,
        baseCurrency: displayCurrency,
        transactions: transactions.map((t) => ({
          id: t.id,
          assetId: t.assetId,
          accountId: t.accountId,
          kind: t.type,
          quantity: String(t.quantity),
          date: t.datetime,
        })),
        assets: assets.map((a) => ({
          id: a.id,
          symbol: a.symbol,
          assetType: a.assetType,
          quoteCurrency: a.quoteCurrency,
        })),
        modelVersion: FULL_ANALYSIS_MODEL_VERSION,
      }),
    [assets, transactions, displayCurrency, asOf],
  )

  /** Solo la generación vigente puede publicar. */
  const generacion = useRef(0)
  const visible = opciones.visibleAccountId
  const espera = opciones.debounceMs ?? DEBOUNCE_MS

  /**
   * El proveedor de series vive en una referencia y **no** en las dependencias.
   *
   * Si entrara, quien lo pase en línea —que es lo natural— cambiaría su
   * identidad en cada render: el efecto se relanzaría, publicaría, provocaría
   * otro render y vuelta a empezar. Se vio en las pruebas antes de que ninguna
   * lo buscara: ocho rondas completas de análisis para una sola cartera, con
   * sus ocho descargas. Lo que importa de esta función es lo que hace, no
   * cuándo se creó.
   */
  const seriesRef = useRef(opciones.seriesFor ?? SIN_SERIES)
  seriesRef.current = opciones.seriesFor ?? SIN_SERIES

  const posiciones = useMemo(() => {
    const vista = buildPortfolioView({
      assets,
      accounts,
      transactions,
      quotes,
      fxRates,
      displayCurrency,
    })
    // Una posición del mismo activo puede estar repartida entre cuentas, así que
    // se abre por cuenta. Colapsarla en una sola con `accountIds[0]` atribuiría
    // a una cuenta el valor que está en otra, y el informe de cuenta dejaría de
    // corresponder a nada que el usuario pueda ver.
    return vista.positions
      .filter((p) => p.quantity.gt(0))
      .flatMap((p) =>
        p.accountBreakdown
          .filter((b) => b.quantity.gt(0))
          .map((b) => ({
            assetId: p.asset.id,
            symbol: p.asset.symbol,
            assetType: p.asset.assetType,
            accountId: b.accountId,
            value: b.value === null ? null : Number(b.value.toString()),
            quantity: Number(b.quantity.toString()),
          })),
      )
  }, [assets, accounts, transactions, quotes, fxRates, displayCurrency])

  const arrancar = useCallback(async () => {
    const mia = generacion.current + 1
    generacion.current = mia
    const vigente = () => generacion.current === mia

    // El informe anterior queda obsoleto en cuanto la huella cambia. Marcarlo
    // en vez de borrarlo permite seguir enseñándolo mientras se recalcula, con
    // la etiqueta puesta.
    setReports((previos) => {
      const salida = new Map(previos)
      for (const [clave, informe] of salida) salida.set(clave, { ...informe, status: 'stale' })
      return salida
    })

    if (posiciones.length === 0) {
      if (vigente()) setReports(new Map())
      return
    }

    // Si ya hay un informe de esta misma huella guardado, se enseña de
    // inmediato. Recargar la página no puede costar una ronda de descargas, y
    // la huella —no la antigüedad— es lo que dice si sigue respondiendo a la
    // misma pregunta.
    const guardado = loadReport(fingerprint, { kind: 'portfolio' })
    if (guardado !== null && vigente()) {
      setReports((previos) => new Map(previos).set('portfolio', guardado))
    }

    setRunning(true)
    const cuentas = [...new Set(posiciones.map((p) => p.accountId).filter((id) => id !== ''))]
    const tareas = planScopes(cuentas, visible)

    // Caché compartida entre ámbitos: la mayoría de las series que necesita una
    // cuenta ya las pidió el consolidado.
    const cache = new Map<string, readonly DatedReturn[]>()
    const seriesCompartidas = async (ids: readonly string[]) => {
      const faltan = ids.filter((id) => !cache.has(id))
      if (faltan.length > 0) {
        const nuevas = await seriesRef.current(faltan)
        for (const [id, serie] of nuevas) cache.set(id, serie)
      }
      return new Map(ids.flatMap((id) => (cache.has(id) ? [[id, cache.get(id)!] as const] : [])))
    }

    try {
      await runQueue(
        tareas,
        async (scope: AnalysisScope) => {
          const entrada: FullAnalysisInput = {
            runId: `${fingerprint}:${scopeKey(scope)}`,
            fingerprint,
            scope,
            asOf,
            baseCurrency: displayCurrency,
            positions: posiciones,
            seriesFor: seriesCompartidas,
          }
          return runFullAnalysis(entrada, (parcial) => {
            // Publicación por etapas: la concentración aparece sin esperar a la
            // red. Cada parcial comprueba la generación por su cuenta.
            if (!vigente()) return
            setReports((previos) => new Map(previos).set(scopeKey(scope), parcial))
          })
        },
        (scope, informe) => {
          // Solo se guardan los terminados: un informe parcial no responde
          // todavía a la pregunta, y recuperarlo al recargar daría una respuesta
          // a medias con aspecto de completa.
          saveReport(informe)
          setReports((previos) => new Map(previos).set(scopeKey(scope), informe))
        },
        vigente,
      )
    } finally {
      if (vigente()) setRunning(false)
    }
  }, [asOf, displayCurrency, fingerprint, posiciones, visible])

  useEffect(() => {
    const temporizador = setTimeout(() => void arrancar(), espera)
    return () => clearTimeout(temporizador)
  }, [arrancar, espera])

  return { fingerprint, reports, running }
}
