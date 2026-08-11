/**
 * Paso 6 del asistente: necesidad de rentabilidad (LAB-215).
 *
 * Coge los números que has declarado, hace la cuenta y dice la verdad: si tu
 * objetivo cuadra con el riesgo que aceptas, si es agresivo, o si sencillamente
 * no se sostiene. Y cuando no cuadra, enseña **qué números sí cuadrarían**.
 *
 * Ninguna de esas cifras es una recomendación de compra. Son la misma ecuación
 * que tú has escrito, despejada por otra variable.
 */
import { useMemo } from 'react'
import { Card, Note } from '../../../../components/ui'
import { formatMoney } from '../../../../lib/format'
import { buildPortfolioView } from '../../../../lib/portfolio'
import {
  RETURN_BY_BAND,
  alternativesFor,
  assessReturnNeed,
  verdictFor,
  type GoalVerdict,
} from '../../../../lib/lab/analytics/returnNeed'
import {
  RISK_BAND_INFO,
  type InvestmentPolicy,
  type InvestmentGoal,
} from '../../../../lib/lab/domain/investmentPolicy'
import { useAppStore } from '../../../../state/store'

export interface NeedStepProps {
  readonly policy: InvestmentPolicy
  readonly hoy: string
}

const VEREDICTO: Readonly<Record<GoalVerdict, { titulo: string; tono: 'info' | 'warning' | 'negative' }>> = {
  holgado: { titulo: 'Cuadra de sobra', tono: 'info' },
  ajustado: { titulo: 'Cuadra justo', tono: 'info' },
  agresivo: { titulo: 'Es agresivo para tu perfil', tono: 'warning' },
  incompatible: { titulo: 'No cabe en el riesgo que aceptas', tono: 'negative' },
  imposible: { titulo: 'Así no se sostiene', tono: 'negative' },
  sin_datos: { titulo: 'Faltan datos para decirlo', tono: 'warning' },
}

export function NeedStep(props: NeedStepProps) {
  const assets = useAppStore((s) => s.assets)
  const accounts = useAppStore((s) => s.accounts)
  const transactions = useAppStore((s) => s.transactions)
  const quotes = useAppStore((s) => s.quotes)
  const fxRates = useAppStore((s) => s.fxRates)

  const capital = useMemo(() => {
    const vista = buildPortfolioView({
      assets,
      accounts,
      transactions,
      quotes,
      fxRates,
      displayCurrency: props.policy.baseCurrency,
    })
    return vista.totalValue.toNumber()
  }, [assets, accounts, transactions, quotes, fxRates, props.policy.baseCurrency])

  if (props.policy.goals.length === 0) {
    return (
      <div className="ips-step">
        <Note>
          Declara al menos un objetivo en el paso 1 y aquí te diré si cuadra con el riesgo que
          aceptas.
        </Note>
      </div>
    )
  }

  return (
    <div className="ips-step">
      <p className="muted">
        Con lo que tienes hoy ({formatMoney(capital, props.policy.baseCurrency)}), lo que aportas y
        el plazo que has puesto, esto es lo que haría falta ganar cada año para llegar.
      </p>

      {props.policy.goals.map((goal) => (
        <Objetivo
          key={goal.id}
          goal={goal}
          policy={props.policy}
          capital={capital}
          hoy={props.hoy}
        />
      ))}

      <Note>
        La cuenta de cuánto hay que ganar es aritmética sobre tus datos. Traducirla a un nivel de
        riesgo usa un <strong>supuesto declarado</strong> de la herramienta sobre qué rentabilidad
        cabría esperar de cada nivel — no es una predicción, y nadie puede garantizarla.
      </Note>
    </div>
  )
}

function Objetivo(props: {
  goal: InvestmentGoal
  policy: InvestmentPolicy
  capital: number
  hoy: string
}) {
  const entrada = {
    currentCapital: props.capital,
    goal: props.goal,
    today: props.hoy,
    ...(props.policy.contributionPlan === undefined
      ? {}
      : { contributionPlan: props.policy.contributionPlan }),
  }
  const need = assessReturnNeed(entrada)
  const efectivo = props.policy.effectiveRisk
  const veredicto = verdictFor(need, efectivo)
  const meta = VEREDICTO[veredicto]
  const divisa = props.goal.currency

  return (
    <Card title={props.goal.name} sub={`${props.goal.targetAmount} ${divisa} · ${props.goal.targetDate}`}>
      <Note kind={meta.tono}>
        <strong>{meta.titulo}.</strong>{' '}
        {need.diagnosis === 'already_reached' && 'Ya tienes más de lo que pides para este objetivo.'}
        {need.diagnosis === 'no_time_left' &&
          'La fecha que has puesto ya pasó, o queda menos de un mes. Cambia la fecha para poder hacer la cuenta.'}
        {need.diagnosis === 'nothing_to_grow' &&
          'Sin capital de partida y sin aportaciones no hay nada que pueda crecer. Declara una aportación en el paso 8.'}
        {need.diagnosis === 'implausible' &&
          'Harían falta rentabilidades que ninguna cartera diversificada sostiene de forma estable. No es cuestión de asumir más riesgo: los números no dan.'}
        {need.diagnosis === 'solved' && need.requiredReturn !== undefined && (
          <>
            Harían falta cerca de un <strong>{porcentaje(need.requiredReturn)} anual</strong> durante{' '}
            {Math.round(need.months / 12)} años.
            {need.requiredBand !== undefined && (
              <>
                {' '}
                Eso encaja con un riesgo <strong>{RISK_BAND_INFO[need.requiredBand].nombre.toLowerCase()}</strong>
                {efectivo !== undefined && (
                  <>
                    , y el tuyo es <strong>{RISK_BAND_INFO[efectivo].nombre.toLowerCase()}</strong>
                  </>
                )}
                .
              </>
            )}
          </>
        )}
      </Note>

      {efectivo !== undefined && veredicto !== 'holgado' && veredicto !== 'ajustado' && (
        <Alternativas entrada={entrada} efectivo={efectivo} divisa={divisa} />
      )}
    </Card>
  )
}

function Alternativas(props: {
  entrada: Parameters<typeof alternativesFor>[0]
  efectivo: Parameters<typeof alternativesFor>[1]
  divisa: 'EUR' | 'USD'
}) {
  const alt = alternativesFor(props.entrada, props.efectivo)
  const mesesActuales = props.entrada.goal.targetDate
  const mensualActual = alt.monthlyNeeded

  return (
    <>
      <h4 className="card-title">Qué números sí cuadrarían</h4>
      <ul className="ips-pendientes">
        <li>
          <strong>Darte más tiempo:</strong>{' '}
          {alt.monthsNeeded === null
            ? 'ni con cuarenta años se llega con estos números.'
            : `unos ${Math.round(alt.monthsNeeded / 12)} años en vez de la fecha de ${mesesActuales}.`}
        </li>
        <li>
          <strong>Aportar más:</strong>{' '}
          {mensualActual === null
            ? 'no se puede calcular sin una fecha válida.'
            : `${formatMoney(mensualActual, props.divisa)} al mes.`}
        </li>
        <li>
          <strong>Ajustar el objetivo:</strong> con lo que aportas y el plazo actual llegarías a{' '}
          {formatMoney(alt.reachableTarget, props.divisa)}.
        </li>
      </ul>
      <p className="muted tiny mb-0">
        Calculado suponiendo un {porcentaje(alt.assumedReturn)} anual, que es lo que este supuesto
        asocia a tu nivel de riesgo ({RISK_BAND_INFO[props.efectivo].nombre.toLowerCase()}). Ninguna
        de estas cifras es una recomendación: son tu misma ecuación despejada por otra variable.
      </p>
    </>
  )
}

function porcentaje(fraccion: number): string {
  return `${(Math.round(fraccion * 1000) / 10).toString().replace('.', ',')} %`
}

/** Rentabilidad asociada a cada banda, para poder enseñarla en pantalla. */
export { RETURN_BY_BAND }
