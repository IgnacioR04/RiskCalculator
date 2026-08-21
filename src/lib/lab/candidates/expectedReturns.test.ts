/**
 * LAB-1101 / LAB-1105. Lo que se comprueba es lo que hace defendible el modelo:
 * que **encoge**, que **recorta**, que **no rellena huecos con ceros** y —lo
 * añadido en el endurecimiento— que **se niega a estimar** cuando no debe.
 *
 * Los tres defectos de la primera versión que estas pruebas fijan: usar el tipo
 * de producto como clase económica, darle al efectivo un 2 % fijo sin relación
 * con la tasa sin riesgo del Sharpe, y estimar sin suelo de cobertura.
 */
import { describe, expect, it } from 'vitest'
import type { EconomicClass, EconomicClassification } from './economicClass'
import {
  COBERTURA_MINIMA,
  expectedReturns,
  PESO_HISTORICO_POR_DEFECTO,
  PRIOR_SET_V1,
  RECORTE_POR_DEFECTO,
} from './expectedReturns'

const clase = (c: EconomicClass): EconomicClassification => ({
  economicClass: c,
  source: 'declared',
  detail: '',
})

const desconocida: EconomicClassification = {
  economicClass: null,
  source: 'unknown',
  detail: 'Es un envoltorio.',
}

const uniforme = (n: number) => new Array<number>(n).fill(1 / n)

describe('expectedReturns · estimación', () => {
  it('encoge la media histórica hacia el prior de su clase', () => {
    const r = expectedReturns({
      classifications: [clase('equity')],
      historicalAnnual: [0.5],
      weights: [1],
      cashRate: 0.02,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const mezcla =
      PESO_HISTORICO_POR_DEFECTO * 0.5 +
      (1 - PESO_HISTORICO_POR_DEFECTO) * PRIOR_SET_V1.annual.equity
    expect(r.mu[0]!).toBe(Math.min(mezcla, RECORTE_POR_DEFECTO.max))
    // Un activo que subió un 50 % no tiene una esperanza del 50 %.
    expect(r.mu[0]!).toBeLessThan(0.5)
  })

  it('un activo sin historia se queda con su prior, no con un cero', () => {
    // Un cero diría «no rinde nada», que es una afirmación. La ausencia de
    // historia no afirma nada sobre el activo, solo sobre lo que sabemos.
    const r = expectedReturns({
      classifications: [clase('crypto')],
      historicalAnnual: [null],
      weights: [1],
      cashRate: 0.02,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mu[0]!).toBe(PRIOR_SET_V1.annual.crypto)
    expect(r.withoutHistory).toBe(1)
    expect(r.historyCoverage).toBe(0)
  })

  it('recorta por arriba y por abajo', () => {
    const r = expectedReturns({
      classifications: [clase('crypto'), clase('crypto')],
      historicalAnnual: [10, -10],
      weights: uniforme(2),
      cashRate: 0.02,
      historicalWeight: 1,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mu[0]!).toBe(RECORTE_POR_DEFECTO.max)
    expect(r.mu[1]!).toBe(RECORTE_POR_DEFECTO.min)
  })
})

describe('expectedReturns · el efectivo sale de la tasa configurada', () => {
  it('no lleva prior propio ni se mezcla con su pasado', () => {
    // Su rentabilidad no se estima, se conoce. Y tiene que ser la misma tasa
    // con la que se calcula el Sharpe: dos números distintos hablando de lo
    // mismo en la misma pantalla es peor que un número aproximado.
    const r = expectedReturns({
      classifications: [clase('cash')],
      historicalAnnual: [0.35],
      weights: [1],
      cashRate: 0.031,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mu[0]!).toBe(0.031)
  })

  it('sigue la tasa cuando cambia', () => {
    const base = {
      classifications: [clase('cash')],
      historicalAnnual: [null],
      weights: [1],
    }
    const a = expectedReturns({ ...base, cashRate: 0.01 })
    const b = expectedReturns({ ...base, cashRate: 0.04 })
    expect(a.ok && a.mu[0]).toBe(0.01)
    expect(b.ok && b.mu[0]).toBe(0.04)
  })

  it('rechaza una tasa imposible en vez de propagarla', () => {
    const r = expectedReturns({
      classifications: [clase('cash')],
      historicalAnnual: [null],
      weights: [1],
      cashRate: 3,
    })
    expect(r).toEqual({ ok: false, reason: 'invalid_cash_rate' })
  })
})

describe('expectedReturns · cobertura', () => {
  it('no estima si una parte material del universo no está clasificada', () => {
    // Aquí está el defecto que esto cierra: la primera versión devolvía un
    // vector completo con la mitad del universo sin clasificar, y la
    // optimización seguía adelante como si nada.
    const r = expectedReturns({
      classifications: [clase('equity'), desconocida],
      historicalAnnual: [0.06, 0.06],
      weights: [0.5, 0.5],
      cashRate: 0.02,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('insufficient_classification')
    expect(r.classifiedCoverage).toBeCloseTo(0.5, 9)
  })

  it('la cobertura se mide por peso, no por número de posiciones', () => {
    // Diez residuales sin clasificar importan menos que una que sea el 40 %.
    // Con el 95 % clasificado y una posición minúscula sin clasificar, se
    // calcula; al revés, no.
    const conPesoPequeno = expectedReturns({
      classifications: [clase('equity'), desconocida],
      historicalAnnual: [0.06, 0.06],
      weights: [0.95, 0.05],
      cashRate: 0.02,
    })
    expect(conPesoPequeno.ok).toBe(true)

    const conPesoGrande = expectedReturns({
      classifications: [clase('equity'), desconocida],
      historicalAnnual: [0.06, 0.06],
      weights: [0.6, 0.4],
      cashRate: 0.02,
    })
    expect(conPesoGrande.ok).toBe(false)
  })

  it('el suelo de cobertura es configurable y se respeta', () => {
    const entrada = {
      classifications: [clase('equity'), desconocida],
      historicalAnnual: [0.06, 0.06],
      weights: [0.8, 0.2],
      cashRate: 0.02,
    }
    expect(expectedReturns({ ...entrada, minimumCoverage: 0.75 }).ok).toBe(true)
    expect(expectedReturns({ ...entrada, minimumCoverage: COBERTURA_MINIMA }).ok).toBe(false)
  })
})

describe('expectedReturns · gobierno', () => {
  it('publica versión de modelo, versión de priors y madurez', () => {
    const r = expectedReturns({
      classifications: [clase('equity')],
      historicalAnnual: [0.05],
      weights: [1],
      cashRate: 0.02,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.modelVersion).toBe('expected-returns-v2')
    expect(r.priorVersion).toBe(PRIOR_SET_V1.version)
    // Mientras no estén integradas la sensibilidad y el fuera de muestra, el
    // máximo Sharpe no puede decidir por sí solo nada.
    expect(r.maturity).toBe('experimental')
  })

  it('el conjunto de priors trae metodología, fecha de vigencia y fuentes', () => {
    expect(PRIOR_SET_V1.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(PRIOR_SET_V1.methodology.length).toBeGreaterThan(100)
    expect(PRIOR_SET_V1.sources.length).toBeGreaterThan(0)
    // El efectivo no tiene prior: sale de la tasa.
    expect('cash' in PRIOR_SET_V1.annual).toBe(false)
  })

  it('declara la fase experimental y que la clase es económica, no de producto', () => {
    const r = expectedReturns({
      classifications: [clase('equity')],
      historicalAnnual: [0.05],
      weights: [1],
      cashRate: 0.02,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const etiquetas = r.assumptions.map((a) => a.label).join(' · ')
    expect(etiquetas).toMatch(/experimental/i)
    expect(etiquetas).toMatch(/económica, no el tipo de producto/)
  })

  it('rechaza entradas incoherentes en vez de completarlas', () => {
    expect(expectedReturns({ classifications: [], historicalAnnual: [], weights: [], cashRate: 0.02 })).toEqual({
      ok: false,
      reason: 'empty_universe',
    })
    expect(
      expectedReturns({
        classifications: [clase('equity')],
        historicalAnnual: [],
        weights: [1],
        cashRate: 0.02,
      }),
    ).toEqual({ ok: false, reason: 'length_mismatch' })
    expect(
      expectedReturns({
        classifications: [clase('equity')],
        historicalAnnual: [0.05],
        weights: [1],
        cashRate: 0.02,
        historicalWeight: 2,
      }),
    ).toEqual({ ok: false, reason: 'invalid_weight' })
  })

  it('es reproducible', () => {
    const entrada = {
      classifications: [clase('equity'), clase('crypto')],
      historicalAnnual: [0.05, 0.3],
      weights: uniforme(2),
      cashRate: 0.02,
    }
    expect(expectedReturns(entrada)).toEqual(expectedReturns(entrada))
  })
})
