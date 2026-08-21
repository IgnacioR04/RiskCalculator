/**
 * Escenarios (LAB-508).
 *
 * «¿Qué le pasa a mi cartera si…?». El orden de la página va de la respuesta a
 * sus condiciones: primero el número, después de qué depende, después quién lo
 * produce y por último qué supuesto manda.
 *
 * Los escenarios históricos se quedan fuera de esta pantalla mientras no haya
 * series descargadas aquí: enseñarlos sin datos daría un «no se puede calcular»
 * repetido que no informa de nada. El motor está construido y probado
 * (`LAB-503`); lo que falta es engancharle la adquisición, y eso es trabajo de
 * la pantalla, no del cálculo.
 *
 * La página no calcula: junta el store con cuatro bloques puros.
 */
import { useMemo, useState } from 'react'
import { Card, Note } from '../../../components/ui'
import { buildPortfolioView } from '../../../lib/portfolio'
import type { StressPosition } from '../../../lib/finance/stress'
import {
  builtinDeterministicScenarios,
  runDeterministicScenario,
} from '../../../lib/lab/scenarios/deterministicScenario'
import { scenarioSensitivity } from '../../../lib/lab/scenarios/scenarioSensitivity'
import { alignReturns } from '../../../lib/lab/scenarios/bootstrapOutcome'
import { hasDemoHistoricalSeries } from '../../../state/demoHistory'
import { useStabilityAnalysis } from '../../../lib/lab/stability/useStabilityAnalysis'
import { SimularContenido } from '../../../pages/SimularPage'
import { useAppStore } from '../../../state/store'
import { LabShell } from '../components/LabShell'
import { BootstrapBlock } from '../scenarios/BootstrapBlock'
import { useBootstrapRun } from '../scenarios/useBootstrapRun'
import {
  AssumptionsBlock,
  ContributionsBlock,
  ScenarioOutcomeBlock,
  ScenarioPicker,
  SensitivityBlock,
} from '../scenarios/ScenarioBlocks'

/**
 * Longitud del bloque, en días hábiles.
 *
 * Un mes de mercado. Es el mismo compromiso que documenta `blockBootstrap`:
 * suficientemente largo para conservar una racha de volatilidad dentro del
 * bloque, suficientemente corto para que con un año de historia salgan bloques
 * distintos y no cuatro trozos siempre iguales. No se ofrece como control: sería
 * un mando que casi nadie puede juzgar y que cambia el resultado.
 */
const BLOQUE_DIAS = 20

/**
 * Semilla fija.
 *
 * Que sea fija es lo que hace comparables dos ejecuciones seguidas: si cambiara
 * sola, mover el horizonte y ver otro abanico no diría si cambió por el
 * horizonte o por el azar. Se enseña en pantalla, y con ella el resultado se
 * reproduce.
 */
const SEMILLA = 20260820

export function LabScenariosPage() {
  const store = useAppStore()
  const displayCurrency = store.settings.displayCurrency

  const escenarios = useMemo(() => builtinDeterministicScenarios(), [])
  // Se calcula al elegir, no al pulsar. Un escenario determinista cuesta
  // 0,23 ms medidos: no hay nada que diferir, y el botón solo servía para
  // dejar la pantalla en blanco hasta que alguien lo encontrara.
  const [elegido, setElegido] = useState(escenarios[0]?.id ?? '')

  const { posiciones, sinValorar } = useMemo(() => {
    const vista = buildPortfolioView({
      assets: store.assets,
      accounts: store.accounts,
      transactions: store.transactions,
      quotes: store.quotes,
      fxRates: store.fxRates,
      displayCurrency,
    })

    const conCantidad = vista.positions.filter((p) => p.quantity.gt(0))
    return {
      posiciones: conCantidad
        .filter((p) => p.value !== null)
        .map<StressPosition>((p) => ({
          assetId: p.asset.id,
          symbol: p.asset.symbol,
          assetType: p.asset.assetType,
          quoteCurrency: p.asset.quoteCurrency,
          value: p.value!.toString(),
        })),
      // Una posición sin precio no se estresa ni se cuenta como cero: se nombra.
      sinValorar: conCantidad.filter((p) => p.value === null).map((p) => p.asset.symbol),
    }
  }, [store.assets, store.accounts, store.transactions, store.quotes, store.fxRates, displayCurrency])

  /* ── Bootstrap (LAB-1014) ───────────────────────────────────────────────── */

  const candidatosHistoria = useMemo(
    () =>
      store.assets.filter(
        (a) =>
          a.assetType !== 'cash' &&
          posiciones.some((p) => p.assetId === a.id) &&
          (hasDemoHistoricalSeries(a.id) ||
            a.providerIds?.['coingecko'] !== undefined ||
            a.providerIds?.['twelvedata'] !== undefined),
      ),
    [store.assets, posiciones],
  )

  const { loaded, busy: descargando } = useStabilityAnalysis(
    candidatosHistoria,
    displayCurrency,
  )

  const [horizonte, setHorizonte] = useState(252)
  const [trayectorias, setTrayectorias] = useState(1_000)
  const bootstrap = useBootstrapRun()

  const historia = useMemo(() => {
    if (loaded === null || loaded.length === 0) return null
    const alineado = alignReturns(
      loaded.map((item) => ({
        id: item.asset.id,
        label: item.asset.symbol,
        returns: item.returns,
      })),
    )
    // El valor va en el mismo orden que las columnas: si se desordenara, cada
    // activo evolucionaría con la historia de otro y nada fallaría.
    const porId = new Map(posiciones.map((p) => [p.assetId, Number(p.value)]))
    return { alineado, values: alineado.ids.map((id) => porId.get(id) ?? 0) }
  }, [loaded, posiciones])

  const analisis = useMemo(() => {
    if (elegido === '') return null
    const definicion = escenarios.find((d) => d.id === elegido)
    if (definicion === undefined) return null

    const hoy = new Date().toISOString().slice(0, 10)
    const resultado = runDeterministicScenario({
      definition: definicion,
      positions: posiciones,
      displayCurrency,
      asOf: hoy,
      ...(sinValorar.length === 0 ? {} : { unvalued: sinValorar }),
    })

    return {
      definicion,
      resultado,
      sensibilidad: scenarioSensitivity(definicion, (d) =>
        d.params.kind !== 'deterministic'
          ? null
          : runDeterministicScenario({
              definition: d,
              positions: posiciones,
              displayCurrency,
              asOf: hoy,
            }).outcome.changePct,
      ),
    }
  }, [elegido, escenarios, posiciones, sinValorar, displayCurrency])

  if (posiciones.length === 0) {
    return (
      <LabShell routeId="lab.future.scenarios">
        <Card title="Hace falta una cartera valorada">
          <p className="muted mb-0">
            Un escenario aplica un supuesto sobre lo que tienes. Sin posiciones con precio no hay
            nada sobre lo que aplicarlo. Carga los datos de demostración o añade posiciones.
          </p>
        </Card>
        <SimularContenido />
      </LabShell>
    )
  }

  return (
    <LabShell routeId="lab.future.scenarios">
      <ScenarioPicker
        scenarios={escenarios}
        selectedId={elegido}
        onSelect={setElegido}
      />

      {analisis === null ? null : (
        <>
          <ScenarioOutcomeBlock result={analisis.resultado} name={analisis.definicion.name} />
          <AssumptionsBlock assumptions={analisis.resultado.assumptions} />
          <SensitivityBlock sensitivity={analisis.sensibilidad} />
          <ContributionsBlock result={analisis.resultado} />

          <Note kind="info">
            Esto no es una previsión ni una probabilidad. Es aritmética sobre un supuesto que has
            elegido tú: dice qué pasaría <em>si</em> ocurriera, no si va a ocurrir.
          </Note>
        </>
      )}

      {/* El bootstrap por bloques, que hasta LAB-1014 estaba construido y no se
          enseñaba: ADR-006 exigía worker, cancelación y progreso antes de
          exponerlo, y hasta ahora no los tenía. */}
      {candidatosHistoria.length === 0 ? null : historia === null ? (
        <Card
          title="Muchos futuros posibles"
          sub="Remuestreo por bloques de tu propia historia, no una campana de Gauss"
        >
          <p className="muted mb-0">
            {descargando
              ? 'Descargando tu historial para poder remuestrearlo.'
              : 'Todavía no ha llegado historial de tus posiciones. Revisa en Cartera que estén enlazadas con un proveedor.'}
          </p>
        </Card>
      ) : (
        <BootstrapBlock
          state={bootstrap.state}
          availableDays={historia.alineado.rows.length}
          horizonDays={horizonte}
          paths={trayectorias}
          blockDays={BLOQUE_DIAS}
          currency={displayCurrency}
          onHorizonChange={setHorizonte}
          onPathsChange={setTrayectorias}
          onCancel={bootstrap.cancel}
          onRun={() =>
            bootstrap.run({
              history: historia.alineado.rows,
              values: historia.values,
              blockDays: BLOQUE_DIAS,
              horizonDays: horizonte,
              paths: trayectorias,
              seed: SEMILLA,
            })
          }
        />
      )}

      {/* El simulador de siempre sigue aquí: `/simular` redirige a esta ruta
          desde LAB-107, y quitarlo se llevaría por delante el simulador de
          aportaciones hipotéticas, que esta pantalla no cubre. El motor de
          escenarios lo complementa, no lo sustituye. */}
      <SimularContenido />
    </LabShell>
  )
}
