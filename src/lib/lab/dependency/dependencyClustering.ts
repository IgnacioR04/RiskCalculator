/**
 * Agrupación jerárquica por dependencia (LAB-412).
 *
 * Una matriz de treinta posiciones son 435 celdas y nadie lee 435 celdas. Lo que
 * el usuario necesita saber es más simple: **¿cuántas apuestas distintas tengo
 * de verdad?** Si diez posiciones se mueven como una sola, tiene una apuesta y
 * cree tener diez.
 *
 * ## Decisiones declaradas y versionadas
 *
 * - **Distancia:** `d = (1 − ρ) / 2`, que lleva la correlación al intervalo
 *   [0, 1]: dos activos idénticos distan 0 y dos opuestos distan 1. Se usa esta
 *   y no `√(2(1−ρ))` porque acota en [0,1] y se explica en una frase; la
 *   diferencia entre ambas es monótona, así que **no cambia los grupos**, solo
 *   la escala en la que se leen.
 * - **Enlace:** *average linkage* (UPGMA). El enlace simple encadena grupos por
 *   un solo par parecido; el completo los rompe por un solo par distinto. El
 *   medio no hace ninguna de las dos cosas.
 * - **Orden de hojas:** determinista, por identificador dentro de cada fusión.
 *
 * Cambiar cualquiera de las tres cambia los grupos, así que van versionadas:
 * un resultado guardado con `CLUSTERING_VERSION` distinta no es comparable.
 *
 * ## Lo que estos grupos no son
 *
 * No son sectores, ni estilos, ni ninguna clasificación con significado
 * económico. Son **grupos de activos que se han movido juntos**, y por eso se
 * etiquetan «Grupo 1», «Grupo 2» y no «Tecnología». Ponerles un nombre temático
 * sería afirmar una causa que el cálculo no ha mirado.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import { cellFor, type DependencyMatrix } from './dependencyMatrix'

/** Versión del método. Cambiar distancia o enlace obliga a subirla. */
export const CLUSTERING_VERSION = 'hclust-avg-v1'

export interface Cluster {
  /** Etiqueta genérica y estable. Nunca temática. */
  readonly label: string
  readonly members: readonly string[]
  /** Correlación media dentro del grupo, para poder ordenar por relevancia. */
  readonly averageCorrelation: number | null
}

export interface ClusteringResult {
  readonly version: string
  readonly clusters: readonly Cluster[]
  /** Orden de hojas para pintar la matriz agrupada. */
  readonly leafOrder: readonly string[]
  /** Activos que no han entrado en ningún grupo por falta de datos. */
  readonly unclustered: readonly string[]
  /** Umbral de distancia usado para cortar el árbol. */
  readonly threshold: number
}

/** Distancia entre dos activos a partir de su correlación. */
export function correlationDistance(rho: number): number {
  return (1 - rho) / 2
}

interface Nodo {
  readonly id: string
  readonly hojas: readonly string[]
}

/**
 * Agrupa los activos de una matriz.
 *
 * `threshold` es la distancia máxima a la que dos grupos siguen fusionándose.
 * Por defecto 0,25, que equivale a una correlación media de 0,5: por debajo de
 * eso llamar «grupo» a un conjunto sería exagerar.
 */
export function clusterByDependency(
  matrix: DependencyMatrix,
  threshold = 0.25,
): ClusteringResult {
  // Un activo sin ninguna celda utilizable no puede agruparse. Meterlo en un
  // grupo «por defecto» sería afirmar un parecido que nadie ha medido.
  const conDatos = matrix.ids.filter((id) =>
    matrix.cells.some((c) => (c.a === id || c.b === id) && c.value !== null),
  )
  const sinDatos = matrix.ids.filter((id) => !conDatos.includes(id))

  const distancia = (x: string, y: string): number | null => {
    const celda = cellFor(matrix, x, y)
    return celda === null || celda.value === null ? null : correlationDistance(celda.value)
  }

  /** Distancia media entre dos grupos (average linkage). */
  const entreGrupos = (p: Nodo, q: Nodo): number | null => {
    const valores: number[] = []
    for (const hp of p.hojas) {
      for (const hq of q.hojas) {
        const d = distancia(hp, hq)
        if (d !== null) valores.push(d)
      }
    }
    // Sin ninguna pareja medible no se fusiona: no hay evidencia.
    if (valores.length === 0) return null
    return valores.reduce((s, v) => s + v, 0) / valores.length
  }

  let nodos: Nodo[] = conDatos.map((id) => ({ id, hojas: [id] }))

  for (;;) {
    let mejor: { i: number; j: number; d: number } | null = null

    for (let i = 0; i < nodos.length; i += 1) {
      for (let j = i + 1; j < nodos.length; j += 1) {
        const d = entreGrupos(nodos[i]!, nodos[j]!)
        if (d === null || d > threshold) continue
        // Empate resuelto por identificador: sin esto el resultado dependería
        // del orden de entrada y dejaría de ser reproducible.
        if (
          mejor === null ||
          d < mejor.d - 1e-12 ||
          (Math.abs(d - mejor.d) <= 1e-12 &&
            `${nodos[i]!.id}|${nodos[j]!.id}` < `${nodos[mejor.i]!.id}|${nodos[mejor.j]!.id}`)
        ) {
          mejor = { i, j, d }
        }
      }
    }

    if (mejor === null) break

    const a = nodos[mejor.i]!
    const b = nodos[mejor.j]!
    const hojas = [...a.hojas, ...b.hojas].sort()
    const fusionado: Nodo = { id: hojas[0]!, hojas }
    nodos = nodos.filter((_, k) => k !== mejor!.i && k !== mejor!.j)
    nodos.push(fusionado)
    nodos.sort((x, y) => x.id.localeCompare(y.id))
  }

  const correlacionMedia = (hojas: readonly string[]): number | null => {
    const valores: number[] = []
    for (let i = 0; i < hojas.length; i += 1) {
      for (let j = i + 1; j < hojas.length; j += 1) {
        const celda = cellFor(matrix, hojas[i]!, hojas[j]!)
        if (celda?.value != null) valores.push(celda.value)
      }
    }
    return valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length
  }

  // Los grupos grandes primero: un grupo de seis posiciones que se mueven a la
  // vez es lo primero que hay que mirar.
  const ordenados = [...nodos].sort(
    (x, y) => y.hojas.length - x.hojas.length || x.id.localeCompare(y.id),
  )

  return {
    version: CLUSTERING_VERSION,
    clusters: ordenados.map((n, i) => ({
      label: `Grupo ${i + 1}`,
      members: n.hojas,
      averageCorrelation: correlacionMedia(n.hojas),
    })),
    leafOrder: ordenados.flatMap((n) => n.hojas),
    unclustered: sinDatos,
    threshold,
  }
}

/**
 * Cuántas apuestas distintas hay de verdad: grupos con más de un miembro más
 * los activos que van por libre.
 *
 * Es una lectura del clustering, no una métrica estadística: no confundir con
 * el número efectivo de activos del HHI, que mide otra cosa (concentración de
 * pesos, no de comportamiento).
 */
export function distinctBets(resultado: ClusteringResult): number {
  return resultado.clusters.length + resultado.unclustered.length
}
