/**
 * Pruebas de la candidata de solo aportaciones (LAB-605).
 *
 * El criterio de aceptación es una invariante, no un caso: **ninguna cantidad se
 * vende**. El valor en euros de cada posición después es mayor o igual que
 * antes, pase lo que pase.
 */
import { describe, expect, it } from 'vitest'
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import {
  CONTRIBUTIONS_ONLY_VERSION,
  candidateContributionsOnly,
} from './candidateContributionsOnly'

function activo(id: string, dimensions: CompilerInstrument['dimensions'] = {}): CompilerInstrument {
  return { id, symbol: id.toUpperCase(), dimensions, currentWeight: 0 }
}

const TRES = [activo('a'), activo('b'), activo('c')]

/** Cartera desequilibrada: A se ha disparado, C se ha quedado atrás. */
const VALORES = [6000, 3000, 1000]
const OBJETIVO = [1 / 3, 1 / 3, 1 / 3]

function repartir(opciones: {
  contribution?: number
  constraints?: PortfolioConstraint[]
  values?: number[]
  targets?: number[]
  tradingFee?: number
  universe?: CompilerInstrument[]
}) {
  const universe = opciones.universe ?? TRES
  return candidateContributionsOnly({
    compiled: compileConstraints(opciones.constraints ?? [], universe),
    currentValues: opciones.values ?? VALORES,
    contribution: opciones.contribution ?? 3000,
    targetWeights: opciones.targets ?? OBJETIVO,
    ...(opciones.tradingFee === undefined ? {} : { tradingFee: opciones.tradingFee }),
  })
}

describe('la invariante: no se vende nada', () => {
  it('ninguna asignación es negativa', () => {
    const r = repartir({})
    expect(r.plan.every((p) => p.amount >= 0)).toBe(true)
  })

  it('el activo que se ha disparado no recibe nada, pero tampoco se recorta', () => {
    // A está en 6.000 con objetivo 1/3: por encima. No recibe, y sigue en 6.000.
    const r = repartir({})
    const a = r.plan.find((p) => p.symbol === 'A')!
    expect(a.amount).toBe(0)
    // Su peso baja solo porque los demás suben.
    expect(a.weightAfter).toBeLessThan(a.weightBefore)
  })

  it('con cualquier reparto, el valor de cada posición no baja', () => {
    for (const contribution of [100, 1000, 5000, 50_000]) {
      const r = repartir({ contribution })
      r.plan.forEach((p, i) => {
        expect(p.amount).toBeGreaterThanOrEqual(0)
        // El valor final = valor inicial + lo aportado, nunca menos.
        expect(VALORES[i]! + p.amount).toBeGreaterThanOrEqual(VALORES[i]!)
      })
    }
  })
})

describe('el reparto va a quien más falta le hace', () => {
  it('prioriza al más rezagado', () => {
    const r = repartir({})
    const b = r.plan.find((p) => p.symbol === 'B')!
    const c = r.plan.find((p) => p.symbol === 'C')!
    // C está más lejos de su objetivo que B, así que recibe más.
    expect(c.amount).toBeGreaterThan(b.amount)
  })

  it('una aportación suficiente cuadra la cartera del todo', () => {
    // Con 3.000 sobre 10.000: total 13.000, objetivo 4.333 cada uno. A ya tiene
    // 6.000, así que no cuadra del todo. Con más dinero sí.
    const r = repartir({ contribution: 8000 })
    expect(r.remainingGap).toBeCloseTo(0, 6)
    const pesos = r.plan.map((p) => p.weightAfter)
    for (const w of pesos) expect(w).toBeCloseTo(1 / 3, 6)
  })

  it('los pesos finales suman uno', () => {
    const r = repartir({})
    expect(r.weights!.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 9)
  })

  it('todo el dinero se coloca cuando hay hueco', () => {
    const r = repartir({})
    const total = r.plan.reduce((s, p) => s + p.amount, 0)
    expect(total).toBeCloseTo(3000, 6)
    expect(r.unallocated).toBeCloseTo(0, 9)
  })
})

describe('cuando el dinero no llega', () => {
  it('no cuadrar la cartera no es un fallo: es la respuesta, y se cuantifica', () => {
    const r = repartir({ contribution: 500 })
    expect(r.solver.status).toBe('converged')
    expect(r.remainingGap).toBeGreaterThan(0)
  })

  it('con poco dinero se reparte igual, sin dejar nada sin colocar', () => {
    const r = repartir({ contribution: 100 })
    expect(r.plan.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(100, 6)
  })

  it('sin dinero no hay plan, y se dice', () => {
    const r = repartir({ contribution: 0 })
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('invalid_input')
    expect(r.notCovered[0]).toMatch(/No hay dinero nuevo/)
  })

  it('sin universo tampoco', () => {
    const r = repartir({ universe: [] })
    expect(r.weights).toBeNull()
    expect(r.solver.status).toBe('invalid_input')
  })
})

describe('topes y activos excluidos', () => {
  it('un activo excluido del universo no recibe nada', () => {
    const r = repartir({ constraints: [{ kind: 'eligibleUniverse', instrumentIds: ['b', 'c'] }] })
    expect(r.plan.find((p) => p.symbol === 'A')!.amount).toBe(0)
  })

  it('un tope por activo se respeta al aportar', () => {
    // C tope al 15 %: con 13.000 finales son 1.950, y ya tiene 1.000.
    const r = repartir({ constraints: [{ kind: 'assetWeight', instrumentId: 'c', max: 0.15 }] })
    const c = r.plan.find((p) => p.symbol === 'C')!
    expect(c.weightAfter).toBeLessThanOrEqual(0.15 + 1e-9)
  })

  it('si los topes no admiten todo el dinero, se dice cuánto sobra', () => {
    const r = repartir({
      contribution: 20_000,
      constraints: [
        { kind: 'assetWeight', instrumentId: 'a', max: 0.4 },
        { kind: 'assetWeight', instrumentId: 'b', max: 0.1 },
        { kind: 'assetWeight', instrumentId: 'c', max: 0.1 },
      ],
    })
    expect(r.unallocated).toBeGreaterThan(0)
    expect(r.notCovered[0]).toMatch(/sin colocar/)
  })
})

describe('costes', () => {
  it('la comisión sale del dinero aportado, no de la nada', () => {
    const r = repartir({ contribution: 1000, tradingFee: 0.01 })
    // Se invierten 1000/1,01 ≈ 990,10 y la comisión son ≈ 9,90.
    expect(r.cost).toBeCloseTo(1000 - 1000 / 1.01, 6)
    expect(r.plan.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(1000 / 1.01, 6)
  })

  it('sin comisión declarada, el coste es cero y se invierte todo', () => {
    const r = repartir({ contribution: 1000 })
    expect(r.cost).toBe(0)
    expect(r.plan.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(1000, 6)
  })

  it('una comisión más alta deja menos invertido', () => {
    const barato = repartir({ contribution: 1000, tradingFee: 0.001 })
    const caro = repartir({ contribution: 1000, tradingFee: 0.05 })
    expect(caro.cost).toBeGreaterThan(barato.cost)
  })
})

describe('procedencia y determinismo', () => {
  it('va versionada', () => {
    expect(repartir({}).modelVersion).toBe(CONTRIBUTIONS_ONLY_VERSION)
  })

  it('declara por qué no vender, que es la decisión de fondo', () => {
    const r = repartir({})
    expect(r.assumptions.some((a) => /No se vende nada/.test(a.label))).toBe(true)
    expect(r.assumptions.some((a) => /impuestos sobre la plusvalía/.test(a.detail))).toBe(true)
  })

  it('los mismos datos dan exactamente el mismo plan', () => {
    expect(repartir({})).toEqual(repartir({}))
  })

  it('una cartera ya equilibrada reparte a partes iguales', () => {
    const r = repartir({ values: [1000, 1000, 1000], contribution: 300 })
    for (const p of r.plan) expect(p.amount).toBeCloseTo(100, 6)
  })
})
