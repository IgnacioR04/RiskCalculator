/**
 * Motor de brechas (LAB-613).
 *
 * Ejecuta las reglas declarativas de `rules.ts` y devuelve los hallazgos
 * **ordenados**, con la garantía que da sentido a la pantalla: lo estructural
 * va antes que lo táctico, siempre.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import {
  RULES,
  THRESHOLDS,
  type Finding,
  type FindingSeverity,
  type RepairContext,
} from './rules'

export const REPAIR_ENGINE_VERSION = 'repair-v1'

/** Cuántos hallazgos se enseñan. Doce avisos no informan de doce cosas. */
export const MAX_VISIBLE = 4

const PESO_SEVERIDAD: Readonly<Record<FindingSeverity, number>> = {
  alta: 0,
  media: 1,
  baja: 2,
}

export interface RepairReport {
  readonly version: string
  /** Los que se enseñan, ya acotados y ordenados. */
  readonly findings: readonly Finding[]
  /** Cuántos se han dejado fuera por el tope. */
  readonly hidden: number
  /** Hallazgos descartados por afectar a muy poca cartera. */
  readonly immaterial: number
  readonly disclaimer: string
}

export const REPAIR_DISCLAIMER =
  'Esto describe cómo está construida tu cartera. No dice qué comprar ni qué vender: cada punto enlaza a una herramienta donde puedes mirarlo tú.'

/**
 * Ordena los hallazgos.
 *
 * **No admite ningún criterio que coloque lo táctico por encima de lo
 * estructural.** El orden es: naturaleza, después severidad, después
 * materialidad. Que sea una función sin parámetros de ordenación es
 * deliberado: una opción de «ordenar por severidad» permitiría que un aviso
 * táctico urgente tapara un problema estructural, que es justo lo que este
 * módulo existe para impedir.
 */
export function sortFindings(findings: readonly Finding[]): readonly Finding[] {
  return [...findings].sort(
    (a, b) =>
      naturaleza(a) - naturaleza(b) ||
      PESO_SEVERIDAD[a.severity] - PESO_SEVERIDAD[b.severity] ||
      b.materiality.weight - a.materiality.weight ||
      a.id.localeCompare(b.id),
  )
}

const naturaleza = (f: Finding) => (f.nature === 'structural' ? 0 : 1)

/**
 * Evalúa todas las reglas sobre el contexto.
 *
 * Un hallazgo que afecta a menos del umbral de materialidad se descarta y se
 * cuenta: una brecha sobre el 2 % de la cartera es ruido con formato de aviso.
 * La excepción son los incumplimientos de la política del usuario, que afectan
 * a la cartera entera por definición.
 */
export function assessRepair(ctx: RepairContext): RepairReport {
  const todos: Finding[] = []

  for (const regla of RULES) {
    for (const parcial of regla.evaluate(ctx)) {
      todos.push({
        ...parcial,
        id: `${regla.id}:${parcial.title}`,
        ruleId: regla.id,
        nature: regla.nature,
      })
    }
  }

  const materiales = todos.filter((f) => f.materiality.weight >= THRESHOLDS.materiality)
  const ordenados = sortFindings(materiales)

  return {
    version: REPAIR_ENGINE_VERSION,
    findings: ordenados.slice(0, MAX_VISIBLE),
    hidden: Math.max(0, ordenados.length - MAX_VISIBLE),
    immaterial: todos.length - materiales.length,
    disclaimer: REPAIR_DISCLAIMER,
  }
}
