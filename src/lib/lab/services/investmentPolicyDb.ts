/**
 * Filas de base de datos de la política de inversión (LAB-206).
 *
 * Espejo exacto de `supabase/migrations/20260810120000_investment_policy.sql`.
 *
 * **Estos tipos están escritos a mano, no generados.** `supabase gen types`
 * necesita una base en marcha, y este entorno no tiene Docker; generar contra
 * el proyecto real habría significado apuntar a producción para escribir un
 * archivo de tipos, que no es motivo suficiente. Queda anotado como divergencia
 * D14: en cuanto haya base local, conviene regenerarlos y comparar.
 *
 * Mientras tanto, la garantía no es la confianza: el mapeo se valida con zod al
 * leer, y las pruebas comprueban el viaje de ida y vuelta.
 */

/** Fila de `public.investment_policies`. */
export interface InvestmentPolicyRow {
  id: string
  user_id: string
  schema_version: number
  version: number
  status: 'draft' | 'active' | 'superseded'
  effective_from: string
  reviewed_at: string | null
  next_review_at: string | null
  base_currency: 'EUR' | 'USD'
  assessment: unknown
  effective_risk: number | null
  effective_risk_rule_version: number
  liquidity_reserve_months: number | null
  contribution_plan: unknown | null
  rebalance_policy: unknown
  assumptions: unknown
  acknowledgements: unknown
  created_at: string
  updated_at: string
}

/** Fila de `public.investment_goals`. */
export interface InvestmentGoalRow {
  id: string
  policy_id: string
  user_id: string
  name: string
  priority: 'esencial' | 'importante' | 'deseable'
  currency: 'EUR' | 'USD'
  /** `numeric` viaja como texto para no perder precisión. */
  target_amount: string
  target_date: string
  date_flexible: boolean
  amount_flexible: boolean
  monthly_contribution: string | null
  notes: string | null
}

/** Fila de `public.portfolio_constraints`. */
export interface PortfolioConstraintRow {
  id: string
  policy_id: string
  user_id: string
  kind: string
  payload: Record<string, unknown>
}

export const TABLA_POLITICAS = 'investment_policies' as const
export const TABLA_OBJETIVOS = 'investment_goals' as const
export const TABLA_RESTRICCIONES = 'portfolio_constraints' as const
