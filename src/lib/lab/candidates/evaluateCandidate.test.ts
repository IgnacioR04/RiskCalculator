/**
 * Pruebas de la evaluación de candidatas (LAB-609).
 *
 * El criterio de aceptación: **la actual y las candidatas usan los mismos
 * supuestos**. Si se midieran distinto, cualquier diferencia entre ellas sería
 * inatribuible, y el resultado saldría plausible igualmente.
 */
import { describe, expect, it } from 'vitest'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import {
  EVALUATION_VERSION,
  SHARED_ASSUMPTIONS,
  evaluateCandidates,
  sortBy,
  type EvaluableCandidate,
} from './evaluateCandidate'

const activo = (id: string): CompilerInstrument => ({
  id,
  symbol: id.toUpperCase(),
  dimensions: {},
  currentWeight: 0,
})

const UNIVERSO = [activo('a'), activo('b'), activo('c')]
const COV = [
  [0.04, 0.01, 0.0],
  [0.01, 0.09, 0.0],
  [0.0, 0.0, 0.0025],
]

const ACTUAL = [0.6, 0.3, 0.1]

function evaluar(
  candidatas: EvaluableCandidate[],
  opciones: { constraints?: PortfolioConstraint[]; costs?: Parameters<typeof evaluateCandidates>[1]['costs'] } = {},
) {
  return evaluateCandidates(candidatas, {
    compiled: compileConstraints(opciones.constraints ?? [], UNIVERSO),
    covariance: COV,
    currentWeights: ACTUAL,
    totalValue: 10_000,
    ...(opciones.costs === undefined ? {} : { costs: opciones.costs }),
  })
}

const IGUALES: EvaluableCandidate = {
  method: 'equalWeight',
  label: 'A partes iguales',
  weights: [1 / 3, 1 / 3, 1 / 3],
}

describe('la actual se mide como una candidata más', () => {
  it('si no viene en la lista, se añade sola', () => {
    const r = evaluar([IGUALES])
    expect(r.metrics.map((m) => m.method)).toContain('current')
    expect(r.metrics[0]!.method).toBe('current')
  })

  it('si viene, no se duplica', () => {
    const r = evaluar([
      { method: 'current', label: 'La mía', weights: ACTUAL },
      IGUALES,
    ])
    expect(r.metrics.filter((m) => m.method === 'current')).toHaveLength(1)
  })

  it('la actual comparada consigo misma no tiene rotación ni coste', () => {
    const r = evaluar([IGUALES])
    const actual = r.metrics.find((m) => m.method === 'current')!
    expect(actual.turnover).toBeCloseTo(0, 12)
    expect(actual.cost).toBeCloseTo(0, 12)
  })

  it('los supuestos son comunes, y lo dicen', () => {
    const r = evaluar([IGUALES])
    expect(r.sharedAssumptions).toEqual([...SHARED_ASSUMPTIONS])
    expect(r.sharedAssumptions[0]).toMatch(/mismo código/)
  })

  it('declara que no estima rentabilidad de ninguna', () => {
    expect(evaluar([IGUALES]).sharedAssumptions.some((a) => /no se estima rentabilidad/i.test(a))).toBe(
      true,
    )
  })
})

describe('las métricas miden lo que dicen', () => {
  it('una cartera concentrada tiene más HHI que una repartida', () => {
    const r = evaluar([IGUALES])
    const actual = r.metrics.find((m) => m.method === 'current')!
    const iguales = r.metrics.find((m) => m.method === 'equalWeight')!
    expect(actual.hhi).toBeGreaterThan(iguales.hhi)
  })

  it('el número efectivo de posiciones es la inversa del HHI', () => {
    const r = evaluar([IGUALES])
    const iguales = r.metrics.find((m) => m.method === 'equalWeight')!
    // Tres posiciones a partes iguales son tres posiciones efectivas.
    expect(iguales.effectivePositions).toBeCloseTo(3, 6)
  })

  it('el peso máximo es el de la mayor posición', () => {
    const actual = evaluar([IGUALES]).metrics.find((m) => m.method === 'current')!
    expect(actual.maxWeight).toBeCloseTo(0.6, 9)
  })

  it('la volatilidad NO se vuelve a anualizar: la matriz ya viene anualizada', () => {
    // Doble anualización multiplicaría por √252 ≈ 15,9 y daría un 237 % de
    // volatilidad anual: absurdo, pero casi creíble si nadie mira el orden de
    // magnitud. Ocurrió, y esta prueba existe para que no vuelva a ocurrir.
    const iguales = evaluar([IGUALES]).metrics.find((m) => m.method === 'equalWeight')!
    const varianzaEsperada =
      (1 / 3) ** 2 * (0.04 + 0.09 + 0.0025) + 2 * (1 / 3) ** 2 * 0.01
    expect(iguales.volatility).toBeCloseTo(Math.sqrt(varianzaEsperada), 9)
    // Y con estos números, una cifra creíble: por debajo del 100 %.
    expect(iguales.volatility).toBeLessThan(1)
  })

  it('la concentración del riesgo no es la del dinero', () => {
    // A partes iguales el HHI es 1/3, pero el riesgo no se reparte igual:
    // B es mucho más volátil y aporta más.
    const iguales = evaluar([IGUALES]).metrics.find((m) => m.method === 'equalWeight')!
    expect(iguales.hhi).toBeCloseTo(1 / 3, 6)
    expect(iguales.riskConcentration).toBeGreaterThan(iguales.hhi)
  })

  it('la rotación mide cuánto hay que mover para llegar', () => {
    const iguales = evaluar([IGUALES]).metrics.find((m) => m.method === 'equalWeight')!
    // De [0,6 · 0,3 · 0,1] a [1/3 · 1/3 · 1/3]: mitad de la suma de diferencias.
    expect(iguales.turnover).toBeCloseTo((Math.abs(0.6 - 1 / 3) + Math.abs(0.3 - 1 / 3) + Math.abs(0.1 - 1 / 3)) / 2, 9)
  })
})

describe('los costes desconocidos no se convierten en cero', () => {
  it('una candidata que exige vender sin precio de compra deja el coste en «no se sabe»', () => {
    const r = evaluar([IGUALES], { costs: { proportional: 0.001 } })
    const iguales = r.metrics.find((m) => m.method === 'equalWeight')!
    // Llegar a partes iguales exige vender A, y no se conoce su plusvalía.
    expect(iguales.cost).toBeNull()
    expect(iguales.costUnknown.length).toBeGreaterThan(0)
  })

  it('una candidata que no exige vender sí tiene coste calculable', () => {
    const soloCompras: EvaluableCandidate = {
      method: 'contributionsOnly',
      label: 'Aportando',
      weights: ACTUAL,
    }
    const r = evaluar([soloCompras], { costs: { proportional: 0.001 } })
    expect(r.metrics.find((m) => m.method === 'contributionsOnly')!.cost).toBeCloseTo(0, 9)
  })
})

describe('los incumplimientos se declaran, no se esconden', () => {
  it('una candidata que rompe un límite lo lleva escrito', () => {
    const r = evaluar([IGUALES], {
      constraints: [{ kind: 'assetWeight', instrumentId: 'a', max: 0.2 }],
    })
    const iguales = r.metrics.find((m) => m.method === 'equalWeight')!
    expect(iguales.violations.length).toBeGreaterThan(0)
    expect(iguales.breaksHardConstraints).toBe(true)
  })

  it('la cartera actual también se comprueba, no se le perdona nada', () => {
    const r = evaluar([IGUALES], {
      constraints: [{ kind: 'assetWeight', instrumentId: 'a', max: 0.2 }],
    })
    // La actual tiene un 60 % en A: incumple igual, y se dice.
    expect(r.metrics.find((m) => m.method === 'current')!.breaksHardConstraints).toBe(true)
  })

  it('sin restricciones nadie incumple nada', () => {
    for (const m of evaluar([IGUALES]).metrics) {
      expect(m.violations).toEqual([])
      expect(m.breaksHardConstraints).toBe(false)
    }
  })
})

describe('ordenar sin declarar una ganadora', () => {
  it('ordena por la métrica pedida', () => {
    const r = evaluar([IGUALES])
    const porVolatilidad = sortBy(r.metrics, 'volatility')
    expect(porVolatilidad[0]!.volatility).toBeLessThanOrEqual(porVolatilidad[1]!.volatility)
  })

  it('puede ordenarse al revés', () => {
    const r = evaluar([IGUALES])
    const desc = sortBy(r.metrics, 'hhi', 'desc')
    expect(desc[0]!.hhi).toBeGreaterThanOrEqual(desc[1]!.hhi)
  })

  it('el empate se rompe por etiqueta, no por azar', () => {
    const gemela: EvaluableCandidate = { ...IGUALES, label: 'Otra igual' }
    const r = evaluar([IGUALES, gemela])
    const orden = sortBy(r.metrics, 'volatility').map((m) => m.label)
    expect(orden).toEqual([...orden])
    expect(sortBy(r.metrics, 'volatility').map((m) => m.label)).toEqual(orden)
  })

  it('no existe ninguna función que elija la mejor', async () => {
    // Elegir es del usuario. Una aplicación que preselecciona está
    // recomendando aunque diga que no.
    const modulo = await import('./evaluateCandidate')
    expect(Object.keys(modulo)).not.toContain('bestCandidate')
  })
})

describe('procedencia y determinismo', () => {
  it('va versionada', () => {
    expect(evaluar([IGUALES]).version).toBe(EVALUATION_VERSION)
  })

  it('los mismos datos dan exactamente el mismo resultado', () => {
    expect(evaluar([IGUALES])).toEqual(evaluar([IGUALES]))
  })

  it('sin candidatas, solo se evalúa la actual', () => {
    const r = evaluar([])
    expect(r.metrics).toHaveLength(1)
    expect(r.metrics[0]!.method).toBe('current')
  })
})
