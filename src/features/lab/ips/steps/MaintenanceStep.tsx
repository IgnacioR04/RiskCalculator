/**
 * Paso 8 del asistente: reglas de mantenimiento (LAB-209).
 *
 * Rebalanceo, reserva de liquidez y plan de aportaciones. Lo importante de este
 * paso es que **«no rebalancear» es una elección**, no un hueco: ADR-002 §6 la
 * exige declarada precisamente para que no se quede implícita. Por eso aparece
 * como una opción más y no como el valor que queda si no tocas nada.
 */
import { useId, useState } from 'react'
import { Card, Note } from '../../../../components/ui'
import type { Currency } from '../../../../lib/domain'
import type {
  ContributionPlan,
  RebalancePolicy,
} from '../../../../lib/lab/domain/investmentPolicy'

export interface MaintenanceStepProps {
  readonly rebalancePolicy: RebalancePolicy
  readonly liquidityReserveMonths: number | undefined
  readonly contributionPlan: ContributionPlan | undefined
  readonly baseCurrency: Currency
  readonly onRebalanceChange: (policy: RebalancePolicy) => void
  readonly onReserveChange: (meses: number | undefined) => void
  readonly onContributionChange: (plan: ContributionPlan | undefined) => void
}

const FRECUENCIAS: readonly { value: ContributionPlan['frequency']; label: string }[] = [
  { value: 'mensual', label: 'Cada mes' },
  { value: 'trimestral', label: 'Cada trimestre' },
  { value: 'anual', label: 'Una vez al año' },
  { value: 'puntual', label: 'Solo cuando pueda' },
]

export function MaintenanceStep(props: MaintenanceStepProps) {
  const idBase = useId()

  // El plan a medio escribir vive aquí y no en la política: sin importe no hay
  // plan que guardar, pero elegir primero la frecuencia y luego el importe tiene
  // que funcionar. Sin este estado, la frecuencia elegida se perdería al no
  // haber todavía nada que persistir.
  const [plan, setPlan] = useState<ContributionPlan>(
    props.contributionPlan ?? {
      amount: '',
      currency: props.baseCurrency,
      frequency: 'mensual',
    },
  )

  function cambiarPlan(cambio: Partial<ContributionPlan>) {
    const siguiente = { ...plan, ...cambio }
    setPlan(siguiente)
    // Sin importe no hay plan: dejarlo a medias guardaría una intención vacía.
    props.onContributionChange(siguiente.amount.trim() === '' ? undefined : siguiente)
  }

  return (
    <div className="ips-step">
      <p className="muted">
        Qué harás con la cartera una vez montada. Son reglas para tu yo futuro, escritas ahora que
        no hay ninguna caída de por medio.
      </p>

      <Card>
        <fieldset className="ips-pregunta">
          <legend>¿Cada cuánto reequilibras?</legend>
          <details className="ips-porque">
            <summary>¿Por qué se pregunta esto?</summary>
            <p className="muted tiny mb-0">
              Reequilibrar obliga a vender lo que ha subido y comprar lo que ha bajado, que es
              justo lo que menos apetece hacer. Decidirlo ahora evita decidirlo en caliente.
            </p>
          </details>

          <label htmlFor={`${idBase}-none`}>
            <input
              id={`${idBase}-none`}
              type="radio"
              name={`${idBase}-rebalanceo`}
              checked={props.rebalancePolicy.kind === 'none'}
              onChange={() => props.onRebalanceChange({ kind: 'none' })}
            />
            <span>No reequilibrar. Es una elección, no un olvido.</span>
          </label>

          <label htmlFor={`${idBase}-calendar`}>
            <input
              id={`${idBase}-calendar`}
              type="radio"
              name={`${idBase}-rebalanceo`}
              checked={props.rebalancePolicy.kind === 'calendar'}
              onChange={() => props.onRebalanceChange({ kind: 'calendar', everyMonths: 12 })}
            />
            <span>Por calendario, cada cierto tiempo.</span>
          </label>

          {props.rebalancePolicy.kind === 'calendar' && (
            <div className="field">
              <label htmlFor={`${idBase}-meses`}>Cada cuántos meses</label>
              <input
                id={`${idBase}-meses`}
                inputMode="numeric"
                autoComplete="off"
                value={props.rebalancePolicy.everyMonths}
                onChange={(e) => {
                  const meses = Number(e.target.value)
                  if (!Number.isInteger(meses) || meses < 1 || meses > 120) return
                  props.onRebalanceChange({ kind: 'calendar', everyMonths: meses })
                }}
              />
              <span className="hint">Un número entero de meses, entre 1 y 120.</span>
            </div>
          )}

          <label htmlFor={`${idBase}-bands`}>
            <input
              id={`${idBase}-bands`}
              type="radio"
              name={`${idBase}-rebalanceo`}
              checked={props.rebalancePolicy.kind === 'bands'}
              onChange={() => props.onRebalanceChange({ kind: 'bands', toleranceBand: 0.05 })}
            />
            <span>Por desviación, cuando un peso se aleje de su objetivo.</span>
          </label>

          {props.rebalancePolicy.kind === 'bands' && (
            <div className="field">
              <label htmlFor={`${idBase}-banda`}>Desviación que toleras</label>
              <div className="input-suffix">
                <input
                  id={`${idBase}-banda`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={Math.round(props.rebalancePolicy.toleranceBand * 1000) / 10}
                  onChange={(e) => {
                    const porcentaje = Number(e.target.value.replace(',', '.'))
                    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) return
                    // Se pregunta en porcentaje y se guarda en fracción.
                    props.onRebalanceChange({ kind: 'bands', toleranceBand: porcentaje / 100 })
                  }}
                />
                <span className="suffix">%</span>
              </div>
            </div>
          )}
        </fieldset>
      </Card>

      <Card>
        <div className="field">
          <label htmlFor={`${idBase}-reserva`}>Reserva de liquidez que quieres mantener</label>
          <div className="input-suffix">
            <input
              id={`${idBase}-reserva`}
              inputMode="decimal"
              autoComplete="off"
              value={props.liquidityReserveMonths ?? ''}
              onChange={(e) => {
                const bruto = e.target.value
                if (bruto === '') return props.onReserveChange(undefined)
                const meses = Number(bruto.replace(',', '.'))
                props.onReserveChange(
                  Number.isFinite(meses) && meses >= 0 && meses <= 120 ? meses : undefined,
                )
              }}
            />
            <span className="suffix">meses</span>
          </div>
          <span className="hint">
            En meses de gasto. Es lo que quieres tener fuera del riesgo, no lo que ya tienes.
          </span>
        </div>
      </Card>

      <Card>
        <fieldset className="ips-fieldset">
          <legend>Aportaciones previstas</legend>
          <div className="ips-campos">
            <div className="field">
              <label htmlFor={`${idBase}-importe`}>Importe</label>
              <input
                id={`${idBase}-importe`}
                inputMode="decimal"
                autoComplete="off"
                value={plan.amount}
                onChange={(e) => cambiarPlan({ amount: e.target.value })}
              />
              <span className="hint">Déjalo en blanco si no quieres declarar ninguna.</span>
            </div>
            <div className="field">
              <label htmlFor={`${idBase}-divisa`}>Divisa</label>
              <select
                id={`${idBase}-divisa`}
                value={plan.currency}
                onChange={(e) => cambiarPlan({ currency: e.target.value as Currency })}
              >
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${idBase}-frecuencia`}>Cada cuánto</label>
              <select
                id={`${idBase}-frecuencia`}
                value={plan.frequency}
                onChange={(e) =>
                  cambiarPlan({ frequency: e.target.value as ContributionPlan['frequency'] })
                }
              >
                {FRECUENCIAS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>
      </Card>

      <Note>
        Nada de esto se ejecuta solo. Son reglas escritas para poder contrastarlas después con lo
        que de verdad hiciste.
      </Note>
    </div>
  )
}
