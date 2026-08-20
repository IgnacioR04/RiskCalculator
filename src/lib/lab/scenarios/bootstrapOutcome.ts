/**
 * Resumen de un bootstrap por bloques, sin materializar las trayectorias
 * (LAB-1014).
 *
 * `blockBootstrap` devuelve **todas** las trayectorias: `paths[i][día][activo]`.
 * Con 10.000 trayectorias, 252 días y 20 activos son 50 millones de números,
 * del orden de 400 MB. Eso no cabe en un `postMessage` —se copia entero— ni
 * tiene por qué existir: la pantalla no enseña trayectorias, enseña percentiles.
 *
 * Aquí se recorre exactamente el mismo muestreo y se va **acumulando el
 * resultado de cada trayectoria**, quedándose solo con el valor final y la peor
 * caída. La memoria pasa a ser proporcional al número de trayectorias, no a su
 * contenido, y aparece un punto natural donde informar del progreso.
 *
 * `bootstrapOutcome.test.ts` comprueba que con la misma semilla sale lo mismo
 * que calculando desde `blockBootstrap`: es un cambio de cómo se ejecuta, no de
 * qué se calcula. Si esa prueba cae, el modelo ha cambiado sin querer.
 */
import { createRng, MAX_PATHS, percentiles, type BootstrapError } from './blockBootstrap'
import type { PathSummary } from './contracts'
import type { ReturnSeries } from '../dependency/dependencyMatrix'

/* ── Alineación ────────────────────────────────────────────────────────────── */

export interface AlignedHistory {
  /** Fechas comunes, ordenadas. */
  readonly dates: readonly string[]
  /** `rows[día][activo]`, con las filas alineadas por fecha. */
  readonly rows: readonly (readonly number[])[]
  /** Identificadores en el orden de las columnas. */
  readonly ids: readonly string[]
}

/**
 * Cruza las series por fecha, quedándose **solo con los días que tienen todos**.
 *
 * La intersección estricta es lo que hace correcto el muestreo: una fila tiene
 * que ser el mismo día para todos los activos, porque es lo que conserva la
 * correlación. Rellenar un hueco con cero inventaría un día plano para un activo
 * que simplemente no cotizó, y eso baja su volatilidad y su correlación con el
 * resto: haría la cartera más diversificada de lo que es.
 */
export function alignReturns(series: readonly ReturnSeries[]): AlignedHistory {
  if (series.length === 0) return { dates: [], rows: [], ids: [] }

  const mapas = series.map((s) => new Map(s.returns.map((p) => [p.date, p.value])))
  const primera = series[0]!
  const comunes = primera.returns
    .map((p) => p.date)
    .filter((fecha) => mapas.every((m) => m.has(fecha)))
    .sort((a, b) => a.localeCompare(b))

  return {
    dates: comunes,
    rows: comunes.map((fecha) => mapas.map((m) => m.get(fecha)!)),
    ids: series.map((s) => s.id),
  }
}

/* ── Resumen ───────────────────────────────────────────────────────────────── */

export interface BootstrapOutcomeInput {
  /** `history[día][activo]`, ya alineado. */
  readonly history: readonly (readonly number[])[]
  /** Valor inicial de cada activo, en divisa de presentación y en el mismo orden. */
  readonly values: readonly number[]
  readonly blockDays: number
  readonly horizonDays: number
  readonly paths: number
  readonly seed: number
  /** Importe objetivo, si la pregunta es «¿llego a…?». */
  readonly target?: number
}

export interface BootstrapOutcome {
  readonly ok: true
  readonly baseValue: number
  /** Distribución del valor final de la cartera. */
  readonly distribution: PathSummary
  /** Mediana de la peor caída dentro del recorrido, como fracción negativa. */
  readonly medianMaxDrawdown: number
  /** Fracción de trayectorias que alcanzan el objetivo, si se pidió. */
  readonly successRate?: number
  readonly paths: number
  readonly seed: number
  readonly blocksPerPath: number
}

export type BootstrapOutcomeResult =
  | BootstrapOutcome
  | { readonly ok: false; readonly reason: BootstrapError | 'no_value' }

/** Cada cuántas trayectorias se informa del progreso. */
const TRAYECTORIAS_POR_TRAMO = 50

/**
 * Recorre el muestreo y devuelve el resumen.
 *
 * `onProgress` se llama cada pocas trayectorias. Desde un worker, `postMessage`
 * se encola y llega al hilo principal aunque el worker siga calculando, así que
 * no hace falta trocear el bucle ni ceder el turno para que la barra avance.
 *
 * **Sin rebalanceo**: cada activo evoluciona por su cuenta y los pesos derivan,
 * que es lo que pasa si no se toca la cartera. Es un supuesto, y por eso se
 * declara arriba en vez de quedar escondido en el bucle.
 */
export function bootstrapOutcome(
  input: BootstrapOutcomeInput,
  onProgress?: (hechas: number, total: number) => void,
): BootstrapOutcomeResult {
  const { history, values, blockDays, horizonDays, paths, seed, target } = input

  if (history.length === 0) return { ok: false, reason: 'empty_history' }
  if (!Number.isInteger(blockDays) || blockDays < 2) return { ok: false, reason: 'invalid_block' }
  if (!Number.isInteger(horizonDays) || horizonDays < 1) {
    return { ok: false, reason: 'invalid_horizon' }
  }
  if (blockDays > history.length) return { ok: false, reason: 'block_longer_than_history' }
  if (!Number.isInteger(paths) || paths < 1 || paths > MAX_PATHS) {
    return { ok: false, reason: 'too_many_paths' }
  }

  const baseValue = values.reduce((s, v) => s + v, 0)
  if (baseValue <= 0) return { ok: false, reason: 'no_value' }

  const rng = createRng(seed)
  const activos = history[0]?.length ?? 0
  const blocksPerPath = Math.ceil(horizonDays / blockDays)
  const inicioMaximo = history.length - blockDays

  const finales: number[] = []
  const caidas: number[] = []
  // Se reutiliza entre trayectorias: reservar un array por trayectoria domina
  // el coste cuando son diez mil.
  const actual = new Float64Array(activos)

  for (let p = 0; p < paths; p += 1) {
    for (let i = 0; i < activos; i += 1) actual[i] = values[i] ?? 0
    let maximo = baseValue
    let peorCaida = 0
    let dias = 0

    for (let b = 0; b < blocksPerPath; b += 1) {
      // Un solo sorteo por bloque y para todos los activos, igual que en
      // `blockBootstrap`. El sorteo se hace **siempre**, aunque el horizonte ya
      // esté cubierto: si no, el generador iría desfasado respecto al motor
      // original y las dos rutas dejarían de coincidir.
      const inicio = Math.floor(rng() * (inicioMaximo + 1))
      for (let d = 0; d < blockDays; d += 1) {
        if (dias >= horizonDays) continue
        const fila = history[inicio + d]
        let total = 0
        for (let i = 0; i < activos; i += 1) {
          actual[i]! *= 1 + (fila?.[i] ?? 0)
          total += actual[i]!
        }
        dias += 1
        if (total > maximo) maximo = total
        const caida = total / maximo - 1
        if (caida < peorCaida) peorCaida = caida
      }
    }

    let final = 0
    for (let i = 0; i < activos; i += 1) final += actual[i]!
    finales.push(final)
    caidas.push(peorCaida)

    if (onProgress !== undefined && (p + 1) % TRAYECTORIAS_POR_TRAMO === 0) {
      onProgress(p + 1, paths)
    }
  }

  onProgress?.(paths, paths)

  const distribution = percentiles(finales)!
  const medianas = percentiles(caidas)!

  return {
    ok: true,
    baseValue,
    distribution,
    medianMaxDrawdown: medianas.p50,
    ...(target === undefined
      ? {}
      : { successRate: finales.filter((v) => v >= target).length / finales.length }),
    paths,
    seed,
    blocksPerPath,
  }
}
