/**
 * Rentabilidad necesaria para alcanzar un objetivo, y qué hacer si no cuadra
 * (LAB-215).
 *
 * Contesta la pregunta que la herramienta no sabía contestar: **«¿lo que quiero
 * conseguir cabe en el riesgo que acepto?»**. Y cuando no cabe, dice qué números
 * sí cuadrarían.
 *
 * Hay dos cosas aquí y conviene no confundirlas:
 *
 * 1. **Aritmética sobre lo que el usuario ha declarado.** Cuánto hay que ganar
 *    al año para llegar de X a Y en N meses aportando Z al mes. Esto no asume
 *    nada del mercado: es despejar una incógnita.
 * 2. **Un supuesto declarado** para traducir esa rentabilidad a un nivel de
 *    riesgo. Ese supuesto está escrito abajo, versionado y a la vista, y **no es
 *    una predicción**: nadie sabe qué dará cada cartera. Dice qué rentabilidad
 *    haría falta *esperar* para justificar cada banda, que es otra cosa.
 *
 * Lo que este archivo **no** hace: recomendar productos, prometer resultados ni
 * decir a nadie qué comprar. Solo despeja variables de una ecuación que el
 * propio usuario ha escrito.
 */
import type { ContributionPlan, InvestmentGoal, RiskBand } from '../domain/investmentPolicy'

/** Versión del supuesto de rentabilidad por banda. Viaja con cada resultado. */
export const RETURN_ASSUMPTION_VERSION = 1

/**
 * Rentabilidad anual que **haría falta esperar** para justificar cada banda de
 * riesgo.
 *
 * Supuesto declarado de la herramienta, no una medida ni un pronóstico. Los
 * cortes son deliberadamente redondos y conservadores: sirven para clasificar
 * un plan como razonable o agresivo, no para proyectar un patrimonio.
 *
 * Cambiarlos cambia el veredicto de un plan ya guardado, así que obliga a subir
 * `RETURN_ASSUMPTION_VERSION`.
 */
export const RETURN_BY_BAND: Readonly<Record<RiskBand, number>> = {
  1: 0.01, // Preservar: apenas por encima de no hacer nada.
  2: 0.03,
  3: 0.05,
  4: 0.07,
  5: 0.09, // Muy alta: aceptar caídas severas a cambio de más recorrido.
}

/**
 * Rentabilidad por encima de la cual un plan no se sostiene con ninguna cartera
 * diversificada. No es un límite legal ni físico: es el punto en que seguir
 * clasificando en bandas sería fingir precisión.
 */
export const IMPLAUSIBLE_RETURN = 0.25

/* ── Entrada ──────────────────────────────────────────────────────────────── */

export interface GoalPlanInput {
  /** Capital de partida, en la divisa del objetivo. */
  readonly currentCapital: number
  readonly goal: InvestmentGoal
  readonly contributionPlan?: ContributionPlan
  /** Fecha desde la que se cuenta. Argumento, nunca el reloj. */
  readonly today: string
}

/* ── Diagnóstico ──────────────────────────────────────────────────────────── */

export type NeedDiagnosis =
  /** Ya tienes más de lo que pides: no hace falta rentabilidad ninguna. */
  | 'already_reached'
  /** La fecha objetivo ya pasó, o queda menos de un mes. */
  | 'no_time_left'
  /** Sin capital y sin aportaciones no se llega a ningún sitio. */
  | 'nothing_to_grow'
  /** Se puede llegar, y se sabe con cuánta rentabilidad. */
  | 'solved'
  /** Haría falta tanto que ninguna cartera lo sostiene. */
  | 'implausible'

export interface ReturnNeedResult {
  readonly diagnosis: NeedDiagnosis
  /** Rentabilidad anual necesaria, en fracción. Solo con `solved`. */
  readonly requiredReturn?: number
  /** Banda que haría falta para justificarla. Solo con `solved`. */
  readonly requiredBand?: RiskBand
  readonly months: number
  /** Aportación mensual equivalente que se ha usado en la cuenta. */
  readonly monthlyContribution: number
  readonly assumptionVersion: number
}

/* ── La cuenta ────────────────────────────────────────────────────────────── */

/** Meses completos entre dos fechas `YYYY-MM-DD`. */
export function monthsBetween(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00Z`)
  const b = new Date(`${hasta}T00:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  const meses =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  return b.getUTCDate() < a.getUTCDate() ? meses - 1 : meses
}

/**
 * Aportación mensual equivalente.
 *
 * «Puntual» cuenta como **cero**: quien aporta cuando puede no está declarando
 * un compromiso, y contarlo como si lo fuera inflaría el resultado.
 */
export function monthlyFrom(plan: ContributionPlan | undefined): number {
  if (plan === undefined) return 0
  const importe = Number(plan.amount)
  if (!Number.isFinite(importe) || importe <= 0) return 0
  if (plan.frequency === 'mensual') return importe
  if (plan.frequency === 'trimestral') return importe / 3
  if (plan.frequency === 'anual') return importe / 12
  return 0
}

/** Valor futuro con capitalización mensual y aportaciones a fin de mes. */
export function futureValue(
  capital: number,
  monthly: number,
  months: number,
  annualReturn: number,
): number {
  const i = Math.pow(1 + annualReturn, 1 / 12) - 1
  if (Math.abs(i) < 1e-12) return capital + monthly * months
  const factor = Math.pow(1 + i, months)
  return capital * factor + monthly * ((factor - 1) / i)
}

/**
 * Rentabilidad anual necesaria, por bisección.
 *
 * Se resuelve numéricamente y no con una fórmula cerrada porque **no existe**
 * una cuando hay aportaciones periódicas: la ecuación es polinómica de grado
 * `months`. La bisección converge siempre porque el valor futuro crece de forma
 * monótona con la rentabilidad.
 */
export function solveRequiredReturn(
  capital: number,
  monthly: number,
  months: number,
  target: number,
): number | null {
  if (months <= 0) return null
  if (futureValue(capital, monthly, months, -0.99) > target) return null

  let bajo = -0.99
  let alto = 10
  if (futureValue(capital, monthly, months, alto) < target) return null

  for (let paso = 0; paso < 200; paso += 1) {
    const medio = (bajo + alto) / 2
    if (futureValue(capital, monthly, months, medio) < target) bajo = medio
    else alto = medio
  }
  return (bajo + alto) / 2
}

/** La banda más baja cuya rentabilidad esperada llega a lo que hace falta. */
export function bandForReturn(annualReturn: number): RiskBand | null {
  const bandas: RiskBand[] = [1, 2, 3, 4, 5]
  return bandas.find((banda) => RETURN_BY_BAND[banda] >= annualReturn - 1e-9) ?? null
}

/**
 * Diagnostica el plan. **Nunca lanza y nunca devuelve un número inventado**: si
 * el objetivo no se sostiene, lo dice con un código, no con una cifra grande.
 */
export function assessReturnNeed(input: GoalPlanInput): ReturnNeedResult {
  const months = monthsBetween(input.today, input.goal.targetDate)
  const monthly = monthlyFrom(input.contributionPlan)
  const target = Number(input.goal.targetAmount)
  const base = { months, monthlyContribution: monthly, assumptionVersion: RETURN_ASSUMPTION_VERSION }

  if (Number.isFinite(target) && input.currentCapital >= target) {
    return { diagnosis: 'already_reached', ...base }
  }
  if (months <= 0) return { diagnosis: 'no_time_left', ...base }
  if (input.currentCapital <= 0 && monthly <= 0) {
    return { diagnosis: 'nothing_to_grow', ...base }
  }

  const requerida = solveRequiredReturn(input.currentCapital, monthly, months, target)
  if (requerida === null || requerida > IMPLAUSIBLE_RETURN) {
    return {
      diagnosis: 'implausible',
      ...base,
      ...(requerida === null ? {} : { requiredReturn: requerida }),
    }
  }

  const banda = bandForReturn(requerida)
  return {
    diagnosis: 'solved',
    requiredReturn: requerida,
    ...(banda === null ? {} : { requiredBand: banda }),
    ...base,
  }
}

/* ── Veredicto contra el riesgo que el usuario acepta ─────────────────────── */

export type GoalVerdict =
  /** Cuadra de sobra: hace falta menos riesgo del que aceptas. */
  | 'holgado'
  /** Cuadra justo. */
  | 'ajustado'
  /** Pide más riesgo del que aceptas, pero por poco. */
  | 'agresivo'
  /** Pide bastante más riesgo del que aceptas. */
  | 'incompatible'
  /** No se sostiene con ninguna cartera, o no tiene sentido tal como está. */
  | 'imposible'
  /** Falta un dato para poder decir nada. */
  | 'sin_datos'

export function verdictFor(
  need: ReturnNeedResult,
  effectiveRisk: RiskBand | undefined,
): GoalVerdict {
  if (need.diagnosis === 'already_reached') return 'holgado'
  if (need.diagnosis === 'implausible' || need.diagnosis === 'nothing_to_grow') return 'imposible'
  if (need.diagnosis === 'no_time_left') return 'imposible'
  if (need.requiredBand === undefined || effectiveRisk === undefined) return 'sin_datos'

  const diferencia = need.requiredBand - effectiveRisk
  if (diferencia <= -1) return 'holgado'
  if (diferencia === 0) return 'ajustado'
  if (diferencia === 1) return 'agresivo'
  return 'incompatible'
}

/* ── Qué números sí cuadrarían ────────────────────────────────────────────── */

/**
 * Alternativas concretas para que el plan quepa en el riesgo aceptado.
 *
 * Cada una despeja **una sola variable** de la misma ecuación, dejando las
 * demás como están: así se ve qué cuesta cada camino por separado. Son las tres
 * primeras salidas del conflicto de ADR-002 §4, con números en vez de consejos.
 *
 * `null` en un campo significa «por ahí no se arregla»: por ejemplo, si ni con
 * cuarenta años de plazo se llega, no se inventa una fecha.
 */
export interface GoalAlternatives {
  /** Meses de plazo que harían falta manteniendo aportación y objetivo. */
  readonly monthsNeeded: number | null
  /** Aportación mensual que haría falta manteniendo plazo y objetivo. */
  readonly monthlyNeeded: number | null
  /** Objetivo alcanzable manteniendo plazo y aportación. */
  readonly reachableTarget: number
  /** Rentabilidad con la que se han hecho estas cuentas. */
  readonly assumedReturn: number
  readonly assumptionVersion: number
}

/** Tope de plazo al buscar alternativas: cuarenta años ya no es un plan. */
const MAX_MESES = 480

export function alternativesFor(
  input: GoalPlanInput,
  effectiveRisk: RiskBand,
): GoalAlternatives {
  const r = RETURN_BY_BAND[effectiveRisk]
  const months = monthsBetween(input.today, input.goal.targetDate)
  const monthly = monthlyFrom(input.contributionPlan)
  const target = Number(input.goal.targetAmount)
  const capital = input.currentCapital

  // 1. Alargar el plazo. Se busca el primer mes en que se llega.
  let monthsNeeded: number | null = null
  for (let m = Math.max(1, months); m <= MAX_MESES; m += 1) {
    if (futureValue(capital, monthly, m, r) >= target) {
      monthsNeeded = m
      break
    }
  }

  // 2. Aportar más. Se despeja la mensualidad, que sí tiene fórmula cerrada.
  let monthlyNeeded: number | null = null
  if (months > 0) {
    const i = Math.pow(1 + r, 1 / 12) - 1
    const factor = Math.pow(1 + i, months)
    const acumulador = Math.abs(i) < 1e-12 ? months : (factor - 1) / i
    const necesario = (target - capital * factor) / acumulador
    monthlyNeeded = necesario > 0 ? necesario : 0
  }

  // 3. Bajar el objetivo a lo que de verdad da de sí el plan actual.
  const reachableTarget = months > 0 ? futureValue(capital, monthly, months, r) : capital

  return {
    monthsNeeded,
    monthlyNeeded,
    reachableTarget,
    assumedReturn: r,
    assumptionVersion: RETURN_ASSUMPTION_VERSION,
  }
}
