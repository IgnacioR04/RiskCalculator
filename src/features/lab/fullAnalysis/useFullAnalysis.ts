/**
 * Arranque automático del análisis (LAB-1205, rediseñado en LAB-1213).
 *
 * ## Dónde se engancha, y por qué no en la importación
 *
 * Engancharlo al evento de importación cubriría ese camino y dejaría fuera los
 * otros seis: editar una operación, sincronizar, cambiar de divisa, de
 * benchmark, de política o de ámbito. Aquí se vigila **la identidad del
 * análisis**, que es lo que todos tienen en común. Un evento repetido no
 * dispara nada porque la identidad no se mueve, así que la deduplicación sale
 * gratis en vez de llevar un registro de eventos vistos.
 *
 * Vive montado en la shell: **no hace falta visitar ninguna pantalla**.
 *
 * ## La política de precios, que antes se contradecía
 *
 * La primera versión decía que las cotizaciones no entraban en la huella, y a la
 * vez derivaba los pesos de `quotes` dentro de un `useMemo` del que dependía el
 * efecto. Resultado: un tick **sí** relanzaba el análisis, y el informe nuevo se
 * guardaba con el mismo `runId` que el anterior teniendo pesos distintos.
 *
 * La política ahora es explícita y se cumple en las dos direcciones:
 *
 * 1. **La valoración se congela por fecha.** El disparador es
 *    `estructura + configuración + fecha de valoración`. Un tick intradía no
 *    relanza nada: los pesos del informe de hoy son los del momento en que se
 *    calculó, y se identifican.
 * 2. **Si aun así se recalcula, la identidad cambia.** Los precios usados se
 *    capturan al arrancar y producen una `valuationVersion` que forma parte de
 *    la identidad completa. Dos informes con pesos distintos no pueden compartir
 *    clave, pase lo que pase aguas arriba.
 *
 * Al cruzar medianoche cambia la fecha de valoración, así que la aplicación
 * abierta desde ayer recalcula sola.
 *
 * ## Tres cosas distintas que no son «cancelar»
 *
 * - `requestAborted`: se abortan las descargas pendientes de una ejecución
 *   caduca. Es lo que ahorra tiempo y cuota.
 * - `resultDiscarded`: llegó un resultado de una generación anterior y se tira.
 * - `taskFailed`: un ámbito falló. Los demás continúan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildPortfolioView } from '../../../lib/portfolio'
import type { AnalysisScope, PortfolioHealthReport } from '../../../lib/lab/fullAnalysis/contracts'
import { FULL_ANALYSIS_MODEL_VERSION, scopeKey } from '../../../lib/lab/fullAnalysis/contracts'
import {
  analysisIdentity,
  modelConfigFingerprint,
  structuralFingerprint,
  valuationVersion,
} from '../../../lib/lab/fullAnalysis/fingerprint'
import { planScopes, runQueue } from '../../../lib/lab/fullAnalysis/analysisQueue'
import {
  createMarketSeriesAdapter,
  ADAPTADOR_VACIO,
  AnalysisAbortedError,
  type MarketSeriesAdapter,
} from '../../../lib/lab/fullAnalysis/marketSeriesAdapter'
import { loadCompatibleReports, saveReport } from '../../../lib/lab/fullAnalysis/reportStore'
import { runFullAnalysis, type FullAnalysisInput } from '../../../lib/lab/fullAnalysis/runFullAnalysis'
import { EXPECTED_RETURNS_VERSION } from '../../../lib/lab/candidates/expectedReturns'
import { ECONOMIC_CLASS_VERSION } from '../../../lib/lab/candidates/economicClass'
import { useAppStore } from '../../../state/store'

/**
 * Espera antes de arrancar tras un cambio.
 *
 * Escribir una operación dispara varias actualizaciones del store seguidas
 * —cantidad, precio, fecha—, y cada una cambiaría la identidad. Sin esta pausa
 * el análisis arrancaría y se abortaría a sí mismo cuatro veces por edición.
 */
export const DEBOUNCE_MS = 600

/** Cada cuánto se comprueba si ha cambiado el día. */
export const COMPROBACION_DE_FECHA_MS = 60_000

export interface FullAnalysisState {
  /** Identidad completa vigente. */
  readonly fingerprint: string
  readonly structuralFingerprint: string
  readonly valuationVersion: string
  readonly reports: ReadonlyMap<string, PortfolioHealthReport>
  readonly running: boolean
  /** Ámbitos que fallaron, con su motivo. Uno roto no detiene a los demás. */
  readonly failures: ReadonlyMap<string, string>
}

export interface FullAnalysisOptions {
  readonly visibleAccountId?: string
  /**
   * Adaptador de históricos. **En producción no se pasa**: se construye el real.
   * Existe para poder probar el orquestador sin red, y su ausencia ya no
   * significa «sin series».
   */
  readonly adapterFactory?: (opciones: {
    signal: AbortSignal
    baseCurrency: string
  }) => MarketSeriesAdapter
  readonly debounceMs?: number
}

export function useFullAnalysis(opciones: FullAnalysisOptions = {}): FullAnalysisState {
  const assets = useAppStore((s) => s.assets)
  const accounts = useAppStore((s) => s.accounts)
  const transactions = useAppStore((s) => s.transactions)
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)

  const [reports, setReports] = useState<ReadonlyMap<string, PortfolioHealthReport>>(new Map())
  const [failures, setFailures] = useState<ReadonlyMap<string, string>>(new Map())
  const [running, setRunning] = useState(false)

  /**
   * Fecha de valoración, revisada cada minuto.
   *
   * Sin esto, una aplicación abierta desde ayer seguiría analizando con la fecha
   * de ayer indefinidamente. Es barato y es lo que hace que la política de
   * «valoración congelada por día» tenga un día que congelar.
   */
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10))
  useEffect(() => {
    const t = setInterval(() => {
      const hoy = new Date().toISOString().slice(0, 10)
      setAsOf((previo) => (previo === hoy ? previo : hoy))
    }, COMPROBACION_DE_FECHA_MS)
    return () => clearInterval(t)
  }, [])

  /* ── Identidad ───────────────────────────────────────────────────────────── */

  const estructural = useMemo(
    () =>
      structuralFingerprint({
        scope: { kind: 'portfolio' },
        transactions: transactions.map((t) => ({
          id: t.id,
          assetId: t.assetId,
          accountId: t.accountId,
          type: t.type,
          datetime: t.datetime,
          quantity: t.quantity,
          investedAmount: t.investedAmount,
          investedCurrency: t.investedCurrency,
          executionPrice: t.executionPrice,
          quoteCurrency: t.quoteCurrency,
          fee: t.fee,
          feeCurrency: t.feeCurrency,
        })),
        assets: assets.map((a) => ({
          id: a.id,
          symbol: a.symbol,
          assetType: a.assetType,
          quoteCurrency: a.quoteCurrency,
        })),
        accountIds: accounts.map((c) => c.id),
      }),
    [assets, accounts, transactions],
  )

  const configModelo = useMemo(
    () =>
      modelConfigFingerprint({
        modelVersions: {
          analysis: FULL_ANALYSIS_MODEL_VERSION,
          expectedReturns: EXPECTED_RETURNS_VERSION,
          economicClass: ECONOMIC_CLASS_VERSION,
        },
      }),
    [],
  )

  /**
   * Disparador.
   *
   * **No incluye los precios.** Esa es la política: la valoración se congela por
   * día. Los precios sí entran en la identidad del informe, pero se leen al
   * arrancar, no aquí.
   */
  const disparador = `${estructural}.${configModelo}.${asOf}`

  const [identidad, setIdentidad] = useState({ full: '', structural: '', valuation: '' })

  /* ── Ejecución ───────────────────────────────────────────────────────────── */

  const generacion = useRef(0)
  const abortoActual = useRef<AbortController | null>(null)
  const visible = opciones.visibleAccountId
  const espera = opciones.debounceMs ?? DEBOUNCE_MS

  const fabricaRef = useRef(opciones.adapterFactory)
  fabricaRef.current = opciones.adapterFactory

  const arrancar = useCallback(async () => {
    const mia = generacion.current + 1
    generacion.current = mia
    const vigente = () => generacion.current === mia

    // `requestAborted`: se cortan las descargas de la ejecución anterior. No es
    // lo mismo que descartar su resultado, y la diferencia se nota en la cuota
    // del proveedor y en dos minutos de espera.
    abortoActual.current?.abort()
    const aborto = new AbortController()
    abortoActual.current = aborto

    setReports((previos) => {
      const salida = new Map(previos)
      for (const [clave, informe] of salida) salida.set(clave, { ...informe, status: 'stale' })
      return salida
    })
    setFailures(new Map())

    // Los precios se leen **ahora**, no reactivamente: es lo que congela la
    // valoración y lo que permite identificarla.
    const estado = useAppStore.getState()
    const vista = buildPortfolioView({
      assets: estado.assets,
      accounts: estado.accounts,
      transactions: estado.transactions,
      quotes: estado.quotes,
      fxRates: estado.fxRates,
      displayCurrency,
    })

    const valoracion = valuationVersion({
      asOf,
      baseCurrency: displayCurrency,
      prices: Object.values(estado.quotes).map((q) => ({
        assetId: q.assetId,
        price: q.price,
        currency: q.currency,
        asOf: q.timestamp,
      })),
      fx: estado.fxRates.map((r) => ({ pair: `${r.base}/${r.quote}`, rate: String(r.rate) })),
    })

    const id = analysisIdentity(estructural, valoracion, configModelo)
    if (vigente()) setIdentidad({ full: id.full, structural: id.structural, valuation: id.valuation })

    // Una posición del mismo activo repartida entre cuentas se abre por cuenta:
    // colapsarla atribuiría a una cuenta el valor que está en otra.
    const posiciones = vista.positions
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

    if (posiciones.length === 0) {
      if (vigente()) setReports(new Map())
      return
    }

    // Se recuperan **todos** los informes compatibles, no solo el consolidado:
    // recargar la página no puede obligar a recalcular cada cuenta.
    const cuentasVivas = new Set(estado.accounts.map((c) => c.id))
    const guardados = loadCompatibleReports(id.full, cuentasVivas)
    if (guardados.size > 0 && vigente()) {
      setReports((previos) => new Map([...previos, ...guardados]))
    }

    setRunning(true)
    const cuentas = [...new Set(posiciones.map((p) => p.accountId).filter((c) => c !== ''))]
    const tareas = planScopes(cuentas, visible)

    // Un adaptador por ejecución: su caché se comparte entre ámbitos y no
    // arrastra series de una valoración anterior.
    const adaptador =
      fabricaRef.current?.({ signal: aborto.signal, baseCurrency: displayCurrency }) ??
      (estado.assets.length === 0
        ? ADAPTADOR_VACIO
        : createMarketSeriesAdapter({
            assets: estado.assets,
            baseCurrency: displayCurrency,
            signal: aborto.signal,
          }))

    const fallos = new Map<string, string>()

    try {
      await runQueue(
        tareas,
        async (scope: AnalysisScope) => {
          const entrada: FullAnalysisInput = {
            runId: `${id.full}:${scopeKey(scope)}`,
            fingerprint: id.full,
            structuralFingerprint: id.structural,
            valuationVersion: id.valuation,
            modelConfigFingerprint: id.modelConfig,
            scope,
            asOf,
            baseCurrency: displayCurrency,
            positions: posiciones,
            seriesFor: adaptador.seriesFor,
            seriesFailures: adaptador.failures,
          }
          try {
            return await runFullAnalysis(entrada, (parcial) => {
              if (!vigente()) return // resultDiscarded
              setReports((previos) => new Map(previos).set(scopeKey(scope), parcial))
            })
          } catch (error) {
            if (error instanceof AnalysisAbortedError) throw error
            // `taskFailed`: este ámbito no sale, los demás siguen.
            fallos.set(scopeKey(scope), error instanceof Error ? error.message : 'Error desconocido.')
            return null
          }
        },
        (scope, informe) => {
          if (informe === null) return
          saveReport(informe)
          setReports((previos) => new Map(previos).set(scopeKey(scope), informe))
        },
        vigente,
      )
    } catch (error) {
      // El aborto es una salida normal, no un fallo que haya que enseñar.
      if (!(error instanceof AnalysisAbortedError)) {
        fallos.set('portfolio', error instanceof Error ? error.message : 'Error desconocido.')
      }
    } finally {
      // `running` termina aunque una etapa falle: dejarlo encendido convertiría
      // un fallo puntual en una barra de progreso eterna.
      if (vigente()) {
        setFailures(fallos)
        setRunning(false)
      }
    }
  }, [asOf, configModelo, displayCurrency, estructural, visible])

  useEffect(() => {
    const temporizador = setTimeout(() => {
      void arrancar()
    }, espera)
    return () => clearTimeout(temporizador)
    // `disparador` está en las dependencias a propósito aunque no se use dentro:
    // es lo que define cuándo hay una pregunta nueva.
  }, [arrancar, espera, disparador])

  useEffect(() => () => abortoActual.current?.abort(), [])

  return {
    fingerprint: identidad.full,
    structuralFingerprint: identidad.structural,
    valuationVersion: identidad.valuation,
    reports,
    running,
    failures,
  }
}
