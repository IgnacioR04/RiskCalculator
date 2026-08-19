/**
 * Bloques de la pantalla de Carteras candidatas (LAB-612).
 *
 * Puros: reciben datos ya resueltos, no tocan el store y no calculan.
 *
 * La regla que gobierna toda la pantalla: **ninguna candidata viene marcada como
 * la mejor**. Es el criterio de aceptación de LAB-612 y no es cosmética. Una
 * aplicación que preselecciona está recomendando aunque escriba debajo que no
 * recomienda, y elegir entre menos riesgo, menos coste y menos concentración
 * depende de cosas que la aplicación no sabe.
 */
import { Card, Note } from '../../../components/ui'
import type { Currency } from '../../../lib/domain'
import { formatMoney, formatPct } from '../../../lib/format'
import type { CandidateMetrics } from '../../../lib/lab/candidates/evaluateCandidate'
import type { FeasibilityReport } from '../../../lib/lab/candidates/constraintFeasibility'
import type { RobustnessReport } from '../../../lib/lab/candidates/candidateRobustness'
import type { CoverageIssue } from '../../../lib/lab/candidates/constraintCompiler'

const num = (valor: number, decimales = 2) =>
  valor.toFixed(decimales).replace('.', ',')

/* ── Por qué no hay solución ───────────────────────────────────────────────── */

export function InfeasibleBlock(props: { readonly feasibility: FeasibilityReport }) {
  return (
    <Card
      title="Tus reglas no admiten ninguna cartera"
      sub="No es que no se encuentre: es que no existe"
    >
      <ul className="lista-grupos">
        {props.feasibility.problems.map((p) => (
          <li key={`${p.kind}-${p.bounds.join(',')}`}>
            <strong>{p.detail}</strong>
            <div className="meta">{p.remediation}</div>
          </li>
        ))}
      </ul>
      <Note>{props.feasibility.limitations.join(' ')}</Note>
    </Card>
  )
}

/* ── Restricciones que no se han podido comprobar ──────────────────────────── */

export function CoverageBlock(props: { readonly issues: readonly CoverageIssue[] }) {
  if (props.issues.length === 0) return null
  const bloqueos = props.issues.filter((i) => i.severity === 'blocking')

  return (
    <Card
      title="Reglas que no se han podido comprobar"
      sub="No rigen mientras no se puedan comprobar, y eso hay que saberlo"
    >
      <ul className="lista-grupos">
        {props.issues.map((issue) => (
          <li key={`${issue.reason}-${issue.detail}`}>
            <strong>{issue.detail}</strong>
            <div className="meta">{issue.remediation}</div>
          </li>
        ))}
      </ul>
      {bloqueos.length > 0 && (
        <Note kind="warning">
          {bloqueos.length === 1
            ? 'Una de tus reglas no se puede comprobar con los datos que hay.'
            : `${bloqueos.length} de tus reglas no se pueden comprobar con los datos que hay.`}{' '}
          Las candidatas de abajo se han calculado sin ellas.
        </Note>
      )}
    </Card>
  )
}

/* ── La tabla comparativa ──────────────────────────────────────────────────── */

export interface ComparisonProps {
  readonly metrics: readonly CandidateMetrics[]
  readonly currency: Currency
  readonly universeSymbols: readonly string[]
}

export function CandidateComparisonTable(props: ComparisonProps) {
  if (props.metrics.length === 0) return null

  return (
    <Card
      title="Las alternativas, una al lado de otra"
      sub="Todas medidas con el mismo código y los mismos datos, incluida la tuya"
    >
      <div className="table-wrap">
        <table className="data" aria-label="Comparación de carteras candidatas">
          <thead>
            <tr>
              <th scope="col">Cartera</th>
              <th scope="col">Volatilidad</th>
              <th scope="col">Posiciones efectivas</th>
              <th scope="col">Mayor posición</th>
              <th scope="col">Hay que mover</th>
              <th scope="col">Coste</th>
            </tr>
          </thead>
          <tbody>
            {props.metrics.map((m) => (
              <tr key={m.method}>
                <td>
                  <strong>{m.label}</strong>
                  {m.violations.length > 0 && (
                    <div className="meta">Incumple: {m.violations.join('; ')}</div>
                  )}
                </td>
                <td className="num">{formatPct(m.volatility, 1)}</td>
                <td className="num">{num(m.effectivePositions, 1)}</td>
                <td className="num">{formatPct(m.maxWeight, 0)}</td>
                <td className="num">{m.method === 'current' ? '—' : formatPct(m.turnover, 0)}</td>
                <td className="num">
                  {m.cost === null ? (
                    <span className="meta">No se sabe</span>
                  ) : (
                    formatMoney(m.cost, props.currency)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {props.metrics.some((m) => m.cost === null) && (
        <p className="muted tiny">
          «No se sabe» no es cero: falta el precio de compra de algo que habría que vender, así que
          no se puede estimar el impuesto sobre la plusvalía.
        </p>
      )}

      <Note kind="info">
        Ninguna viene marcada como la mejor, y no es por prudencia: elegir entre menos riesgo,
        menos coste y menos concentración depende de cosas que esta aplicación no sabe de ti.
      </Note>
    </Card>
  )
}

/* ── Los pesos ─────────────────────────────────────────────────────────────── */

export function WeightsTable(props: ComparisonProps) {
  if (props.metrics.length === 0) return null

  return (
    <Card title="Qué peso tendría cada posición">
      <div className="table-wrap">
        <table className="data" aria-label="Pesos por candidata">
          <thead>
            <tr>
              <th scope="col">Posición</th>
              {props.metrics.map((m) => (
                <th key={m.method} scope="col">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.universeSymbols.map((symbol, i) => (
              <tr key={symbol}>
                <td>{symbol}</td>
                {props.metrics.map((m) => (
                  <td key={m.method} className="num">
                    {formatPct(m.weights[i] ?? 0, 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ── Estabilidad de los pesos ──────────────────────────────────────────────── */

export function CandidateStabilityPanel(props: { readonly robustness: RobustnessReport }) {
  const { robustness } = props
  if (robustness.ranges.length === 0) return null

  const inestables = robustness.ranges.filter((r) => r.stability === 'inestable')

  return (
    <Card
      title="¿Estos pesos son una decisión o son ruido?"
      sub="Qué pasa con la mínima varianza si los datos hubieran salido un poco distintos"
    >
      <div className="table-wrap">
        <table className="data" aria-label="Estabilidad de los pesos">
          <thead>
            <tr>
              <th scope="col">Posición</th>
              <th scope="col">Peso</th>
              <th scope="col">Rango al perturbar</th>
              <th scope="col">Qué significa</th>
            </tr>
          </thead>
          <tbody>
            {robustness.ranges.map((r) => (
              <tr key={r.symbol}>
                <td>{r.symbol}</td>
                <td className="num">{formatPct(r.base, 1)}</td>
                <td className="num">
                  {formatPct(r.min, 0)} – {formatPct(r.max, 0)}
                </td>
                <td>
                  <span className="meta">{r.stability}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inestables.length > 0 && (
        <Note kind="warning">
          {inestables.length === 1
            ? `El peso de ${inestables[0]!.symbol} cambia mucho`
            : `Los pesos de ${inestables.map((r) => r.symbol).join(', ')} cambian mucho`}{' '}
          con perturbaciones pequeñas de los datos. Ese número no es una decisión del optimizador:
          es ruido con muchos decimales.
        </Note>
      )}

      <p className="muted tiny mb-0">
        {robustness.repetitions} repeticiones con semilla {robustness.seed}
        {robustness.discarded > 0 && `, ${robustness.discarded} descartadas por no converger`}.{' '}
        {robustness.limitations.join(' ')}
      </p>
    </Card>
  )
}
