/**
 * Diagnóstico de factibilidad (LAB-602).
 *
 * Contesta la pregunta que un optimizador no sabe contestar: **¿por qué no hay
 * ninguna cartera que cumpla mis reglas?**
 *
 * Un solver que no converge devuelve «infactible» y se queda tan ancho. Eso es
 * inútil para quien escribió las reglas: no sabe cuál sobra, ni cuánto tendría
 * que aflojar, ni si el problema es una regla concreta o la combinación de tres.
 *
 * Este módulo se ejecuta **antes** de optimizar y busca las contradicciones que
 * se pueden explicar en una frase. No es una prueba de factibilidad completa
 * —eso lo dice el propio solver— y esa limitación está declarada: hay
 * combinaciones infactibles que esto no detecta.
 *
 * ## Qué significa «conjunto mínimo útil»
 *
 * Cuando tres mínimos suman más del 100 %, el conjunto culpable son los tres:
 * quitar cualquiera arregla el problema. Decir «tu política es infactible» no
 * ayuda; decir «estos tres mínimos suman un 120 %» sí, porque señala dónde
 * mirar.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { CompiledBound, CompiledConstraints } from './constraintCompiler'

/** Margen de coma flotante al comparar sumas de fracciones. */
const EPS = 1e-9

export type InfeasibilityKind =
  /** Los suelos exigen más del 100 % de la cartera. */
  | 'minimums_exceed_total'
  /** Los techos no llegan al 100 %: sobraría dinero sin dónde ponerlo. */
  | 'maximums_below_total'
  /** Un límite pide un mínimo mayor que su propio máximo. */
  | 'inverted_bound'
  /** Un grupo exige un mínimo que sus miembros no pueden alcanzar. */
  | 'group_capped_below_minimum'
  /** No queda ningún instrumento donde invertir. */
  | 'empty_universe'
  /** Algo bloqueado tiene que pesar cero: no se puede tener y no tener. */
  | 'locked_forced_to_zero'

export interface Infeasibility {
  readonly kind: InfeasibilityKind
  /** Límites implicados. El conjunto mínimo que explica el problema. */
  readonly bounds: readonly string[]
  /** Qué pasa, con los números concretos. */
  readonly detail: string
  /** Qué aflojar. Un diagnóstico sin salida no sirve de nada. */
  readonly remediation: string
}

export interface FeasibilityReport {
  readonly feasible: boolean
  /** Ordenadas de más a menos determinante. */
  readonly problems: readonly Infeasibility[]
  /** Lo que este análisis **no** comprueba. */
  readonly limitations: readonly string[]
}

export const FEASIBILITY_LIMITATIONS = [
  'Solo detecta contradicciones que se explican en una frase. Una combinación de límites que se estorban entre sí de forma indirecta la descubre el optimizador, no esto.',
  'No mira costes ni rotación: una cartera puede ser alcanzable en teoría y demasiado cara de alcanzar.',
] as const

const pct = (fraccion: number) => `${(fraccion * 100).toFixed(1).replace('.', ',')} %`

/**
 * Busca las contradicciones evidentes de un conjunto compilado.
 *
 * El orden importa: se informa primero de lo que hace imposible cualquier
 * solución, y después de lo que estorba a una parte.
 */
export function assessFeasibility(compiled: CompiledConstraints): FeasibilityReport {
  const problems: Infeasibility[] = []
  const { universe, bounds } = compiled

  const duros = bounds.filter((b) => b.severity === 'hard')

  if (universe.length === 0) {
    problems.push({
      kind: 'empty_universe',
      bounds: [],
      detail: 'No hay ningún instrumento sobre el que construir una cartera.',
      remediation: 'Añade posiciones o amplía el universo elegible.',
    })
  }

  // 1. Un límite que se contradice a sí mismo.
  for (const b of duros) {
    if (b.min > b.max + EPS) {
      problems.push({
        kind: 'inverted_bound',
        bounds: [b.id],
        detail: `«${b.label}» pide un mínimo del ${pct(b.min)} y un máximo del ${pct(b.max)}.`,
        remediation: 'Corrige uno de los dos: el mínimo no puede superar al máximo.',
      })
    }
  }

  // 2. Suelos que no caben. Se usan solo los límites **disjuntos** para no
  //    contar dos veces al mismo instrumento: si «tech ≥ 30 %» y «AAPL ≥ 20 %»
  //    y AAPL es tech, sumarlos daría un 50 % que no es real.
  const disjuntos = seleccionDisjunta(duros)
  const sumaMinimos = disjuntos.reduce((s, b) => s + b.min, 0)
  if (sumaMinimos > 1 + EPS) {
    problems.push({
      kind: 'minimums_exceed_total',
      bounds: disjuntos.filter((b) => b.min > 0).map((b) => b.id),
      detail: `Los mínimos exigen ${pct(sumaMinimos)} de la cartera, y solo hay un 100 % que repartir.`,
      remediation: `Baja alguno de los mínimos: sobran ${pct(sumaMinimos - 1)}.`,
    })
  }

  // 3. Techos que no llegan. Solo tiene sentido preguntarlo si los límites
  //    cubren a todos los instrumentos: si alguno queda libre, ahí cabe el
  //    resto y no hay problema.
  const cubiertos = new Set(disjuntos.flatMap((b) => b.members))
  if (universe.length > 0 && cubiertos.size === universe.length) {
    const sumaMaximos = disjuntos.reduce((s, b) => s + b.max, 0)
    if (sumaMaximos < 1 - EPS) {
      problems.push({
        kind: 'maximums_below_total',
        bounds: disjuntos.map((b) => b.id),
        detail: `Los máximos solo admiten ${pct(sumaMaximos)} de la cartera: quedaría un ${pct(1 - sumaMaximos)} sin dónde ir.`,
        remediation: 'Sube algún máximo o deja algún activo sin techo.',
      })
    }
  }

  // 4. Un grupo cuyo mínimo no pueden alcanzar sus propios miembros, porque
  //    cada uno tiene su techo.
  for (const grupo of duros) {
    if (grupo.min <= EPS || grupo.members.length < 2) continue

    const techoAlcanzable = grupo.members.reduce((s, i) => {
      const propio = duros.find((b) => b.members.length === 1 && b.members[0] === i)
      return s + (propio === undefined ? 1 : propio.max)
    }, 0)

    if (techoAlcanzable < grupo.min - EPS) {
      problems.push({
        kind: 'group_capped_below_minimum',
        bounds: [
          grupo.id,
          ...duros.filter((b) => b.members.length === 1 && grupo.members.includes(b.members[0]!)).map((b) => b.id),
        ],
        detail: `«${grupo.label}» exige al menos ${pct(grupo.min)}, pero los topes de sus activos solo permiten llegar al ${pct(techoAlcanzable)}.`,
        remediation: 'Sube el techo de alguno de esos activos o baja el mínimo del grupo.',
      })
    }
  }

  // 5. Algo que no se puede vender y a la vez tiene que valer cero.
  for (const i of compiled.locked) {
    const forzadoACero = duros.find((b) => b.members.includes(i) && b.max <= EPS)
    if (forzadoACero !== undefined) {
      problems.push({
        kind: 'locked_forced_to_zero',
        bounds: [forzadoACero.id],
        detail: `${universe[i]?.symbol ?? i} no se puede vender, pero «${forzadoACero.label}» lo obliga a pesar cero.`,
        remediation: 'Permite venderlo o quita el límite que lo excluye.',
      })
    }
  }

  return {
    feasible: problems.length === 0,
    problems,
    limitations: [...FEASIBILITY_LIMITATIONS],
  }
}

/**
 * Selecciona un subconjunto de límites **sin instrumentos compartidos**.
 *
 * Sumar mínimos de grupos que se solapan cuenta dos veces al mismo dinero y
 * produce un falso «infactible», que es peor que no avisar: el usuario aflojaría
 * una regla que no era el problema.
 *
 * Se prefieren los límites de mínimo más alto, que son los que de verdad
 * aprietan; los empates se rompen por identificador para que el resultado no
 * dependa del orden de entrada.
 */
function seleccionDisjunta(bounds: readonly CompiledBound[]): readonly CompiledBound[] {
  const candidatos = [...bounds].sort((a, b) => b.min - a.min || a.id.localeCompare(b.id))
  const usados = new Set<number>()
  const salida: CompiledBound[] = []

  for (const b of candidatos) {
    if (b.members.length === 0) continue
    if (b.members.some((i) => usados.has(i))) continue
    b.members.forEach((i) => usados.add(i))
    salida.push(b)
  }

  return salida
}
