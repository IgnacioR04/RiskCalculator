/**
 * LAB-1106. Los casos que importan son los que **no fallan solos**: una matriz
 * cuadrada, simétrica y con diagonal positiva puede seguir asignando varianza
 * negativa a alguna cartera, y entonces un minimizador de varianza encuentra
 * direcciones de «riesgo negativo» y devuelve pesos que parecen una solución.
 */
import { describe, expect, it } from 'vitest'
import { covarianceHealth } from './covarianceHealth'
import { isUsableCovariance } from './optimizers'

describe('covarianceHealth · forma', () => {
  it('rechaza una matriz que no es cuadrada', () => {
    const r = covarianceHealth([[0.04, 0.01], [0.01]])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not_square')
  })

  it('rechaza una varianza nula: una serie constante no puede optimizarse', () => {
    const r = covarianceHealth([
      [0.04, 0],
      [0, 0],
    ])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('nonpositive_variance')
  })

  it('rechaza la asimetría real pero tolera el último bit', () => {
    const asimetrica = covarianceHealth([
      [0.04, 0.02],
      [0.03, 0.09],
    ])
    expect(asimetrica.ok).toBe(false)
    if (!asimetrica.ok) expect(asimetrica.reason).toBe('not_symmetric')

    // Diferencia de redondeo entre dos caminos de cálculo: no es asimetría.
    const casi = covarianceHealth([
      [0.04, 0.02],
      [0.02 + 1e-18, 0.09],
    ])
    expect(casi.ok).toBe(true)
  })
})

describe('covarianceHealth · definición positiva', () => {
  it('acepta sin tocar nada una matriz bien condicionada', () => {
    const r = covarianceHealth([
      [0.04, 0.01],
      [0.01, 0.09],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.jitter).toBe(0)
  })

  it('regulariza una matriz singular y dice cuánto', () => {
    // Dos activos con correlación exactamente 1: la matriz es singular, y el
    // caso aparece de verdad con dos clases del mismo índice.
    const r = covarianceHealth([
      [0.04, 0.04],
      [0.04, 0.04],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Regularizar en silencio sería cambiar el problema sin decirlo.
    expect(r.jitter).toBeGreaterThan(0)
  })

  it('rechaza una matriz indefinida que ninguna comprobación de forma detecta', () => {
    // Correlación 1,5: imposible, pero cuadrada, simétrica y con diagonal
    // positiva. `isUsableCovariance` la da por buena; aquí no pasa.
    const indefinida = [
      [0.04, 0.06],
      [0.06, 0.04],
    ]
    expect(isUsableCovariance(indefinida)).toBe(true)

    const r = covarianceHealth(indefinida)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not_positive_semidefinite')
  })

  it('rechaza una matriz con más activos que información', () => {
    // Tres activos que son combinación lineal exacta entre sí: pasa a ser
    // singular de rango 1 y con signos que la vuelven indefinida.
    const r = covarianceHealth([
      [0.04, 0.04, -0.04],
      [0.04, 0.04, -0.04],
      [-0.04, -0.04, 0.03],
    ])
    expect(r.ok).toBe(false)
  })

  it('es determinista', () => {
    const m = [
      [0.04, 0.039],
      [0.039, 0.04],
    ]
    expect(covarianceHealth(m)).toEqual(covarianceHealth(m))
  })
})
