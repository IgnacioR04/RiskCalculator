/**
 * Métricas históricas bajo demanda: descarga series diarias de los
 * proveedores disponibles y calcula volatilidad, drawdown, Sharpe/Sortino,
 * correlaciones y beta contra un benchmark elegido. Los activos sin serie se
 * declaran «sin datos»; nunca se muestran números con muestra insuficiente.
 */
import { useMemo, useState } from 'react'
import type { Asset } from '../../lib/domain'
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
import { formatPct } from '../../lib/format'
import { CorrelationHeatmap } from '../charts/CorrelationHeatmap'
import { coingeckoProvider } from '../../lib/market/coingecko'
import { twelveDataProvider } from '../../lib/market/twelvedata'
import { useAppStore } from '../../state/store'
import { Card, Note, Segmented } from '../ui'

type Period = '90' | '180' | '365'

interface AssetSeries {
  asset: Asset
  series: SeriesPoint[]
  returns: { date: string; value: number }[]
  provider: string
}

async function fetchSeries(asset: Asset, days: number): Promise<AssetSeries | null> {
  const tdId = asset.providerIds?.['twelvedata']
  if (tdId !== undefined && twelveDataProvider.isConfigured()) {
    try {
      const candles = await twelveDataProvider.getDailyOHLC(tdId, days, asset.quoteCurrency)
      if (candles.length > 0) {
        const series = candles.map((c) => ({ date: c.time, close: Number(c.close) }))
        return { asset, series, returns: dailyReturns(series), provider: 'twelvedata' }
      }
    } catch {
      // cae al siguiente proveedor
    }
  }
  const cgId = asset.providerIds?.['coingecko']
  if (cgId !== undefined && asset.assetType === 'crypto') {
    try {
      const candles = await coingeckoProvider.getDailyOHLC(cgId, days, asset.quoteCurrency)
      if (candles.length > 0) {
        const series = candles.map((c) => ({ date: c.time, close: Number(c.close) }))
        return { asset, series, returns: dailyReturns(series), provider: 'coingecko' }
      }
    } catch {
      // sin datos
    }
  }
  return null
}

export function HistoricalRiskSection() {
  const assets = useAppStore((s) => s.assets)
  const transactions = useAppStore((s) => s.transactions)
  const riskFreeRate = useAppStore((s) => s.settings.riskFreeRate)

  const candidates = useMemo(
    () =>
      assets.filter(
        (a) =>
          transactions.some((t) => t.assetId === a.id) &&
          (a.providerIds?.['coingecko'] !== undefined || a.providerIds?.['twelvedata'] !== undefined),
      ),
    [assets, transactions],
  )

  const [period, setPeriod] = useState<Period>('90')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState<AssetSeries[] | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [benchmarkId, setBenchmarkId] = useState('')

  async function run() {
    setBusy(true)
    setLoaded(null)
    setMissing([])
    try {
      const results: AssetSeries[] = []
      const failed: string[] = []
      for (const asset of candidates) {
        const s = await fetchSeries(asset, Number(period))
        if (s !== null) results.push(s)
        else failed.push(asset.symbol)
      }
      setLoaded(results)
      setMissing(failed)
      const first = results[0]
      if (first !== undefined) setBenchmarkId(first.asset.id)
    } finally {
      setBusy(false)
    }
  }

  const rf = Number(riskFreeRate) || 0
  const benchmark = loaded?.find((s) => s.asset.id === benchmarkId) ?? null

  if (candidates.length === 0) {
    return (
      <Card title="Riesgo histórico">
        <Note kind="info">
          El análisis histórico necesita activos con proveedor de datos (búscalos al crear el
          activo). Los activos manuales o sin proveedor no tienen serie histórica: el análisis no
          está disponible para ellos y no se muestran números inventados.
        </Note>
      </Card>
    )
  }

  return (
    <Card title="Riesgo histórico">
      <p className="muted">
        Series diarias de los proveedores disponibles. Tasa libre de riesgo usada en Sharpe/Sortino:{' '}
        <strong>{formatPct(rf)}</strong> anual (configurable en Perfil). Las métricas describen el
        pasado del periodo elegido; no predicen el futuro.
      </p>
      <div className="row">
        <Segmented<Period>
          label="Periodo"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '90', label: '90 días' },
            { value: '180', label: '180 días' },
            { value: '365', label: '1 año' },
          ]}
        />
        <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
          {busy ? 'Descargando series…' : 'Calcular métricas'}
        </button>
      </div>

      {missing.length > 0 && (
        <Note kind="warning">
          Sin serie histórica disponible para: {missing.join(', ')}. Sus métricas no se calculan.
        </Note>
      )}

      {loaded !== null && loaded.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Activo</th>
                  <th scope="col">Obs.</th>
                  <th scope="col">Volatilidad anual</th>
                  <th scope="col">Vol. bajista</th>
                  <th scope="col">Drawdown máx.</th>
                  <th scope="col">Sharpe</th>
                  <th scope="col">Sortino</th>
                </tr>
              </thead>
              <tbody>
                {loaded.map((s) => {
                  const returns = s.returns.map((r) => r.value)
                  const vol = annualizedVolatility(returns)
                  const dvol = downsideVolatility(returns)
                  const dd = maxDrawdown(s.series)
                  const sharpe = sharpeRatio(returns, rf)
                  const sortino = sortinoRatio(returns, rf)
                  return (
                    <tr key={s.asset.id}>
                      <td>
                        {s.asset.symbol}
                        <div className="muted" style={{ fontSize: '0.72rem' }}>
                          {s.provider}
                        </div>
                      </td>
                      <td>{s.returns.length}</td>
                      <td>{vol.ok ? formatPct(vol.value, 1) : 'Datos insuf.'}</td>
                      <td>{dvol.ok ? formatPct(dvol.value, 1) : 'Datos insuf.'}</td>
                      <td>{dd.ok ? formatPct(dd.value.maxDrawdown, 1) : 'Datos insuf.'}</td>
                      <td>{sharpe.ok ? sharpe.value.toFixed(2) : 'Datos insuf.'}</td>
                      <td>{sortino.ok ? sortino.value.toFixed(2) : 'Datos insuf.'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">
            La volatilidad mide la variabilidad histórica de los retornos diarios, no la calidad
            del activo. El drawdown máximo es la mayor caída pico-valle del periodo.
          </p>

          {loaded.length > 1 && (
            <>
              <h3>Matriz de correlación (relaciones entre tus activos)</h3>
              <p className="muted">
                Mide cómo se han movido juntos tus activos en el periodo. Activos muy
                correlacionados (naranja) diversifican poco entre sí; correlación baja o negativa
                (azul) reparte mejor el riesgo. Es historia, no una garantía futura.
              </p>
              <CorrelationHeatmap
                matrix={{
                  labels: loaded.map((s) => s.asset.symbol),
                  cells: loaded.map((row) =>
                    loaded.map((col) => {
                      if (row.asset.id === col.asset.id) return { value: 1 }
                      const aligned = alignReturns(row.returns, col.returns)
                      const corr = correlation(aligned.a, aligned.b)
                      return { value: corr.ok ? corr.value : null }
                    }),
                  ),
                }}
              />

              <h3>Beta contra un benchmark</h3>
              <div className="field">
                <label htmlFor="benchmark-select">Benchmark</label>
                <span className="hint">
                  Elige contra qué activo medir beta/alpha/R². Un índice no siempre es invertible
                  directamente; aquí se usa como referencia.
                </span>
                <select
                  id="benchmark-select"
                  value={benchmarkId}
                  onChange={(e) => setBenchmarkId(e.target.value)}
                >
                  {loaded.map((s) => (
                    <option key={s.asset.id} value={s.asset.id}>
                      {s.asset.symbol}
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
                        <th scope="col">Obs. comunes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loaded
                        .filter((s) => s.asset.id !== benchmark.asset.id)
                        .map((s) => {
                          const aligned = alignReturns(s.returns, benchmark.returns)
                          const reg = betaAlpha(aligned.a, aligned.b)
                          return (
                            <tr key={s.asset.id}>
                              <td>{s.asset.symbol}</td>
                              <td>{reg.ok ? reg.value.beta.toFixed(2) : 'Datos insuf.'}</td>
                              <td>{reg.ok ? formatPct(reg.value.alpha, 1) : '—'}</td>
                              <td>{reg.ok ? reg.value.r2.toFixed(2) : '—'}</td>
                              <td>{aligned.a.length}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {loaded !== null && loaded.length === 0 && (
        <Note kind="warning">
          Ningún activo tiene serie histórica disponible con los proveedores actuales. El análisis
          no está disponible; no se muestran números inventados.
        </Note>
      )}
    </Card>
  )
}
