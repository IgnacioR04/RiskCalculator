/**
 * Pruebas de compatibilidad sector-cartera (LAB-712).
 *
 * Es lo único que la Fase 7 publica, porque es lo único que no exige predecir
 * nada: describe la cartera de hoy.
 */
import { describe, expect, it } from 'vitest'
import {
  COMPATIBILITY_VERSION,
  SIMILARITY_THRESHOLD,
  TEST_WEIGHT,
  assessCompatibility,
  type SectorCandidate,
} from './compatibility'

const candidato = (cambios: Partial<SectorCandidate> = {}): SectorCandidate => ({
  sector: 'energia',
  symbol: 'ENER',
  volatility: 0.2,
  correlation: 0.2,
  observations: 200,
  currentWeight: 0,
  ...cambios,
})

const evaluar = (candidates: SectorCandidate[], minObservations = 30) =>
  assessCompatibility({ portfolioVolatility: 0.2, candidates, minObservations })

describe('distingue lo que aporta de lo que repite', () => {
  it('un sector poco correlacionado aporta algo distinto', () => {
    const r = evaluar([candidato({ correlation: 0.1 })])
    expect(r.sectors[0]!.label).toBe('aporta_algo_distinto')
    expect(r.sectors[0]!.volatilityChange).toBeLessThan(0)
  })

  it('un sector que se mueve casi igual es más de lo mismo', () => {
    const r = evaluar([candidato({ correlation: 0.95 })])
    expect(r.sectors[0]!.label).toBe('mas_de_lo_mismo')
    expect(r.sectors[0]!.explanation).toMatch(/más de lo mismo/)
  })

  it('el umbral de parecido está declarado como dato', () => {
    expect(SIMILARITY_THRESHOLD).toBeGreaterThan(0.5)
    expect(SIMILARITY_THRESHOLD).toBeLessThan(1)
  })

  it('un sector que ya se tiene de sobra se marca aunque diversifique', () => {
    // Tenerlo ya manda sobre que además reparta: es lo que hay que mirar
    // primero.
    const r = evaluar([candidato({ correlation: 0.1, currentWeight: 0.4 })])
    expect(r.sectors[0]!.label).toBe('ya_lo_tienes')
    expect(r.sectors[0]!.explanation).toMatch(/concentra en vez de repartir/)
  })

  it('un sector descorrelacionado pero muy volátil sube la oscilación, y se dice', () => {
    const r = evaluar([candidato({ correlation: 0, volatility: 1.5 })])
    expect(r.sectors[0]!.label).toBe('aporta_algo_distinto')
    expect(r.sectors[0]!.volatilityChange).toBeGreaterThan(0)
    expect(r.sectors[0]!.explanation).toMatch(/habría subido su oscilación/)
  })
})

describe('sin muestra no se dice nada', () => {
  it('con pocas observaciones se declara sin datos', () => {
    const r = evaluar([candidato({ observations: 10 })])
    expect(r.sectors[0]!.label).toBe('sin_datos')
    expect(r.sectors[0]!.volatilityChange).toBeNull()
    expect(r.sectors[0]!.correlation).toBeNull()
  })

  it('se dice cuántas observaciones harían falta y cuántas hay', () => {
    const r = evaluar([candidato({ observations: 10 })], 30)
    expect(r.sectors[0]!.explanation).toMatch(/harían falta 30 observaciones y hay 10/)
  })

  it('una correlación no finita se trata como falta de datos', () => {
    const r = evaluar([candidato({ correlation: Number.NaN })])
    expect(r.sectors[0]!.label).toBe('sin_datos')
  })
})

describe('se agrupa por categoría, no se ordena por bondad', () => {
  it('nunca encabeza la lista algo etiquetado «ya lo tienes»', () => {
    // Ordenar por «cuánto reduce la oscilación» ponía arriba un sector del que
    // ya se tiene de sobra, y la primera fila de una tabla se lee como la mejor
    // opción por mucho que la etiqueta diga lo contrario.
    const r = evaluar([
      candidato({ sector: 'saturado', correlation: -0.5, currentWeight: 0.4 }),
      candidato({ sector: 'nuevo', correlation: 0.4 }),
    ])
    expect(r.sectors[0]!.label).toBe('aporta_algo_distinto')
    expect(r.sectors[0]!.sector).toBe('nuevo')
  })

  it('dentro de una categoría sí manda el efecto', () => {
    const r = evaluar([
      candidato({ sector: 'poco', correlation: 0.5 }),
      candidato({ sector: 'mucho', correlation: -0.3 }),
    ])
    expect(r.sectors.map((s) => s.sector)).toEqual(['mucho', 'poco'])
  })

  it('lo que no se puede calcular va al final: no es bueno ni malo, es desconocido', () => {
    const r = evaluar([
      candidato({ sector: 'sinDatos', observations: 5 }),
      candidato({ sector: 'conDatos', correlation: 0.1 }),
    ])
    expect(r.sectors.at(-1)!.sector).toBe('sinDatos')
  })

  it('el empate se rompe por nombre, no por azar', () => {
    const r = evaluar([
      candidato({ sector: 'zeta', correlation: 0.3 }),
      candidato({ sector: 'alfa', correlation: 0.3 }),
    ])
    expect(r.sectors.map((s) => s.sector)).toEqual(['alfa', 'zeta'])
  })
})

describe('honestidad sobre lo que esto es', () => {
  it('declara que no dice qué comprar', () => {
    const r = evaluar([candidato()])
    expect(r.disclaimer).toMatch(/no qué comprar/)
  })

  it('avisa de que la correlación cambia justo cuando más falta hace', () => {
    const r = evaluar([candidato()])
    expect(r.limitations.some((l) => /en un desplome, casi todo correlaciona más/.test(l))).toBe(
      true,
    )
  })

  it('declara que no mira rentabilidad esperada de nada', () => {
    const r = evaluar([candidato()])
    expect(r.limitations.some((l) => /no se estima ninguna/.test(l))).toBe(true)
  })

  it('el peso de prueba se declara y viaja en el resultado', () => {
    expect(evaluar([candidato()]).testWeight).toBe(TEST_WEIGHT)
  })

  it('va versionado', () => {
    expect(evaluar([candidato()]).version).toBe(COMPATIBILITY_VERSION)
  })
})

describe('casos límite', () => {
  it('sin candidatos no rompe', () => {
    expect(evaluar([]).sectors).toEqual([])
  })

  it('los mismos datos dan exactamente el mismo resultado', () => {
    const c = [candidato({ sector: 'a' }), candidato({ sector: 'b', correlation: 0.9 })]
    expect(evaluar(c)).toEqual(evaluar(c))
  })
})
