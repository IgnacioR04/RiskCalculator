/**
 * Paso 9 del asistente: revisión y firma educativa (LAB-209).
 *
 * Resume lo declarado (documento de producto §8.2), dice qué impide activar y
 * pide una confirmación explícita antes de dar la política por vigente.
 *
 * La confirmación no es un trámite. ADR-002 §6 la exige porque activar una
 * política cambia lo que la aplicación hace después: a partir de ahí los
 * resultados se presentan en su contexto. Y lo que se firma es que **esto es una
 * herramienta educativa**, no un dictamen de idoneidad.
 */
import { Card, Note } from '../../../../components/ui'
import { formatMoney } from '../../../../lib/format'
import {
  RISK_BAND_INFO,
  type InvestmentPolicy,
  type KnowledgeLevel,
} from '../../../../lib/lab/domain/investmentPolicy'
import type { ActivationBlocker } from '../../../../lib/lab/analytics/policyActivation'
import { findConstraintIssues } from '../../../../lib/lab/analytics/constraintConsistency'
import { TOLERANCE_QUESTIONS } from '../../../../lib/lab/analytics/toleranceBand'
import { describir } from './ConstraintsStep'

/** Qué falta, dicho en la lengua del usuario y no en códigos. */
const TEXTO_BLOQUEO: Readonly<Record<ActivationBlocker, string>> = {
  no_goals: 'Declara al menos un objetivo en el paso 1.',
  tolerance_not_assessed: 'Contesta las cinco preguntas de tolerancia en el paso 4.',
  capacity_incomplete: 'Completa los cinco datos de situación en los pasos 2 y 3.',
  no_effective_risk:
    'Sin tolerancia declarada y capacidad medida no hay riesgo efectivo, y sin él no hay política.',
  constraints_contradictory: 'Corrige en el paso 7 los límites que se contradicen.',
  not_acknowledged: 'Marca la confirmación de aquí abajo.',
  derived_from_legacy_unconfirmed:
    'Revisa y confirma el borrador que se dedujo de tu perfil anterior.',
  already_active: 'Esta política ya está vigente.',
}

const NOMBRE_NIVEL: Readonly<Record<KnowledgeLevel, string>> = {
  basico: 'básico',
  medio: 'medio',
  avanzado: 'avanzado',
}

export interface ReviewStepProps {
  readonly policy: InvestmentPolicy
  readonly blockers: readonly ActivationBlocker[]
  readonly acknowledged: boolean
  readonly onAcknowledge: (confirmado: boolean) => void
  readonly onActivate: () => void
}

export function ReviewStep(props: ReviewStepProps) {
  const { policy } = props
  const prioritario = objetivoPrioritario(policy)
  const perdidaTolerada = perdidaMaximaDeclarada(policy)
  const issues = findConstraintIssues(policy.constraints)
  const puedeActivar = props.blockers.length === 0

  return (
    <div className="ips-step">
      <p className="muted">
        Esto es lo que has declarado. Repásalo antes de darlo por bueno: a partir de aquí es el
        contexto con el que se presentarán los resultados.
      </p>

      <Card>
        <h4 className="card-title">Tu política, en una pantalla</h4>
        <dl className="ips-resumen">
          <Fila etiqueta="Objetivo prioritario">
            {prioritario === undefined
              ? 'Sin declarar'
              : `${prioritario.name} · ${formatMoney(prioritario.targetAmount, prioritario.currency)} · ${prioritario.targetDate}`}
          </Fila>
          <Fila etiqueta="Horizonte">
            {policy.assessment.capacity.horizonYears === undefined
              ? 'Sin declarar'
              : `${policy.assessment.capacity.horizonYears} años`}
          </Fila>
          <Fila etiqueta="Pérdida máxima que dices tolerar">
            {perdidaTolerada ?? 'Sin declarar'}
          </Fila>
          <Fila etiqueta="Capacidad de asumir pérdidas">
            {banda(policy.assessment.capacity.band)}
          </Fila>
          <Fila etiqueta="Tolerancia declarada">{banda(policy.assessment.tolerance.band)}</Fila>
          <Fila etiqueta="Riesgo efectivo">
            {policy.effectiveRisk === undefined
              ? 'No se puede calcular: falta capacidad o tolerancia'
              : `${RISK_BAND_INFO[policy.effectiveRisk].nombre} — el menor de los dos`}
          </Fila>
          <Fila etiqueta="Conocimientos declarados">
            {policy.assessment.knowledge?.level === undefined
              ? 'Sin declarar'
              : NOMBRE_NIVEL[policy.assessment.knowledge.level]}
          </Fila>
          <Fila etiqueta="Aportaciones">
            {policy.contributionPlan === undefined
              ? 'Ninguna declarada'
              : `${formatMoney(policy.contributionPlan.amount, policy.contributionPlan.currency)} · ${policy.contributionPlan.frequency}`}
          </Fila>
          <Fila etiqueta="Reserva de liquidez">
            {policy.liquidityReserveMonths === undefined
              ? 'Sin declarar'
              : `${policy.liquidityReserveMonths} meses de gasto`}
          </Fila>
          <Fila etiqueta="Reequilibrio">{rebalanceo(policy)}</Fila>
          <Fila etiqueta="Restricciones">
            {policy.constraints.length === 0
              ? 'Ninguna'
              : policy.constraints.map(describir).join(' · ')}
          </Fila>
          <Fila etiqueta="Revisión">
            {policy.nextReviewAt ?? 'Se fijará a doce meses al activar'}
          </Fila>
          <Fila etiqueta="Entra en vigor">
            {policy.status === 'active' ? policy.effectiveFrom : 'Al activarla'}
          </Fila>
          <Fila etiqueta="Versión">
            {policy.version} · {policy.status}
          </Fila>
        </dl>
      </Card>

      {issues.length > 0 && (
        <Note kind={issues.some((i) => i.severity === 'error') ? 'negative' : 'warning'}>
          <strong>Restricciones que no encajan.</strong>
          <ul className="ips-pendientes">
            {issues.map((issue) => (
              <li key={`${issue.code}-${issue.indices.join('-')}`}>{issue.message}</li>
            ))}
          </ul>
        </Note>
      )}

      {policy.assessment.knowledge?.level === 'basico' && (
        <Note kind="warning">
          Has declarado experiencia básica. No impide nada, pero conviene tenerlo presente si más
          adelante aparece un producto complejo: entenderlo es parte del riesgo.
        </Note>
      )}

      <Card>
        <h4 className="card-title">Confirmación</h4>
        <label htmlFor="ips-firma" className="ips-firma">
          <input
            id="ips-firma"
            type="checkbox"
            checked={props.acknowledged}
            onChange={(e) => props.onAcknowledge(e.target.checked)}
          />
          <span>
            He revisado lo de arriba y es lo que quiero declarar. Entiendo que RiskCalculator es
            una herramienta educativa: no es asesoramiento financiero, no evalúa mi idoneidad y no
            me recomienda comprar ni vender nada.
          </span>
        </label>

        {props.blockers.length > 0 && (
          <Note kind="warning">
            <strong>Falta esto para poder activarla:</strong>
            <ul className="ips-pendientes">
              {props.blockers.map((blocker) => (
                <li key={blocker}>{TEXTO_BLOQUEO[blocker]}</li>
              ))}
            </ul>
          </Note>
        )}

        <button
          type="button"
          className="btn primary"
          disabled={!puedeActivar}
          onClick={props.onActivate}
        >
          Activar esta política
        </button>
        <p className="muted tiny mb-0">
          Al activarla queda fija: para cambiar algo se abre una versión nueva y la anterior se
          conserva tal cual, porque es el contexto de los resultados que ya has visto.
        </p>
      </Card>
    </div>
  )
}

function Fila(props: { etiqueta: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{props.etiqueta}</dt>
      <dd>{props.children}</dd>
    </>
  )
}

function banda(valor: InvestmentPolicy['effectiveRisk']): string {
  return valor === undefined ? 'Sin medir' : RISK_BAND_INFO[valor].nombre
}

/** El objetivo esencial más cercano; si no hay esencial, el más cercano de todos. */
function objetivoPrioritario(policy: InvestmentPolicy) {
  const porFecha = [...policy.goals].sort((a, b) => a.targetDate.localeCompare(b.targetDate))
  return porFecha.find((goal) => goal.priority === 'esencial') ?? porFecha[0]
}

/** La respuesta que el usuario dio a la pregunta de pérdida máxima tolerada. */
function perdidaMaximaDeclarada(policy: InvestmentPolicy): string | undefined {
  const pregunta = TOLERANCE_QUESTIONS.find((p) => p.id === 'perdida-anual')
  const elegida = pregunta?.options.find(
    (o) => o.value === policy.assessment.tolerance.answers[pregunta.id],
  )
  return elegida?.label
}

function rebalanceo(policy: InvestmentPolicy): string {
  const regla = policy.rebalancePolicy
  if (regla.kind === 'none') return 'No reequilibrar (elección declarada)'
  if (regla.kind === 'calendar') return `Cada ${regla.everyMonths} meses`
  return `Cuando un peso se desvíe más de ${Math.round(regla.toleranceBand * 1000) / 10} %`
}
