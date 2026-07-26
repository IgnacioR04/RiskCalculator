import { describe, expect, it } from 'vitest'
import { describeDiversification, diversificationMetrics } from './diversification'

/** Matriz de covarianzas de dos activos con volatilidad `s` y correlación `rho`. */
function cov2(s: number, rho: number): number[][] {
  return [
    [s * s, rho * s * s],
    [rho * s * s, s * s],
  ]
}

describe('diversificationMetrics', () => {
  it('dos activos independientes al 50 %: DR = √2 y quita ~29 % de volatilidad', () => {
    // σ_cartera = σ/√2, Σwσ = σ  ⇒  DR = √2
    const r = diversificationMetrics([0.5, 0.5], cov2(0.2, 0), [0.5, 0.5])!
    expect(r.diversificationRatio).toBeCloseTo(Math.SQRT2, 10)
    expect(r.volatilityReduction).toBeCloseTo(1 - 1 / Math.SQRT2, 10)
    expect(r.portfolioVolatility).toBeCloseTo(0.2 / Math.SQRT2, 10)
    expect(r.weightedAverageVolatility).toBeCloseTo(0.2, 10)
    expect(r.averageCorrelation).toBeCloseTo(0, 10)
    // Dos fuentes de riesgo iguales e independientes ⇒ 2 apuestas efectivas.
    expect(r.effectiveBets).toBeCloseTo(2, 10)
  })

  it('dos activos idénticos (ρ = 1): DR = 1 y no hay reducción', () => {
    const r = diversificationMetrics([0.5, 0.5], cov2(0.2, 1), [0.5, 0.5])!
    expect(r.diversificationRatio).toBeCloseTo(1, 10)
    expect(r.volatilityReduction).toBeCloseTo(0, 10)
    expect(r.averageCorrelation).toBeCloseTo(1, 10)
  })

  it('correlación negativa (ρ = −0,5): DR = 2 y quita la mitad de la volatilidad', () => {
    const r = diversificationMetrics([0.5, 0.5], cov2(1, -0.5), [0.5, 0.5])!
    expect(r.portfolioVolatility).toBeCloseTo(0.5, 10)
    expect(r.diversificationRatio).toBeCloseTo(2, 10)
    expect(r.volatilityReduction).toBeCloseTo(0.5, 10)
    expect(r.averageCorrelation).toBeCloseTo(-0.5, 10)
  })

  it('una cartera muy desigual tiene menos apuestas efectivas que activos', () => {
    // Tres activos independientes, pero uno domina el riesgo.
    const cov = [
      [0.04, 0, 0],
      [0, 0.04, 0],
      [0, 0, 0.04],
    ]
    const r = diversificationMetrics([0.9, 0.05, 0.05], cov, [0.98, 0.01, 0.01])!
    expect(r.effectiveBets).not.toBeNull()
    // Con 3 activos el máximo es 3; aquí debe quedar muy por debajo.
    expect(r.effectiveBets!).toBeLessThan(1.3)
  })

  it('reparto perfecto entre 4 fuentes ⇒ 4 apuestas efectivas', () => {
    const cov = [
      [0.04, 0, 0, 0],
      [0, 0.04, 0, 0],
      [0, 0, 0.04, 0],
      [0, 0, 0, 0.04],
    ]
    const r = diversificationMetrics([0.25, 0.25, 0.25, 0.25], cov, [0.25, 0.25, 0.25, 0.25])!
    expect(r.effectiveBets).toBeCloseTo(4, 10)
  })

  it('un activo sin riesgo (efectivo) no invalida el nº de apuestas', () => {
    // Tres activos: dos independientes al 50 % del riesgo y efectivo que no
    // aporta nada. La entropía debe salir 2, no anularse por el cero.
    const cov = [
      [0.04, 0, 0],
      [0, 0.04, 0],
      [0, 0, 0],
    ]
    const r = diversificationMetrics([0.45, 0.45, 0.1], cov, [0.5, 0.5, 0])!
    expect(r.effectiveBets).toBeCloseTo(2, 10)
  })

  it('con una contribución negativa no se inventa el nº de apuestas', () => {
    const r = diversificationMetrics([0.5, 0.5], cov2(1, -0.5), [1.2, -0.2])!
    expect(r.effectiveBets).toBeNull()
    // El resto de medidas sí se calculan.
    expect(r.diversificationRatio).toBeCloseTo(2, 10)
  })

  it('rechaza entradas degeneradas', () => {
    expect(diversificationMetrics([], [], [])).toBeNull()
    // Cobertura perfecta: volatilidad cero, DR no definido.
    expect(diversificationMetrics([0.5, 0.5], cov2(1, -1), [0.5, 0.5])).toBeNull()
    // Varianza negativa: matriz inválida.
    expect(diversificationMetrics([1], [[-1]], [1])).toBeNull()
  })

  it('sin contribuciones devuelve el resto de medidas', () => {
    const r = diversificationMetrics([0.5, 0.5], cov2(0.2, 0))!
    expect(r.effectiveBets).toBeNull()
    expect(r.diversificationRatio).toBeCloseTo(Math.SQRT2, 10)
  })
})

describe('describeDiversification', () => {
  it('clasifica el ratio en niveles legibles', () => {
    expect(describeDiversification(1.8).level).toBe('ok')
    expect(describeDiversification(1.25).level).toBe('ok')
    expect(describeDiversification(1.1).level).toBe('warn')
    expect(describeDiversification(1.0).level).toBe('high')
  })
})
