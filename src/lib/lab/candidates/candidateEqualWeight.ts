/**
 * Candidata a partes iguales, 1/N (LAB-604).
 *
 * Es la baseline, y no es una baseline tonta: repartir a partes iguales bate a
 * muchos optimizadores fuera de muestra, porque no estima nada y por tanto no se
 * equivoca al estimar. Cualquier candidata más sofisticada tiene que justificar
 * por qué merece la pena frente a esto.
 *
 * ## Lo que la hace no trivial
 *
 * «Partes iguales» deja de ser trivial en cuanto hay restricciones. Un activo
 * topado al 10 % con seis activos en cartera no puede llevarse su 16,7 %, y el
 * sobrante tiene que ir a algún sitio **sin romper los demás topes**.
 *
 * Se resuelve por reparto iterativo del residuo: se da a cada uno lo que le toca
 * acotado a su caja, y lo que sobra se reparte entre los que aún tienen sitio,
 * hasta que no queda nada o nadie tiene hueco. Es el criterio de aceptación:
 * los pesos suman uno y las violaciones son cero.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { CompiledConstraints } from './constraintCompiler'
import { violations as comprobar } from './constraintCompiler'
import type { PortfolioCandidate } from './contracts'

export const EQUAL_WEIGHT_VERSION = 'candidate-equalweight-v1'

const EPS = 1e-9
const MAX_PASADAS = 100

const SUPUESTOS = [
  {
    label: 'No estima nada',
    detail:
      'Reparte por igual sin mirar rentabilidades ni riesgos pasados. Por eso no puede equivocarse al estimarlos, que es de donde vienen la mayoría de los errores de las carteras optimizadas.',
  },
  {
    label: 'Trata igual lo que no lo es',
    detail:
      'Un fondo mundial y una acción suelta pesan lo mismo. Es deliberado: es la referencia contra la que se comparan las demás candidatas, no una propuesta.',
  },
] as const

/**
 * Reparte a partes iguales respetando las cajas de cada activo.
 *
 * `min` y `max` por activo salen de los límites compilados que afectan a uno
 * solo. Los límites de grupo **no** se usan para acotar el reparto —requerirían
 * un optimizador— pero sí se comprueban al final: si el reparto los incumple, se
 * dice en vez de entregar una cartera que no cumple lo que promete.
 */
export function candidateEqualWeight(compiled: CompiledConstraints): PortfolioCandidate {
  const n = compiled.universe.length

  if (n === 0) {
    return {
      method: 'equalWeight',
      modelVersion: EQUAL_WEIGHT_VERSION,
      weights: null,
      solver: { status: 'invalid_input', iterations: 0, residual: 0, tolerance: EPS },
      violations: [],
      assumptions: [...SUPUESTOS],
      notCovered: ['No hay ningún instrumento sobre el que repartir.'],
    }
  }

  // Cajas por activo. Sin límite propio, el activo puede ir de 0 a 1.
  const min = new Array<number>(n).fill(0)
  const max = new Array<number>(n).fill(1)
  for (const b of compiled.bounds) {
    if (b.severity !== 'hard') continue

    if (b.members.length === 1) {
      const i = b.members[0]!
      min[i] = Math.max(min[i]!, b.min)
      max[i] = Math.min(max[i]!, b.max)
      continue
    }

    // Un grupo con techo cero obliga a **cada** miembro a cero: los pesos no son
    // negativos, así que ninguno puede compensar a otro. Es exacto, no una
    // aproximación, y es como llega el universo elegible desde el compilador.
    // El resto de límites de grupo no se pueden repartir sin un optimizador; se
    // comprueban al final.
    if (b.max <= EPS) {
      for (const i of b.members) max[i] = 0
    }
  }

  // Una caja imposible no se arregla repartiendo.
  if (min.some((m, i) => m > max[i]! + EPS)) {
    return {
      method: 'equalWeight',
      modelVersion: EQUAL_WEIGHT_VERSION,
      weights: null,
      solver: { status: 'infeasible', iterations: 0, residual: 0, tolerance: EPS },
      violations: [],
      assumptions: [...SUPUESTOS],
      notCovered: ['Algún activo tiene un mínimo mayor que su máximo.'],
    }
  }

  const sumaMinimos = min.reduce((s, v) => s + v, 0)
  const sumaMaximos = max.reduce((s, v) => s + v, 0)
  if (sumaMinimos > 1 + EPS || sumaMaximos < 1 - EPS) {
    return {
      method: 'equalWeight',
      modelVersion: EQUAL_WEIGHT_VERSION,
      weights: null,
      solver: { status: 'infeasible', iterations: 0, residual: 0, tolerance: EPS },
      violations: [],
      assumptions: [...SUPUESTOS],
      notCovered: [
        sumaMinimos > 1
          ? 'Los mínimos por activo exigen más del 100 % de la cartera.'
          : 'Los máximos por activo no llegan a cubrir el 100 % de la cartera.',
      ],
    }
  }

  // Todos arrancan en su mínimo; se reparte lo que queda.
  const pesos = [...min]
  let restante = 1 - sumaMinimos
  let pasadas = 0

  while (restante > EPS && pasadas < MAX_PASADAS) {
    pasadas += 1
    const conHueco = pesos.flatMap((w, i) => (max[i]! - w > EPS ? [i] : []))
    if (conHueco.length === 0) break

    const porCabeza = restante / conHueco.length
    let repartido = 0
    for (const i of conHueco) {
      // Lo que se le da es lo que le toca o lo que le cabe, lo que sea menor.
      const cabe = Math.min(porCabeza, max[i]! - pesos[i]!)
      pesos[i] = pesos[i]! + cabe
      repartido += cabe
    }
    restante -= repartido
    // Sin avance no hay nada más que hacer: evita un bucle que no termina.
    if (repartido <= EPS) break
  }

  const convergido = restante <= EPS

  return {
    method: 'equalWeight',
    modelVersion: EQUAL_WEIGHT_VERSION,
    weights: convergido ? pesos : null,
    solver: {
      status: convergido ? 'converged' : 'infeasible',
      iterations: pasadas,
      residual: restante,
      tolerance: EPS,
    },
    // Los límites de grupo no acotan el reparto, pero sí se comprueban: entregar
    // una cartera que incumple lo que promete sería peor que no entregarla.
    violations: convergido ? comprobar(compiled, pesos).map((v) => v.label) : [],
    assumptions: [...SUPUESTOS],
    notCovered: convergido ? [] : ['No se ha podido repartir el 100 % respetando los topes.'],
  }
}
