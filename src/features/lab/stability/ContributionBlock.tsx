/**
 * Quién aporta el riesgo (LAB-307).
 *
 * La idea que este bloque existe para enseñar: **un activo puede pesar poco en
 * euros y dominar el riesgo**. La columna de diferencia es la que lo delata.
 */
import { formatPct } from '../../../lib/format'
import { RiskContributionChart } from '../../../components/charts/RiskContributionChart'
import type { ContributionRow } from './contracts'
import { TableWrap } from '../../../components/TableWrap'

/** A partir de dos puntos de diferencia se colorea; por debajo es ruido. */
const UMBRAL = 0.02

export function ContributionBlock(props: { readonly rows: readonly ContributionRow[] }) {
  return (
    <section className="risk-block">
      <div className="card-title">Quién aporta el riesgo</div>
      <p className="card-sub">
        Un activo puede pesar poco en euros y dominar el riesgo. Las barras negativas indican efecto
        diversificador en esta muestra.
      </p>
      <RiskContributionChart
        data={props.rows.map((row) => ({ label: row.symbol, contribution: row.contribution }))}
      />
      <TableWrap>
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
            {props.rows.map((row) => {
              const delta = row.contribution - row.weight
              return (
                <tr key={row.assetId}>
                  <td>{row.symbol}</td>
                  <td className="num">{formatPct(row.weight, 1)}</td>
                  <td className="num">{formatPct(row.contribution, 1)}</td>
                  <td className="num">
                    <span
                      className={
                        delta > UMBRAL ? 'negative' : delta < -UMBRAL ? 'positive' : undefined
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
      </TableWrap>
      <p className="meta mb-0">En rojo, aporta más riesgo del que pesa. En verde, amortigua.</p>
    </section>
  )
}
