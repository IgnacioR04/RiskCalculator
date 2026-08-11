/**
 * Pruebas de la necesidad de rentabilidad (LAB-215).
 *
 * Los nombres describen lo que el usuario vería, así que la salida se lee como
 * un informe de si la herramienta dice la verdad en cada caso.
 */
import { describe, expect, it } from 'vitest'
import type { ContributionPlan, InvestmentGoal } from '../domain/investmentPolicy'
import {
  IMPLAUSIBLE_RETURN,
  RETURN_BY_BAND,
  alternativesFor,
  assessReturnNeed,
  bandForReturn,
  futureValue,
  monthlyFrom,
  monthsBetween,
  solveRequiredReturn,
  verdictFor,
} from './returnNeed'

const HOY = '2026-01-01'

function objetivo(cambio: Partial<InvestmentGoal> = {}): InvestmentGoal {
  return {
    id: 'g1',
    name: 'Objetivo',
    priority: 'esencial',
    currency: 'EUR',
    targetAmount: '100000',
    targetDate: '2036-01-01',
    dateFlexible: true,
    amountFlexible: true,
    ...cambio,
  }
}

const APORTA_200: ContributionPlan = { amount: '200', currency: 'EUR', frequency: 'mensual' }

describe('la aritmética es correcta', () => {
  it('sin rentabilidad, el futuro es lo que metes', () => {
    expect(futureValue(1000, 100, 12, 0)).toBeCloseTo(1000 + 1200, 6)
  })

  it('un 10 % anual sobre capital sin aportaciones capitaliza bien', () => {
    expect(futureValue(1000, 0, 12, 0.1)).toBeCloseTo(1100, 6)
  })

  it('lo que resuelve el solver devuelve el objetivo al recomponerlo', () => {
    const r = solveRequiredReturn(20000, 200, 120, 100000)
    expect(r).not.toBeNull()
    expect(futureValue(20000, 200, 120, r as number)).toBeCloseTo(100000, 2)
  })

  it('las frecuencias se pasan a mensual, y «puntual» no compromete nada', () => {
    expect(monthlyFrom({ ...APORTA_200, frequency: 'mensual' })).toBe(200)
    expect(monthlyFrom({ ...APORTA_200, frequency: 'trimestral' })).toBeCloseTo(66.67, 1)
    expect(monthlyFrom({ ...APORTA_200, frequency: 'anual' })).toBeCloseTo(16.67, 1)
    expect(monthlyFrom({ ...APORTA_200, frequency: 'puntual' })).toBe(0)
    expect(monthlyFrom(undefined)).toBe(0)
  })

  it('cuenta los meses que hay de verdad', () => {
    expect(monthsBetween('2026-01-01', '2036-01-01')).toBe(120)
    expect(monthsBetween('2026-01-15', '2026-02-01')).toBe(0)
  })
})

describe('el caso del ejemplo: 20.000 €, 200 €/mes, 100.000 € en 10 años', () => {
  const resultado = assessReturnNeed({
    currentCapital: 20000,
    goal: objetivo(),
    contributionPlan: APORTA_200,
    today: HOY,
  })

  it('dice que hace falta más de un 10 % anual', () => {
    expect(resultado.diagnosis).toBe('solved')
    expect(resultado.requiredReturn).toBeGreaterThan(0.1)
    expect(resultado.requiredReturn).toBeLessThan(0.15)
  })

  it('eso no encaja en ninguna banda: ni la más alta llega', () => {
    expect(resultado.requiredBand).toBeUndefined()
  })

  it('con una tolerancia baja el veredicto es incompatible, no «ya veremos»', () => {
    expect(verdictFor(resultado, 2)).toBe('sin_datos')
  })
})

describe('los cuatro veredictos', () => {
  const conPlazo = (anos: number, meta: string, capital: number) =>
    assessReturnNeed({
      currentCapital: capital,
      goal: objetivo({ targetAmount: meta, targetDate: `${2026 + anos}-01-01` }),
      contributionPlan: APORTA_200,
      today: HOY,
    })

  it('holgado: pides poco para el tiempo que tienes', () => {
    const need = conPlazo(20, '60000', 20000)
    expect(verdictFor(need, 4)).toBe('holgado')
  })

  it('agresivo: pide una banda más de la que aceptas', () => {
    const need = { diagnosis: 'solved' as const, requiredBand: 4 as const, requiredReturn: 0.07, months: 120, monthlyContribution: 200, assumptionVersion: 1 }
    expect(verdictFor(need, 3)).toBe('agresivo')
  })

  it('incompatible: pide dos bandas más', () => {
    const need = { diagnosis: 'solved' as const, requiredBand: 5 as const, requiredReturn: 0.09, months: 120, monthlyContribution: 200, assumptionVersion: 1 }
    expect(verdictFor(need, 3)).toBe('incompatible')
  })

  it('imposible: haría falta más de lo que sostiene ninguna cartera', () => {
    const need = conPlazo(2, '500000', 1000)
    expect(need.diagnosis).toBe('implausible')
    expect(verdictFor(need, 5)).toBe('imposible')
  })
})

describe('los casos que no tienen sentido se dicen, no se calculan', () => {
  it('ya has llegado', () => {
    const need = assessReturnNeed({ currentCapital: 150000, goal: objetivo(), today: HOY })
    expect(need.diagnosis).toBe('already_reached')
    expect(verdictFor(need, 1)).toBe('holgado')
  })

  it('la fecha ya pasó', () => {
    const need = assessReturnNeed({
      currentCapital: 1000,
      goal: objetivo({ targetDate: '2020-01-01' }),
      today: HOY,
    })
    expect(need.diagnosis).toBe('no_time_left')
  })

  it('sin capital y sin aportar no hay nada que crezca', () => {
    const need = assessReturnNeed({ currentCapital: 0, goal: objetivo(), today: HOY })
    expect(need.diagnosis).toBe('nothing_to_grow')
    expect(need.requiredReturn).toBeUndefined()
  })

  it('nunca devuelve una cifra inventada cuando no se puede', () => {
    for (const need of [
      assessReturnNeed({ currentCapital: 0, goal: objetivo(), today: HOY }),
      assessReturnNeed({ currentCapital: 1000, goal: objetivo({ targetDate: '2020-01-01' }), today: HOY }),
    ]) {
      expect(need.requiredBand).toBeUndefined()
    }
  })
})

describe('qué números sí cuadrarían', () => {
  const entrada = {
    currentCapital: 20000,
    goal: objetivo(),
    contributionPlan: APORTA_200,
    today: HOY,
  }

  it('alargar el plazo: dice cuántos años harían falta', () => {
    const alt = alternativesFor(entrada, 3)
    expect(alt.monthsNeeded).not.toBeNull()
    expect(alt.monthsNeeded as number).toBeGreaterThan(120)
  })

  it('aportar más: la cifra recompone el objetivo exactamente', () => {
    const alt = alternativesFor(entrada, 3)
    expect(alt.monthlyNeeded).not.toBeNull()
    expect(futureValue(20000, alt.monthlyNeeded as number, 120, RETURN_BY_BAND[3])).toBeCloseTo(
      100000,
      2,
    )
  })

  it('ajustar el objetivo: dice a cuánto se llega de verdad', () => {
    const alt = alternativesFor(entrada, 3)
    expect(alt.reachableTarget).toBeGreaterThan(20000)
    expect(alt.reachableTarget).toBeLessThan(100000)
  })

  it('cuanto menos riesgo aceptas, más te cuesta llegar', () => {
    const conservador = alternativesFor(entrada, 1)
    const dinamico = alternativesFor(entrada, 5)
    expect(conservador.monthlyNeeded as number).toBeGreaterThan(dinamico.monthlyNeeded as number)
    expect(conservador.reachableTarget).toBeLessThan(dinamico.reachableTarget)
  })

  it('cuando por el plazo no se arregla, lo dice en vez de inventar una fecha', () => {
    // Sin capital y sin aportaciones: se quita la clave, no se pone a
    // `undefined`, que con `exactOptionalPropertyTypes` no es lo mismo.
    const { contributionPlan: _sinPlan, ...sinAportar } = entrada
    expect(alternativesFor({ ...sinAportar, currentCapital: 0 }, 1).monthsNeeded).toBeNull()
  })
})

describe('el supuesto está declarado y es coherente', () => {
  it('más banda, más rentabilidad esperada', () => {
    const valores = [1, 2, 3, 4, 5].map((b) => RETURN_BY_BAND[b as 1 | 2 | 3 | 4 | 5])
    expect([...valores].sort((a, b) => a - b)).toEqual(valores)
  })

  it('la banda es la más baja que llega a lo que hace falta', () => {
    expect(bandForReturn(0.005)).toBe(1)
    expect(bandForReturn(0.05)).toBe(3)
    expect(bandForReturn(0.08)).toBe(5)
    expect(bandForReturn(0.5)).toBeNull()
  })

  it('el techo de lo sostenible está por encima de la banda más alta', () => {
    expect(IMPLAUSIBLE_RETURN).toBeGreaterThan(RETURN_BY_BAND[5])
  })
})
