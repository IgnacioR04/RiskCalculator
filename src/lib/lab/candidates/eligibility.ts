/**
 * Qué restricciones puede imponer el solver, y qué pasa con las que no
 * (LAB-1103).
 *
 * ## El defecto que cierra este módulo
 *
 * `projectToSimplex` proyecta sobre cajas por activo. Eso impone bien un
 * `assetWeight` y un grupo con techo cero, y **no impone nada más**. Un tope de
 * sector al 30 %, un suelo de liquidez, una posición bloqueada o un límite de
 * rotación no caben en una caja por activo: el optimizador los ignora mientras
 * resuelve.
 *
 * Hasta aquí, la consecuencia era que una candidata que se saltara un tope de
 * sector salía con `violations: ['Tecnología entre 0 % y 30 %']` y por lo demás
 * con la misma pinta que una correcta. Una lista de textos no impide que algo
 * se presente como factible, y una cartera que incumple un límite duro **no lo
 * es**.
 *
 * Peor todavía: `violations` solo mira `bounds`. `lockedPosition`,
 * `contributionsOnly` y `maxTurnover` no son bounds, así que una candidata que
 * vendiera una posición bloqueada salía con **cero incumplimientos**.
 *
 * Aquí se separan tres cosas que no son la misma:
 *
 * - lo que el solver **impone** mientras optimiza (`box`);
 * - lo que solo se puede **comprobar después** (`checked_after`);
 * - y si la candidata resultante es **elegible**, que es distinto de si tiene
 *   texto en una lista.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import { turnover } from './costModel'
import {
  violations,
  type CompiledConstraints,
  type ConstraintSeverity,
} from './constraintCompiler'

export const ELIGIBILITY_VERSION = 'eligibility-v1'

/** Cómo se hace cumplir una restricción concreta. */
export type EnforcementKind =
  /** El solver la impone en cada iteración: la solución no puede violarla. */
  | 'box'
  /**
   * El solver no la conoce. Se comprueba sobre el resultado, y si no se cumple
   * la candidata deja de ser elegible.
   */
  | 'checked_after'

export interface ConstraintEnforcement {
  readonly id: string
  readonly label: string
  readonly severity: ConstraintSeverity
  readonly kind: EnforcementKind
}

export interface EnforcementReport {
  readonly version: string
  readonly items: readonly ConstraintEnforcement[]
  /** Duras que el solver no impone y hay que comprobar a posteriori. */
  readonly hardCheckedAfter: readonly ConstraintEnforcement[]
}

/**
 * Clasifica cada restricción por cómo se puede hacer cumplir.
 *
 * Un límite de un solo instrumento es una caja y el solver lo respeta siempre.
 * Un límite de grupo solo cabe en una caja cuando su techo es cero, porque
 * entonces equivale a poner a cero cada miembro; con cualquier otro techo,
 * repartir el margen entre los miembros es parte del problema y no de la
 * proyección.
 */
export function enforcementReport(compiled: CompiledConstraints): EnforcementReport {
  const items: ConstraintEnforcement[] = []

  for (const bound of compiled.bounds) {
    const esCaja = bound.members.length === 1 || bound.max <= 1e-9
    items.push({
      id: bound.id,
      label: bound.label,
      severity: bound.severity,
      kind: esCaja ? 'box' : 'checked_after',
    })
  }

  for (const i of compiled.locked) {
    items.push({
      id: `locked:${i}`,
      label: `${compiled.universe[i]?.symbol ?? `#${i}`} no se puede vender`,
      severity: 'hard',
      kind: 'checked_after',
    })
  }

  if (compiled.contributionsOnly) {
    items.push({
      id: 'contributionsOnly',
      label: 'Solo se puede aportar: ninguna posición puede bajar',
      severity: 'hard',
      kind: 'checked_after',
    })
  }

  if (compiled.maxTurnover !== null) {
    items.push({
      id: 'turnover',
      label: `Rotación máxima del ${Math.round(compiled.maxTurnover * 100)} %`,
      severity: 'hard',
      kind: 'checked_after',
    })
  }

  return {
    version: ELIGIBILITY_VERSION,
    items,
    hardCheckedAfter: items.filter((i) => i.severity === 'hard' && i.kind === 'checked_after'),
  }
}

/** Un incumplimiento, ya sea de un límite o de una regla que no es un límite. */
export interface EligibilityBreach {
  readonly id: string
  readonly label: string
  readonly severity: ConstraintSeverity
  readonly detail: string
}

export interface CandidateEligibility {
  readonly version: string
  /**
   * `false` si incumple **cualquier** restricción dura.
   *
   * Una candidata no elegible puede seguir mostrándose —comparar contra ella
   * informa— pero no puede presentarse como factible ni elegirse como cartera
   * compatible con el perfil.
   */
  readonly eligible: boolean
  readonly breaches: readonly EligibilityBreach[]
  /**
   * Lo que el solver no pudo imponer durante la optimización, se cumpla o no.
   * Va en el informe aunque no haya incumplimiento: que esta vez saliera bien
   * no significa que el motor lo estuviera vigilando.
   */
  readonly limitations: readonly string[]
}

/** Margen de coma flotante, el mismo que usa el compilador. */
const EPS = 1e-9

/**
 * Comprueba una cartera contra **todas** las restricciones, no solo las que son
 * límites.
 *
 * `violations` del compilador cubre `bounds`. Aquí se añaden las tres reglas
 * que no son bounds y que por eso pasaban desapercibidas: posiciones
 * bloqueadas, plan de solo aportaciones y rotación máxima.
 */
export function candidateEligibility(
  compiled: CompiledConstraints,
  weights: readonly number[] | null,
): CandidateEligibility {
  const informe = enforcementReport(compiled)
  const limitaciones = informe.hardCheckedAfter.map(
    (i) =>
      `«${i.label}» no la impone el optimizador mientras resuelve: se comprueba sobre el resultado. Si no se cumple, la cartera queda descartada en vez de ajustada.`,
  )

  if (weights === null) {
    return {
      version: ELIGIBILITY_VERSION,
      eligible: false,
      breaches: [],
      limitations: limitaciones,
    }
  }

  const breaches: EligibilityBreach[] = violations(compiled, weights).map((v) => ({
    id: v.boundId,
    label: v.label,
    severity: v.severity,
    detail: `El conjunto queda en ${pct(v.actual)}, fuera del rango ${pct(v.min)}–${pct(v.max)}.`,
  }))

  const actuales = compiled.universe.map((item) => item.currentWeight)

  for (const i of compiled.locked) {
    const antes = actuales[i] ?? 0
    const despues = weights[i] ?? 0
    if (despues < antes - EPS) {
      breaches.push({
        id: `locked:${i}`,
        label: `${compiled.universe[i]?.symbol ?? `#${i}`} no se puede vender`,
        severity: 'hard',
        detail: `La cartera propuesta la baja del ${pct(antes)} al ${pct(despues)}.`,
      })
    }
  }

  if (compiled.contributionsOnly) {
    const bajan = compiled.universe.flatMap((item, i) =>
      (weights[i] ?? 0) < (actuales[i] ?? 0) - EPS ? [item.symbol] : [],
    )
    if (bajan.length > 0) {
      breaches.push({
        id: 'contributionsOnly',
        label: 'Solo se puede aportar: ninguna posición puede bajar',
        severity: 'hard',
        detail: `Bajarían ${bajan.length}: ${bajan.join(', ')}.`,
      })
    }
  }

  if (compiled.maxTurnover !== null) {
    const rotacion = turnover(actuales, weights)
    if (rotacion > compiled.maxTurnover + EPS) {
      breaches.push({
        id: 'turnover',
        label: `Rotación máxima del ${pct(compiled.maxTurnover)}`,
        severity: 'hard',
        detail: `Llegar a esta cartera exige mover el ${pct(rotacion)}.`,
      })
    }
  }

  return {
    version: ELIGIBILITY_VERSION,
    eligible: !breaches.some((b) => b.severity === 'hard'),
    breaches,
    limitations: limitaciones,
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`
