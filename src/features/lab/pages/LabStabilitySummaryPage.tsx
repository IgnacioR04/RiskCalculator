/**
 * Resumen de estabilidad V2 (LAB-312).
 *
 * Cuatro tarjetas y una respuesta corta a «¿cómo de estable es esto?». Debajo,
 * la estabilidad de la propia medición: la misma métrica en varias ventanas,
 * porque un número que cambia mucho según el periodo que mires dice menos de lo
 * que parece.
 *
 * Dos reglas que vienen del criterio de aceptación:
 *
 * - **Hay un máximo de hallazgos.** Doce avisos no informan de doce cosas: no
 *   informan de ninguna. Se enseñan los más importantes y se dice cuántos
 *   quedan fuera.
 * - **La evidencia está accesible.** Cada hallazgo dice de dónde sale su número,
 *   sin salir de la página. Un hallazgo sin evidencia es una opinión.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Note } from '../../../components/ui'
import { diversificationMetrics } from '../../../lib/finance/diversification'
import {
  alignManyReturns,
  covarianceMatrix,
  portfolioRisk,
  tradingDaysForPortfolio,
} from '../../../lib/finance/portfolioRisk'
import { formatPct } from '../../../lib/format'
import { buildPortfolioView } from '../../../lib/portfolio'
import {
  DEFAULT_WINDOWS,
  VAR_DISCLAIMER,
  drawdownProfile,
  historicalTailRisk,
  overWindows,
} from '../../../lib/lab/analytics/downside'
import { hasDemoHistoricalSeries } from '../../../state/demoHistory'
import { useStabilityAnalysis } from '../../../lib/lab/stability/useStabilityAnalysis'
import { useAppStore } from '../../../state/store'
import { LabShell } from '../components/LabShell'
import { labPath } from '../routes/labRoutes'
import {
  MAX_FINDINGS,
  hiddenFindingsCount,
  stabilityFindings,
  type StabilityFacts,
} from '../stability/findings'
import { TableWrap } from '../../../components/TableWrap'

/** Una cifra grande con su lectura debajo. `null` se dice, no se pinta a cero. */
function Tarjeta(props: {
  readonly titulo: string
  readonly valor: string | null
  readonly lectura: string
}) {
  return (
    <div className="estabilidad-tarjeta">
      <span className="label">{props.titulo}</span>
      <span className="figure figure-result">{props.valor ?? 'No disponible'}</span>
      <p className="muted tiny mb-0">{props.lectura}</p>
    </div>
  )
}

export function LabStabilitySummaryPage() {
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

  const { loaded, busy, run } = useStabilityAnalysis(candidates, store.settings.displayCurrency)

  const resumen = useMemo(() => {
    if (loaded === null || loaded.length === 0) return null

    const aligned = alignManyReturns(loaded.map((item) => item.returns))
    const periodsPerYear = tradingDaysForPortfolio(loaded.map((item) => item.asset.assetType))
    const covariance = covarianceMatrix(aligned.columns, periodsPerYear)

    const valores = loaded.map((item) => {
      const position = view.positions.find((p) => p.asset.id === item.asset.id)
      return position?.value == null ? 0 : Number(position.value.toString())
    })
    const total = valores.reduce((suma, v) => suma + v, 0)
    const weights = valores.map((v) => (total > 0 ? v / total : 0))

    const risk = covariance.ok ? portfolioRisk(weights, covariance.value) : null
    const diversification =
      covariance.ok && risk !== null
        ? diversificationMetrics(weights, covariance.value, risk.percentageContributions)
        : null

    // La serie de la cartera: suma ponderada de los cierres normalizados. Es la
    // que sostiene la caída máxima y la cola, porque medirlas activo a activo no
    // dice cómo cayó el conjunto.
    const fechas = aligned.dates
    const serieCartera = fechas.map((date, indice) => ({
      date,
      close: loaded.reduce((suma, item, i) => {
        const punto = item.series[item.series.length - fechas.length + indice]
        const base = item.series[item.series.length - fechas.length]
        return suma + (punto && base && base.close > 0 ? (punto.close / base.close) * (weights[i] ?? 0) : 0)
      }, 0),
    }))

    const caida = drawdownProfile(serieCartera)
    const retornosCartera = aligned.columns[0]?.map((_, t) =>
      aligned.columns.reduce((suma, columna, i) => suma + (columna[t] ?? 0) * (weights[i] ?? 0), 0),
    ) ?? []
    const cola = historicalTailRisk(retornosCartera)

    const ventanas = overWindows(
      serieCartera,
      (tramo) => {
        const perfil = drawdownProfile(tramo)
        return perfil.ok ? perfil.value.maxDrawdown : null
      },
      DEFAULT_WINDOWS,
    )

    const facts: StabilityFacts = {
      volatility: risk === null ? null : risk.volatility,
      maxDrawdown: caida.ok ? caida.value.maxDrawdown : null,
      recovered: caida.ok ? caida.value.recovered : null,
      daysUnderwater: caida.ok && !caida.value.recovered ? caida.value.declineDays : null,
      diversification,
      coverage:
        Number(view.totalValue.toString()) > 0 ? total / Number(view.totalValue.toString()) : 0,
      commonDays: fechas.length,
      topWeight: weights.length === 0 ? null : Math.max(...weights),
    }

    return { risk, caida, cola, ventanas, facts, volatilidadCartera: risk?.volatility ?? null }
  }, [loaded, view])

  return (
    <LabShell routeId="lab.stability">
      {candidates.length === 0 ? (
        <Card title="Todavía no hay nada que medir">
          <p className="muted mb-0">
            Para medir estabilidad hacen falta activos con histórico. Carga los datos de
            demostración desde Perfil, o añade proveedores a tus activos.
          </p>
        </Card>
      ) : resumen === null ? (
        <Card title="Resumen de estabilidad">
          <p className="muted">
            Aún no se ha calculado nada. El análisis usa las series que ya tienes descargadas.
          </p>
          <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
            {busy ? 'Analizando…' : 'Analizar cartera'}
          </button>
        </Card>
      ) : (
        <>
          <Card title="¿Cómo de estable es tu cartera?">
            <div className="estabilidad-tarjetas">
              <Tarjeta
                titulo="Volatilidad anual"
                valor={
                  resumen.volatilidadCartera === null
                    ? null
                    : formatPct(resumen.volatilidadCartera, 1)
                }
                lectura="Cuánto oscila el conjunto en un año."
              />
              <Tarjeta
                titulo="Peor caída del periodo"
                valor={resumen.caida.ok ? formatPct(resumen.caida.value.maxDrawdown, 1) : null}
                lectura={
                  resumen.caida.ok
                    ? resumen.caida.value.recovered
                      ? `Recuperada en ${resumen.caida.value.recoveryDays} días.`
                      : 'Todavía no recuperada.'
                    : 'No hay caída medible en esta muestra.'
                }
              />
              <Tarjeta
                titulo="Día malo típico"
                valor={resumen.cola.ok ? formatPct(resumen.cola.value.var, 1) : null}
                lectura="Umbral que supera el 5 % de días peores."
              />
              <Tarjeta
                titulo="Cuando se cruza"
                valor={resumen.cola.ok ? formatPct(resumen.cola.value.cvar, 1) : null}
                lectura="Pérdida media en esos días peores (CVaR)."
              />
            </div>
            {resumen.cola.ok && (
              <Note kind="info">{VAR_DISCLAIMER}</Note>
            )}
          </Card>

          <Card title="Qué conviene mirar">
            <ul className="estabilidad-hallazgos">
              {stabilityFindings(resumen.facts).map((hallazgo) => (
                <li key={hallazgo.code} className={hallazgo.level}>
                  <p className="mb-0">
                    <span aria-hidden="true">{hallazgo.level === 'warning' ? '▲ ' : '◆ '}</span>
                    {hallazgo.text}
                  </p>
                  {/* La evidencia va con el hallazgo, no en otra pantalla: sin
                      ella es una opinión. */}
                  <details>
                    <summary>De dónde sale</summary>
                    <p className="muted tiny mb-0">{hallazgo.evidence}</p>
                  </details>
                </li>
              ))}
            </ul>
            {hiddenFindingsCount(resumen.facts) > 0 && (
              <p className="muted tiny mb-0">
                Se muestran los {MAX_FINDINGS} más importantes; hay{' '}
                {hiddenFindingsCount(resumen.facts)} más en las pantallas de detalle.
              </p>
            )}
          </Card>

          <Card title="¿Es estable la propia medición?">
            <p className="muted">
              La misma caída máxima medida en ventanas distintas. Si cambia mucho, el número dice
              menos de lo que parece.
            </p>
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Ventana</th>
                    <th scope="col">Peor caída</th>
                    <th scope="col">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.ventanas.map((salida) => (
                    <tr key={salida.window.id}>
                      <td>{salida.window.label}</td>
                      <td className="num">
                        {/* Una ventana que la serie no cubre no se simula. */}
                        {salida.status === 'ok' && salida.result !== undefined
                          ? formatPct(salida.result, 1)
                          : 'Sin datos suficientes'}
                      </td>
                      <td className="num">{salida.observations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>

          <Note>
            El pasado describe riesgo; no predice retornos. Para ver qué datos sostienen esto,
            mira <Link to={labPath('lab.stability.data')}>Calidad y cobertura</Link>.
          </Note>
        </>
      )}
    </LabShell>
  )
}
