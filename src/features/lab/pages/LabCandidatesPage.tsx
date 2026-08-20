/**
 * Carteras candidatas (LAB-612).
 *
 * Enseña alternativas a la cartera actual, medidas todas con el mismo motor.
 * **Ninguna viene marcada como la mejor**: elegir entre menos riesgo, menos
 * coste y menos concentración depende de cosas que la aplicación no sabe.
 *
 * El orden va de lo que impide responder a lo que responde: primero por qué no
 * hay solución, si es el caso; después qué reglas no se han podido comprobar;
 * después la comparación; y al final si esos pesos son una decisión o son ruido.
 *
 * La página no calcula: junta el store con `runCandidates` y cuatro bloques
 * puros.
 */
import { useMemo, useState } from 'react'
import { Card, Note } from '../../../components/ui'
import { alignManyReturns, covarianceMatrix } from '../../../lib/finance/portfolioRisk'
import { tradingDaysForPortfolio } from '../../../lib/finance/portfolioRisk'
import { buildPortfolioView } from '../../../lib/portfolio'
import {
  RUN_ERROR_TEXT,
  runCandidates,
} from '../../../lib/lab/candidates/candidateRun'
import type { CompilerInstrument } from '../../../lib/lab/candidates/constraintCompiler'
import { hasDemoHistoricalSeries } from '../../../state/demoHistory'
import { useStabilityAnalysis } from '../../../lib/lab/stability/useStabilityAnalysis'
import { useAppStore } from '../../../state/store'
import { LabShell } from '../components/LabShell'
import {
  CandidateComparisonTable,
  CandidateStabilityPanel,
  CoverageBlock,
  InfeasibleBlock,
  WeightsTable,
} from '../candidates/CandidateBlocks'

/** Semilla fija: dos visitas seguidas tienen que dar el mismo análisis. */
const SEED = 20260820

export function LabCandidatesPage() {
  const store = useAppStore()
  const displayCurrency = store.settings.displayCurrency
  const [calculado, setCalculado] = useState(false)

  const view = useMemo(
    () =>
      buildPortfolioView({
        assets: store.assets,
        accounts: store.accounts,
        transactions: store.transactions,
        quotes: store.quotes,
        fxRates: store.fxRates,
        displayCurrency,
      }),
    [store.assets, store.accounts, store.transactions, store.quotes, store.fxRates, displayCurrency],
  )

  const candidatos = useMemo(
    () =>
      view.positions
        .filter((p) => p.quantity.gt(0) && p.value !== null && p.asset.assetType !== 'cash')
        .filter(
          (p) =>
            hasDemoHistoricalSeries(p.asset.id) ||
            p.asset.providerIds?.['coingecko'] !== undefined ||
            p.asset.providerIds?.['twelvedata'] !== undefined,
        )
        .map((p) => p.asset),
    [view.positions],
  )

  const { loaded, busy, run } = useStabilityAnalysis(candidatos, displayCurrency)

  const analisis = useMemo(() => {
    if (!calculado) return null

    const posiciones = view.positions.filter(
      (p) => p.quantity.gt(0) && p.value !== null && p.asset.assetType !== 'cash',
    )
    if (posiciones.length < 2) return null

    const total = posiciones.reduce((s, p) => s + p.value!.toNumber(), 0)
    const universe: CompilerInstrument[] = posiciones.map((p) => ({
      id: p.asset.id,
      symbol: p.asset.symbol,
      dimensions: {
        assetType: p.asset.assetType,
        ...(p.asset.sector === undefined ? {} : { sector: p.asset.sector }),
        ...(p.asset.country === undefined ? {} : { region: p.asset.country }),
        currency: p.asset.quoteCurrency,
      },
      currentWeight: total > 0 ? p.value!.toNumber() / total : 0,
    }))

    // La covarianza solo se puede estimar con las series que se hayan
    // descargado, y **en el mismo orden que el universo**: si no coincidieran,
    // cada peso hablaría de otro activo.
    let covariance: number[][] | null = null
    if (loaded !== null && loaded.length === universe.length) {
      const enOrden = universe.map((u) => loaded.find((l) => l.asset.id === u.id))
      if (enOrden.every((x) => x !== undefined)) {
        const alineadas = alignManyReturns(enOrden.map((x) => x!.returns))
        const cov = covarianceMatrix(
          alineadas.columns,
          tradingDaysForPortfolio(enOrden.map((x) => x!.asset.assetType)),
        )
        if (cov.ok) covariance = cov.value.map((fila) => [...fila])
      }
    }

    return runCandidates({
      universe,
      // Las restricciones salen de la política **vigente**, no del borrador: un
      // borrador es lo que el usuario está pensando, no lo que ha decidido.
      constraints: store.labPolicyActive?.constraints ?? [],
      currentWeights: universe.map((u) => u.currentWeight),
      totalValue: total,
      covariance,
      seed: SEED,
    })
  }, [calculado, view.positions, loaded, store.labPolicyActive])

  if (candidatos.length < 2) {
    return (
      <LabShell routeId="lab.future.candidates">
        <Card title="Hacen falta al menos dos posiciones con historial">
          <p className="muted mb-0">
            Una cartera candidata reparte entre lo que tienes. Con menos de dos posiciones
            valoradas y con historial no hay nada que repartir. Carga los datos de demostración o
            añade posiciones.
          </p>
        </Card>
      </LabShell>
    )
  }

  return (
    <LabShell routeId="lab.future.candidates">
      <Card
        title="Alternativas a tu cartera"
        sub="Carteras que cumplen tus reglas y optimizan un criterio concreto"
      >
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            void run().then(() => setCalculado(true))
          }}
        >
          {busy ? 'Calculando…' : 'Ver alternativas'}
        </button>
      </Card>

      {analisis === null ? (
        <Card title="Todavía no se ha calculado">
          <p className="muted mb-0">
            Pulsa «Ver alternativas» para descargar el historial y construirlas. No se muestra
            ninguna cifra antes de calcularla.
          </p>
        </Card>
      ) : (
        <>
          {analisis.errors.map((codigo) => (
            <Note key={codigo} kind="warning">
              {RUN_ERROR_TEXT[codigo]}
            </Note>
          ))}

          {!analisis.feasibility.feasible && (
            <InfeasibleBlock feasibility={analisis.feasibility} />
          )}

          <CoverageBlock issues={analisis.compiled.issues} />

          {analisis.metrics !== null && (
            <>
              <CandidateComparisonTable
                metrics={analisis.metrics}
                currency={displayCurrency}
                universeSymbols={analisis.compiled.universe.map((u) => u.symbol)}
              />
              <WeightsTable
                metrics={analisis.metrics}
                currency={displayCurrency}
                universeSymbols={analisis.compiled.universe.map((u) => u.symbol)}
              />
            </>
          )}

          {analisis.robustness !== null && (
            <CandidateStabilityPanel robustness={analisis.robustness} />
          )}

          <Note kind="info">{analisis.disclaimer}</Note>
        </>
      )}
    </LabShell>
  )
}
