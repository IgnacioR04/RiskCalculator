/**
 * Casos dorados contra una referencia independiente (LAB-1107).
 *
 * Comparar un optimizador consigo mismo demuestra que es determinista, no que
 * acierte. Aquí se compara contra `scipy` con SLSQP —programación cuadrática
 * secuencial frente a gradiente proyectado, dos algoritmos distintos—, y las
 * cifras están congeladas en un fixture: Python no entra en el producto.
 *
 * ## Sobre las tolerancias
 *
 * Los pesos se comparan con **1e-3 absoluto**. No es laxitud: dos algoritmos
 * distintos que minimizan la misma función convexa llegan al mismo óptimo pero
 * paran en sitios ligeramente distintos, y en las zonas planas del problema
 * —típicas en el máximo Sharpe— un cambio de peso de 5·10⁻⁴ mueve el objetivo
 * en menos de 10⁻⁶.
 *
 * Por eso, además de los pesos, se comparan los **valores objetivo**, que es lo
 * que de verdad tiene que coincidir: si dos vectores distintos dan el mismo
 * Sharpe, los dos son óptimos.
 */
import { describe, expect, it } from 'vitest'
import { REFERENCIA_SCIPY, type ReferenciaCaso } from './__fixtures__/optimizerReference'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import { candidateMaximumDiversification, candidateMaximumSharpe, efficientFrontier } from './frontier'
import { candidateEqualRiskContribution, candidateMinimumVariance } from './optimizers'

/** Tolerancia de pesos entre dos solucionadores distintos. */
const TOL_PESOS = 1e-3
/** Tolerancia del valor objetivo. Más estricta: es lo que se optimiza. */
const TOL_OBJETIVO = 5e-4

function entrada(caso: ReferenciaCaso) {
  const universo: CompilerInstrument[] = caso.mu.map((_, i) => ({
    id: `a${i}`,
    symbol: `A${i}`,
    dimensions: {},
    currentWeight: 1 / caso.mu.length,
  }))

  const restricciones = caso.bounds.flatMap((b, i) =>
    b[0] === 0 && b[1] === 1
      ? []
      : [{ kind: 'assetWeight' as const, instrumentId: `a${i}`, min: b[0]!, max: b[1]! }],
  )

  return {
    compiled: compileConstraints(restricciones, universo),
    covariance: caso.cov,
    // Sin shrinkage: la referencia se resolvió sobre la matriz tal cual, y
    // encogerla aquí compararía dos problemas distintos.
    shrinkage: 0,
    mu: caso.mu,
    riskFreeRate: caso.riskFreeRate,
  }
}

const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0)
const vol = (cov: readonly (readonly number[])[], w: readonly number[]) =>
  Math.sqrt(Math.max(dot(w, cov.map((f) => dot(f, w))), 0))

for (const [nombre, caso] of Object.entries(REFERENCIA_SCIPY)) {
  describe(`referencia · ${nombre}`, () => {
    const base = entrada(caso)

    it('mínima varianza coincide con SLSQP', () => {
      const r = candidateMinimumVariance(base)
      expect(r.weights).not.toBeNull()
      if (r.weights === null) return

      for (let i = 0; i < r.weights.length; i += 1) {
        expect(r.weights[i]!).toBeCloseTo(caso.minimumVariance.weights[i]!, 3)
      }
      expect(vol(caso.cov, r.weights)).toBeCloseTo(caso.minimumVariance.volatility, 6)
    })

    it('máximo Sharpe coincide con SLSQP', () => {
      const r = candidateMaximumSharpe(base)
      expect(r.weights).not.toBeNull()
      if (r.weights === null) return

      const sharpe = (w: readonly number[]) => (dot(caso.mu, w) - caso.riskFreeRate) / vol(caso.cov, w)
      // El valor objetivo primero: es la comprobación que de verdad importa.
      expect(sharpe(r.weights)).toBeCloseTo(caso.maximumSharpe.sharpe, 4)
      for (let i = 0; i < r.weights.length; i += 1) {
        expect(Math.abs(r.weights[i]! - caso.maximumSharpe.weights[i]!)).toBeLessThan(TOL_PESOS)
      }
    })

    it('máxima diversificación coincide con SLSQP', () => {
      const r = candidateMaximumDiversification(base)
      expect(r.weights).not.toBeNull()
      if (r.weights === null) return

      const vols = caso.cov.map((f, i) => Math.sqrt(f[i]!))
      const ratio = (w: readonly number[]) => dot(vols, w) / vol(caso.cov, w)
      expect(ratio(r.weights)).toBeCloseTo(caso.maximumDiversification.diversificationRatio, 4)
      for (let i = 0; i < r.weights.length; i += 1) {
        expect(Math.abs(r.weights[i]! - caso.maximumDiversification.weights[i]!)).toBeLessThan(
          TOL_PESOS,
        )
      }
    })

    it('paridad de riesgo coincide con SLSQP', () => {
      const r = candidateEqualRiskContribution(base)
      expect(r.weights).not.toBeNull()
      if (r.weights === null) return
      for (let i = 0; i < r.weights.length; i += 1) {
        expect(Math.abs(r.weights[i]! - caso.equalRiskContribution.weights[i]!)).toBeLessThan(
          TOL_PESOS,
        )
      }
    })

    it('el rango de rentabilidad de la frontera coincide', () => {
      const r = efficientFrontier(base, 24)
      expect(r.ok).toBe(true)
      if (!r.ok) return

      const primero = r.points[0]!
      const ultimo = r.points[r.points.length - 1]!
      expect(primero.expectedReturn).toBeCloseTo(caso.returnRange.min, 3)
      expect(ultimo.expectedReturn).toBeCloseTo(caso.returnRange.max, 3)
    })

    it('los puntos intermedios de la frontera dan la misma volatilidad', () => {
      // Se compara la volatilidad **a igual rentabilidad**, que es la definición
      // de la frontera. Comparar pesos punto a punto exigiría que los dos
      // solucionadores hubieran elegido exactamente los mismos objetivos.
      const r = efficientFrontier(base, 40)
      expect(r.ok).toBe(true)
      if (!r.ok) return

      for (const referencia of caso.frontier) {
        const cercano = r.points.reduce((mejor, p) =>
          Math.abs(p.expectedReturn - referencia.expectedReturn) <
          Math.abs(mejor.expectedReturn - referencia.expectedReturn)
            ? p
            : mejor,
        )
        // Si el punto propio está a menos de un punto básico de rentabilidad,
        // su volatilidad tiene que ser prácticamente la misma.
        if (Math.abs(cercano.expectedReturn - referencia.expectedReturn) < 1e-4) {
          expect(cercano.volatility).toBeCloseTo(referencia.volatility, 3)
        }
      }
    })

    it('ningún resultado incumple los topes de la referencia', () => {
      for (const r of [
        candidateMinimumVariance(base),
        candidateMaximumSharpe(base),
        candidateMaximumDiversification(base),
      ]) {
        if (r.weights === null) continue
        r.weights.forEach((w, i) => {
          expect(w).toBeGreaterThanOrEqual(caso.bounds[i]![0]! - TOL_OBJETIVO)
          expect(w).toBeLessThanOrEqual(caso.bounds[i]![1]! + TOL_OBJETIVO)
        })
      }
    })
  })
}
