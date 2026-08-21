/**
 * LAB-1102. La frontera y las dos candidatas que la cierran.
 *
 * Lo que más importa comprobar aquí no es que los números salgan, sino que
 * salgan **los correctos y no otros parecidos**: un optimizador que no converge
 * devuelve pesos que suman uno y parecen una cartera. Por eso casi todas las
 * pruebas comparan contra una propiedad que solo cumple la solución real.
 */
import { describe, expect, it } from 'vitest'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import {
  candidateMaximumDiversification,
  candidateMaximumSharpe,
  efficientFrontier,
  TOLERANCIA_OBJETIVO,
} from './frontier'
import { candidateMinimumVariance } from './optimizers'

function universo(n: number): CompilerInstrument[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    symbol: `A${i}`,
    dimensions: {},
    currentWeight: 1 / n,
  }))
}

const compilado = (n: number) => compileConstraints([], universo(n))

/** Covarianza diagonal: sin correlación, la solución es analítica. */
function diagonal(varianzas: readonly number[]): number[][] {
  return varianzas.map((v, i) => varianzas.map((_, j) => (i === j ? v : 0)))
}

const suma = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0)
const vol = (sigma: readonly (readonly number[])[], w: readonly number[]) =>
  Math.sqrt(dot(w, sigma.map((f) => dot(f, w))))

describe('máximo Sharpe', () => {
  it('con activos incorrelados carga en el de mejor rentabilidad por unidad de riesgo', () => {
    // Sin correlación, w_i ∝ (mu_i − rf) / var_i. El segundo activo tiene el
    // doble de exceso y la misma varianza, así que tiene que pesar más.
    const sigma = diagonal([0.04, 0.04, 0.04])
    const r = candidateMaximumSharpe({
      compiled: compilado(3),
      covariance: sigma,
      shrinkage: 0,
      mu: [0.04, 0.08, 0.04],
      riskFreeRate: 0.02,
    })

    expect(r.weights).not.toBeNull()
    const w = r.weights!
    expect(suma(w)).toBeCloseTo(1, 9)
    expect(w[1]!).toBeGreaterThan(w[0]!)
    expect(w[1]!).toBeGreaterThan(w[2]!)
    // Los dos activos idénticos reciben lo mismo: si no, el solucionador está
    // rompiendo una simetría que el problema no rompe.
    expect(w[0]!).toBeCloseTo(w[2]!, 6)
  })

  it('sin rentabilidades esperadas no devuelve pesos, en vez de inventarlas', () => {
    const r = candidateMaximumSharpe({
      compiled: compilado(3),
      covariance: diagonal([0.04, 0.04, 0.04]),
      mu: [0.05, Number.NaN, 0.05],
      riskFreeRate: 0.02,
    })
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('invalid_input')
  })

  it('respeta los topes por activo', () => {
    const instrumentos = universo(3)
    const compiled = compileConstraints(
      [{ kind: 'assetWeight', instrumentId: 'a1', min: 0, max: 0.2 }],
      instrumentos,
    )
    const r = candidateMaximumSharpe({
      compiled,
      covariance: diagonal([0.04, 0.04, 0.04]),
      shrinkage: 0,
      mu: [0.03, 0.2, 0.03],
      riskFreeRate: 0.02,
    })
    expect(r.weights).not.toBeNull()
    // Sin tope se lo llevaría casi todo; con tope no puede pasar de 0,2.
    expect(r.weights![1]!).toBeLessThanOrEqual(0.2 + 1e-6)
  })

  it('declara que depende del número más frágil del cálculo', () => {
    const r = candidateMaximumSharpe({
      compiled: compilado(2),
      covariance: diagonal([0.04, 0.09]),
      mu: [0.05, 0.07],
      riskFreeRate: 0.02,
    })
    expect(r.assumptions.map((a) => a.label).join(' ')).toMatch(/frágil/)
    // Nunca se llama «óptima» a secas.
    expect(r.assumptions.some((a) => a.label.includes('No es «la óptima»'))).toBe(true)
  })
})

describe('máxima diversificación', () => {
  it('no necesita rentabilidades esperadas', () => {
    const r = candidateMaximumDiversification({
      compiled: compilado(3),
      covariance: diagonal([0.01, 0.04, 0.09]),
      shrinkage: 0,
    })
    expect(r.weights).not.toBeNull()
    expect(suma(r.weights!)).toBeCloseTo(1, 9)
  })

  it('con activos incorrelados y misma volatilidad reparte por igual', () => {
    // Es el caso donde la respuesta se conoce sin resolver nada: cualquier
    // desviación del reparto uniforme indicaría que el solucionador deriva.
    const r = candidateMaximumDiversification({
      compiled: compilado(4),
      covariance: diagonal([0.04, 0.04, 0.04, 0.04]),
      shrinkage: 0,
    })
    expect(r.weights).not.toBeNull()
    for (const w of r.weights!) expect(w).toBeCloseTo(0.25, 4)
  })

  it('su ratio de diversificación no es peor que el de la cartera uniforme', () => {
    const sigma = [
      [0.04, 0.03, 0.001],
      [0.03, 0.05, 0.002],
      [0.001, 0.002, 0.02],
    ]
    const r = candidateMaximumDiversification({ compiled: compilado(3), covariance: sigma, shrinkage: 0 })
    expect(r.weights).not.toBeNull()

    const vols = sigma.map((f, i) => Math.sqrt(f[i]!))
    const ratio = (w: readonly number[]) => dot(vols, w) / vol(sigma, w)
    const uniforme = [1 / 3, 1 / 3, 1 / 3]
    expect(ratio(r.weights!)).toBeGreaterThanOrEqual(ratio(uniforme) - 1e-6)
  })
})

describe('frontera eficiente', () => {
  const sigma = [
    [0.04, 0.01, 0.0],
    [0.01, 0.09, 0.005],
    [0.0, 0.005, 0.16],
  ]
  const mu = [0.04, 0.07, 0.11]

  it('devuelve una curva creciente en rentabilidad y en volatilidad', () => {
    const r = efficientFrontier(
      { compiled: compilado(3), covariance: sigma, shrinkage: 0, mu, riskFreeRate: 0.02 },
      12,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.points.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < r.points.length; i += 1) {
      expect(r.points[i]!.expectedReturn).toBeGreaterThan(r.points[i - 1]!.expectedReturn - 1e-9)
      // Es la propiedad que define la frontera: a más rentabilidad exigida, más
      // volatilidad. Si baja en algún tramo, el punto anterior no era eficiente.
      expect(r.points[i]!.volatility).toBeGreaterThan(r.points[i - 1]!.volatility - 1e-6)
    }
  })

  it('cada punto cumple su restricción de rentabilidad, o no aparece', () => {
    const r = efficientFrontier(
      { compiled: compilado(3), covariance: sigma, shrinkage: 0, mu, riskFreeRate: 0.02 },
      15,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const p of r.points) expect(p.residual).toBeLessThanOrEqual(TOLERANCIA_OBJETIVO)
  })

  it('todos los pesos suman uno y ninguno es negativo', () => {
    const r = efficientFrontier(
      { compiled: compilado(3), covariance: sigma, shrinkage: 0, mu, riskFreeRate: 0.02 },
      10,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const p of r.points) {
      expect(suma(p.weights)).toBeCloseTo(1, 6)
      for (const w of p.weights) expect(w).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('el extremo de menor riesgo coincide con la mínima varianza', () => {
    // La frontera arranca donde acaba el optimizador que ya existía. Si no
    // coincidieran, habría dos respuestas distintas a la misma pregunta.
    const entrada = { compiled: compilado(3), covariance: sigma, shrinkage: 0 }
    const minvar = candidateMinimumVariance(entrada)
    const r = efficientFrontier({ ...entrada, mu, riskFreeRate: 0.02 }, 10)

    expect(minvar.weights).not.toBeNull()
    expect(r.ok).toBe(true)
    if (!r.ok || minvar.weights === null) return

    expect(r.points[0]!.volatility).toBeCloseTo(vol(sigma, minvar.weights), 3)
  })

  it('con todas las rentabilidades iguales no hay curva, y lo dice', () => {
    const r = efficientFrontier(
      {
        compiled: compilado(3),
        covariance: sigma,
        shrinkage: 0,
        mu: [0.05, 0.05, 0.05],
        riskFreeRate: 0.02,
      },
      10,
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('degenerate_range')
  })

  it('sin universo no devuelve una curva vacía disfrazada de resultado', () => {
    const r = efficientFrontier({
      compiled: compilado(0),
      covariance: [],
      mu: [],
      riskFreeRate: 0.02,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('empty_universe')
  })

  it('es reproducible: dos ejecuciones dan lo mismo', () => {
    const entrada = { compiled: compilado(3), covariance: sigma, shrinkage: 0, mu, riskFreeRate: 0.02 }
    expect(efficientFrontier(entrada, 8)).toEqual(efficientFrontier(entrada, 8))
  })
})
