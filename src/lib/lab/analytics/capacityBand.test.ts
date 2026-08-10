/**
 * Pruebas de la derivación de capacidad (LAB-208).
 *
 * Los valores esperados salen de la tabla de umbrales declarada en el módulo,
 * calculados a mano: no son una foto de lo que el código devuelve hoy. Por eso
 * las fronteras se prueban una a una, que es donde un `<` cambiado por un `<=`
 * pasa desapercibido.
 */
import { describe, expect, it } from 'vitest'
import type { CapacityAssessment, RiskBand } from '../domain/investmentPolicy'
import { bindingCapacityFacts, capacityCaps, deriveCapacityBand } from './capacityBand'

/** Capacidad en la que todos los hechos están en su mejor caso: techo 5. */
const TODO_HOLGADO: CapacityAssessment = {
  horizonYears: 20,
  emergencyFundMonths: 12,
  incomeStability: 'estable',
  dependents: 0,
  shareOfNetWorth: 0.05,
}

function con(cambio: Partial<CapacityAssessment>): CapacityAssessment {
  return { ...TODO_HOLGADO, ...cambio }
}

/** Techo que impone un hecho aislado, dejando los demás sin limitar. */
function techoDe(cambio: Partial<CapacityAssessment>): RiskBand | null {
  return deriveCapacityBand(con(cambio))
}

describe('el mejor caso de cada hecho no limita', () => {
  it('con todo holgado la capacidad es la banda 5', () => {
    expect(deriveCapacityBand(TODO_HOLGADO)).toBe(5)
  })

  it('los cinco techos son 5', () => {
    expect(capacityCaps(TODO_HOLGADO).map((t) => t.cap)).toEqual([5, 5, 5, 5, 5])
  })
})

describe('horizonte', () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [4, 2],
    [5, 3],
    [7, 3],
    [8, 4],
    [14, 4],
    [15, 5],
    [40, 5],
  ])('%i años ponen techo en la banda %i', (anos, esperado) => {
    expect(techoDe({ horizonYears: anos })).toBe(esperado)
  })
})

describe('colchón de liquidez', () => {
  it.each([
    [0, 1],
    [0.5, 1],
    [1, 2],
    [2.9, 2],
    [3, 3],
    [5, 3],
    [6, 4],
    [11, 4],
    [12, 5],
    [36, 5],
  ])('%s meses ponen techo en la banda %i', (meses, esperado) => {
    expect(techoDe({ emergencyFundMonths: meses })).toBe(esperado)
  })
})

describe('estabilidad de ingresos', () => {
  it.each([
    ['estable', 5],
    ['variable', 3],
    ['incierta', 2],
  ] as const)('unos ingresos %s ponen techo en la banda %i', (estabilidad, esperado) => {
    expect(techoDe({ incomeStability: estabilidad })).toBe(esperado)
  })

  it('el peor caso no baja a 1: «inciertos» no significa «sin ingresos»', () => {
    expect(techoDe({ incomeStability: 'incierta' })).toBeGreaterThan(1)
  })
})

describe('personas a cargo', () => {
  it.each([
    [0, 5],
    [1, 4],
    [2, 4],
    [3, 3],
    [4, 3],
    [5, 2],
    [9, 2],
  ])('%i personas ponen techo en la banda %i', (personas, esperado) => {
    expect(techoDe({ dependents: personas })).toBe(esperado)
  })
})

describe('peso en el patrimonio', () => {
  it.each([
    [0, 5],
    [0.1, 5],
    [0.11, 4],
    [0.25, 4],
    [0.26, 3],
    [0.5, 3],
    [0.51, 2],
    [0.75, 2],
    [0.76, 1],
    [1, 1],
  ])('una fracción de %s pone techo en la banda %i', (fraccion, esperado) => {
    expect(techoDe({ shareOfNetWorth: fraccion })).toBe(esperado)
  })

  it('es el único hecho que puede llegar a 1 por sí solo, junto al horizonte', () => {
    expect(techoDe({ shareOfNetWorth: 0.9 })).toBe(1)
  })
})

describe('manda el techo más bajo, no la media', () => {
  it('un horizonte largo no compensa la falta de colchón', () => {
    const capacidad = con({ horizonYears: 30, emergencyFundMonths: 0 })
    // Media de [5, 1, 5, 5, 5] sería 4,2. El mínimo es 1, y es el que vale.
    expect(deriveCapacityBand(capacidad)).toBe(1)
  })

  it('con varios hechos medianos gana el peor de ellos', () => {
    // horizonte 10 → 4 · colchón 6 → 4 · estables → 5 · 1 persona → 4 ·
    // peso 0,2 → 4. Mínimo 4.
    const capacidad: CapacityAssessment = {
      horizonYears: 10,
      emergencyFundMonths: 6,
      incomeStability: 'estable',
      dependents: 1,
      shareOfNetWorth: 0.2,
    }
    expect(deriveCapacityBand(capacidad)).toBe(4)
  })

  it('señala todos los hechos que empatan en el mínimo, no solo el primero', () => {
    const capacidad: CapacityAssessment = {
      horizonYears: 10,
      emergencyFundMonths: 6,
      incomeStability: 'estable',
      dependents: 1,
      shareOfNetWorth: 0.2,
    }
    // Cuatro de los cinco empatan en 4; solo la estabilidad de ingresos (5) no
    // limita. Decirlos todos evita creer que basta con arreglar uno.
    expect(bindingCapacityFacts(capacidad)).toEqual([
      'horizonYears',
      'emergencyFundMonths',
      'dependents',
      'shareOfNetWorth',
    ])
  })

  it('cuando solo uno limita, solo se nombra ese', () => {
    expect(bindingCapacityFacts(con({ shareOfNetWorth: 0.9 }))).toEqual(['shareOfNetWorth'])
  })
})

describe('sin los cinco hechos no hay banda', () => {
  const hechos = [
    'horizonYears',
    'emergencyFundMonths',
    'incomeStability',
    'dependents',
    'shareOfNetWorth',
  ] as const

  it.each(hechos)('falta %s y el resultado es null, no una estimación', (hecho) => {
    const incompleta = { ...TODO_HOLGADO }
    delete (incompleta as Record<string, unknown>)[hecho]
    expect(deriveCapacityBand(incompleta)).toBeNull()
    expect(capacityCaps(incompleta)).toEqual([])
    expect(bindingCapacityFacts(incompleta)).toEqual([])
  })

  it('una capacidad vacía no vale la banda del medio', () => {
    expect(deriveCapacityBand({})).toBeNull()
  })

  it('con cuatro de cinco tampoco se adelanta un resultado', () => {
    const { shareOfNetWorth: _fuera, ...cuatro } = TODO_HOLGADO
    expect(deriveCapacityBand(cuatro)).toBeNull()
  })
})

describe('la banda ya guardada no se tiene en cuenta', () => {
  it('se recalcula desde los hechos, sin creerse lo que traiga', () => {
    // Una banda 5 pegada a unos hechos que solo dan 1 no la sostiene.
    const manipulada: CapacityAssessment = { ...con({ shareOfNetWorth: 0.9 }), band: 5 }
    expect(deriveCapacityBand(manipulada)).toBe(1)
  })
})
