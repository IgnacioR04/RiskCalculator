/**
 * Pruebas de los hallazgos del resumen de estabilidad (LAB-312).
 *
 * La ficha pide tres casos: cartera concentrada, diversificada y datos
 * parciales. El criterio de aceptación es el **máximo de hallazgos** y que la
 * **evidencia esté accesible**: las dos cosas se comprueban aquí, con objetos
 * fijos y sin montar nada.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_FINDINGS,
  allStabilityFindings,
  hiddenFindingsCount,
  stabilityFindings,
  type StabilityFacts,
} from './findings'

/** Cartera sana: repartida, cubierta entera y recuperada. */
const DIVERSIFICADA: StabilityFacts = {
  volatility: 0.14,
  maxDrawdown: 0.18,
  recovered: true,
  daysUnderwater: null,
  diversification: {
    diversificationRatio: 1.42,
    volatilityReduction: 0.3,
    effectiveBets: 4.2,
    averageCorrelation: 0.31,
    weightedAverageVolatility: 0.2,
    portfolioVolatility: 0.14,
  },
  coverage: 1,
  commonDays: 250,
  topWeight: 0.22,
}

const codigos = (facts: StabilityFacts) => stabilityFindings(facts).map((f) => f.code)

describe('cartera diversificada', () => {
  it('no dispara ningún aviso: no hay nada que arreglar', () => {
    expect(stabilityFindings(DIVERSIFICADA).every((f) => f.level === 'info')).toBe(true)
  })

  it('sí cuenta lo que pasó, aunque no haya avisos', () => {
    expect(codigos(DIVERSIFICADA)).toContain('observed_drawdown')
    expect(codigos(DIVERSIFICADA)).toContain('effective_bets')
  })
})

describe('cartera concentrada', () => {
  const concentrada: StabilityFacts = {
    ...DIVERSIFICADA,
    topWeight: 0.62,
    diversification: {
      ...DIVERSIFICADA.diversification!,
      diversificationRatio: 1.03,
      effectiveBets: 1.2,
    },
  }

  it('avisa de que un solo activo manda', () => {
    expect(codigos(concentrada)).toContain('concentrated')
  })

  it('avisa de que repartir no está reparando', () => {
    expect(codigos(concentrada)).toContain('poor_diversification')
  })

  it('los avisos van antes que lo informativo', () => {
    const niveles = stabilityFindings(concentrada).map((f) => f.level)
    const ultimoAviso = niveles.lastIndexOf('warning')
    const primerInfo = niveles.indexOf('info')
    if (primerInfo !== -1) expect(ultimoAviso).toBeLessThan(primerInfo)
  })

  it('justo en el umbral todavía no se llama concentrada', () => {
    expect(codigos({ ...concentrada, topWeight: 0.4 })).not.toContain('concentrated')
    expect(codigos({ ...concentrada, topWeight: 0.41 })).toContain('concentrated')
  })
})

describe('datos parciales', () => {
  const parcial: StabilityFacts = { ...DIVERSIFICADA, coverage: 0.62 }

  it('lo dice, y lo dice el primero', () => {
    // Si el análisis cubre media cartera, todo lo demás describe media
    // cartera: avisar de otra cosa antes sería enseñar una conclusión sobre
    // datos que no sabemos si valen.
    expect(codigos(parcial)[0]).toBe('partial_coverage')
  })

  it('con cobertura completa no aparece', () => {
    expect(codigos({ ...parcial, coverage: 1 })).not.toContain('partial_coverage')
  })

  it('justo en el umbral no se marca como parcial', () => {
    expect(codigos({ ...parcial, coverage: 0.9 })).not.toContain('partial_coverage')
    expect(codigos({ ...parcial, coverage: 0.89 })).toContain('partial_coverage')
  })
})

describe('ACEPTACIÓN · máximo de hallazgos', () => {
  /** Todo mal a la vez: cobertura parcial, concentrada, hundida y sin repartir. */
  const todoMal: StabilityFacts = {
    ...DIVERSIFICADA,
    coverage: 0.5,
    topWeight: 0.7,
    recovered: false,
    daysUnderwater: 400,
    diversification: {
      ...DIVERSIFICADA.diversification!,
      diversificationRatio: 1.01,
      effectiveBets: 1.1,
    },
  }

  it('nunca se enseñan más de los que caben', () => {
    expect(allStabilityFindings(todoMal).length).toBeGreaterThan(MAX_FINDINGS)
    expect(stabilityFindings(todoMal)).toHaveLength(MAX_FINDINGS)
  })

  it('los que no caben se cuentan, no desaparecen sin más', () => {
    expect(hiddenFindingsCount(todoMal)).toBe(
      allStabilityFindings(todoMal).length - MAX_FINDINGS,
    )
    expect(hiddenFindingsCount(todoMal)).toBeGreaterThan(0)
  })

  it('cuando caben todos no se oculta ninguno', () => {
    expect(hiddenFindingsCount(DIVERSIFICADA)).toBe(0)
  })

  it('lo que se recorta es lo informativo, nunca un aviso', () => {
    const mostrados = stabilityFindings(todoMal)
    const avisosTotales = allStabilityFindings(todoMal).filter((f) => f.level === 'warning')
    for (const aviso of avisosTotales) {
      expect(mostrados.map((f) => f.code)).toContain(aviso.code)
    }
  })
})

describe('ACEPTACIÓN · la evidencia está accesible', () => {
  it('cada hallazgo dice de dónde sale su número', () => {
    for (const facts of [DIVERSIFICADA, { ...DIVERSIFICADA, coverage: 0.5, topWeight: 0.8 }]) {
      for (const hallazgo of allStabilityFindings(facts)) {
        expect(hallazgo.evidence.length, hallazgo.code).toBeGreaterThan(15)
      }
    }
  })

  it('los códigos son estables y no se repiten', () => {
    const cs = allStabilityFindings(DIVERSIFICADA).map((f) => f.code)
    expect(new Set(cs).size).toBe(cs.length)
  })
})

describe('sin datos no se inventa nada', () => {
  const vacia: StabilityFacts = {
    volatility: null,
    maxDrawdown: null,
    recovered: null,
    daysUnderwater: null,
    diversification: null,
    coverage: 1,
    commonDays: 0,
    topWeight: null,
  }

  it('no produce ningún hallazgo en vez de uno vacío', () => {
    expect(allStabilityFindings(vacia)).toEqual([])
  })

  it('una caída sin volatilidad tampoco se cuenta a medias', () => {
    expect(allStabilityFindings({ ...vacia, maxDrawdown: 0.2 })).toEqual([])
  })
})
