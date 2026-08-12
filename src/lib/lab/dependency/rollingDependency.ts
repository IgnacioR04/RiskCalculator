/**
 * Dependencia por tiempo y en caídas (LAB-411).
 *
 * Una correlación única resume años en un número, y ese número esconde justo lo
 * que importa. Dos activos pueden tener correlación media 0,3 y haber estado a
 * 0,9 durante los tres meses en que todo caía. **La diversificación tiende a
 * desaparecer cuando hace falta**, y una cifra global no lo enseña.
 *
 * Aquí se mira lo mismo de dos maneras:
 *
 * - **Rolling**: la correlación ventana a ventana, para ver si se mueve.
 * - **Downside**: la correlación calculada solo sobre los días malos.
 *
 * ## La condición «día malo» es una decisión, no un detalle
 *
 * Se define como **los días en que el mercado de referencia cae**, y el mercado
 * de referencia es la propia cartera. No «los días en que cae A», que produciría
 * un número distinto según por dónde se mire y no sería simétrico. La definición
 * viaja en el resultado (`condition`) para que la interfaz **tenga que**
 * enseñarla: un número de correlación bajista sin su definición no significa
 * nada.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import { correlation, MIN_OBSERVATIONS } from '../../finance/historical'
import type { ReturnSeries } from './dependencyMatrix'

/** Ventanas ofrecidas, en días de mercado. */
export const ROLLING_WINDOWS = [30, 60, 90] as const
export type RollingWindow = (typeof ROLLING_WINDOWS)[number]

export interface RollingPoint {
  /** Último día de la ventana. */
  readonly date: string
  readonly value: number
  readonly observations: number
}

export interface RollingCorrelation {
  readonly a: string
  readonly b: string
  readonly window: RollingWindow
  readonly points: readonly RollingPoint[]
  /** Mínimo y máximo alcanzados, que es lo que de verdad se mira. */
  readonly min: number | null
  readonly max: number | null
  /** Última ventana disponible. */
  readonly latest: number | null
  /** Motivo, cuando no hay ni un solo punto. */
  readonly reason?: 'insufficient_sample'
}

/**
 * Correlación ventana a ventana entre dos series.
 *
 * Una ventana solo se publica si está **completa**: media ventana calculada con
 * la mitad de los datos daría un punto más nervioso que los demás y el gráfico
 * lo pintaría igual que al resto.
 */
export function rollingCorrelation(
  a: ReturnSeries,
  b: ReturnSeries,
  window: RollingWindow,
): RollingCorrelation {
  const mapB = new Map(b.returns.map((p) => [p.date, p.value]))
  const comun: { date: string; a: number; b: number }[] = []
  for (const punto of a.returns) {
    const valorB = mapB.get(punto.date)
    if (valorB !== undefined) comun.push({ date: punto.date, a: punto.value, b: valorB })
  }
  comun.sort((x, y) => x.date.localeCompare(y.date))

  const points: RollingPoint[] = []
  for (let fin = window; fin <= comun.length; fin += 1) {
    const trozo = comun.slice(fin - window, fin)
    const r = correlation(
      trozo.map((p) => p.a),
      trozo.map((p) => p.b),
    )
    if (r.ok) {
      points.push({ date: trozo[trozo.length - 1]!.date, value: r.value, observations: window })
    }
  }

  const valores = points.map((p) => p.value)
  return {
    a: a.id,
    b: b.id,
    window,
    points,
    min: valores.length === 0 ? null : Math.min(...valores),
    max: valores.length === 0 ? null : Math.max(...valores),
    latest: points.length === 0 ? null : points[points.length - 1]!.value,
    ...(points.length === 0 ? { reason: 'insufficient_sample' as const } : {}),
  }
}

/* ── Dependencia en caídas ─────────────────────────────────────────────────── */

/** Definición de «día malo». Viaja con el resultado para poder mostrarla. */
export const DOWNSIDE_CONDITION =
  'Días en que la cartera cerró en negativo. La correlación bajista se calcula solo sobre esos días.'

export interface DownsideDependency {
  readonly a: string
  readonly b: string
  /** Correlación sobre todos los días. */
  readonly overall: number | null
  /** Correlación solo sobre los días malos. */
  readonly downside: number | null
  /** Días malos usados. */
  readonly downsideObservations: number
  readonly observations: number
  /** La definición usada, obligatoria de mostrar junto al número. */
  readonly condition: string
  /**
   * `true` si la dependencia **sube** en las caídas, que es el hallazgo
   * relevante: la diversificación se evapora justo cuando se necesitaba.
   */
  readonly worsensInDrawdown: boolean
  readonly reason?: 'insufficient_sample' | 'insufficient_downside_sample'
}

/**
 * Compara la correlación de siempre con la de los días malos.
 *
 * `market` es la serie que define qué día fue malo —normalmente la cartera
 * entera—. Que la condición sea externa a las dos series comparadas es lo que
 * hace el resultado simétrico: `f(a,b)` y `f(b,a)` dan lo mismo.
 */
export function downsideDependency(
  a: ReturnSeries,
  b: ReturnSeries,
  market: ReturnSeries,
): DownsideDependency {
  const mapB = new Map(b.returns.map((p) => [p.date, p.value]))
  const mapM = new Map(market.returns.map((p) => [p.date, p.value]))

  const todos: { a: number; b: number; malo: boolean }[] = []
  for (const punto of a.returns) {
    const valorB = mapB.get(punto.date)
    const valorM = mapM.get(punto.date)
    if (valorB === undefined || valorM === undefined) continue
    todos.push({ a: punto.value, b: valorB, malo: valorM < 0 })
  }

  const base = {
    a: a.id,
    b: b.id,
    observations: todos.length,
    condition: DOWNSIDE_CONDITION,
  }

  const rGlobal = correlation(
    todos.map((p) => p.a),
    todos.map((p) => p.b),
  )
  if (!rGlobal.ok) {
    return {
      ...base,
      overall: null,
      downside: null,
      downsideObservations: 0,
      worsensInDrawdown: false,
      reason: 'insufficient_sample',
    }
  }

  const malos = todos.filter((p) => p.malo)
  const rMalos = correlation(
    malos.map((p) => p.a),
    malos.map((p) => p.b),
  )

  if (!rMalos.ok) {
    // Hay datos de sobra en total pero no suficientes días malos. Se dice, en
    // vez de publicar una correlación bajista sobre doce observaciones.
    return {
      ...base,
      overall: rGlobal.value,
      downside: null,
      downsideObservations: malos.length,
      worsensInDrawdown: false,
      reason: 'insufficient_downside_sample',
    }
  }

  return {
    ...base,
    overall: rGlobal.value,
    downside: rMalos.value,
    downsideObservations: malos.length,
    worsensInDrawdown: rMalos.value > rGlobal.value,
  }
}

/** Mínimo de días malos para publicar una correlación bajista. */
export const MIN_DOWNSIDE_OBSERVATIONS = MIN_OBSERVATIONS
