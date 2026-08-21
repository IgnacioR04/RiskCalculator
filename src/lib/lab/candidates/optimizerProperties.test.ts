/**
 * Propiedades sobre problemas aleatorios con semilla fija (LAB-1107).
 *
 * Los casos dorados comprueban tres matrices concretas. Estas pruebas barren
 * cincuenta generadas al azar y comprueban las propiedades que **toda**
 * solución tiene que cumplir, más una comparación contra una referencia
 * independiente: para tres activos, una rejilla exhaustiva sobre el símplex.
 *
 * La rejilla es lenta y tosca, y por eso solo se usa aquí: es un método
 * completamente distinto del gradiente proyectado, así que un error compartido
 * entre los dos es muy improbable.
 *
 * Semilla fija: un fallo aleatorio que no se puede reproducir no se puede
 * arreglar.
 */
import { describe, expect, it } from 'vitest'
import { createRng } from '../scenarios/blockBootstrap'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import { covarianceHealth } from './covarianceHealth'
import { candidateMaximumSharpe, efficientFrontier } from './frontier'
import { candidateMinimumVariance } from './optimizers'

const N = 3
const CASOS = 50

function universo(n: number): CompilerInstrument[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    symbol: `A${i}`,
    dimensions: {},
    currentWeight: 1 / n,
  }))
}

/**
 * Covarianza aleatoria pero **válida por construcción**: `A·Aᵀ` es siempre
 * semidefinida positiva. Generar números sueltos daría matrices indefinidas y
 * la prueba mediría el rechazo, no la optimización.
 */
function covarianzaAleatoria(rng: () => number, n: number): number[][] {
  const a = Array.from({ length: n }, () => Array.from({ length: n }, () => rng() - 0.5))
  const m = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => a[i]!.reduce((s, v, k) => s + v * a[j]![k]!, 0) * 0.1),
  )
  // Se refuerza la diagonal para que no salga casi singular en cada iteración.
  for (let i = 0; i < n; i += 1) m[i]![i] = m[i]![i]! + 0.01 + rng() * 0.05
  return m
}

const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0)
const varianza = (cov: readonly (readonly number[])[], w: readonly number[]) =>
  Math.max(dot(w, cov.map((f) => dot(f, w))), 0)

/** Rejilla exhaustiva sobre el símplex de tres activos, paso 1/200. */
function mejorEnRejilla(
  n: number,
  objetivo: (w: readonly number[]) => number,
  pasos = 200,
): { w: number[]; valor: number } {
  let mejor = { w: new Array<number>(n).fill(1 / n), valor: -Infinity }
  for (let i = 0; i <= pasos; i += 1) {
    for (let j = 0; i + j <= pasos; j += 1) {
      const w = [i / pasos, j / pasos, (pasos - i - j) / pasos]
      const v = objetivo(w)
      if (v > mejor.valor) mejor = { w, valor: v }
    }
  }
  return mejor
}

describe('propiedades sobre 50 problemas aleatorios', () => {
  const rng = createRng(20260821)
  const problemas = Array.from({ length: CASOS }, () => ({
    cov: covarianzaAleatoria(rng, N),
    mu: Array.from({ length: N }, () => 0.02 + rng() * 0.1),
  })).filter((p) => covarianceHealth(p.cov).ok)

  it('los problemas generados son utilizables', () => {
    // Si el generador produjera basura, todo lo demás pasaría por vacío.
    expect(problemas.length).toBeGreaterThan(CASOS * 0.8)
  })

  it('los pesos suman uno y ninguno es negativo', () => {
    for (const p of problemas) {
      const base = { compiled: compileConstraints([], universo(N)), covariance: p.cov, shrinkage: 0 }
      for (const r of [
        candidateMinimumVariance(base),
        candidateMaximumSharpe({ ...base, mu: p.mu, riskFreeRate: 0.02 }),
      ]) {
        if (r.weights === null) continue
        expect(r.weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 6)
        for (const w of r.weights) expect(w).toBeGreaterThanOrEqual(-1e-9)
      }
    }
  })

  it('nunca aparece NaN ni Infinity en un resultado disponible', () => {
    for (const p of problemas) {
      const r = candidateMaximumSharpe({
        compiled: compileConstraints([], universo(N)),
        covariance: p.cov,
        shrinkage: 0,
        mu: p.mu,
        riskFreeRate: 0.02,
      })
      if (r.weights === null) continue
      for (const w of r.weights) expect(Number.isFinite(w)).toBe(true)
    }
  })

  it('la mínima varianza no es peor que la rejilla exhaustiva', () => {
    // Referencia independiente: fuerza bruta sobre el símplex, un método sin
    // nada en común con el gradiente proyectado.
    for (const p of problemas.slice(0, 12)) {
      const r = candidateMinimumVariance({
        compiled: compileConstraints([], universo(N)),
        covariance: p.cov,
        shrinkage: 0,
      })
      if (r.weights === null) continue

      const rejilla = mejorEnRejilla(N, (w) => -varianza(p.cov, w))
      // El paso de la rejilla es 1/200, así que su óptimo puede quedarse un
      // poco por encima: lo que no puede es quedar **por debajo**.
      expect(varianza(p.cov, r.weights)).toBeLessThanOrEqual(-rejilla.valor + 1e-6)
    }
  })

  it('el máximo Sharpe no es peor que la rejilla exhaustiva', () => {
    for (const p of problemas.slice(0, 12)) {
      const r = candidateMaximumSharpe({
        compiled: compileConstraints([], universo(N)),
        covariance: p.cov,
        shrinkage: 0,
        mu: p.mu,
        riskFreeRate: 0.02,
      })
      if (r.weights === null) continue

      const sharpe = (w: readonly number[]) =>
        (dot(p.mu, w) - 0.02) / Math.sqrt(Math.max(varianza(p.cov, w), 1e-18))
      const rejilla = mejorEnRejilla(N, sharpe)
      expect(sharpe(r.weights)).toBeGreaterThanOrEqual(rejilla.valor - 1e-4)
    }
  })

  it('la frontera es monótona siempre que exista', () => {
    for (const p of problemas) {
      const r = efficientFrontier(
        {
          compiled: compileConstraints([], universo(N)),
          covariance: p.cov,
          shrinkage: 0,
          mu: p.mu,
          riskFreeRate: 0.02,
        },
        10,
      )
      if (!r.ok) continue
      for (let i = 1; i < r.points.length; i += 1) {
        expect(r.points[i]!.expectedReturn).toBeGreaterThan(r.points[i - 1]!.expectedReturn - 1e-9)
        expect(r.points[i]!.volatility).toBeGreaterThan(r.points[i - 1]!.volatility - 1e-6)
      }
    }
  })

  it('la misma semilla da exactamente los mismos problemas', () => {
    const otra = createRng(20260821)
    const repetidos = Array.from({ length: CASOS }, () => ({
      cov: covarianzaAleatoria(otra, N),
      mu: Array.from({ length: N }, () => 0.02 + otra() * 0.1),
    })).filter((p) => covarianceHealth(p.cov).ok)
    expect(repetidos).toEqual(problemas)
  })
})
