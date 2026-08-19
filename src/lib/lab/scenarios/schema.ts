/**
 * Validación de escenarios en la frontera (LAB-501).
 *
 * El tipo de TypeScript impide construir un escenario incompleto **en el
 * código**. Esto impide que entre uno incompleto **desde fuera**: de
 * `localStorage`, de un fichero importado o de Supabase, donde no hay tipos que
 * valgan.
 *
 * Dos reglas propias de esta frontera, además de las generales del proyecto:
 *
 * - **Un escenario con azar no puede existir sin semilla.** Se comprueba en el
 *   esquema, no en el motor: si dependiera del motor, cualquier ruta que se
 *   olvidara de pasarla produciría resultados irreproducibles en silencio.
 * - **Los shocks son fracciones, nunca porcentajes.** Un `-30` donde se
 *   esperaba `-0.3` es un error de dos órdenes de magnitud que produce una
 *   cartera de valor negativo, y una cartera de valor negativo se ve; peor es
 *   el caso contrario, `-0.003` por `-0.3`, que pasa por un resultado plausible.
 */
import { z } from 'zod'
import {
  SCENARIO_SCHEMA_VERSION,
  isStochastic,
  type ScenarioDefinition,
  type ScenarioResult,
} from './contracts'

const finito = z.number().finite()

/**
 * Un shock, como fracción.
 *
 * El suelo es −1: perderlo todo. Por debajo sería un valor negativo, que no
 * existe en una posición larga. El techo de 10 (+1.000 %) no es una verdad
 * financiera, es un cortafuegos contra el porcentaje mal escrito.
 */
const shock = finito.min(-1, 'Un shock no puede ser peor que perderlo todo').max(10)

const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Se espera una fecha YYYY-MM-DD')
  .refine((valor) => {
    const fecha = new Date(`${valor}T00:00:00Z`)
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
  }, 'La fecha no existe en el calendario')

/**
 * Shocks por clase de activo, todos opcionales.
 *
 * Se escribe como objeto con claves opcionales y no como `z.record(enum, …)`:
 * en zod 3 un record con clave de enum exige **todas** las clases, que obligaría
 * a declarar un shock para `cash` y `manual` en cada escenario.
 */
const byTypeSchema = z.object({
  stock: shock.optional(),
  etf: shock.optional(),
  crypto: shock.optional(),
  commodity: shock.optional(),
  index: shock.optional(),
  cash: shock.optional(),
  manual: shock.optional(),
})

export const horizonSchema = z.object({
  amount: finito.positive('El horizonte tiene que ser positivo'),
  unit: z.enum(['days', 'months', 'years']),
})

export const assumptionSchema = z.object({
  label: z.string().min(1),
  detail: z.string().min(1),
})

const deterministicSchema = z.object({
  kind: z.literal('deterministic'),
  general: shock.optional(),
  byType: byTypeSchema.optional(),
  byAsset: z.record(z.string(), shock).optional(),
  fxForeign: shock.optional(),
})

const historicalSchema = z.object({
  kind: z.literal('historical'),
  from: fechaIso,
  to: fechaIso,
})

const bootstrapSchema = z.object({
  kind: z.literal('bootstrap'),
  // Un bloque de un día destruye la dependencia temporal que el método existe
  // para conservar; uno de más de un año no deja bloques que remuestrear.
  blockDays: finito.int().min(2).max(252),
  paths: finito.int().min(100).max(10_000),
})

const goalSchema = z.object({
  kind: z.literal('goal'),
  target: finito.positive('El objetivo tiene que ser un importe positivo'),
  contribution: z
    .object({
      amount: finito.positive(),
      everyDays: finito.int().positive(),
    })
    .optional(),
})

/**
 * La unión lleva solo objetos planos: `z.discriminatedUnion` de zod 3 no acepta
 * miembros con `.refine`, así que las reglas que cruzan campos se aplican
 * después, sobre la unión ya resuelta.
 */
export const scenarioParamsSchema = z
  .discriminatedUnion('kind', [
    deterministicSchema,
    historicalSchema,
    bootstrapSchema,
    goalSchema,
  ])
  .refine(
    (v) => v.kind !== 'historical' || v.from < v.to,
    'El periodo tiene que empezar antes de terminar',
  )

export const scenarioDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: finito.int().positive(),
    horizon: horizonSchema,
    params: scenarioParamsSchema,
    seed: finito.int().optional(),
    assumptions: z.array(assumptionSchema),
    description: z.string().optional(),
    source: z.enum(['builtin', 'user']),
  })
  .refine(
    (v) => !isStochastic(v.params.kind) || v.seed !== undefined,
    'Un escenario con azar necesita semilla: sin ella el resultado no se puede reproducir',
  )

const pathSummarySchema = z.object({
  p05: finito,
  p25: finito,
  p50: finito,
  p75: finito,
  p95: finito,
})

export const scenarioResultSchema = z.object({
  definitionId: z.string().min(1),
  definitionVersion: finito.int().positive(),
  modelVersion: z.string().min(1),
  asOf: fechaIso,
  seed: finito.int().optional(),
  baseValue: finito,
  baseCurrency: z.enum(['EUR', 'USD']),
  outcome: z.object({
    finalValue: finito.nullable(),
    changePct: finito.nullable(),
    distribution: pathSummarySchema.optional(),
    successRate: finito.min(0).max(1).optional(),
    maxDrawdown: finito.min(-1).max(0).optional(),
  }),
  contributions: z.array(
    z.object({
      assetId: z.string().min(1),
      symbol: z.string().min(1),
      before: finito,
      after: finito,
      shareOfChange: finito.nullable(),
    }),
  ),
  assumptions: z.array(assumptionSchema),
  notCovered: z.array(z.string()),
})

/** Valida una definición que viene de fuera. Nunca lanza. */
export function parseScenarioDefinition(
  valor: unknown,
): { ok: true; value: ScenarioDefinition } | { ok: false; error: string } {
  const r = scenarioDefinitionSchema.safeParse(valor)
  return r.success
    ? { ok: true, value: r.data as ScenarioDefinition }
    : { ok: false, error: r.error.issues[0]?.message ?? 'Escenario inválido' }
}

/** Valida un resultado guardado. Nunca lanza. */
export function parseScenarioResult(
  valor: unknown,
): { ok: true; value: ScenarioResult } | { ok: false; error: string } {
  const r = scenarioResultSchema.safeParse(valor)
  return r.success
    ? { ok: true, value: r.data as ScenarioResult }
    : { ok: false, error: r.error.issues[0]?.message ?? 'Resultado inválido' }
}

export { SCENARIO_SCHEMA_VERSION }
