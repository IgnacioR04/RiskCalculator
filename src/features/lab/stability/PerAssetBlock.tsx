/**
 * Activo por activo (LAB-307).
 *
 * Volatilidad, caída máxima y ratios de cada serie, con su fuente. Beta y alpha
 * van en un desplegable porque solo tienen sentido eligiendo antes contra qué
 * comparar, y esa elección no debería estorbar a quien no la necesita.
 *
 * Un valor que no se pudo calcular se pinta «—» y nunca cero: cero es un
 * resultado y la ausencia no lo es.
 */
import { formatPct } from '../../../lib/format'
import type { AssetMetricRow, BenchmarkRow } from './contracts'
import { TableWrap } from '../../../components/TableWrap'

function num(valor: number | null, decimales = 2): string {
  return valor === null ? '—' : valor.toFixed(decimales)
}

export interface PerAssetBlockProps {
  readonly rows: readonly AssetMetricRow[]
  readonly benchmarkId: string
  readonly onBenchmarkChange: (id: string) => void
  /** Filas frente al benchmark elegido. Vacío si no hay benchmark. */
  readonly benchmarkRows: readonly BenchmarkRow[]
}

export function PerAssetBlock(props: PerAssetBlockProps) {
  return (
    <section className="risk-block">
      <div className="card-title">Activo por activo</div>
      <p className="card-sub">
        Volatilidad y caída máxima del periodo, con la fuente de cada serie.
      </p>
      <TableWrap>
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
            {props.rows.map((row) => (
              <tr key={row.assetId}>
                <td>
                  <strong>{row.symbol}</strong>
                  <div className="meta">{row.name}</div>
                </td>
                <td className="num">
                  {row.volatility === null ? '—' : formatPct(row.volatility, 1)}
                </td>
                <td className="num negative">
                  {row.maxDrawdown === null ? '—' : formatPct(row.maxDrawdown, 1)}
                </td>
                <td className="num">{num(row.sharpe)}</td>
                <td className="num">{num(row.sortino)}</td>
                <td>
                  <span className="meta">{row.provider}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <details className="disclose mt-3">
        <summary>Beta y alpha frente a un benchmark</summary>
        <div className="disclose-body">
          <div className="field compact-field">
            <label htmlFor="benchmark-select">Benchmark de comparación</label>
            <select
              id="benchmark-select"
              value={props.benchmarkId}
              onChange={(event) => props.onBenchmarkChange(event.target.value)}
            >
              {props.rows.map((row) => (
                <option key={row.assetId} value={row.assetId}>
                  {row.symbol}
                </option>
              ))}
            </select>
          </div>
          {props.benchmarkRows.length > 0 && (
            <TableWrap>
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
                  {props.benchmarkRows.map((row) => (
                    <tr key={row.assetId}>
                      <td>{row.symbol}</td>
                      <td className="num">{num(row.beta)}</td>
                      <td className="num">{row.alpha === null ? '—' : formatPct(row.alpha, 1)}</td>
                      <td className="num">{num(row.r2)}</td>
                      {/* Las observaciones se enseñan siempre: una beta sobre
                          treinta días y otra sobre trescientos no son
                          comparables, y el número es lo único que lo dice. */}
                      <td className="num">{row.observations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      </details>
    </section>
  )
}
