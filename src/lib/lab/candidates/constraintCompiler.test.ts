/**
 * Pruebas del compilador de restricciones (LAB-601).
 *
 * El criterio de aceptación: **una restricción sin clasificación no se ignora**;
 * produce bloqueo o aviso. Es la diferencia entre una política que rige y una
 * que el usuario cree que rige.
 */
import { describe, expect, it } from 'vitest'
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import {
  CONSTRAINT_COMPILER_VERSION,
  blockingIssues,
  compileConstraints,
  violations,
  type CompilerInstrument,
} from './constraintCompiler'

function activo(
  id: string,
  dimensions: CompilerInstrument['dimensions'] = {},
  currentWeight = 0.25,
): CompilerInstrument {
  return { id, symbol: id.toUpperCase(), dimensions, currentWeight }
}

const UNIVERSO: CompilerInstrument[] = [
  activo('aapl', { assetType: 'stock', sector: 'tech', currency: 'USD' }),
  activo('msft', { assetType: 'stock', sector: 'tech', currency: 'USD' }),
  activo('iwda', { assetType: 'etf', sector: 'diversificado', currency: 'EUR' }),
  activo('eur', { assetType: 'cash', currency: 'EUR' }),
]

const compilar = (c: PortfolioConstraint[], u = UNIVERSO) => compileConstraints(c, u)

describe('lo que no se puede comprobar no se da por cumplido', () => {
  it('una dimensión que nadie declara bloquea, no se aplica en vacío', () => {
    // Aplicarla sobre el conjunto vacío la dejaría satisfecha siempre, y el
    // usuario creería que su límite rige.
    const r = compilar([{ kind: 'groupWeight', dimension: 'region', key: 'europa', max: 0.3 }])

    expect(r.bounds).toHaveLength(0)
    expect(blockingIssues(r)).toHaveLength(1)
    expect(blockingIssues(r)[0]!.reason).toBe('dimension_unknown')
  })

  it('un bloqueo siempre dice qué hacer para resolverlo', () => {
    const r = compilar([{ kind: 'groupWeight', dimension: 'region', key: 'europa', max: 0.3 }])
    expect(blockingIssues(r)[0]!.remediation.length).toBeGreaterThan(0)
  })

  it('un grupo vacío avisa pero no bloquea: no tener nada no es no saberlo', () => {
    const r = compilar([{ kind: 'groupWeight', dimension: 'sector', key: 'energia', max: 0.1 }])

    expect(r.bounds).toHaveLength(0)
    expect(blockingIssues(r)).toHaveLength(0)
    expect(r.issues[0]!.reason).toBe('empty_group')
    expect(r.issues[0]!.severity).toBe('warning')
  })

  it('un activo que ya no está en cartera avisa en vez de desaparecer', () => {
    const r = compilar([{ kind: 'assetWeight', instrumentId: 'tsla', max: 0.1 }])
    expect(r.issues[0]!.reason).toBe('instrument_not_found')
    expect(r.bounds).toHaveLength(0)
  })

  it('exigir no vender algo que el universo excluye es imposible, y se dice', () => {
    const r = compilar([
      { kind: 'lockedPosition', instrumentId: 'aapl' },
      { kind: 'eligibleUniverse', instrumentIds: ['msft', 'iwda', 'eur'] },
    ])
    const bloqueos = blockingIssues(r)
    expect(bloqueos).toHaveLength(1)
    expect(bloqueos[0]!.reason).toBe('locked_outside_universe')
  })
})

describe('traduce dimensiones humanas a índices', () => {
  it('un límite por sector agrupa a quienes lo comparten', () => {
    const r = compilar([{ kind: 'groupWeight', dimension: 'sector', key: 'tech', max: 0.4 }])
    expect(r.bounds).toHaveLength(1)
    expect(r.bounds[0]!.members).toEqual([0, 1])
    expect(r.bounds[0]!.max).toBe(0.4)
  })

  it('un límite por activo afecta solo a ese activo', () => {
    const r = compilar([{ kind: 'assetWeight', instrumentId: 'aapl', min: 0.05, max: 0.2 }])
    expect(r.bounds[0]!.members).toEqual([0])
    expect(r.bounds[0]!.min).toBe(0.05)
  })

  it('sin mínimo declarado el suelo es cero, y sin máximo el techo es uno', () => {
    const r = compilar([{ kind: 'assetWeight', instrumentId: 'aapl', max: 0.2 }])
    expect(r.bounds[0]!.min).toBe(0)
    expect(compilar([{ kind: 'assetWeight', instrumentId: 'aapl', min: 0.1 }]).bounds[0]!.max).toBe(1)
  })

  it('los límites llegan acotados a 0–1: nadie puede pedir un 150 %', () => {
    const r = compilar([{ kind: 'assetWeight', instrumentId: 'aapl', min: -0.5, max: 1.5 }])
    expect(r.bounds[0]!.min).toBe(0)
    expect(r.bounds[0]!.max).toBe(1)
  })

  it('cada límite trae su frase para la interfaz', () => {
    const r = compilar([{ kind: 'groupWeight', dimension: 'sector', key: 'tech', max: 0.4 }])
    expect(r.bounds[0]!.label).toBe('tech entre 0 % y 40 %')
  })

  it('el universo conserva el orden de entrada: los índices dependen de él', () => {
    const r = compilar([])
    expect(r.universe.map((u) => u.id)).toEqual(['aapl', 'msft', 'iwda', 'eur'])
  })
})

describe('duras y blandas se separan desde el principio', () => {
  it('un límite por grupo es duro', () => {
    const r = compilar([{ kind: 'groupWeight', dimension: 'sector', key: 'tech', max: 0.4 }])
    expect(r.bounds[0]!.severity).toBe('hard')
  })

  it('la liquidez es blanda: un colchón es una preferencia, no una ley', () => {
    // Tratarla como dura dejaría sin solución a quien tenga poco efectivo.
    const r = compilar([{ kind: 'liquidity', minimumLiquidWeight: 0.1 }])
    expect(r.bounds[0]!.severity).toBe('soft')
    expect(r.bounds[0]!.members).toEqual([3])
  })

  it('sin efectivo en cartera, la liquidez avisa en vez de compilar un imposible', () => {
    const sinEfectivo = UNIVERSO.slice(0, 3)
    const r = compilar([{ kind: 'liquidity', minimumLiquidWeight: 0.1 }], sinEfectivo)
    expect(r.bounds).toHaveLength(0)
    expect(r.issues[0]!.reason).toBe('empty_group')
  })
})

describe('universo, bloqueos y comportamiento global', () => {
  it('lo excluido del universo se compila como peso cero', () => {
    const r = compilar([{ kind: 'eligibleUniverse', instrumentIds: ['aapl', 'eur'] }])
    const excluidos = r.bounds.find((b) => b.id === 'universe:excluded')!
    expect(excluidos.members).toEqual([1, 2])
    expect(excluidos.max).toBe(0)
  })

  it('sin restricción de universo no se excluye a nadie', () => {
    expect(compilar([]).bounds.find((b) => b.id === 'universe:excluded')).toBeUndefined()
  })

  it('las posiciones bloqueadas se recogen por índice y ordenadas', () => {
    const r = compilar([
      { kind: 'lockedPosition', instrumentId: 'iwda' },
      { kind: 'lockedPosition', instrumentId: 'aapl' },
    ])
    expect(r.locked).toEqual([0, 2])
  })

  it('el plan de solo aportaciones se propaga', () => {
    expect(compilar([{ kind: 'contributionsOnly', enabled: true }]).contributionsOnly).toBe(true)
    expect(compilar([]).contributionsOnly).toBe(false)
  })

  it('la rotación máxima se propaga, y sin ella es null', () => {
    expect(compilar([{ kind: 'turnover', max: 0.2 }]).maxTurnover).toBe(0.2)
    expect(compilar([]).maxTurnover).toBeNull()
  })

  it('el compilador va versionado', () => {
    expect(compilar([]).version).toBe(CONSTRAINT_COMPILER_VERSION)
  })
})

describe('comprobar una cartera con el mismo código que la produce', () => {
  const compilado = compilar([
    { kind: 'groupWeight', dimension: 'sector', key: 'tech', max: 0.4 },
    { kind: 'assetWeight', instrumentId: 'eur', min: 0.05 },
  ])

  it('una cartera que cumple no produce violaciones', () => {
    expect(violations(compilado, [0.2, 0.15, 0.55, 0.1])).toEqual([])
  })

  it('pasarse del techo de un grupo se detecta y se cuantifica', () => {
    const v = violations(compilado, [0.35, 0.3, 0.25, 0.1])
    expect(v).toHaveLength(1)
    expect(v[0]!.boundId).toBe('group:sector:tech')
    expect(v[0]!.actual).toBeCloseTo(0.65, 9)
  })

  it('quedarse por debajo de un suelo también es una violación', () => {
    const v = violations(compilado, [0.2, 0.15, 0.63, 0.02])
    expect(v.map((x) => x.boundId)).toContain('asset:eur')
  })

  it('el margen de coma flotante no inventa violaciones en el borde', () => {
    // 0,2 + 0,2 = 0,4000000000000001 en coma flotante.
    expect(violations(compilado, [0.2, 0.2, 0.5, 0.1])).toEqual([])
  })

  it('un peso que falta cuenta como cero, no rompe', () => {
    expect(() => violations(compilado, [0.2])).not.toThrow()
  })
})

describe('determinismo', () => {
  it('las mismas restricciones producen exactamente lo mismo', () => {
    const c: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'sector', key: 'tech', max: 0.4 },
      { kind: 'lockedPosition', instrumentId: 'aapl' },
      { kind: 'turnover', max: 0.15 },
    ]
    expect(compilar(c)).toEqual(compilar(c))
  })

  it('sin restricciones no rompe y no inventa límites', () => {
    const r = compilar([])
    expect(r.bounds).toEqual([])
    expect(r.issues).toEqual([])
  })
})
