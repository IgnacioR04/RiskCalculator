import { useEffect, useMemo, useRef, useState } from 'react'
import type { Asset } from '../../lib/domain'
import {
  alignReturns,
  annualizedVolatility,
  betaAlpha,
  correlation,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
  type SeriesPoint,
} from '../../lib/finance/historical'
import { describeDiversification, diversificationMetrics } from '../../lib/finance/diversification'
import {
  alignManyReturns,
  covarianceMatrix,
  portfolioRisk,
  tradingDaysForAsset,
  tradingDaysForPortfolio,
} from '../../lib/finance/portfolioRisk'
import { formatPct } from '../../lib/format'
import { buildPortfolioView } from '../../lib/portfolio'
import { historicalFxSeries } from '../../lib/market/service'
import { fetchSeries } from '../../lib/lab/stability/acquisition'
import { hasDemoHistoricalSeries } from '../../state/demoHistory'
import { calculatePortfolioTwr } from '../../lib/lab/stability/twr'
import { useAppStore } from '../../state/store'
import { RiskMatrix } from '../charts/RiskMatrix'
import { RiskContributionChart } from '../charts/RiskContributionChart'
import { Card, Kpi, Note, Segmented } from '../ui'

type Period = '90' | '180' | '365'
type RiskView = 'relaciones' | 'activos' | 'contribucion'
type MatrixKind = 'correlacion' | 'covarianza'

interface AssetSeries {
  asset: Asset
  series: SeriesPoint[]
  returns: { date: string; value: number }[]
  provider: string
}

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
  const [period, setPeriod] = useState<Period>('365')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState<AssetSeries[] | null>(null)
  const [downloadedFx, setDownloadedFx] = useState<{ date: string; rate: number }[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [benchmarkId, setBenchmarkId] = useState('')
  const [view3, setView3] = useState<RiskView>('relaciones')
  const [matrixKind, setMatrixKind] = useState<MatrixKind>('correlacion')
  const autoRan = useRef(false)

  async function run() {
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
          asset.quoteCurrency !== store.settings.displayCurrency &&
          !(asset.isDemo === true && hasDemoHistoricalSeries(asset.id)),
      )
      if (needsDownloadedFx) {
        try {
          fx = await historicalFxSeries(
            store.settings.displayCurrency === 'EUR' ? 'USD' : 'EUR',
            store.settings.displayCurrency,
            start.toISOString().slice(0, 10),
            end.toISOString().slice(0, 10),
          )
        } catch {
          // Solo sera bloqueante para activos en la otra divisa.
        }
      }
      setDownloadedFx(fx)
      const results = await Promise.all(
        candidates.map((asset) =>
          fetchSeries(asset, days, store.settings.displayCurrency, fx),
        ),
      )
      const available = results.filter((result): result is AssetSeries => result !== null)
      setLoaded(available)
      setMissing(
        candidates
          .filter((asset) => !available.some((item) => item.asset.id === asset.id))
          .map((asset) => asset.symbol),
      )
      const defaultBenchmark =
        available.find((item) => item.asset.symbol === 'SXR8') ?? available[0]
      if (defaultBenchmark !== undefined) setBenchmarkId(defaultBenchmark.asset.id)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (autoRan.current || candidates.length === 0) return
    autoRan.current = true
    void run()
    // Solo en el primer montaje (autoRan): despues manda el usuario con la ventana.
  }, [candidates.length])

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

  const riskFreeRate = Number(store.settings.riskFreeRate) || 0
  const benchmark = loaded?.find((item) => item.asset.id === benchmarkId) ?? null

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
          <div className="kpi-row analytics-kpis">
            <Kpi
              label={analytics.complete ? 'Volatilidad de cartera' : 'Volatilidad del segmento'}
              hint="Cuánto oscila el conjunto en un año, teniendo en cuenta que los activos no se mueven a la vez."
            >
              {analytics.risk === null ? 'Datos insuf.' : formatPct(analytics.risk.volatility, 1)}
            </Kpi>
            <Kpi label="Cobertura analizada" hint="Parte del valor de tu cartera incluida en este análisis.">
              {formatPct(analytics.coverage, 0)}
            </Kpi>
            <Kpi label="TWR del periodo" hint="Rentabilidad ponderada por tiempo: aísla el efecto de cuándo aportaste.">
              {analytics.twr === null ? 'No disp.' : formatPct(analytics.twr, 1)}
            </Kpi>
            <Kpi label="Muestra común" hint="Días con precio en todos los activos analizados.">
              {analytics.aligned.dates.length} días
            </Kpi>
          </div>

          {analytics.diversification !== null && (
            <section className="risk-block mt-3">
              <div className="card-title">¿Estás diversificando de verdad?</div>
              <p className="card-sub">
                No basta con tener muchos activos: lo que cuenta es que no se muevan todos a la vez.
              </p>
              <div className="div-metrics">
                <div className="div-metric">
                  <span className="label">Ratio de diversificación</span>
                  <span className="figure">
                    {analytics.diversification.diversificationRatio.toFixed(2).replace('.', ',')}
                  </span>
                  <p>
                    1,00 sería no diversificar nada. Compara la volatilidad que tendrías si todo se
                    moviera junto con la que tienes.
                  </p>
                </div>
                <div className="div-metric">
                  <span className="label">Riesgo que te ahorras</span>
                  <span className="figure">
                    {formatPct(analytics.diversification.volatilityReduction, 1)}
                  </span>
                  <p>
                    Parte de la volatilidad que desaparece solo por repartir, en lugar de tenerlo
                    todo en un único activo.
                  </p>
                </div>
                <div className="div-metric">
                  <span className="label">Apuestas reales de riesgo</span>
                  <span className="figure">
                    {analytics.diversification.effectiveBets === null
                      ? '—'
                      : analytics.diversification.effectiveBets.toFixed(1).replace('.', ',')}
                  </span>
                  <p>
                    Entre cuántas fuentes de riesgo independientes está repartido de verdad. Diez
                    activos que se mueven igual son una sola apuesta.
                  </p>
                </div>
                <div className="div-metric">
                  <span className="label">Correlación media</span>
                  <span className="figure">
                    {analytics.diversification.averageCorrelation === null
                      ? '—'
                      : analytics.diversification.averageCorrelation.toFixed(2).replace('.', ',')}
                  </span>
                  <p>
                    Lo parecidos que son entre sí tus activos, de media. Cuanto más bajo, mejor
                    reparten el riesgo.
                  </p>
                </div>
              </div>
              <div
                className={
                  'note ' +
                  (describeDiversification(analytics.diversification.diversificationRatio).level ===
                  'ok'
                    ? 'info'
                    : 'warning')
                }
              >
                <span className="note-glyph" aria-hidden="true">
                  {describeDiversification(analytics.diversification.diversificationRatio).level ===
                  'ok'
                    ? '◆'
                    : '▲'}
                </span>
                <span>
                  {describeDiversification(analytics.diversification.diversificationRatio).text}{' '}
                  Sin repartir, tu volatilidad sería{' '}
                  <strong>
                    {formatPct(analytics.diversification.weightedAverageVolatility, 1)}
                  </strong>
                  ; repartiendo se queda en{' '}
                  <strong>{formatPct(analytics.diversification.portfolioVolatility, 1)}</strong>.
                </span>
              </div>
            </section>
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
            <section className="risk-block">
              <div className="card-head">
                <div>
                  <div className="card-title">
                    {matrixKind === 'correlacion' ? 'Cómo se mueven entre sí' : 'Cuánto riesgo comparten'}
                  </div>
                  <div className="card-sub">
                    {matrixKind === 'correlacion'
                      ? 'Pasa el ratón por una casilla y te lo explico en una frase.'
                      : 'Covarianza anualizada: relación y magnitud del riesgo a la vez.'}
                  </div>
                </div>
                <Segmented<MatrixKind>
                  label="Tipo de matriz"
                  hideLabel
                  value={matrixKind}
                  onChange={setMatrixKind}
                  options={[
                    { value: 'correlacion', label: 'Correlación' },
                    { value: 'covarianza', label: 'Covarianza' },
                  ]}
                />
              </div>

              {matrixKind === 'correlacion' ? (
                <RiskMatrix
                  mode="correlacion"
                  labels={loaded.map((item) => item.asset.symbol)}
                  values={correlationMatrix}
                />
              ) : analytics.covariance.ok ? (
                <RiskMatrix
                  mode="covarianza"
                  labels={loaded.map((item) => item.asset.symbol)}
                  values={analytics.covariance.value.map((row) => row.map((value) => value))}
                />
              ) : (
                <Note kind="info">Se necesitan al menos 30 retornos comunes.</Note>
              )}

              {pairInsights.length > 0 && (
                <div className="stack mt-3">
                  {pairInsights.map((insight) => (
                    <div key={insight.text} className={'note ' + insight.kind}>
                      <span className="note-glyph" aria-hidden="true">
                        {insight.kind === 'warning' ? '▲' : '◆'}
                      </span>
                      <span>{insight.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {view3 === 'contribucion' && analytics.risk !== null && (
            <section className="risk-block">
              <div className="card-title">Quién aporta el riesgo</div>
              <p className="card-sub">
                Un activo puede pesar poco en euros y dominar el riesgo. Las barras negativas indican
                efecto diversificador en esta muestra.
              </p>
              <RiskContributionChart
                data={loaded.map((item, index) => ({
                  label: item.asset.symbol,
                  contribution: analytics.risk!.percentageContributions[index] ?? 0,
                }))}
              />
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Activo</th>
                      <th scope="col">Pesa</th>
                      <th scope="col">Aporta de riesgo</th>
                      <th scope="col">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loaded.map((item, index) => {
                      const weight = analytics.weights[index] ?? 0
                      // percentageContributions ya viene como fracción (suma 1),
                      // pese a su nombre: no hay que dividir otra vez.
                      const contribution = analytics.risk!.percentageContributions[index] ?? 0
                      const delta = contribution - weight
                      return (
                        <tr key={item.asset.id}>
                          <td>{item.asset.symbol}</td>
                          <td className="num">{formatPct(weight, 1)}</td>
                          <td className="num">{formatPct(contribution, 1)}</td>
                          <td className="num">
                            <span
                              className={
                                delta > 0.02 ? 'negative' : delta < -0.02 ? 'positive' : undefined
                              }
                            >
                              {delta >= 0 ? '+' : ''}
                              {formatPct(delta, 1)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="meta mb-0">
                En rojo, aporta más riesgo del que pesa. En verde, amortigua.
              </p>
            </section>
          )}

          {view3 === 'activos' && (
            <section className="risk-block">
              <div className="card-title">Activo por activo</div>
              <p className="card-sub">
                Volatilidad y caída máxima del periodo, con la fuente de cada serie.
              </p>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Activo</th>
                      <th scope="col">Volatilidad</th>
                      <th scope="col">Caída máxima</th>
                      <th scope="col">Sharpe</th>
                      <th scope="col">Sortino</th>
                      <th scope="col">Fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loaded.map((item) => {
                      const returns = item.returns.map((point) => point.value)
                      const annualization = tradingDaysForAsset(item.asset.assetType)
                      const volatility = annualizedVolatility(returns, annualization)
                      const drawdown = maxDrawdown(item.series)
                      const sharpe = sharpeRatio(returns, riskFreeRate, annualization)
                      const sortino = sortinoRatio(returns, riskFreeRate, annualization)
                      return (
                        <tr key={item.asset.id}>
                          <td>
                            <strong>{item.asset.symbol}</strong>
                            <div className="meta">{item.asset.name}</div>
                          </td>
                          <td className="num">
                            {volatility.ok ? formatPct(volatility.value, 1) : '—'}
                          </td>
                          <td className="num negative">
                            {drawdown.ok ? formatPct(drawdown.value.maxDrawdown, 1) : '—'}
                          </td>
                          <td className="num">{sharpe.ok ? sharpe.value.toFixed(2) : '—'}</td>
                          <td className="num">{sortino.ok ? sortino.value.toFixed(2) : '—'}</td>
                          <td>
                            <span className="meta">{item.provider}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <details className="disclose mt-3">
                <summary>Beta y alpha frente a un benchmark</summary>
                <div className="disclose-body">
                  <div className="field compact-field">
                    <label htmlFor="benchmark-select">Benchmark de comparación</label>
                    <select
                      id="benchmark-select"
                      value={benchmarkId}
                      onChange={(event) => setBenchmarkId(event.target.value)}
                    >
                      {loaded.map((item) => (
                        <option key={item.asset.id} value={item.asset.id}>
                          {item.asset.symbol}
                        </option>
                      ))}
                    </select>
                  </div>
                  {benchmark !== null && (
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th scope="col">Activo</th>
                            <th scope="col">Beta</th>
                            <th scope="col">Alpha anual</th>
                            <th scope="col">R²</th>
                            <th scope="col">Obs.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loaded
                            .filter((item) => item.asset.id !== benchmark.asset.id)
                            .map((item) => {
                              const alignedPair = alignReturns(item.returns, benchmark.returns)
                              const regression = betaAlpha(
                                alignedPair.a,
                                alignedPair.b,
                                tradingDaysForPortfolio([
                                  item.asset.assetType,
                                  benchmark.asset.assetType,
                                ]),
                              )
                              return (
                                <tr key={item.asset.id}>
                                  <td>{item.asset.symbol}</td>
                                  <td className="num">
                                    {regression.ok ? regression.value.beta.toFixed(2) : '—'}
                                  </td>
                                  <td className="num">
                                    {regression.ok ? formatPct(regression.value.alpha, 1) : '—'}
                                  </td>
                                  <td className="num">
                                    {regression.ok ? regression.value.r2.toFixed(2) : '—'}
                                  </td>
                                  <td className="num">{alignedPair.a.length}</td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            </section>
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
