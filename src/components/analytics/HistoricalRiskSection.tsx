import { useMemo, useState } from 'react'
import {
  alignReturns,
  annualizedVolatility,
  betaAlpha,
  correlation,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
} from '../../lib/finance/historical'
import { diversificationMetrics } from '../../lib/finance/diversification'
import {
  alignManyReturns,
  covarianceMatrix,
  portfolioRisk,
  tradingDaysForAsset,
  tradingDaysForPortfolio,
} from '../../lib/finance/portfolioRisk'
import { buildPortfolioView } from '../../lib/portfolio'
import { hasDemoHistoricalSeries } from '../../state/demoHistory'
import { calculatePortfolioTwr } from '../../lib/lab/stability/twr'
import { useStabilityAnalysis } from '../../lib/lab/stability/useStabilityAnalysis'
import { useAppStore } from '../../state/store'
import { Card, Note, Segmented } from '../ui'
import { ContributionBlock } from '../../features/lab/stability/ContributionBlock'
import { DiversificationBlock } from '../../features/lab/stability/DiversificationBlock'
import { PerAssetBlock } from '../../features/lab/stability/PerAssetBlock'
import { RelationsBlock, type MatrixKind } from '../../features/lab/stability/RelationsBlock'
import { StabilityKpis } from '../../features/lab/stability/StabilityKpis'
import type { AssetMetricRow, BenchmarkRow } from '../../features/lab/stability/contracts'

type Period = '90' | '180' | '365'
type RiskView = 'relaciones' | 'activos' | 'contribucion'

export function HistoricalRiskSection() {
  const store = useAppStore()
  const view = useMemo(
    () =>
      buildPortfolioView({
        assets: store.assets,
        accounts: store.accounts,
        transactions: store.transactions,
        quotes: store.quotes,
        fxRates: store.fxRates,
        displayCurrency: store.settings.displayCurrency,
      }),
    [
      store.assets,
      store.accounts,
      store.transactions,
      store.quotes,
      store.fxRates,
      store.settings.displayCurrency,
    ],
  )
  const candidates = useMemo(
    () =>
      view.positions
        .filter((position) => position.quantity.gt(0))
        .map((position) => position.asset)
        .filter(
          (asset) =>
            hasDemoHistoricalSeries(asset.id) ||
            asset.providerIds?.['coingecko'] !== undefined ||
            asset.providerIds?.['twelvedata'] !== undefined,
        ),
    [view.positions],
  )
  // La orquestación de la descarga vive en el hook (LAB-306): esta pantalla ya
  // no sabe que existen proveedores, ni puede publicar una respuesta que llegue
  // tarde. Lo que queda aquí son las dos elecciones puramente visuales.
  const { period, busy, loaded, downloadedFx, missing, benchmarkId, setPeriod, setBenchmarkId, run } =
    useStabilityAnalysis(candidates, store.settings.displayCurrency)
  const [view3, setView3] = useState<RiskView>('relaciones')
  const [matrixKind, setMatrixKind] = useState<MatrixKind>('correlacion')

  const riskFreeRate = Number(store.settings.riskFreeRate) || 0

  const analytics = useMemo(() => {
    if (loaded === null || loaded.length === 0) return null
    const aligned = alignManyReturns(loaded.map((item) => item.returns))
    const periodsPerYear = tradingDaysForPortfolio(
      loaded.map((item) => item.asset.assetType),
    )
    const covariance = covarianceMatrix(aligned.columns, periodsPerYear)
    const valuedLoaded = loaded.flatMap((item) => {
      const position = view.positions.find((candidate) => candidate.asset.id === item.asset.id)
      return position?.value === null || position?.value === undefined
        ? []
        : [{ item, value: Number(position.value.toString()) }]
    })
    const loadedTotal = valuedLoaded.reduce((sum, item) => sum + item.value, 0)
    const weights = loaded.map((item) => {
      const match = valuedLoaded.find((candidate) => candidate.item.asset.id === item.asset.id)
      return loadedTotal > 0 ? (match?.value ?? 0) / loadedTotal : 0
    })
    const risk = covariance.ok ? portfolioRisk(weights, covariance.value) : null
    const requiredAssetIds = new Set(
      view.positions
        .filter((position) => position.quantity.gt(0))
        .map((position) => position.asset.id),
    )
    const twr = calculatePortfolioTwr({
      loaded,
      transactions: store.transactions,
      displayCurrency: store.settings.displayCurrency,
      fxRates: store.fxRates,
      downloadedFx,
      requiredAssetIds,
    })
    const diversification =
      covariance.ok && risk !== null
        ? diversificationMetrics(weights, covariance.value, risk.percentageContributions)
        : null

    return {
      aligned,
      covariance,
      risk,
      diversification,
      weights,
      coverage:
        Number(view.totalValue.toString()) > 0
          ? loadedTotal / Number(view.totalValue.toString())
          : 0,
      twr,
      complete: requiredAssetIds.size === loaded.length && missing.length === 0,
    }
  }, [
    loaded,
    view,
    store.transactions,
    store.settings.displayCurrency,
    store.fxRates,
    downloadedFx,
    missing.length,
  ])

  /**
   * Filas ya resueltas para los bloques de presentación (LAB-307).
   *
   * El cálculo vive aquí y no en los componentes: así los bloques se prueban
   * con un objeto fijo, sin montar una cartera ni descargar nada.
   */
  const assetRows = useMemo<AssetMetricRow[]>(() => {
    if (loaded === null) return []
    return loaded.map((item) => {
      const returns = item.returns.map((point) => point.value)
      const annualization = tradingDaysForAsset(item.asset.assetType)
      const volatility = annualizedVolatility(returns, annualization)
      const drawdown = maxDrawdown(item.series)
      const sharpe = sharpeRatio(returns, riskFreeRate, annualization)
      const sortino = sortinoRatio(returns, riskFreeRate, annualization)
      return {
        assetId: item.asset.id,
        symbol: item.asset.symbol,
        name: item.asset.name,
        provider: item.provider,
        volatility: volatility.ok ? volatility.value : null,
        maxDrawdown: drawdown.ok ? drawdown.value.maxDrawdown : null,
        sharpe: sharpe.ok ? sharpe.value : null,
        sortino: sortino.ok ? sortino.value : null,
      }
    })
  }, [loaded, riskFreeRate])

  const benchmarkRows = useMemo<BenchmarkRow[]>(() => {
    const benchmark = loaded?.find((item) => item.asset.id === benchmarkId) ?? null
    if (loaded === null || benchmark === null) return []
    return loaded
      .filter((item) => item.asset.id !== benchmark.asset.id)
      .map((item) => {
        const alignedPair = alignReturns(item.returns, benchmark.returns)
        const regression = betaAlpha(
          alignedPair.a,
          alignedPair.b,
          tradingDaysForPortfolio([item.asset.assetType, benchmark.asset.assetType]),
        )
        return {
          assetId: item.asset.id,
          symbol: item.asset.symbol,
          beta: regression.ok ? regression.value.beta : null,
          alpha: regression.ok ? regression.value.alpha : null,
          r2: regression.ok ? regression.value.r2 : null,
          observations: alignedPair.a.length,
        }
      })
  }, [loaded, benchmarkId])

  /** Matriz de correlación completa, lista para pintar. */
  const correlationMatrix = useMemo<(number | null)[][]>(() => {
    if (loaded === null) return []
    return loaded.map((row) =>
      loaded.map((column) => {
        if (row.asset.id === column.asset.id) return 1
        const alignedPair = alignReturns(row.returns, column.returns)
        const result = correlation(alignedPair.a, alignedPair.b)
        return result.ok ? result.value : null
      }),
    )
  }, [loaded])

  /**
   * Conclusiones automáticas en lenguaje natural sobre los pares de activos:
   * lo que un inversor necesita saber sin leer la matriz casilla a casilla.
   */
  const pairInsights = useMemo<{ kind: 'warning' | 'info'; text: string }[]>(() => {
    if (loaded === null || loaded.length < 2) return []
    const pairs: { a: string; b: string; value: number }[] = []
    for (let i = 0; i < loaded.length; i++) {
      for (let j = i + 1; j < loaded.length; j++) {
        const rowItem = loaded[i]!
        const colItem = loaded[j]!
        const alignedPair = alignReturns(rowItem.returns, colItem.returns)
        const result = correlation(alignedPair.a, alignedPair.b)
        if (result.ok) {
          pairs.push({ a: rowItem.asset.symbol, b: colItem.asset.symbol, value: result.value })
        }
      }
    }
    if (pairs.length === 0) return []
    const out: { kind: 'warning' | 'info'; text: string }[] = []

    const highest = [...pairs].sort((x, y) => y.value - x.value)[0]!
    if (highest.value >= 0.9) {
      out.push({
        kind: 'warning',
        text: `${highest.a} y ${highest.b} se han movido casi como un mismo activo (${highest.value.toFixed(2)}). Tenerlos por separado diversifica poco.`,
      })
    } else if (highest.value >= 0.7) {
      out.push({
        kind: 'info',
        text: `Lo más parecido de tu cartera es ${highest.a} con ${highest.b} (${highest.value.toFixed(2)}): suben y bajan bastante a la vez.`,
      })
    }

    const lowest = [...pairs].sort((x, y) => x.value - y.value)[0]!
    if (lowest.value < 0.3) {
      out.push({
        kind: 'info',
        text: `${lowest.a} y ${lowest.b} apenas se siguen (${lowest.value.toFixed(2)}): es la pareja que más te reparte el riesgo.`,
      })
    }
    return out
  }, [loaded])

  if (candidates.length === 0) {
    return (
      <Card title="Riesgo y diversificación">
        <Note kind="info">
          Añade proveedores a tus activos para calcular volatilidad, covarianzas y contribución al
          riesgo. No se generan números a partir de activos manuales sin histórico.
        </Note>
      </Card>
    )
  }

  return (
    <Card title="Riesgo y diversificación">
      <div className="analytics-toolbar">
        <div>
          <span className="eyebrow">Histórico en {store.settings.displayCurrency}</span>
          <p className="muted mb-0">
            Precios y cambios FX alineados por fecha. El pasado describe riesgo; no predice retornos.
          </p>
        </div>
        <div className="row">
          <Segmented<Period>
            label="Ventana"
            value={period}
            onChange={setPeriod}
            options={[
              { value: '90', label: '90 d' },
              { value: '180', label: '6 m' },
              { value: '365', label: '1 a' },
            ]}
          />
          <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
            {busy ? 'Analizando…' : loaded === null ? 'Analizar cartera' : 'Actualizar análisis'}
          </button>
        </div>
      </div>

      {loaded?.some((item) => item.asset.isDemo === true) && (
        <Note kind="info">
          Las series de Demostración sintética son ficticias y reproducibles: sirven para probar
          la analítica sin claves externas. No son cotizaciones reales ni predicciones.
        </Note>
      )}

      {missing.length > 0 && (
        <Note kind="warning">
          Sin histórico convertible para {missing.join(', ')}. Las métricas de cartera muestran
          cobertura parcial y no se presentan como completas.
        </Note>
      )}

      {loaded !== null && analytics !== null && (
        <>
          <StabilityKpis
            data={{
              complete: analytics.complete,
              volatility: analytics.risk === null ? null : analytics.risk.volatility,
              coverage: analytics.coverage,
              twr: analytics.twr,
              commonDays: analytics.aligned.dates.length,
            }}
          />

          {analytics.diversification !== null && (
            <DiversificationBlock data={analytics.diversification} />
          )}

          {/* Una vista cada vez: antes se mostraba todo junto y no se leía nada. */}
          <div className="risk-views">
            <Segmented<RiskView>
              label="Qué quieres ver"
              hideLabel
              value={view3}
              onChange={setView3}
              options={[
                { value: 'relaciones', label: 'Cómo se relacionan' },
                { value: 'contribucion', label: 'Quién aporta el riesgo' },
                { value: 'activos', label: 'Activo por activo' },
              ]}
            />
          </div>

          {view3 === 'relaciones' && loaded.length > 1 && (
            <RelationsBlock
              labels={loaded.map((item) => item.asset.symbol)}
              correlation={correlationMatrix}
              covariance={analytics.covariance.ok ? analytics.covariance.value : null}
              insights={pairInsights}
              kind={matrixKind}
              onKindChange={setMatrixKind}
            />
          )}

          {view3 === 'contribucion' && analytics.risk !== null && (
            <ContributionBlock
              rows={loaded.map((item, index) => ({
                assetId: item.asset.id,
                symbol: item.asset.symbol,
                weight: analytics.weights[index] ?? 0,
                // `percentageContributions` ya viene como fracción (suma 1),
                // pese a su nombre: no hay que dividir otra vez.
                contribution: analytics.risk?.percentageContributions[index] ?? 0,
              }))}
            />
          )}

          {view3 === 'activos' && (
            <PerAssetBlock
              rows={assetRows}
              benchmarkId={benchmarkId}
              onBenchmarkChange={setBenchmarkId}
              benchmarkRows={benchmarkRows}
            />
          )}
        </>
      )}

      {loaded !== null && loaded.length === 0 && (
        <Note kind="warning">
          Los proveedores no devolvieron series utilizables. No se muestran métricas estimadas.
        </Note>
      )}
    </Card>
  )
}
