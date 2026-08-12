/**
 * Matriz de dependencia par a par (LAB-410).
 *
 * Contesta «¿mis posiciones se mueven juntas?». Es la pregunta que hay detrás
 * de «creo que estoy diversificado»: tener diez cosas no diversifica si las
 * diez bajan a la vez.
 *
 * ## Por qué par a par y no una intersección global
 *
 * Lo cómodo sería recortar todas las series al rango común y calcular una
 * matriz sobre él. Es lo que hace casi todo el mundo y tiene un coste que no se
 * ve: **una sola posición reciente destruye el historial de todas las demás**.
 * Si compraste algo hace dos meses, la intersección global deja la matriz
 * entera en dos meses de datos, y una correlación sobre 40 observaciones se
 * presenta con la misma cara que una sobre 2.000.
 *
 * Aquí cada celda se estima con **su propio solape**, y lleva encima cuántas
 * observaciones tiene y de qué periodo. Dos celdas de la misma matriz pueden
 * estar calculadas sobre muestras muy distintas, y eso es un hecho que hay que
 * enseñar, no un defecto que haya que esconder igualando por abajo.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import { correlation, MIN_OBSERVATIONS, type MetricResult } from '../../finance/historical'

export interface ReturnSeries {
  /** Identificador estable de la posición (clave canónica o id de activo). */
  readonly id: string
  /** Etiqueta para la interfaz. */
  readonly label: string
  /** Retornos diarios ya calculados, ordenados por fecha. */
  readonly returns: readonly { readonly date: string; readonly value: number }[]
}

/** Método de estimación. Se declara en el resultado: no es un detalle interno. */
export type DependencyMethod = 'pearson' | 'spearman'

export interface DependencyCell {
  readonly a: string
  readonly b: string
  /** Coeficiente de −1 a 1, o `null` si la muestra no da para publicarlo. */
  readonly value: number | null
  /** Observaciones **de esta celda**, no de la matriz. */
  readonly observations: number
  /** Primer y último día del solape, para poder decir «de cuándo a cuándo». */
  readonly from: string | null
  readonly to: string | null
  /** Por qué no hay valor, cuando no lo hay. */
  readonly reason?: 'insufficient_sample' | 'no_overlap' | 'constant_series'
}

export interface DependencyMatrix {
  readonly ids: readonly string[]
  readonly labels: Readonly<Record<string, string>>
  readonly method: DependencyMethod
  /** Celdas del triángulo superior. La matriz es simétrica por construcción. */
  readonly cells: readonly DependencyCell[]
  /** Mínimo de observaciones exigido para publicar una celda. */
  readonly minObservations: number
  /** Pares que no han podido estimarse, para poder decirlo en pantalla. */
  readonly unavailablePairs: number
}

/**
 * Correlación de Spearman: Pearson sobre los **rangos** en vez de sobre los
 * valores.
 *
 * Se ofrece aparte, nunca mezclada con Pearson en la misma matriz. Mide otra
 * cosa —si se mueven en el mismo sentido, no si lo hacen en proporción— y es
 * menos sensible a un día extremo. Presentarlas como intercambiables sería
 * dejar que el usuario compare dos números que no son comparables.
 */
function toRanks(values: readonly number[]): number[] {
  const indexado = values.map((valor, i) => ({ valor, i }))
  indexado.sort((x, y) => x.valor - y.valor)

  const rangos = new Array<number>(values.length)
  let i = 0
  while (i < indexado.length) {
    // Los empates comparten el rango medio: si no, el resultado dependería del
    // orden de entrada y dejaría de ser determinista.
    let j = i
    while (j + 1 < indexado.length && indexado[j + 1]!.valor === indexado[i]!.valor) j += 1
    const rangoMedio = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) rangos[indexado[k]!.i] = rangoMedio
    i = j + 1
  }
  return rangos
}

/** Solape de dos series por fecha, sin rellenar huecos. */
function overlap(
  a: ReturnSeries,
  b: ReturnSeries,
): { a: number[]; b: number[]; dates: string[] } {
  const mapB = new Map(b.returns.map((p) => [p.date, p.value]))
  const salidaA: number[] = []
  const salidaB: number[] = []
  const dates: string[] = []

  for (const punto of a.returns) {
    const valorB = mapB.get(punto.date)
    if (valorB === undefined) continue
    salidaA.push(punto.value)
    salidaB.push(valorB)
    dates.push(punto.date)
  }
  return { a: salidaA, b: salidaB, dates }
}

function celda(a: ReturnSeries, b: ReturnSeries, method: DependencyMethod): DependencyCell {
  const comun = overlap(a, b)
  const base = { a: a.id, b: b.id, observations: comun.dates.length }

  if (comun.dates.length === 0) {
    return { ...base, value: null, from: null, to: null, reason: 'no_overlap' }
  }

  const fechas = [...comun.dates].sort()
  const rango = { from: fechas[0]!, to: fechas[fechas.length - 1]! }

  const resultado: MetricResult<number> =
    method === 'spearman'
      ? correlation(toRanks(comun.a), toRanks(comun.b))
      : correlation(comun.a, comun.b)

  if (!resultado.ok) {
    // `correlation` usa el mismo motivo para «pocos datos» y para «serie
    // plana». Aquí se separan: no son lo mismo para quien lo lee, y la segunda
    // no se arregla esperando.
    const suficientes = comun.dates.length >= MIN_OBSERVATIONS
    return {
      ...base,
      value: null,
      ...rango,
      reason: suficientes ? 'constant_series' : 'insufficient_sample',
    }
  }

  return { ...base, value: resultado.value, ...rango }
}

/**
 * Matriz de dependencia de una cartera.
 *
 * Devuelve solo el **triángulo superior**: la correlación es simétrica y
 * duplicar cada par invita a que las dos mitades se desincronicen.
 */
export function dependencyMatrix(
  series: readonly ReturnSeries[],
  method: DependencyMethod = 'pearson',
): DependencyMatrix {
  // Orden estable por identificador: la misma cartera produce siempre la misma
  // matriz, independientemente de cómo llegue.
  const ordenadas = [...series].sort((x, y) => x.id.localeCompare(y.id))
  const cells: DependencyCell[] = []

  for (let i = 0; i < ordenadas.length; i += 1) {
    for (let j = i + 1; j < ordenadas.length; j += 1) {
      cells.push(celda(ordenadas[i]!, ordenadas[j]!, method))
    }
  }

  return {
    ids: ordenadas.map((s) => s.id),
    labels: Object.fromEntries(ordenadas.map((s) => [s.id, s.label])),
    method,
    cells,
    minObservations: MIN_OBSERVATIONS,
    unavailablePairs: cells.filter((c) => c.value === null).length,
  }
}

/** Busca una celda en cualquiera de los dos órdenes. La matriz es simétrica. */
export function cellFor(
  matrix: DependencyMatrix,
  a: string,
  b: string,
): DependencyCell | null {
  if (a === b) return null
  return (
    matrix.cells.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)) ?? null
  )
}

/**
 * Los pares más correlacionados, de mayor a menor.
 *
 * Es lo que de verdad hay que mirar: la matriz completa de una cartera de
 * treinta posiciones son 435 celdas, y nadie lee 435 celdas.
 */
export function strongestPairs(matrix: DependencyMatrix, limite = 5): readonly DependencyCell[] {
  return matrix.cells
    .filter((c): c is DependencyCell & { value: number } => c.value !== null)
    .sort((x, y) => y.value - x.value)
    .slice(0, limite)
}
