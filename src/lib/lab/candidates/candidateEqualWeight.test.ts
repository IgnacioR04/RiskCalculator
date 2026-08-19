/**
 * Pruebas de la candidata 1/N (LAB-604).
 *
 * El criterio de aceptación: **los pesos suman uno y las violaciones son cero**.
 * Lo que lo hace no trivial son los topes: un activo topado no puede llevarse su
 * parte, y el sobrante tiene que ir a algún sitio sin romper a los demás.
 */
import { describe, expect, it } from 'vitest'
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import { EQUAL_WEIGHT_VERSION, candidateEqualWeight } from './candidateEqualWeight'

function activo(id: string, dimensions: CompilerInstrument['dimensions'] = {}): CompilerInstrument {
  return { id, symbol: id.toUpperCase(), dimensions, currentWeight: 0.25 }
}

const CUATRO = [
  activo('a', { assetType: 'stock', sector: 'tech' }),
  activo('b', { assetType: 'stock', sector: 'tech' }),
  activo('c', { assetType: 'etf' }),
  activo('d', { assetType: 'cash' }),
]

const generar = (c: PortfolioConstraint[] = [], u = CUATRO) =>
  candidateEqualWeight(compileConstraints(c, u))

const suma = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

describe('el reparto básico', () => {
  it('sin restricciones, cada uno se lleva su parte', () => {
    const r = generar()
    expect(r.weights).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(r.solver.status).toBe('converged')
  })

  it('los pesos suman exactamente uno', () => {
    expect(suma(generar().weights!)).toBeCloseTo(1, 12)
  })

  it('no incumple ninguna restricción', () => {
    expect(generar().violations).toEqual([])
  })

  it('va versionada', () => {
    expect(generar().modelVersion).toBe(EQUAL_WEIGHT_VERSION)
  })

  it('declara que no estima nada, que es su virtud', () => {
    expect(generar().assumptions.some((a) => /No estima nada/.test(a.label))).toBe(true)
  })
})

describe('los topes hacen el reparto no trivial', () => {
  it('un activo topado se queda en su techo y el resto se reparte el sobrante', () => {
    const r = generar([{ kind: 'assetWeight', instrumentId: 'a', max: 0.1 }])
    // A se queda en 0,10; los otros tres se reparten 0,90 → 0,30 cada uno.
    expect(r.weights![0]).toBeCloseTo(0.1, 9)
    expect(r.weights![1]).toBeCloseTo(0.3, 9)
    expect(suma(r.weights!)).toBeCloseTo(1, 12)
    expect(r.violations).toEqual([])
  })

  it('dos topes encadenados no rompen el reparto', () => {
    const r = generar([
      { kind: 'assetWeight', instrumentId: 'a', max: 0.1 },
      { kind: 'assetWeight', instrumentId: 'b', max: 0.15 },
    ])
    expect(r.weights![0]).toBeCloseTo(0.1, 9)
    expect(r.weights![1]).toBeCloseTo(0.15, 9)
    // C y D se reparten lo que queda: 0,375 cada uno.
    expect(r.weights![2]).toBeCloseTo(0.375, 9)
    expect(suma(r.weights!)).toBeCloseTo(1, 12)
  })

  it('un suelo se respeta aunque sea mayor que la parte igual', () => {
    const r = generar([{ kind: 'assetWeight', instrumentId: 'a', min: 0.5 }])
    expect(r.weights![0]).toBeGreaterThanOrEqual(0.5 - 1e-9)
    expect(suma(r.weights!)).toBeCloseTo(1, 12)
    expect(r.violations).toEqual([])
  })

  it('el reparto respeta suelo y techo a la vez', () => {
    const r = generar([{ kind: 'assetWeight', instrumentId: 'a', min: 0.3, max: 0.35 }])
    expect(r.weights![0]).toBeGreaterThanOrEqual(0.3 - 1e-9)
    expect(r.weights![0]).toBeLessThanOrEqual(0.35 + 1e-9)
  })

  it('con el universo recortado, lo excluido queda a cero', () => {
    const r = generar([{ kind: 'eligibleUniverse', instrumentIds: ['a', 'b'] }])
    expect(r.weights![2]).toBeCloseTo(0, 9)
    expect(r.weights![3]).toBeCloseTo(0, 9)
    expect(r.weights![0]).toBeCloseTo(0.5, 9)
    expect(r.violations).toEqual([])
  })
})

describe('cuando no hay solución, no se inventa una', () => {
  it('mínimos que suman más del 100 % no producen pesos', () => {
    const r = generar([
      { kind: 'assetWeight', instrumentId: 'a', min: 0.7 },
      { kind: 'assetWeight', instrumentId: 'b', min: 0.7 },
    ])
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('infeasible')
    expect(r.notCovered[0]).toMatch(/más del 100 %/)
  })

  it('máximos que no llegan al 100 % tampoco', () => {
    const r = generar([
      { kind: 'assetWeight', instrumentId: 'a', max: 0.1 },
      { kind: 'assetWeight', instrumentId: 'b', max: 0.1 },
      { kind: 'assetWeight', instrumentId: 'c', max: 0.1 },
      { kind: 'assetWeight', instrumentId: 'd', max: 0.1 },
    ])
    expect(r.weights).toBeNull()
    expect(r.notCovered[0]).toMatch(/no llegan/)
  })

  it('un mínimo mayor que su máximo se detecta', () => {
    const r = generar([{ kind: 'assetWeight', instrumentId: 'a', min: 0.5, max: 0.2 }])
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('infeasible')
  })

  it('sin universo no hay cartera, y se dice', () => {
    const r = generar([], [])
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('invalid_input')
    expect(r.notCovered[0]).toMatch(/ningún instrumento/)
  })

  it('«sin pesos» no es «todo a cero»', () => {
    // Un cero es una decisión; la ausencia de solución es la falta de una.
    const r = generar([
      { kind: 'assetWeight', instrumentId: 'a', min: 0.7 },
      { kind: 'assetWeight', instrumentId: 'b', min: 0.7 },
    ])
    expect(r.weights).toBeNull()
    expect(r.weights).not.toEqual([0, 0, 0, 0])
  })
})

describe('los límites de grupo se comprueban aunque no acoten el reparto', () => {
  it('un reparto que incumple un tope de grupo lo declara', () => {
    // 1/N pone 0,25 en A y 0,25 en B: el sector tech suma 0,50, y el tope es 0,3.
    const r = generar([{ kind: 'groupWeight', dimension: 'sector', key: 'tech', max: 0.3 }])
    expect(r.weights).not.toBeNull()
    expect(r.violations.length).toBeGreaterThan(0)
    expect(r.violations[0]).toMatch(/tech/)
  })

  it('entregar una cartera que incumple es peor que no entregarla en silencio', () => {
    const r = generar([{ kind: 'groupWeight', dimension: 'sector', key: 'tech', max: 0.3 }])
    // Se entrega, pero con la violación a la vista: el usuario decide.
    expect(r.violations).not.toEqual([])
  })
})

describe('determinismo', () => {
  it('las mismas restricciones dan exactamente los mismos pesos', () => {
    const c: PortfolioConstraint[] = [{ kind: 'assetWeight', instrumentId: 'a', max: 0.1 }]
    expect(generar(c)).toEqual(generar(c))
  })

  it('un solo activo se lleva todo', () => {
    const r = generar([], [activo('solo')])
    expect(r.weights).toEqual([1])
  })
})
