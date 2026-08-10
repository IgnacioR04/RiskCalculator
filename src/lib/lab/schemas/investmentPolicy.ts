/**
 * Validación de la política de inversión en la frontera (LAB-202).
 *
 * Todo lo que entra desde fuera —localStorage, Supabase, un fichero importado—
 * pasa por aquí antes de tocar el dominio.
 *
 * Dos reglas gobiernan el diseño:
 *
 * 1. **Ningún número no finito.** `z.number()` rechaza `NaN`, pero acepta
 *    `Infinity` sin más; por eso todos los numéricos usan `.finite()`. Un
 *    infinito colado en un peso envenena cualquier cálculo posterior en
 *    silencio.
 * 2. **Los pesos son fracciones 0–1.** Nunca porcentajes. Un `50` donde se
 *    esperaba `0.5` es un error de dos órdenes de magnitud que no se nota hasta
 *    que ya ha producido una recomendación absurda.
 */
import { z } from 'zod'
import {
  EFFECTIVE_RISK_RULE_VERSION,
  IPS_SCHEMA_VERSION,
  type InvestmentPolicy,
} from '../domain/investmentPolicy'

/** Número finito: descarta `NaN` e `Infinity`. */
const finito = z.number().finite()

/** Fracción de cartera. Cerrada en ambos extremos. */
const peso = finito.min(0).max(1)

/** Fecha `YYYY-MM-DD` que además existe en el calendario. */
const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Se espera una fecha YYYY-MM-DD')
  .refine((valor) => {
    const fecha = new Date(`${valor}T00:00:00Z`)
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
  }, 'La fecha no existe en el calendario')

/** Marca temporal ISO completa. */
const instanteIso = z.string().datetime({ offset: true }).or(z.string().datetime())

/** Importe monetario como texto, para no perder precisión al viajar. */
const importe = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Se espera un importe decimal en texto')
  .refine((valor) => Number.isFinite(Number(valor)), 'El importe no es finito')

const importePositivo = importe.refine((valor) => Number(valor) > 0, 'El importe debe ser positivo')

export const currencySchema = z.enum(['EUR', 'USD'])

export const riskBandSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])

/* ── Evaluación ───────────────────────────────────────────────────────────── */

export const toleranceAssessmentSchema = z.object({
  answers: z.record(z.string(), z.string()),
  band: riskBandSchema,
  assessedAt: instanteIso,
})

export const capacityAssessmentSchema = z
  .object({
    horizonYears: finito.int().min(0).max(100).optional(),
    emergencyFundMonths: finito.min(0).max(120).optional(),
    incomeStability: z.enum(['estable', 'variable', 'incierta']).optional(),
    dependents: finito.int().min(0).max(20).optional(),
    shareOfNetWorth: peso.optional(),
    band: riskBandSchema.optional(),
    assessedAt: instanteIso.optional(),
  })
  .refine(
    (capacidad) =>
      capacidad.band === undefined ||
      (capacidad.horizonYears !== undefined &&
        capacidad.emergencyFundMonths !== undefined &&
        capacidad.incomeStability !== undefined &&
        capacidad.dependents !== undefined &&
        capacidad.shareOfNetWorth !== undefined),
    {
      message:
        'La capacidad no puede tener banda sin todos sus hechos objetivos: ADR-002 prohíbe estimarla',
      path: ['band'],
    },
  )

export const needAssessmentSchema = z.object({
  band: riskBandSchema,
  derivedFrom: z.enum(['goals', 'declared']),
  assessedAt: instanteIso,
})

export const riskAssessmentSchema = z.object({
  tolerance: toleranceAssessmentSchema,
  capacity: capacityAssessmentSchema,
  need: needAssessmentSchema.optional(),
})

/* ── Objetivos y restricciones ────────────────────────────────────────────── */

export const investmentGoalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  priority: z.enum(['esencial', 'importante', 'deseable']),
  currency: currencySchema,
  targetAmount: importePositivo,
  targetDate: fechaIso,
  dateFlexible: z.boolean(),
  amountFlexible: z.boolean(),
  monthlyContribution: importe.optional(),
  notes: z.string().max(500).optional(),
})

/**
 * Miembros de la unión, sin refinar. `discriminatedUnion` de zod exige objetos
 * planos: un `.refine()` los envuelve en `ZodEffects` y el discriminante deja de
 * poder leerse. La coherencia de rangos se comprueba después, sobre la unión ya
 * construida.
 */
const constraintVariants = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('assetWeight'),
    instrumentId: z.string().min(1),
    min: peso.optional(),
    max: peso.optional(),
  }),
  z.object({
    kind: z.literal('groupWeight'),
    dimension: z.enum(['assetType', 'sector', 'region', 'currency', 'issuer']),
    key: z.string().min(1),
    min: peso.optional(),
    max: peso.optional(),
  }),
  z.object({ kind: z.literal('turnover'), max: peso }),
  z.object({ kind: z.literal('liquidity'), minimumLiquidWeight: peso }),
  z.object({
    kind: z.literal('lockedPosition'),
    instrumentId: z.string().min(1),
    weight: peso.optional(),
  }),
  z.object({
    kind: z.literal('eligibleUniverse'),
    instrumentIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({ kind: z.literal('contributionsOnly'), enabled: z.literal(true) }),
])

/**
 * Restricción validada. Un mínimo mayor que su máximo no es una restricción
 * estricta: es una contradicción que ningún optimizador puede satisfacer, y
 * conviene rechazarla al entrar y no al resolver.
 */
export const portfolioConstraintSchema = constraintVariants.refine(
  (restriccion) =>
    !('min' in restriccion) ||
    restriccion.min === undefined ||
    restriccion.max === undefined ||
    restriccion.min <= restriccion.max,
  { message: 'El peso mínimo no puede superar al máximo', path: ['min'] },
)

/* ── Plan, rebalanceo y supuestos ─────────────────────────────────────────── */

export const contributionPlanSchema = z.object({
  amount: importePositivo,
  currency: currencySchema,
  frequency: z.enum(['mensual', 'trimestral', 'anual', 'puntual']),
  startsOn: fechaIso.optional(),
})

export const rebalancePolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('calendar'), everyMonths: finito.int().min(1).max(120) }),
  z.object({ kind: z.literal('bands'), toleranceBand: peso }),
])

export const policyAssumptionsSchema = z.object({
  // Rangos amplios pero acotados: una inflación del 1000 % no es un supuesto,
  // es un dedo resbalado.
  inflation: finito.min(-1).max(1).optional(),
  riskFreeRate: finito.min(-1).max(1).optional(),
  taxTreatment: z.enum(['ignorado', 'estimado']).optional(),
  notes: z.string().max(1000).optional(),
})

export const policyAcknowledgementSchema = z.object({
  kind: z.enum(['perfil-confirmado', 'conflicto-aceptado', 'migracion-confirmada']),
  acknowledgedAt: instanteIso,
  note: z.string().max(500).optional(),
})

/* ── La política ──────────────────────────────────────────────────────────── */

const investmentPolicyBase = z.object({
  schemaVersion: finito.int().min(1),
  id: z.string().min(1),
  userId: z.string().min(1).optional(),
  version: finito.int().min(1),
  status: z.enum(['draft', 'active', 'superseded']),
  effectiveFrom: fechaIso,
  reviewedAt: fechaIso.optional(),
  nextReviewAt: fechaIso.optional(),
  baseCurrency: currencySchema,
  assessment: riskAssessmentSchema,
  effectiveRisk: riskBandSchema.optional(),
  effectiveRiskRuleVersion: finito.int().min(1),
  liquidityReserveMonths: finito.min(0).max(120).optional(),
  goals: z.array(investmentGoalSchema),
  constraints: z.array(portfolioConstraintSchema),
  contributionPlan: contributionPlanSchema.optional(),
  rebalancePolicy: rebalancePolicySchema,
  assumptions: policyAssumptionsSchema,
  acknowledgements: z.array(policyAcknowledgementSchema),
})

export const investmentPolicySchema = investmentPolicyBase
  .refine(
    (policy) => policy.nextReviewAt === undefined || policy.nextReviewAt >= policy.effectiveFrom,
    { message: 'La revisión no puede ser anterior a la entrada en vigor', path: ['nextReviewAt'] },
  )
  .refine(
    (policy) =>
      policy.effectiveRisk === undefined || policy.assessment.capacity.band !== undefined,
    {
      message:
        'No puede haber riesgo efectivo sin capacidad medida: la capacidad no se deduce de la tolerancia',
      path: ['effectiveRisk'],
    },
  )
  .refine(
    (policy) =>
      policy.status !== 'active' ||
      (policy.assessment.capacity.band !== undefined &&
        policy.effectiveRisk !== undefined &&
        policy.goals.length > 0 &&
        policy.acknowledgements.length > 0),
    {
      message:
        'Una política activa exige capacidad medida, riesgo efectivo, al menos un objetivo y confirmación explícita',
      path: ['status'],
    },
  )
  .refine(
    (policy) => new Set(policy.goals.map((objetivo) => objetivo.id)).size === policy.goals.length,
    { message: 'Hay objetivos con el mismo identificador', path: ['goals'] },
  )

export type InvestmentPolicyInput = z.input<typeof investmentPolicySchema>

/**
 * Valida una política que llega de fuera. Devuelve el resultado de zod sin
 * lanzar: quien llama decide cómo degradar.
 */
export function parseInvestmentPolicy(value: unknown) {
  return investmentPolicySchema.safeParse(value)
}

/**
 * Valores por defecto de un borrador nuevo. Nace en `draft`, sin capacidad y sin
 * riesgo efectivo, que es exactamente lo que corresponde antes de preguntar.
 */
export function emptyPolicyDraft(id: string, effectiveFrom: string): InvestmentPolicy {
  return {
    schemaVersion: IPS_SCHEMA_VERSION,
    id,
    version: 1,
    status: 'draft',
    effectiveFrom,
    baseCurrency: 'EUR',
    assessment: {
      tolerance: { answers: {}, band: 3, assessedAt: `${effectiveFrom}T00:00:00Z` },
      capacity: {},
    },
    effectiveRiskRuleVersion: EFFECTIVE_RISK_RULE_VERSION,
    goals: [],
    constraints: [],
    rebalancePolicy: { kind: 'none' },
    assumptions: {},
    acknowledgements: [],
  }
}
