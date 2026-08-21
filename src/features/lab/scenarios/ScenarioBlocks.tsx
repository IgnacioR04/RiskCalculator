/**
 * Bloques de presentación de la pantalla de Escenarios (LAB-508).
 *
 * No calculan nada, no tocan el store y no descargan: reciben datos ya
 * resueltos, así que cada uno se prueba con un objeto fijo.
 *
 * La regla que gobierna todos: **ningún número se enseña sin sus supuestos**.
 * No por precaución legal, sino porque un escenario sin supuestos es una cifra
 * que parece un pronóstico, y esta aplicación no hace pronósticos.
 */
import { Card, Note } from '../../../components/ui'
import { formatMoney, formatPct } from '../../../lib/format'
import type {
  ScenarioAssumption,
  ScenarioDefinition,
  ScenarioResult,
} from '../../../lib/lab/scenarios/contracts'
import type { SensitivityResult } from '../../../lib/lab/scenarios/scenarioSensitivity'
import { TableWrap } from '../../../components/TableWrap'

const signo = (valor: number) => (valor > 0 ? '+' : '')

/* ── Elegir escenario ──────────────────────────────────────────────────────── */

export interface ScenarioPickerProps {
  readonly scenarios: readonly ScenarioDefinition[]
  readonly selectedId: string
  readonly onSelect: (id: string) => void
}

export function ScenarioPicker(props: ScenarioPickerProps) {
  const elegido = props.scenarios.find((d) => d.id === props.selectedId)

  return (
    <Card title="Elige un escenario" sub="Una pregunta con supuestos, no una previsión">
      <div className="controles-fila">
        <div className="field">
          <label htmlFor="escenario">Escenario</label>
          <select
            id="escenario"
            value={props.selectedId}
            onChange={(e) => props.onSelect(e.target.value)}
          >
            {props.scenarios.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {elegido?.description !== undefined && <p className="muted tiny mb-0">{elegido.description}</p>}
    </Card>
  )
}

/* ── Resultado ─────────────────────────────────────────────────────────────── */

export interface ScenarioOutcomeProps {
  readonly result: ScenarioResult
  readonly name: string
  /** Cobertura, cuando el escenario no ha podido mirar toda la cartera. */
  readonly coverage?: number
}

export function ScenarioOutcomeBlock(props: ScenarioOutcomeProps) {
  const { outcome, baseValue, baseCurrency } = props.result

  if (outcome.changePct === null || outcome.finalValue === null) {
    return (
      <Card title={props.name}>
        <p className="muted mb-0">
          No se ha podido calcular este escenario con los datos disponibles.
          {props.result.notCovered.length > 0 && ` ${props.result.notCovered.join('. ')}.`}
        </p>
      </Card>
    )
  }

  return (
    <Card title={props.name} sub="Qué pasaría con la cartera que tienes hoy">
      <p className="figure figure-result">
        {signo(outcome.changePct)}
        {formatPct(outcome.changePct, 1)}
      </p>
      <p className="muted">
        De {formatMoney(baseValue, baseCurrency)} a{' '}
        <strong>{formatMoney(outcome.finalValue, baseCurrency)}</strong>.
        {props.coverage !== undefined && props.coverage < 1 && (
          <> Calculado sobre el {formatPct(props.coverage, 0)} de la cartera que tiene historial.</>
        )}
      </p>

      {props.result.notCovered.length > 0 && (
        <Note kind="warning">
          Fuera del cálculo: {props.result.notCovered.join('; ')}. No se cuentan como si no se
          movieran.
        </Note>
      )}
    </Card>
  )
}

/* ── Supuestos: obligatorios ───────────────────────────────────────────────── */

export function AssumptionsBlock(props: { readonly assumptions: readonly ScenarioAssumption[] }) {
  if (props.assumptions.length === 0) return null

  return (
    <Card title="De qué depende este número" sub="Cambia un supuesto y cambia el resultado">
      <ul className="lista-grupos">
        {props.assumptions.map((a) => (
          <li key={a.label}>
            <strong>{a.label}</strong>
            <div className="meta">{a.detail}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* ── Quién produce el cambio ───────────────────────────────────────────────── */

export function ContributionsBlock(props: { readonly result: ScenarioResult }) {
  const { contributions, baseCurrency } = props.result
  if (contributions.length === 0) return null

  const ordenadas = [...contributions].sort((a, b) => a.after - a.before - (b.after - b.before))

  return (
    <Card title="De dónde sale el golpe" sub="Cuánto aporta cada posición al cambio total">
      <TableWrap>
        <table className="data" aria-label="Contribución al cambio">
          <thead>
            <tr>
              <th scope="col">Posición</th>
              <th scope="col">Antes</th>
              <th scope="col">Después</th>
              <th scope="col">Parte del cambio</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((c) => (
              <tr key={c.assetId}>
                <td>{c.symbol}</td>
                <td className="num">{formatMoney(c.before, baseCurrency)}</td>
                <td className="num">
                  <strong>{formatMoney(c.after, baseCurrency)}</strong>
                </td>
                <td className="num">
                  {c.shareOfChange === null ? '—' : formatPct(c.shareOfChange, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  )
}

/* ── Sensibilidad ──────────────────────────────────────────────────────────── */

export function SensitivityBlock(props: { readonly sensitivity: SensitivityResult }) {
  const { limitations } = props.sensitivity

  // Un supuesto que no mueve nada no es un supuesto de *este* resultado: es un
  // supuesto del escenario que esta cartera no toca. El escenario «Corrección»
  // trae shock de materias primas, y quien no tiene materias primas vería una
  // fila de ceros. Se apartan y se cuentan, en vez de llenar la tabla de ruido.
  const drivers = props.sensitivity.drivers.filter((d) => d.swing > 0)
  const sinEfecto = props.sensitivity.drivers.length - drivers.length

  if (drivers.length === 0) return null

  return (
    <Card
      title="Qué supuesto manda"
      sub="Cuánto cambia el resultado si mueves cada supuesto por separado"
    >
      <TableWrap>
        <table className="data" aria-label="Sensibilidad a los supuestos">
          <thead>
            <tr>
              <th scope="col">Supuesto</th>
              <th scope="col">La mitad</th>
              <th scope="col">Tal cual</th>
              <th scope="col">El doble</th>
              <th scope="col">Mueve</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const en = (factor: number) =>
                d.points.find((p) => p.factor === factor)?.changePct ?? null
              const celda = (valor: number | null) =>
                valor === null ? '—' : `${signo(valor)}${formatPct(valor, 1)}`
              return (
                <tr key={d.path}>
                  <td>{d.label}</td>
                  <td className="num">{celda(en(0.5))}</td>
                  <td className="num">
                    <strong>{celda(en(1))}</strong>
                  </td>
                  <td className="num">{celda(en(2))}</td>
                  <td className="num">{formatPct(d.swing, 1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>

      {drivers[0] !== undefined && (
        <p className="muted tiny">
          El resultado depende sobre todo del <strong>{drivers[0].label.toLowerCase()}</strong>. Si
          ese supuesto te parece discutible, el número entero lo es.
        </p>
      )}

      {sinEfecto > 0 && (
        <p className="muted tiny">
          {sinEfecto === 1
            ? 'Otro supuesto de este escenario no afecta a tu cartera: no tienes nada de esa clase de activo.'
            : `Otros ${sinEfecto} supuestos de este escenario no afectan a tu cartera: no tienes nada de esas clases de activo.`}
        </p>
      )}

      <Note>
        {limitations.join(' ')}
      </Note>
    </Card>
  )
}
