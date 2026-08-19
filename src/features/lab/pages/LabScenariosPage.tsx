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
import { SimularContenido } from '../../../pages/SimularPage'
import { useAppStore } from '../../../state/store'
import { LabShell } from '../components/LabShell'
import {
  AssumptionsBlock,
  ContributionsBlock,
  ScenarioOutcomeBlock,
  ScenarioPicker,
  SensitivityBlock,
} from '../scenarios/ScenarioBlocks'

export function LabScenariosPage() {
  const store = useAppStore()
  const displayCurrency = store.settings.displayCurrency

  const escenarios = useMemo(() => builtinDeterministicScenarios(), [])
  const [elegido, setElegido] = useState(escenarios[0]?.id ?? '')
  const [ejecutado, setEjecutado] = useState<string | null>(null)

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

  const analisis = useMemo(() => {
    if (ejecutado === null) return null
    const definicion = escenarios.find((d) => d.id === ejecutado)
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
  }, [ejecutado, escenarios, posiciones, sinValorar, displayCurrency])

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
        onRun={() => setEjecutado(elegido)}
      />

      {analisis === null ? (
        <Card title="Todavía no se ha calculado">
          <p className="muted mb-0">
            Elige un escenario y pulsa «Ver qué pasaría». No se muestra ninguna cifra antes de
            calcularla.
          </p>
        </Card>
      ) : (
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

      {/* El simulador de siempre sigue aquí: `/simular` redirige a esta ruta
          desde LAB-107, y quitarlo se llevaría por delante el simulador de
          aportaciones hipotéticas, que esta pantalla no cubre. El motor de
          escenarios lo complementa, no lo sustituye. */}
      <SimularContenido />
    </LabShell>
  )
}
