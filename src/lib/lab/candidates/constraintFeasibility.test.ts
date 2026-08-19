/**
 * Pruebas del diagnóstico de factibilidad (LAB-602).
 *
 * El criterio de aceptación: **el error muestra un conjunto mínimo útil o
 * razones ordenadas**. «Tu política es infactible» no ayuda a nadie; «estos tres
 * mínimos suman un 120 %» señala dónde mirar.
 */
import { describe, expect, it } from 'vitest'
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import { assessFeasibility } from './constraintFeasibility'

function activo(id: string, dimensions: CompilerInstrument['dimensions'] = {}): CompilerInstrument {
  return { id, symbol: id.toUpperCase(), dimensions, currentWeight: 0.25 }
}

const UNIVERSO = [
  activo('aapl', { assetType: 'stock', sector: 'tech' }),
  activo('msft', { assetType: 'stock', sector: 'tech' }),
  activo('iwda', { assetType: 'etf', sector: 'diversificado' }),
  activo('eur', { assetType: 'cash' }),
]

const diagnosticar = (c: PortfolioConstraint[], u = UNIVERSO) =>
  assessFeasibility(compileConstraints(c, u))

describe('lo que sí es factible se deja pasar', () => {
  it('sin restricciones, todo cabe', () => {
    const r = diagnosticar([])
    expect(r.feasible).toBe(true)
    expect(r.problems).toEqual([])
  })

  it('unos límites razonables no producen falsos positivos', () => {
    const r = diagnosticar([
      { kind: 'groupWeight', dimension: 'sector', key: 'tech', max: 0.4 },
      { kind: 'assetWeight', instrumentId: 'eur', min: 0.05, max: 0.2 },
    ])
    expect(r.feasible).toBe(true)
  })

  it('mínimos que suman justo el 100 % son factibles', () => {
    const r = diagnosticar([
      { kind: 'assetWeight', instrumentId: 'aapl', min: 0.5 },
      { kind: 'assetWeight', instrumentId: 'msft', min: 0.5 },
    ])
    expect(r.feasible).toBe(true)
  })
})

describe('mínimos que no caben', () => {
  it('tres mínimos que suman más del 100 % se detectan y se cuantifican', () => {
    const r = diagnosticar([
      { kind: 'assetWeight', instrumentId: 'aapl', min: 0.5 },
      { kind: 'assetWeight', instrumentId: 'msft', min: 0.4 },
      { kind: 'assetWeight', instrumentId: 'iwda', min: 0.3 },
    ])

    expect(r.feasible).toBe(false)
    const problema = r.problems.find((p) => p.kind === 'minimums_exceed_total')!
    expect(problema.detail).toMatch(/120,0 %/)
    expect(problema.remediation).toMatch(/sobran 20,0 %/i)
  })

  it('el conjunto culpable son los tres, no «la política»', () => {
    const r = diagnosticar([
      { kind: 'assetWeight', instrumentId: 'aapl', min: 0.5 },
      { kind: 'assetWeight', instrumentId: 'msft', min: 0.4 },
      { kind: 'assetWeight', instrumentId: 'iwda', min: 0.3 },
    ])
    const problema = r.problems.find((p) => p.kind === 'minimums_exceed_total')!
    expect([...problema.bounds].sort()).toEqual(['asset:aapl', 'asset:iwda', 'asset:msft'])
  })

  it('grupos que se solapan no cuentan el mismo dinero dos veces', () => {
    // «tech ≥ 60 %» incluye a AAPL; sumar el 50 % de AAPL daría un falso 110 %,
    // y el usuario aflojaría una regla que no era el problema.
    const r = diagnosticar([
      { kind: 'groupWeight', dimension: 'sector', key: 'tech', min: 0.6 },
      { kind: 'assetWeight', instrumentId: 'aapl', min: 0.5 },
    ])
    expect(r.problems.some((p) => p.kind === 'minimums_exceed_total')).toBe(false)
  })
})

describe('techos que no llegan', () => {
  it('si todo tiene techo y no suman 100 %, sobra dinero sin destino', () => {
    const r = diagnosticar([
      { kind: 'assetWeight', instrumentId: 'aapl', max: 0.2 },
      { kind: 'assetWeight', instrumentId: 'msft', max: 0.2 },
      { kind: 'assetWeight', instrumentId: 'iwda', max: 0.2 },
      { kind: 'assetWeight', instrumentId: 'eur', max: 0.2 },
    ])

    const problema = r.problems.find((p) => p.kind === 'maximums_below_total')!
    expect(problema.detail).toMatch(/80,0 %/)
    expect(problema.detail).toMatch(/20,0 % sin dónde ir/)
  })

  it('si algún activo queda sin techo, no hay problema: ahí cabe el resto', () => {
    const r = diagnosticar([
      { kind: 'assetWeight', instrumentId: 'aapl', max: 0.2 },
      { kind: 'assetWeight', instrumentId: 'msft', max: 0.2 },
    ])
    expect(r.problems.some((p) => p.kind === 'maximums_below_total')).toBe(false)
  })
})

describe('contradicciones locales', () => {
  it('un mínimo mayor que su máximo se señala solo', () => {
    const r = diagnosticar([{ kind: 'assetWeight', instrumentId: 'aapl', min: 0.5, max: 0.2 }])
    const problema = r.problems.find((p) => p.kind === 'inverted_bound')!
    expect(problema.bounds).toEqual(['asset:aapl'])
    expect(problema.detail).toMatch(/mínimo del 50,0 %/)
  })

  it('un grupo cuyos miembros no pueden llegar a su mínimo', () => {
    // «tech ≥ 60 %» con AAPL y MSFT topados al 20 % cada uno: solo llegan al 40 %.
    const r = diagnosticar([
      { kind: 'groupWeight', dimension: 'sector', key: 'tech', min: 0.6 },
      { kind: 'assetWeight', instrumentId: 'aapl', max: 0.2 },
      { kind: 'assetWeight', instrumentId: 'msft', max: 0.2 },
    ])

    const problema = r.problems.find((p) => p.kind === 'group_capped_below_minimum')!
    expect(problema.detail).toMatch(/al menos 60,0 %/)
    expect(problema.detail).toMatch(/llegar al 40,0 %/)
    // El conjunto culpable incluye al grupo y a los topes que lo estrangulan.
    expect(problema.bounds).toContain('group:sector:tech')
    expect(problema.bounds).toContain('asset:aapl')
  })

  it('sin topes por activo, un grupo siempre puede alcanzar su mínimo', () => {
    const r = diagnosticar([{ kind: 'groupWeight', dimension: 'sector', key: 'tech', min: 0.6 }])
    expect(r.problems.some((p) => p.kind === 'group_capped_below_minimum')).toBe(false)
  })

  it('algo que no se puede vender y tiene que valer cero', () => {
    const r = diagnosticar([
      { kind: 'lockedPosition', instrumentId: 'aapl' },
      { kind: 'eligibleUniverse', instrumentIds: ['msft', 'iwda', 'eur'] },
    ])
    const problema = r.problems.find((p) => p.kind === 'locked_forced_to_zero')!
    expect(problema.detail).toMatch(/AAPL no se puede vender/)
    expect(problema.remediation).toMatch(/Permite venderlo/)
  })

  it('un universo vacío se nombra en vez de dar un solver infactible', () => {
    const r = diagnosticar([], [])
    expect(r.problems.some((p) => p.kind === 'empty_universe')).toBe(true)
  })
})

describe('el diagnóstico es honesto sobre sí mismo', () => {
  it('declara que no es una prueba de factibilidad completa', () => {
    const r = diagnosticar([])
    expect(r.limitations.some((l) => /descubre el optimizador/.test(l))).toBe(true)
  })

  it('declara que no mira costes ni rotación', () => {
    expect(diagnosticar([]).limitations.some((l) => /costes ni rotación/.test(l))).toBe(true)
  })

  it('cada problema trae qué aflojar', () => {
    const r = diagnosticar([
      { kind: 'assetWeight', instrumentId: 'aapl', min: 0.7 },
      { kind: 'assetWeight', instrumentId: 'msft', min: 0.7 },
    ])
    for (const p of r.problems) expect(p.remediation.length).toBeGreaterThan(0)
  })
})

describe('determinismo', () => {
  it('el orden de entrada no cambia el diagnóstico', () => {
    const c: PortfolioConstraint[] = [
      { kind: 'assetWeight', instrumentId: 'aapl', min: 0.6 },
      { kind: 'assetWeight', instrumentId: 'msft', min: 0.6 },
    ]
    expect(diagnosticar(c)).toEqual(diagnosticar([...c].reverse()))
  })
})
