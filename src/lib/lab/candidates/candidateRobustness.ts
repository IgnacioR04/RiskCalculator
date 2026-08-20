/**
 * Robustez de los pesos (LAB-610).
 *
 * Contesta la pregunta que separa un optimizador honesto de uno peligroso:
 * **¿este 23 % es una decisión o es ruido?**
 *
 * Un optimizador siempre devuelve un número con muchos decimales, y esa
 * precisión aparente es la trampa: la covarianza que lo produjo se estimó con
 * 252 observaciones, y con otras 252 —igual de válidas— habría salido otro
 * reparto. Si al perturbar ligeramente los datos el peso salta del 5 % al 40 %,
 * ese peso no significa nada.
 *
 * ## Cómo se mide
 *
 * Se perturba la covarianza muchas veces con ruido multiplicativo pequeño, se
 * vuelve a optimizar en cada una y se mira **cómo se mueve cada peso**. Lo que
 * se publica es el rango, no la media: una media esconde exactamente lo que se
 * quería enseñar.
 *
 * La semilla y el número de repeticiones **viajan en el resultado**, que es el
 * criterio de aceptación de LAB-610: sin ellos el análisis no se puede repetir y
 * «me sale otra cosa» es indistinguible de un error.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import { createRng } from '../scenarios/blockBootstrap'
import type { CompiledConstraints } from './constraintCompiler'
import type { PortfolioCandidate } from './contracts'

export const ROBUSTNESS_VERSION = 'candidate-robustness-v1'

/** Cuánto se perturba la covarianza, en fracción. */
export const DEFAULT_NOISE = 0.15

export interface WeightRange {
  readonly index: number
  readonly symbol: string
  /** Peso en la solución sin perturbar. */
  readonly base: number
  readonly min: number
  readonly max: number
  readonly median: number
  /** Fracción de repeticiones en que el activo recibe algo. */
  readonly selectionRate: number
  /**
   * Etiqueta en palabras. Es lo que se enseña: un rango de 0,05 a 0,40 no se
   * lee de un vistazo, «inestable» sí.
   */
  readonly stability: 'estable' | 'sensible' | 'inestable'
}

export interface RobustnessReport {
  readonly version: string
  /** Semilla usada. Obligatoria para poder repetir el análisis. */
  readonly seed: number
  /** Repeticiones efectivamente completadas. */
  readonly repetitions: number
  /** Repeticiones que no convergieron y se descartaron. */
  readonly discarded: number
  readonly noise: number
  readonly ranges: readonly WeightRange[]
  /** `true` si algún peso es inestable: la candidata entera es dudosa. */
  readonly hasUnstableWeights: boolean
  readonly limitations: readonly string[]
}

export const ROBUSTNESS_LIMITATIONS = [
  'Se perturba la covarianza, no los datos que la produjeron. Es una aproximación: mide la sensibilidad del optimizador a la matriz, no el error de estimarla.',
  'Un peso estable no significa que sea acertado. Significa que el optimizador lo elegiría igual con datos parecidos.',
] as const

/**
 * Umbrales de estabilidad, en puntos de peso.
 *
 * Son una **convención declarada**, no una verdad estadística: 10 puntos de
 * recorrido en un peso es mucho para una cartera de particular. Se escriben aquí
 * para poder discutirlos, en vez de esconderlos en un `if`.
 */
export const STABILITY_THRESHOLDS = { estable: 0.05, sensible: 0.15 } as const

function etiquetar(rango: number): WeightRange['stability'] {
  if (rango <= STABILITY_THRESHOLDS.estable) return 'estable'
  if (rango <= STABILITY_THRESHOLDS.sensible) return 'sensible'
  return 'inestable'
}

export interface RobustnessInput {
  readonly compiled: CompiledConstraints
  readonly covariance: readonly (readonly number[])[]
  /** El optimizador que se quiere poner a prueba. */
  readonly optimize: (covariance: readonly (readonly number[])[]) => PortfolioCandidate
  readonly seed: number
  readonly repetitions?: number
  readonly noise?: number
}

/**
 * Perturba la covarianza y vuelve a optimizar, muchas veces.
 *
 * El ruido es multiplicativo y **simétrico**: se aplica el mismo factor a
 * `(i,j)` y a `(j,i)` para que la matriz siga siendo simétrica, que es
 * condición para que el optimizador la acepte.
 */
export function assessRobustness(input: RobustnessInput): RobustnessReport {
  const repeticiones = input.repetitions ?? 100
  const ruido = input.noise ?? DEFAULT_NOISE
  const rng = createRng(input.seed)
  const n = input.compiled.universe.length

  const base = input.optimize(input.covariance)
  const pesosBase = base.weights

  if (pesosBase === null || n === 0) {
    return {
      version: ROBUSTNESS_VERSION,
      seed: input.seed,
      repetitions: 0,
      discarded: 0,
      noise: ruido,
      ranges: [],
      hasUnstableWeights: false,
      limitations: [...ROBUSTNESS_LIMITATIONS],
    }
  }

  const muestras: number[][] = []
  let descartadas = 0

  for (let r = 0; r < repeticiones; r += 1) {
    const perturbada = input.covariance.map((fila) => [...fila])
    for (let i = 0; i < n; i += 1) {
      for (let j = i; j < n; j += 1) {
        const factor = 1 + (rng() - 0.5) * 2 * ruido
        perturbada[i]![j] = input.covariance[i]![j]! * factor
        // Simétrica por construcción: si no, el optimizador la rechazaría.
        perturbada[j]![i] = perturbada[i]![j]!
      }
    }

    const resultado = input.optimize(perturbada)
    // Una repetición que no converge **no se sustituye por la base**: se
    // descarta y se cuenta. Rellenarla con la solución sin perturbar haría
    // parecer estable justo lo que no lo es.
    if (resultado.weights === null) descartadas += 1
    else muestras.push([...resultado.weights])
  }

  const ranges: WeightRange[] = input.compiled.universe.map((instrumento, i) => {
    const valores = muestras.map((m) => m[i] ?? 0)
    if (valores.length === 0) {
      return {
        index: i,
        symbol: instrumento.symbol,
        base: pesosBase[i]!,
        min: pesosBase[i]!,
        max: pesosBase[i]!,
        median: pesosBase[i]!,
        selectionRate: pesosBase[i]! > 1e-9 ? 1 : 0,
        stability: 'estable',
      }
    }

    const orden = [...valores].sort((a, b) => a - b)
    const min = orden[0]!
    const max = orden[orden.length - 1]!
    const mitad = Math.floor(orden.length / 2)
    const median =
      orden.length % 2 === 0 ? (orden[mitad - 1]! + orden[mitad]!) / 2 : orden[mitad]!

    return {
      index: i,
      symbol: instrumento.symbol,
      base: pesosBase[i]!,
      min,
      max,
      median,
      selectionRate: valores.filter((v) => v > 1e-9).length / valores.length,
      stability: etiquetar(max - min),
    }
  })

  return {
    version: ROBUSTNESS_VERSION,
    seed: input.seed,
    repetitions: muestras.length,
    discarded: descartadas,
    noise: ruido,
    ranges,
    hasUnstableWeights: ranges.some((r) => r.stability === 'inestable'),
    limitations: [...ROBUSTNESS_LIMITATIONS],
  }
}
