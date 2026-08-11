/**
 * Activación y versionado de la política (LAB-209).
 *
 * Implementa ADR-002 §5, §6 y §7. Tres reglas, y las tres existen para lo mismo:
 * que un resultado antiguo se pueda explicar meses después.
 *
 * - **Una política activa no se edita.** Editar produce una versión nueva en
 *   borrador; la activa sigue donde estaba hasta que la nueva se active. Es el
 *   criterio de aceptación de la tarea.
 * - **La anterior no se borra**, pasa a `superseded`. Es el contexto bajo el que
 *   se calculó lo que ya existe.
 * - **Caduca a los doce meses**, con aviso a los diez. Caducar suspende la
 *   personalización, no el acceso.
 *
 * Todo es puro y con la fecha como argumento: sin reloj implícito no hay
 * resultado que no se pueda reproducir.
 */
import type { InvestmentPolicy } from '../domain/investmentPolicy'
import { missingCapacityFacts } from './policyAssessment'
import { hasBlockingConstraintIssues } from './constraintConsistency'

/** Meses de validez de una política (ADR-002 §5). */
export const REVIEW_PERIOD_MONTHS = 12

/**
 * Qué falta para poder activar. Códigos estables; la interfaz traduce.
 * Se corresponden uno a uno con la lista de ADR-002 §6.
 */
export type ActivationBlocker =
  | 'no_goals'
  | 'tolerance_not_assessed'
  | 'capacity_incomplete'
  | 'no_effective_risk'
  | 'constraints_contradictory'
  | 'not_acknowledged'
  | 'derived_from_legacy_unconfirmed'
  | 'already_active'

export interface ActivationContext {
  /** El borrador viene del perfil antiguo y nadie lo ha confirmado (LAB-204). */
  readonly derivedFromLegacy: boolean
}

/**
 * Todo lo que impide activar, en orden estable y **completo**: no se corta en el
 * primer problema, porque quien rellena esto quiere saber cuánto le queda, no
 * descubrirlo de uno en uno.
 */
export function activationBlockers(
  policy: InvestmentPolicy,
  context: ActivationContext,
): readonly ActivationBlocker[] {
  const bloqueos: ActivationBlocker[] = []

  if (policy.status === 'active') bloqueos.push('already_active')
  if (policy.goals.length === 0) bloqueos.push('no_goals')
  if (policy.assessment.tolerance.band === undefined) bloqueos.push('tolerance_not_assessed')
  if (missingCapacityFacts(policy.assessment.capacity).length > 0) {
    bloqueos.push('capacity_incomplete')
  }
  if (policy.effectiveRisk === undefined) bloqueos.push('no_effective_risk')
  if (hasBlockingConstraintIssues(policy.constraints)) bloqueos.push('constraints_contradictory')
  if (policy.acknowledgements.length === 0) bloqueos.push('not_acknowledged')
  if (context.derivedFromLegacy) bloqueos.push('derived_from_legacy_unconfirmed')

  return bloqueos
}

export function canActivatePolicy(
  policy: InvestmentPolicy,
  context: ActivationContext,
): boolean {
  return activationBlockers(policy, context).length === 0
}

/**
 * Suma meses a una fecha `YYYY-MM-DD` sin salirse del mes.
 *
 * El 31 de enero más un mes no es el 3 de marzo. `Date` lo desborda solo, así
 * que el día se recorta al último del mes de destino.
 */
export function addMonths(fecha: string, meses: number): string {
  const base = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) throw new Error(`Fecha no válida: ${fecha}`)

  const ano = base.getUTCFullYear()
  const mes = base.getUTCMonth() + meses
  const dia = base.getUTCDate()

  const ultimoDelMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  const destino = new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDelMes)))
  return destino.toISOString().slice(0, 10)
}

/** Fecha de la próxima revisión: doce meses después de entrar en vigor. */
export function nextReviewFrom(effectiveFrom: string): string {
  return addMonths(effectiveFrom, REVIEW_PERIOD_MONTHS)
}

/**
 * Pasa un borrador a vigente.
 *
 * Vuelve a sellar la fecha de entrada en vigor: lo que importa es cuándo empieza
 * a regir, no cuándo se empezó a rellenar. De ahí sale la caducidad.
 *
 * No comprueba nada: quien llama debe haber pasado por `activationBlockers`. Se
 * deja así para que la comprobación tenga un solo sitio y no dos versiones que
 * puedan discrepar.
 */
export function activatePolicy(policy: InvestmentPolicy, hoy: string): InvestmentPolicy {
  return {
    ...policy,
    status: 'active',
    effectiveFrom: hoy,
    reviewedAt: hoy,
    nextReviewAt: nextReviewFrom(hoy),
  }
}

/** Retira una política vigente sin borrarla (ADR-002 §7). */
export function supersedePolicy(policy: InvestmentPolicy): InvestmentPolicy {
  return { ...policy, status: 'superseded' }
}

/**
 * Borrador de la versión siguiente a partir de la vigente.
 *
 * Se lleva el contenido y **no** la vigencia: sube `version`, vuelve a `draft` y
 * pierde las confirmaciones, porque confirmar la versión anterior no es
 * confirmar esta. El identificador es nuevo para que las dos puedan coexistir
 * en la base, que es lo que permite conservar la anterior.
 */
export function nextDraftFrom(
  active: InvestmentPolicy,
  nuevoId: string,
  hoy: string,
): InvestmentPolicy {
  const { reviewedAt: _revisada, nextReviewAt: _revision, ...contenido } = active
  return {
    ...contenido,
    id: nuevoId,
    version: active.version + 1,
    status: 'draft',
    effectiveFrom: hoy,
    acknowledgements: [],
  }
}
