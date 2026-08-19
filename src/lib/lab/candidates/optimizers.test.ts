/**
 * Pruebas de los optimizadores (LAB-606, LAB-607).
 *
 * Los criterios de aceptación son dos y los dos son sobre **no mentir**:
 * mínima varianza no devuelve pesos si el solver no converge, y ERC informa de
 * su error de paridad y de su convergencia.
 *
 * Los casos tienen respuesta conocida a mano, que es lo que hace la prueba
 * comprobable: con una covarianza diagonal la solución de mínima varianza es
 * proporcional a la inversa de las varianzas, y la de ERC es proporcional a la
 * inversa de las desviaciones típicas.
 */
import { describe, expect, it } from 'vitest'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import {
  ERC_VERSION,
  MIN_VARIANCE_VERSION,
  candidateEqualRiskContribution,
  candidateMinimumVariance,
  isUsableCovariance,
  portfolioVariance,
  projectToSimplex,
  riskContributions,
  shrinkCovariance,
} from './optimizers'

const activo = (id: string): CompilerInstrument => ({
  id,
  symbol: id.toUpperCase(),
  dimensions: {},
  currentWeight: 0,
})

const universo = (n: number) =>
  Array.from({ length: n }, (_, i) => activo(String.fromCharCode(97 + i)))

const diagonal = (varianzas: readonly number[]) =>
  varianzas.map((v, i) => varianzas.map((_, j) => (i === j ? v : 0)))

const compilar = (n: number, c: PortfolioConstraint[] = []) => compileConstraints(c, universo(n))

const suma = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

/* ── Mínima varianza ──────────────────────────────────────────────────────── */

describe('mínima varianza: casos con respuesta conocida', () => {
  it('con varianzas iguales reparte por igual', () => {
    const r = candidateMinimumVariance({
      compiled: compilar(3),
      covariance: diagonal([0.04, 0.04, 0.04]),
    })
    expect(r.solver.status).toBe('converged')
    for (const w of r.weights!) expect(w).toBeCloseTo(1 / 3, 4)
  })

  it('con covarianza diagonal, los pesos van como la inversa de la varianza', () => {
    // Varianzas 0,01 / 0,04: inversas 100 y 25 → pesos 0,8 y 0,2.
    const r = candidateMinimumVariance({
      compiled: compilar(2),
      covariance: diagonal([0.01, 0.04]),
      shrinkage: 0,
    })
    expect(r.weights![0]).toBeCloseTo(0.8, 3)
    expect(r.weights![1]).toBeCloseTo(0.2, 3)
  })

  it('carga menos en el activo más volátil', () => {
    const r = candidateMinimumVariance({
      compiled: compilar(3),
      covariance: diagonal([0.01, 0.04, 0.09]),
      shrinkage: 0,
    })
    expect(r.weights![0]).toBeGreaterThan(r.weights![1]!)
    expect(r.weights![1]).toBeGreaterThan(r.weights![2]!)
  })

  it('los pesos suman uno', () => {
    const r = candidateMinimumVariance({
      compiled: compilar(4),
      covariance: diagonal([0.01, 0.02, 0.04, 0.09]),
    })
    expect(suma(r.weights!)).toBeCloseTo(1, 6)
  })

  it('la solución tiene menos varianza que el reparto a partes iguales', () => {
    // Es la definición de lo que hace: si no, el optimizador no optimiza.
    const cov = diagonal([0.01, 0.04, 0.09])
    const r = candidateMinimumVariance({ compiled: compilar(3), covariance: cov, shrinkage: 0 })
    const iguales = [1 / 3, 1 / 3, 1 / 3]
    expect(portfolioVariance(r.weights!, cov)).toBeLessThan(portfolioVariance(iguales, cov))
  })

  it('dos activos idénticos reciben el mismo peso', () => {
    const cov = [
      [0.04, 0.04, 0],
      [0.04, 0.04, 0],
      [0, 0, 0.01],
    ]
    const r = candidateMinimumVariance({ compiled: compilar(3), covariance: cov })
    expect(r.weights![0]).toBeCloseTo(r.weights![1]!, 4)
  })
})

describe('mínima varianza: restricciones', () => {
  it('respeta un techo por activo', () => {
    const r = candidateMinimumVariance({
      compiled: compilar(2, [{ kind: 'assetWeight', instrumentId: 'a', max: 0.5 }]),
      covariance: diagonal([0.01, 0.04]),
      shrinkage: 0,
    })
    expect(r.weights![0]).toBeLessThanOrEqual(0.5 + 1e-6)
    expect(suma(r.weights!)).toBeCloseTo(1, 6)
  })

  it('respeta un suelo por activo', () => {
    const r = candidateMinimumVariance({
      compiled: compilar(2, [{ kind: 'assetWeight', instrumentId: 'b', min: 0.4 }]),
      covariance: diagonal([0.01, 0.09]),
      shrinkage: 0,
    })
    expect(r.weights![1]).toBeGreaterThanOrEqual(0.4 - 1e-6)
  })

  it('un activo excluido del universo queda a cero', () => {
    const r = candidateMinimumVariance({
      compiled: compilar(3, [{ kind: 'eligibleUniverse', instrumentIds: ['a', 'b'] }]),
      covariance: diagonal([0.01, 0.04, 0.0001]),
    })
    // C tiene la varianza más baja, pero está fuera: no entra igualmente.
    expect(r.weights![2]).toBeCloseTo(0, 6)
  })

  it('unos límites imposibles se declaran infactibles, sin pesos', () => {
    const r = candidateMinimumVariance({
      compiled: compilar(2, [
        { kind: 'assetWeight', instrumentId: 'a', max: 0.2 },
        { kind: 'assetWeight', instrumentId: 'b', max: 0.2 },
      ]),
      covariance: diagonal([0.01, 0.04]),
    })
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('infeasible')
  })
})

describe('mínima varianza: lo que no calcula no lo entrega', () => {
  it('una covarianza no simétrica se rechaza', () => {
    const r = candidateMinimumVariance({
      compiled: compilar(2),
      covariance: [
        [0.04, 0.02],
        [0.01, 0.04],
      ],
    })
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('invalid_input')
  })

  it('una varianza cero o negativa se rechaza', () => {
    for (const mala of [diagonal([0, 0.04]), diagonal([-0.01, 0.04])]) {
      const r = candidateMinimumVariance({ compiled: compilar(2), covariance: mala })
      expect(r.weights).toBeNull()
    }
  })

  it('una matriz de tamaño distinto al universo se rechaza', () => {
    const r = candidateMinimumVariance({ compiled: compilar(3), covariance: diagonal([0.01, 0.04]) })
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('invalid_input')
  })

  it('sin universo no hay cartera', () => {
    const r = candidateMinimumVariance({ compiled: compilar(0), covariance: [] })
    expect(r.weights).toBeNull()
  })

  it('el informe del solver viaja siempre, converja o no', () => {
    const bueno = candidateMinimumVariance({ compiled: compilar(2), covariance: diagonal([0.01, 0.04]) })
    const malo = candidateMinimumVariance({ compiled: compilar(2), covariance: [[1]] })
    expect(bueno.solver.iterations).toBeGreaterThanOrEqual(0)
    expect(malo.solver.status).not.toBe('converged')
  })

  it('va versionada y declara que la varianza no es todo el riesgo', () => {
    const r = candidateMinimumVariance({ compiled: compilar(2), covariance: diagonal([0.01, 0.04]) })
    expect(r.modelVersion).toBe(MIN_VARIANCE_VERSION)
    expect(r.assumptions.some((a) => /Menos varianza no es menos riesgo/.test(a.label))).toBe(true)
  })
})

/* ── ERC ──────────────────────────────────────────────────────────────────── */

describe('ERC: casos con respuesta conocida', () => {
  it('con varianzas iguales reparte por igual', () => {
    const r = candidateEqualRiskContribution({
      compiled: compilar(3),
      covariance: diagonal([0.04, 0.04, 0.04]),
    })
    expect(r.solver.status).toBe('converged')
    for (const w of r.weights!) expect(w).toBeCloseTo(1 / 3, 5)
  })

  it('con covarianza diagonal, los pesos van como la inversa de la desviación', () => {
    // Desviaciones 0,1 y 0,2: inversas 10 y 5 → pesos 2/3 y 1/3.
    const r = candidateEqualRiskContribution({
      compiled: compilar(2),
      covariance: diagonal([0.01, 0.04]),
      shrinkage: 0,
    })
    expect(r.weights![0]).toBeCloseTo(2 / 3, 4)
    expect(r.weights![1]).toBeCloseTo(1 / 3, 4)
  })

  it('las contribuciones al riesgo quedan igualadas dentro de la tolerancia', () => {
    const cov = [
      [0.04, 0.01, 0.005],
      [0.01, 0.09, 0.002],
      [0.005, 0.002, 0.0225],
    ]
    const r = candidateEqualRiskContribution({ compiled: compilar(3), covariance: cov })
    const contribuciones = riskContributions(r.weights!, shrinkCovariance(cov, 0.1))
    for (const c of contribuciones) expect(c).toBeCloseTo(1 / 3, 5)
  })

  it('informa del error de paridad alcanzado', () => {
    const r = candidateEqualRiskContribution({
      compiled: compilar(3),
      covariance: diagonal([0.01, 0.04, 0.09]),
    })
    expect(r.parityError).toBeLessThan(1e-8)
    expect(r.solver.residual).toBe(r.parityError)
  })

  it('carga menos en el activo más volátil, pero menos agresivamente que mínima varianza', () => {
    const cov = diagonal([0.01, 0.09])
    const erc = candidateEqualRiskContribution({ compiled: compilar(2), covariance: cov, shrinkage: 0 })
    const mv = candidateMinimumVariance({ compiled: compilar(2), covariance: cov, shrinkage: 0 })
    // ERC: 0,75 / 0,25. Mínima varianza: 0,9 / 0,1. ERC concentra menos.
    expect(erc.weights![0]).toBeLessThan(mv.weights![0]!)
  })

  it('los pesos suman uno', () => {
    const r = candidateEqualRiskContribution({
      compiled: compilar(4),
      covariance: diagonal([0.01, 0.02, 0.04, 0.09]),
    })
    expect(suma(r.weights!)).toBeCloseTo(1, 6)
  })
})

describe('ERC: lo que no calcula no lo entrega', () => {
  it('una covarianza inválida se rechaza sin pesos', () => {
    const r = candidateEqualRiskContribution({ compiled: compilar(2), covariance: [[1]] })
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('invalid_input')
  })

  it('unos límites imposibles se declaran infactibles', () => {
    const r = candidateEqualRiskContribution({
      compiled: compilar(2, [
        { kind: 'assetWeight', instrumentId: 'a', max: 0.2 },
        { kind: 'assetWeight', instrumentId: 'b', max: 0.2 },
      ]),
      covariance: diagonal([0.01, 0.04]),
    })
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('infeasible')
  })

  it('va versionada y avisa de que la paridad se rompe en un desplome', () => {
    const r = candidateEqualRiskContribution({ compiled: compilar(2), covariance: diagonal([0.01, 0.04]) })
    expect(r.modelVersion).toBe(ERC_VERSION)
    expect(r.assumptions.some((a) => /correlaciones cambian/.test(a.detail))).toBe(true)
  })
})

/* ── Piezas ───────────────────────────────────────────────────────────────── */

describe('las piezas de apoyo', () => {
  it('el shrinkage deja la diagonal intacta y encoge lo de fuera', () => {
    const m = [
      [0.04, 0.02],
      [0.02, 0.09],
    ]
    const s = shrinkCovariance(m, 0.5)
    expect(s[0]![0]).toBe(0.04)
    expect(s[0]![1]).toBeCloseTo(0.01, 12)
  })

  it('con intensidad cero no cambia nada, y con uno queda diagonal', () => {
    const m = [
      [0.04, 0.02],
      [0.02, 0.09],
    ]
    expect(shrinkCovariance(m, 0)).toEqual(m)
    expect(shrinkCovariance(m, 1)[0]![1]).toBe(0)
  })

  it('la validación de covarianza acepta lo bueno y rechaza lo malo', () => {
    expect(isUsableCovariance(diagonal([0.01, 0.04]))).toBe(true)
    expect(isUsableCovariance([])).toBe(false)
    expect(isUsableCovariance([[0.01, 0.02]])).toBe(false)
    expect(isUsableCovariance(diagonal([0, 0.04]))).toBe(false)
  })

  it('la proyección devuelve un vector que suma uno y respeta las cajas', () => {
    const p = projectToSimplex([0.9, 0.9, 0.9], { min: [0, 0, 0], max: [0.5, 0.5, 0.5] })!
    expect(suma(p)).toBeCloseTo(1, 9)
    for (const x of p) expect(x).toBeLessThanOrEqual(0.5 + 1e-9)
  })

  it('la proyección devuelve null cuando las cajas no admiten sumar uno', () => {
    expect(projectToSimplex([0.5, 0.5], { min: [0, 0], max: [0.2, 0.2] })).toBeNull()
    expect(projectToSimplex([0.5, 0.5], { min: [0.7, 0.7], max: [1, 1] })).toBeNull()
  })

  it('las contribuciones al riesgo suman uno', () => {
    const cov = diagonal([0.01, 0.04, 0.09])
    expect(suma(riskContributions([0.5, 0.3, 0.2], cov))).toBeCloseTo(1, 9)
  })
})

describe('determinismo', () => {
  it('los mismos datos dan exactamente los mismos pesos', () => {
    const entrada = { compiled: compilar(3), covariance: diagonal([0.01, 0.04, 0.09]) }
    expect(candidateMinimumVariance(entrada)).toEqual(candidateMinimumVariance(entrada))
    expect(candidateEqualRiskContribution(entrada)).toEqual(candidateEqualRiskContribution(entrada))
  })
})
