import { useMemo, useState } from 'react'
import type { Asset, Currency, FxRate, Transaction } from '../../lib/domain'
import {
  alignReturns,
  annualizedVolatility,
  betaAlpha,
  correlation,
  dailyReturns,
  downsideVolatility,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
  type SeriesPoint,
} from '../../lib/finance/historical'
import {
  alignManyReturns,
  covarianceMatrix,
  portfolioRisk,
  timeWeightedReturn,
  tradingDaysForAsset,
  tradingDaysForPortfolio,
  type TwrPeriod,
} from '../../lib/finance/portfolioRisk'
import { dec } from '../../lib/finance/decimal'
import { convertAmount } from '../../lib/fx'
import { formatPct } from '../../lib/format'
import { buildPortfolioView } from '../../lib/portfolio'
import { coingeckoProvider } from '../../lib/market/coingecko'
import { historicalFxSeries } from '../../lib/market/service'
import { twelveDataProvider } from '../../lib/market/twelvedata'
import { DEMO_FX_EURUSD } from '../../state/demoData'
import { getDemoHistoricalSeries, hasDemoHistoricalSeries } from '../../state/demoHistory'
import { useAppStore } from '../../state/store'
import { CorrelationHeatmap } from '../charts/CorrelationHeatmap'
import { CovarianceHeatmap } from '../charts/CovarianceHeatmap'
import { RiskContributionChart } from '../charts/RiskContributionChart'
import { Card, Note, Segmented, Stat } from '../ui'

type Period = '90' | '180' | '365'

interface AssetSeries {
  asset: Asset
  series: SeriesPoint[]
  returns: { date: string; value: number }[]
  provider: string
}

function rateAt(
  rates: readonly { date: string; rate: number }[],
  date: string,
): number | null {
  const candidate = [...rates].reverse().find((rate) => rate.date <= date)
  return candidate?.rate ?? null
}

function convertPriceSeries(
  series: readonly SeriesPoint[],
  rates: readonly { date: string; rate: number }[],
): SeriesPoint[] {
  return series.flatMap((point) => {
    const rate = rateAt(rates, point.date)
    return rate === null ? [] : [{ date: point.date, close: point.close * rate }]
  })
}

function convertDemoPriceSeries(
  series: readonly SeriesPoint[],
  from: Currency,
  to: Currency,
): SeriesPoint[] {
  if (from === to) return series.map((point) => ({ ...point }))
  const eurUsd = Number(DEMO_FX_EURUSD.rate)
  if (!Number.isFinite(eurUsd) || eurUsd <= 0) return []
  const rate = from === 'USD' && to === 'EUR' ? 1 / eurUsd : eurUsd
  return series.map((point) => ({ date: point.date, close: point.close * rate }))
}

async function fetchSeries(
  asset: Asset,
  days: number,
  displayCurrency: Currency,
  fxSeries: readonly { date: string; rate: number }[],
): Promise<AssetSeries | null> {
  if (asset.isDemo === true && hasDemoHistoricalSeries(asset.id)) {
    const demoSeries = getDemoHistoricalSeries(asset.id, days)
    const series = convertDemoPriceSeries(demoSeries, asset.quoteCurrency, displayCurrency)
    if (series.length > 0) {
      return {
        asset,
        series,
        returns: dailyReturns(series),
        provider:
          asset.quoteCurrency === displayCurrency ? 'Demo sintetico' : 'Demo sintetico + FX demo',
      }
    }
  }

  const twelveDataId = asset.providerIds?.['twelvedata']
  if (twelveDataId !== undefined && twelveDataProvider.isConfigured()) {
    try {
      const candles = await twelveDataProvider.getDailyOHLC(
        twelveDataId,
        days,
        asset.quoteCurrency,
      )
      if (candles.length > 0) {
        let series = candles.map((candle) => ({
          date: candle.time,
          close: Number(candle.close),
        }))
        if (asset.quoteCurrency !== displayCurrency) {
          series = convertPriceSeries(series, fxSeries)
        }
        return {
          asset,
          series,
          returns: dailyReturns(series),
          provider:
            asset.quoteCurrency === displayCurrency
              ? 'Twelve Data'
              : 'Twelve Data + BCE FX',
        }
      }
    } catch {
      // Continúa con el siguiente proveedor.
    }
  }

  const coinGeckoId = asset.providerIds?.['coingecko']
  if (coinGeckoId !== undefined && asset.assetType === 'crypto') {
    try {
      // CoinGecko puede devolver directamente la divisa de presentación.
      const candles = await coingeckoProvider.getDailyOHLC(
        coinGeckoId,
        days,
        displayCurrency,
      )
      if (candles.length > 0) {
        const series = candles.map((candle) => ({
          date: candle.time,
          close: Number(candle.close),
        }))
        return { asset, series, returns: dailyReturns(series), provider: 'CoinGecko' }
      }
    } catch {
      // Sin datos.
    }
  }
  return null
}

function transactionCashFlow(
  transaction: Transaction,
  displayCurrency: Currency,
  fxRates: readonly FxRate[],
  downloadedFx: readonly { date: string; rate: number }[],
): { contribution: number; withdrawal: number } | null {
  const date = transaction.datetime.slice(0, 10)
  let amount = convertAmount(
    transaction.investedAmount,
    transaction.investedCurrency,
    displayCurrency,
    fxRates,
    date,
  )?.amount
  if (amount === undefined && transaction.investedCurrency !== displayCurrency) {
    const rate = rateAt(downloadedFx, date)
    if (rate !== null) amount = dec(transaction.investedAmount).times(rate)
  }
  if (amount === undefined) return null

  let fee = dec(0)
  if (transaction.fee !== null) {
    const feeCurrency = transaction.feeCurrency ?? transaction.investedCurrency
    const convertedFee = convertAmount(
      transaction.fee,
      feeCurrency,
      displayCurrency,
      fxRates,
      date,
    )?.amount
    if (convertedFee !== undefined) fee = convertedFee
    else if (feeCurrency !== displayCurrency) {
      const rate = rateAt(downloadedFx, date)
      if (rate === null) return null
      fee = dec(transaction.fee).times(rate)
    } else fee = dec(transaction.fee)
  }

  if (transaction.type === 'buy') {
    return { contribution: Number(amount.plus(fee).toString()), withdrawal: 0 }
  }
  const net = dec(amount).minus(fee)
  return {
    contribution: 0,
    withdrawal: Number((net.gt(0) ? net : dec(0)).toString()),
  }
}

function quantityOn(
  transactions: readonly Transaction[],
  assetId: string,
  date: string,
): number {
  return transactions
    .filter(
      (transaction) =>
        transaction.assetId === assetId && transaction.datetime.slice(0, 10) <= date,
    )
    .reduce(
      (quantity, transaction) =>
        quantity +
        Number(transaction.quantity) * (transaction.type === 'buy' ? 1 : -1),
      0,
    )
}

function calculatePortfolioTwr(input: {
  loaded: AssetSeries[]
  transactions: Transaction[]
  displayCurrency: Currency
  fxRates: FxRate[]
  downloadedFx: { date: string; rate: number }[]
  requiredAssetIds: Set<string>
}): number | null {
  const relevantLoaded = input.loaded.filter((item) =>
    input.requiredAssetIds.has(item.asset.id),
  )
  const relevantTransactions = input.transactions.filter((transaction) =>
    input.requiredAssetIds.has(transaction.assetId),
  )
  if (
    relevantLoaded.length === 0 ||
    relevantLoaded.length !== input.requiredAssetIds.size ||
    relevantTransactions.some((transaction) => transaction.costKnown === false)
  ) {
    return null
  }
  const aligned = alignManyReturns(
    relevantLoaded.map((item) =>
      item.series.map((point) => ({ date: point.date, value: point.close })),
    ),
  )
  if (aligned.dates.length < 2) return null
  const priceMaps = new Map(
    relevantLoaded.map((item) => [
      item.asset.id,
      new Map(item.series.map((point) => [point.date, point.close])),
    ]),
  )
  const periods: TwrPeriod[] = []
  for (let index = 1; index < aligned.dates.length; index++) {
    const previousDate = aligned.dates[index - 1]!
    const date = aligned.dates[index]!
    let openingValue = 0
    let closingValue = 0
    for (const item of relevantLoaded) {
      const prices = priceMaps.get(item.asset.id)!
      openingValue += quantityOn(relevantTransactions, item.asset.id, previousDate) * prices.get(previousDate)!
      closingValue += quantityOn(relevantTransactions, item.asset.id, date) * prices.get(date)!
    }
    let contributions = 0
    let withdrawals = 0
    for (const transaction of relevantTransactions.filter(
      (item) => item.datetime.slice(0, 10) === date,
    )) {
      const flow = transactionCashFlow(
        transaction,
        input.displayCurrency,
        input.fxRates,
        input.downloadedFx,
      )
      if (flow === null) return null
      contributions += flow.contribution
      withdrawals += flow.withdrawal
    }
    periods.push({ openingValue, closingValue, contributions, withdrawals })
  }
  return timeWeightedReturn(periods)
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
      if (available[0] !== undefined) setBenchmarkId(available[0].asset.id)
    } finally {
      setBusy(false)
    }
  }

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
    return {
      aligned,
      covariance,
      risk,
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

      {missing.length > 0 && (
        <Note kind="warning">
          Sin histórico convertible para {missing.join(', ')}. Las métricas de cartera muestran
          cobertura parcial y no se presentan como completas.
        </Note>
      )}

      {loaded !== null && analytics !== null && (
        <>
          <div className="stat-grid analytics-kpis">
            <Stat label={analytics.complete ? 'Volatilidad de cartera' : 'Volatilidad del segmento'}>
              {analytics.risk === null ? 'Datos insuficientes' : formatPct(analytics.risk.volatility, 1)}
            </Stat>
            <Stat label="Cobertura analizada">{formatPct(analytics.coverage, 0)}</Stat>
            <Stat label="TWR del periodo">
              {analytics.twr === null ? 'No disponible' : formatPct(analytics.twr, 1)}
            </Stat>
            <Stat label="Muestra común">{analytics.aligned.dates.length} días</Stat>
          </div>

          <div className="metric-cards">
            {loaded.map((item) => {
              const returns = item.returns.map((point) => point.value)
              const annualization = tradingDaysForAsset(item.asset.assetType)
              const volatility = annualizedVolatility(returns, annualization)
              const downside = downsideVolatility(returns, annualization)
              const drawdown = maxDrawdown(item.series)
              const sharpe = sharpeRatio(returns, riskFreeRate, annualization)
              const sortino = sortinoRatio(returns, riskFreeRate, annualization)
              return (
                <article className="metric-card" key={item.asset.id}>
                  <div className="row spread">
                    <strong>{item.asset.symbol}</strong>
                    <span className="chip delayed">{item.provider}</span>
                  </div>
                  <div className="mini-metrics">
                    <span><small>Volatilidad</small>{volatility.ok ? formatPct(volatility.value, 1) : '—'}</span>
                    <span><small>Drawdown</small>{drawdown.ok ? formatPct(drawdown.value.maxDrawdown, 1) : '—'}</span>
                    <span><small>Sharpe</small>{sharpe.ok ? sharpe.value.toFixed(2) : '—'}</span>
                    <span><small>Sortino</small>{sortino.ok ? sortino.value.toFixed(2) : '—'}</span>
                    <span><small>Vol. bajista</small>{downside.ok ? formatPct(downside.value, 1) : '—'}</span>
                    <span><small>Sesiones/año</small>{annualization}</span>
                  </div>
                </article>
              )
            })}
          </div>

          {loaded.length > 1 && (
            <>
              <div className="analytics-grid">
                <section>
                  <h3>Correlación</h3>
                  <p className="muted tiny">
                    Cercana a +1: se mueven juntos. Cercana a −1: puede diversificar.
                  </p>
                  <CorrelationHeatmap
                    matrix={{
                      labels: loaded.map((item) => item.asset.symbol),
                      cells: loaded.map((row) =>
                        loaded.map((column) => {
                          if (row.asset.id === column.asset.id) return { value: 1 }
                          const aligned = alignReturns(row.returns, column.returns)
                          const result = correlation(aligned.a, aligned.b)
                          return { value: result.ok ? result.value : null }
                        }),
                      ),
                    }}
                  />
                </section>
                <section>
                  <h3>Covarianza anualizada</h3>
                  <p className="muted tiny">
                    Añade magnitud de riesgo a la relación y alimenta la volatilidad de cartera.
                  </p>
                  {analytics.covariance.ok ? (
                    <CovarianceHeatmap
                      labels={loaded.map((item) => item.asset.symbol)}
                      matrix={analytics.covariance.value}
                    />
                  ) : (
                    <Note kind="info">Se necesitan al menos 30 retornos comunes.</Note>
                  )}
                </section>
              </div>

              {analytics.risk !== null && (
                <section>
                  <h3>Quién aporta el riesgo</h3>
                  <p className="muted">
                    Un activo puede pesar poco en euros y dominar el riesgo. Las barras negativas
                    indican efecto diversificador en esta muestra.
                  </p>
                  <RiskContributionChart
                    data={loaded.map((item, index) => ({
                      label: item.asset.symbol,
                      contribution: analytics.risk!.percentageContributions[index] ?? 0,
                    }))}
                  />
                </section>
              )}

              <section>
                <h3>Beta y alpha</h3>
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
                        <tr><th>Activo</th><th>Beta</th><th>Alpha anual</th><th>R²</th><th>Obs.</th></tr>
                      </thead>
                      <tbody>
                        {loaded
                          .filter((item) => item.asset.id !== benchmark.asset.id)
                          .map((item) => {
                            const aligned = alignReturns(item.returns, benchmark.returns)
                            const regression = betaAlpha(
                              aligned.a,
                              aligned.b,
                              tradingDaysForPortfolio([
                                item.asset.assetType,
                                benchmark.asset.assetType,
                              ]),
                            )
                            return (
                              <tr key={item.asset.id}>
                                <td>{item.asset.symbol}</td>
                                <td>{regression.ok ? regression.value.beta.toFixed(2) : '—'}</td>
                                <td>{regression.ok ? formatPct(regression.value.alpha, 1) : '—'}</td>
                                <td>{regression.ok ? regression.value.r2.toFixed(2) : '—'}</td>
                                <td>{aligned.a.length}</td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
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
