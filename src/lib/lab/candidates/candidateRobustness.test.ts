/**
 * Pruebas de robustez (LAB-610).
 *
 * El criterio de aceptación: **la semilla y el número de repeticiones se
 * guardan**. Sin ellos el análisis no se puede repetir, y «me sale otra cosa»
 * es indistinguible de un error.
 */
import { describe, expect, it } from 'vitest'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import { candidateMinimumVariance } from './optimizers'
import {
  DEFAULT_NOISE,
  ROBUSTNESS_VERSION,
  STABILITY_THRESHOLDS,
  assessRobustness,
} from './candidateRobustness'

const activo = (id: string): CompilerInstrument => ({
  id,
  symbol: id.toUpperCase(),
  dimensions: {},
  currentWeight: 0,
})

const UNIVERSO = [activo('a'), activo('b'), activo('c')]
const COMPILADO = compileConstraints([], UNIVERSO)

const diagonal = (v: readonly number[]) => v.map((x, i) => v.map((_, j) => (i === j ? x : 0)))

/** Covarianza con activos muy distintos: la solución está bien determinada. */
const CLARA = diagonal([0.01, 0.09, 0.25])

/** Covarianza con activos casi idénticos: el reparto entre ellos es arbitrario. */
const AMBIGUA = [
  [0.04, 0.0399, 0],
  [0.0399, 0.04, 0],
  [0, 0, 0.01],
]

function analizar(
  covariance: readonly (readonly number[])[],
  opciones: { seed?: number; repetitions?: number; noise?: number } = {},
) {
  return assessRobustness({
    compiled: COMPILADO,
    covariance,
    optimize: (cov) => candidateMinimumVariance({ compiled: COMPILADO, covariance: cov, shrinkage: 0 }),
    seed: opciones.seed ?? 7,
    ...(opciones.repetitions === undefined ? {} : { repetitions: opciones.repetitions }),
    ...(opciones.noise === undefined ? {} : { noise: opciones.noise }),
  })
}

describe('el análisis se puede repetir', () => {
  it('la semilla viaja en el resultado', () => {
    expect(analizar(CLARA, { seed: 42 }).seed).toBe(42)
  })

  it('las repeticiones también', () => {
    expect(analizar(CLARA, { repetitions: 30 }).repetitions).toBe(30)
  })

  it('la misma semilla da exactamente el mismo informe', () => {
    expect(analizar(CLARA, { seed: 5, repetitions: 20 })).toEqual(
      analizar(CLARA, { seed: 5, repetitions: 20 }),
    )
  })

  it('semillas distintas dan informes distintos', () => {
    const a = analizar(CLARA, { seed: 1, repetitions: 20 })
    const b = analizar(CLARA, { seed: 2, repetitions: 20 })
    expect(a.ranges).not.toEqual(b.ranges)
  })

  it('el nivel de ruido usado queda escrito', () => {
    expect(analizar(CLARA).noise).toBe(DEFAULT_NOISE)
    expect(analizar(CLARA, { noise: 0.3 }).noise).toBe(0.3)
  })

  it('va versionado', () => {
    expect(analizar(CLARA).version).toBe(ROBUSTNESS_VERSION)
  })
})

describe('distingue una decisión de un ruido', () => {
  it('con activos muy distintos, los pesos son estables', () => {
    const r = analizar(CLARA, { repetitions: 60 })
    expect(r.hasUnstableWeights).toBe(false)
    for (const rango of r.ranges) {
      expect(rango.max - rango.min).toBeLessThanOrEqual(STABILITY_THRESHOLDS.sensible)
    }
  })

  it('con dos activos casi idénticos, el reparto entre ellos es inestable', () => {
    // La solución entre A y B es arbitraria: el optimizador la cambia con
    // cualquier perturbación. Eso hay que enseñarlo, no esconderlo.
    const r = analizar(AMBIGUA, { repetitions: 60, noise: 0.2 })
    const a = r.ranges.find((x) => x.symbol === 'A')!
    expect(a.max - a.min).toBeGreaterThan(STABILITY_THRESHOLDS.estable)
  })

  it('la etiqueta traduce el rango a una palabra', () => {
    const r = analizar(CLARA, { repetitions: 40 })
    for (const rango of r.ranges) {
      expect(['estable', 'sensible', 'inestable']).toContain(rango.stability)
    }
  })

  it('más ruido produce rangos más anchos', () => {
    const poco = analizar(AMBIGUA, { repetitions: 40, noise: 0.02 })
    const mucho = analizar(AMBIGUA, { repetitions: 40, noise: 0.3 })
    const anchoDe = (r: typeof poco) =>
      r.ranges.reduce((s, x) => s + (x.max - x.min), 0)
    expect(anchoDe(mucho)).toBeGreaterThan(anchoDe(poco))
  })
})

describe('lo que se publica es el rango, no la media', () => {
  it('cada peso trae mínimo, máximo y mediana', () => {
    const r = analizar(CLARA, { repetitions: 40 })
    for (const rango of r.ranges) {
      expect(rango.min).toBeLessThanOrEqual(rango.median)
      expect(rango.median).toBeLessThanOrEqual(rango.max)
    }
  })

  it('el peso sin perturbar se conserva aparte', () => {
    const r = analizar(CLARA, { repetitions: 30 })
    const base = candidateMinimumVariance({ compiled: COMPILADO, covariance: CLARA, shrinkage: 0 })
    r.ranges.forEach((rango, i) => {
      expect(rango.base).toBeCloseTo(base.weights![i]!, 9)
    })
  })

  it('dice con qué frecuencia entra cada activo', () => {
    const r = analizar(CLARA, { repetitions: 40 })
    for (const rango of r.ranges) {
      expect(rango.selectionRate).toBeGreaterThanOrEqual(0)
      expect(rango.selectionRate).toBeLessThanOrEqual(1)
    }
  })
})

describe('lo que no converge no se rellena', () => {
  it('una repetición fallida se descarta y se cuenta, no se sustituye por la base', () => {
    // Rellenarla con la solución sin perturbar haría parecer estable justo lo
    // que no lo es.
    let llamadas = 0
    const r = assessRobustness({
      compiled: COMPILADO,
      covariance: CLARA,
      optimize: (cov) => {
        llamadas += 1
        // Una de cada tres falla.
        return llamadas % 3 === 0
          ? candidateMinimumVariance({ compiled: COMPILADO, covariance: [[1]] })
          : candidateMinimumVariance({ compiled: COMPILADO, covariance: cov, shrinkage: 0 })
      },
      seed: 3,
      repetitions: 30,
    })

    expect(r.discarded).toBeGreaterThan(0)
    expect(r.repetitions + r.discarded).toBe(30)
  })

  it('si la solución base no existe, no se inventa un análisis', () => {
    const r = assessRobustness({
      compiled: COMPILADO,
      covariance: CLARA,
      optimize: () => candidateMinimumVariance({ compiled: COMPILADO, covariance: [[1]] }),
      seed: 1,
      repetitions: 10,
    })
    expect(r.ranges).toEqual([])
    expect(r.repetitions).toBe(0)
  })

  it('sin universo no rompe', () => {
    const vacio = compileConstraints([], [])
    const r = assessRobustness({
      compiled: vacio,
      covariance: [],
      optimize: () => candidateMinimumVariance({ compiled: vacio, covariance: [] }),
      seed: 1,
    })
    expect(r.ranges).toEqual([])
  })
})

describe('honestidad sobre el propio método', () => {
  it('declara que perturba la matriz, no los datos que la produjeron', () => {
    expect(analizar(CLARA).limitations.some((l) => /no los datos que la produjeron/.test(l))).toBe(
      true,
    )
  })

  it('declara que estable no es lo mismo que acertado', () => {
    expect(analizar(CLARA).limitations.some((l) => /no significa que sea acertado/.test(l))).toBe(
      true,
    )
  })

  it('los umbrales son una convención declarada, no un número escondido', () => {
    expect(STABILITY_THRESHOLDS.estable).toBeLessThan(STABILITY_THRESHOLDS.sensible)
  })
})
