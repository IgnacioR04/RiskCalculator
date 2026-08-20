/**
 * Pruebas de la ejecución de candidatas (LAB-611).
 *
 * El criterio de aceptación: **entradas incompatibles devuelven
 * `LAB_CONSTRAINTS_INFEASIBLE`**.
 */
import { describe, expect, it } from 'vitest'
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import type { CompilerInstrument } from './constraintCompiler'
import {
  CANDIDATE_RUN_VERSION,
  RUN_ERROR_TEXT,
  runCandidates,
  type CandidateRunInput,
} from './candidateRun'

const activo = (id: string): CompilerInstrument => ({
  id,
  symbol: id.toUpperCase(),
  dimensions: {},
  currentWeight: 0,
})

const UNIVERSO = [activo('a'), activo('b'), activo('c')]
const COV = [
  [0.04, 0.01, 0],
  [0.01, 0.09, 0],
  [0, 0, 0.0025],
]

function ejecutar(cambios: Partial<CandidateRunInput> = {}) {
  return runCandidates({
    universe: UNIVERSO,
    constraints: [],
    currentWeights: [0.6, 0.3, 0.1],
    totalValue: 10_000,
    covariance: COV,
    seed: 11,
    ...cambios,
  })
}

describe('produce las tres candidatas con los mismos datos', () => {
  it('genera 1/N, mínima varianza y riesgo repartido', () => {
    const r = ejecutar()
    expect(r.candidates.map((c) => c.method).sort()).toEqual([
      'equalRiskContribution',
      'equalWeight',
      'minimumVariance',
    ])
  })

  it('todas convergen con datos razonables', () => {
    for (const c of ejecutar().candidates) expect(c.solver.status).toBe('converged')
  })

  it('las métricas incluyen la cartera actual como referencia', () => {
    expect(ejecutar().metrics!.some((m) => m.method === 'current')).toBe(true)
  })

  it('analiza la robustez de la mínima varianza, con su semilla', () => {
    const r = ejecutar({ seed: 99 })
    expect(r.robustness!.seed).toBe(99)
    expect(r.robustness!.repetitions).toBeGreaterThan(0)
  })

  it('el aviso de que no es una recomendación viaja con el resultado', () => {
    expect(ejecutar().disclaimer).toMatch(/no es una recomendación/i)
  })

  it('va versionada', () => {
    expect(ejecutar().version).toBe(CANDIDATE_RUN_VERSION)
  })
})

describe('restricciones incompatibles', () => {
  const imposibles: PortfolioConstraint[] = [
    { kind: 'assetWeight', instrumentId: 'a', min: 0.7 },
    { kind: 'assetWeight', instrumentId: 'b', min: 0.7 },
  ]

  it('devuelven el código estable, no un vector cualquiera', () => {
    const r = ejecutar({ constraints: imposibles })
    expect(r.errors).toEqual(['LAB_CONSTRAINTS_INFEASIBLE'])
    expect(r.candidates).toEqual([])
  })

  it('el diagnóstico explica cuál es el problema', () => {
    const r = ejecutar({ constraints: imposibles })
    expect(r.feasibility.feasible).toBe(false)
    expect(r.feasibility.problems[0]!.detail.length).toBeGreaterThan(0)
  })

  it('no se optimiza nada: sería entregar carteras que incumplen', () => {
    expect(ejecutar({ constraints: imposibles }).metrics).toBeNull()
  })

  it('cada código tiene su texto para la interfaz', () => {
    expect(RUN_ERROR_TEXT.LAB_CONSTRAINTS_INFEASIBLE).toMatch(/aflojar/)
    expect(RUN_ERROR_TEXT.LAB_EMPTY_UNIVERSE.length).toBeGreaterThan(0)
    expect(RUN_ERROR_TEXT.LAB_COVARIANCE_UNAVAILABLE.length).toBeGreaterThan(0)
  })
})

describe('sin historial suficiente', () => {
  it('1/N sigue valiendo: es la que no estima nada', () => {
    const r = ejecutar({ covariance: null })
    expect(r.candidates.map((c) => c.method)).toEqual(['equalWeight'])
    expect(r.candidates[0]!.weights).not.toBeNull()
  })

  it('se avisa de que falta el historial, con código', () => {
    expect(ejecutar({ covariance: null }).errors).toContain('LAB_COVARIANCE_UNAVAILABLE')
  })

  it('no se inventan métricas de riesgo sin datos para calcularlas', () => {
    const r = ejecutar({ covariance: null })
    expect(r.metrics).toBeNull()
    expect(r.robustness).toBeNull()
  })
})

describe('universo vacío', () => {
  it('se dice con su código y no se produce nada', () => {
    const r = ejecutar({ universe: [], covariance: [] })
    expect(r.errors).toEqual(['LAB_EMPTY_UNIVERSE'])
    expect(r.candidates).toEqual([])
  })
})

describe('idempotencia', () => {
  it('los mismos datos dan exactamente el mismo resultado', () => {
    expect(ejecutar()).toEqual(ejecutar())
  })

  it('el resultado no depende del reloj', () => {
    // Ningún motor de la fase lee la hora; si alguno lo hiciera, dos
    // ejecuciones seguidas dejarían de coincidir.
    const primera = ejecutar()
    const segunda = ejecutar()
    expect(JSON.stringify(primera)).toBe(JSON.stringify(segunda))
  })
})
