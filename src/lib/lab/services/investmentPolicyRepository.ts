/**
 * Persistencia en la nube de la política de inversión (LAB-206).
 *
 * **Única capa autorizada a tocar las tablas de política.** Ningún componente
 * habla con `investment_policies`, `investment_goals` ni
 * `portfolio_constraints` directamente; hay una prueba que lo comprueba
 * recorriendo el árbol de fuentes, porque es el criterio de aceptación de la
 * tarea y una convención sin guardián se rompe sola.
 *
 * Todo lo que se lee se valida con zod antes de entrar al dominio: la base
 * puede contener filas escritas por una versión anterior del cliente, o por
 * alguien hablando con PostgREST a mano.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../../supabase'
import type { InvestmentPolicy, PortfolioConstraint } from '../domain/investmentPolicy'
import { parseInvestmentPolicy } from '../schemas/investmentPolicy'
import {
  TABLA_OBJETIVOS,
  TABLA_POLITICAS,
  TABLA_RESTRICCIONES,
  type InvestmentGoalRow,
  type InvestmentPolicyRow,
  type PortfolioConstraintRow,
} from './investmentPolicyDb'

export type RepositoryFailure =
  /** No hay proyecto Supabase configurado: la aplicación sigue en modo local. */
  | 'not_configured'
  /** Otro cliente activó una política mientras se editaba esta. */
  | 'version_conflict'
  /** Lo que hay guardado no cumple el contrato. */
  | 'invalid_data'
  | 'network'
  | 'unknown'

export type RepositoryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: RepositoryFailure; readonly message: string }

function fallo<T>(reason: RepositoryFailure, message: string): RepositoryResult<T> {
  return { ok: false, reason, message }
}

/** Violación de unicidad en Postgres: aquí solo puede ser la política activa. */
const CODIGO_UNICIDAD = '23505'

/* ── Mapeo entre la fila y el dominio ─────────────────────────────────────── */

function filaAPolitica(
  fila: InvestmentPolicyRow,
  objetivos: readonly InvestmentGoalRow[],
  restricciones: readonly PortfolioConstraintRow[],
): unknown {
  // Se devuelve `unknown` a propósito: el resultado va directo a zod, y
  // tipificarlo aquí daría una falsa sensación de que ya está validado.
  return {
    schemaVersion: fila.schema_version,
    id: fila.id,
    ...(fila.user_id === null ? {} : { userId: fila.user_id }),
    version: fila.version,
    status: fila.status,
    effectiveFrom: fila.effective_from,
    ...(fila.reviewed_at === null ? {} : { reviewedAt: fila.reviewed_at }),
    ...(fila.next_review_at === null ? {} : { nextReviewAt: fila.next_review_at }),
    baseCurrency: fila.base_currency,
    assessment: fila.assessment,
    ...(fila.effective_risk === null ? {} : { effectiveRisk: fila.effective_risk }),
    effectiveRiskRuleVersion: fila.effective_risk_rule_version,
    ...(fila.liquidity_reserve_months === null
      ? {}
      : { liquidityReserveMonths: Number(fila.liquidity_reserve_months) }),
    goals: objetivos.map((objetivo) => ({
      id: objetivo.id,
      name: objetivo.name,
      priority: objetivo.priority,
      currency: objetivo.currency,
      // `numeric` llega como texto y así se queda: convertirlo a `number`
      // perdería precisión en importes grandes.
      targetAmount: objetivo.target_amount,
      targetDate: objetivo.target_date,
      dateFlexible: objetivo.date_flexible,
      amountFlexible: objetivo.amount_flexible,
      ...(objetivo.monthly_contribution === null
        ? {}
        : { monthlyContribution: objetivo.monthly_contribution }),
      ...(objetivo.notes === null ? {} : { notes: objetivo.notes }),
    })),
    constraints: restricciones.map((restriccion) => ({
      kind: restriccion.kind,
      ...restriccion.payload,
    })),
    ...(fila.contribution_plan === null ? {} : { contributionPlan: fila.contribution_plan }),
    rebalancePolicy: fila.rebalance_policy,
    assumptions: fila.assumptions,
    acknowledgements: fila.acknowledgements,
  }
}

function politicaAFila(policy: InvestmentPolicy, userId: string): Record<string, unknown> {
  return {
    id: policy.id,
    user_id: userId,
    schema_version: policy.schemaVersion,
    version: policy.version,
    status: policy.status,
    effective_from: policy.effectiveFrom,
    reviewed_at: policy.reviewedAt ?? null,
    next_review_at: policy.nextReviewAt ?? null,
    base_currency: policy.baseCurrency,
    assessment: policy.assessment,
    effective_risk: policy.effectiveRisk ?? null,
    effective_risk_rule_version: policy.effectiveRiskRuleVersion,
    liquidity_reserve_months: policy.liquidityReserveMonths ?? null,
    contribution_plan: policy.contributionPlan ?? null,
    rebalance_policy: policy.rebalancePolicy,
    assumptions: policy.assumptions,
    acknowledgements: policy.acknowledgements,
  }
}

/** Separa el discriminante del resto: la tabla guarda `kind` y `payload`. */
function restriccionAFila(
  restriccion: PortfolioConstraint,
  policyId: string,
  userId: string,
): Record<string, unknown> {
  const { kind, ...payload } = restriccion
  return { policy_id: policyId, user_id: userId, kind, payload }
}

/* ── Lectura ──────────────────────────────────────────────────────────────── */

interface Cliente {
  readonly supabase: SupabaseClient
  readonly userId: string
}

async function conSesion(): Promise<RepositoryResult<Cliente>> {
  const supabase = getSupabase()
  if (supabase === null) {
    return fallo('not_configured', 'No hay proyecto Supabase configurado.')
  }
  const { data, error } = await supabase.auth.getSession()
  if (error !== null) return fallo('network', error.message)
  const userId = data.session?.user.id
  if (userId === undefined) {
    return fallo('not_configured', 'No hay sesión iniciada: la política vive solo en local.')
  }
  return { ok: true, value: { supabase, userId } }
}

/**
 * Carga la política vigente del usuario. `null` es una respuesta legítima: la
 * mayoría de la gente todavía no tiene ninguna.
 */
export async function loadActivePolicy(): Promise<RepositoryResult<InvestmentPolicy | null>> {
  const sesion = await conSesion()
  if (!sesion.ok) return sesion

  const { supabase, userId } = sesion.value
  const { data, error } = await supabase
    .from(TABLA_POLITICAS)
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error !== null) return fallo('network', error.message)
  if (data === null) return { ok: true, value: null }

  return hidratar(supabase, data as InvestmentPolicyRow)
}

/** Carga una política concreta, con sus objetivos y restricciones. */
export async function loadPolicyById(
  id: string,
): Promise<RepositoryResult<InvestmentPolicy | null>> {
  const sesion = await conSesion()
  if (!sesion.ok) return sesion

  const { supabase, userId } = sesion.value
  const { data, error } = await supabase
    .from(TABLA_POLITICAS)
    .select('*')
    .eq('id', id)
    // Redundante con la RLS, y a propósito: si algún día alguien afloja una
    // política, el filtro del cliente sigue en pie.
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null) return fallo('network', error.message)
  if (data === null) return { ok: true, value: null }

  return hidratar(supabase, data as InvestmentPolicyRow)
}

async function hidratar(
  supabase: SupabaseClient,
  fila: InvestmentPolicyRow,
): Promise<RepositoryResult<InvestmentPolicy>> {
  const [objetivos, restricciones] = await Promise.all([
    supabase.from(TABLA_OBJETIVOS).select('*').eq('policy_id', fila.id),
    supabase.from(TABLA_RESTRICCIONES).select('*').eq('policy_id', fila.id),
  ])

  if (objetivos.error !== null) return fallo('network', objetivos.error.message)
  if (restricciones.error !== null) return fallo('network', restricciones.error.message)

  const candidata = filaAPolitica(
    fila,
    (objetivos.data ?? []) as InvestmentGoalRow[],
    (restricciones.data ?? []) as PortfolioConstraintRow[],
  )

  const validada = parseInvestmentPolicy(candidata)
  if (!validada.success) {
    // No se devuelve una política a medias: quien llama debe poder distinguir
    // «no hay» de «hay algo que no entiendo».
    return fallo(
      'invalid_data',
      `La política guardada no cumple el contrato: ${validada.error.issues[0]?.message ?? 'motivo desconocido'}`,
    )
  }
  return { ok: true, value: validada.data as InvestmentPolicy }
}

/* ── Escritura ────────────────────────────────────────────────────────────── */

/**
 * Guarda una versión nueva. **Nunca sobrescribe la activa**: la anterior pasa a
 * `superseded` y se conserva, porque es el contexto bajo el que se calcularon
 * los resultados que ya existen (ADR-002 §7).
 *
 * Limitación conocida: PostgREST no ofrece transacciones multi-tabla, así que
 * la escritura son varios pasos. Si fallan los hijos, se borra la política
 * recién creada y el borrado arrastra en cascada lo que hubiera entrado. No es
 * atomicidad real; para eso haría falta una función RPC en la base, que queda
 * como trabajo aparte y está anotada como D15.
 */
export async function saveNewVersion(
  policy: InvestmentPolicy,
): Promise<RepositoryResult<InvestmentPolicy>> {
  const sesion = await conSesion()
  if (!sesion.ok) return sesion
  const { supabase, userId } = sesion.value

  // Si la nueva entra como activa, la anterior deja de serlo primero. El índice
  // único parcial de la base impide que coexistan dos, así que el orden importa.
  if (policy.status === 'active') {
    const { error } = await supabase
      .from(TABLA_POLITICAS)
      .update({ status: 'superseded' })
      .eq('user_id', userId)
      .eq('status', 'active')
      .neq('id', policy.id)
    if (error !== null) return fallo('network', error.message)
  }

  const { error: errorPolitica } = await supabase
    .from(TABLA_POLITICAS)
    .insert(politicaAFila(policy, userId))

  if (errorPolitica !== null) {
    if (errorPolitica.code === CODIGO_UNICIDAD) {
      return fallo(
        'version_conflict',
        'Otro dispositivo activó una política mientras editabas esta. Vuelve a cargarla antes de guardar.',
      )
    }
    return fallo('network', errorPolitica.message)
  }

  const hijos = await insertarHijos(supabase, policy, userId)
  if (!hijos.ok) {
    // Compensación: sin la política, sus hijos no tienen sentido. El borrado
    // cascada limpia lo que hubiera llegado a entrar.
    await supabase.from(TABLA_POLITICAS).delete().eq('id', policy.id).eq('user_id', userId)
    return hijos
  }

  return { ok: true, value: policy }
}

async function insertarHijos(
  supabase: SupabaseClient,
  policy: InvestmentPolicy,
  userId: string,
): Promise<RepositoryResult<null>> {
  if (policy.goals.length > 0) {
    const { error } = await supabase.from(TABLA_OBJETIVOS).insert(
      policy.goals.map((objetivo) => ({
        id: objetivo.id,
        policy_id: policy.id,
        user_id: userId,
        name: objetivo.name,
        priority: objetivo.priority,
        currency: objetivo.currency,
        target_amount: objetivo.targetAmount,
        target_date: objetivo.targetDate,
        date_flexible: objetivo.dateFlexible,
        amount_flexible: objetivo.amountFlexible,
        monthly_contribution: objetivo.monthlyContribution ?? null,
        notes: objetivo.notes ?? null,
      })),
    )
    if (error !== null) return fallo('network', error.message)
  }

  if (policy.constraints.length > 0) {
    const { error } = await supabase
      .from(TABLA_RESTRICCIONES)
      .insert(policy.constraints.map((r) => restriccionAFila(r, policy.id, userId)))
    if (error !== null) return fallo('network', error.message)
  }

  return { ok: true, value: null }
}

/** Exportado solo para pruebas: permite comprobar el mapeo sin tocar la red. */
export const __soloParaPruebas = { filaAPolitica, politicaAFila, restriccionAFila }
