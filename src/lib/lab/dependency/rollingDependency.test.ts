/**
 * Pruebas de dependencia por tiempo y en caídas (LAB-411).
 *
 * El criterio de aceptación: el resultado **declara la definición de downside**.
 * Las series son sintéticas y con cambio de régimen a propósito, que es donde se
 * ve si el motor detecta lo que dice detectar.
 */
import { describe, expect, it } from 'vitest'
import {
  DOWNSIDE_CONDITION,
  downsideDependency,
  rollingCorrelation,
} from './rollingDependency'
import type { ReturnSeries } from './dependencyMatrix'

function serie(id: string, valores: readonly number[]): ReturnSeries {
  return {
    id,
    label: id.toUpperCase(),
    returns: valores.map((value, i) => ({
      date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
      value,
    })),
  }
}

/** Pseudoaleatorio determinista: las pruebas no pueden depender de la suerte. */
function ruido(semilla: number) {
  let s = semilla
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648 - 0.5
  }
}

describe('rolling: la correlación se mueve, y se ve', () => {
  // 150 días descorrelacionados y después 150 días en que van a la par.
  const r1 = ruido(7)
  const r2 = ruido(99)
  const independientes = Array.from({ length: 150 }, () => r1())
  const otrosIndependientes = Array.from({ length: 150 }, () => r2())
  const juntos = Array.from({ length: 150 }, () => r1())

  const a = serie('a', [...independientes, ...juntos])
  const b = serie('b', [...otrosIndependientes, ...juntos])

  it('detecta el cambio de régimen: el máximo es muy superior al mínimo', () => {
    const r = rollingCorrelation(a, b, 60)
    expect(r.min).not.toBeNull()
    expect(r.max).toBeGreaterThan(0.9)
    expect(r.max! - r.min!).toBeGreaterThan(0.5)
  })

  it('la última ventana refleja el régimen actual, no la media histórica', () => {
    expect(rollingCorrelation(a, b, 60).latest).toBeGreaterThan(0.9)
  })

  it('cada punto declara cuántas observaciones tiene', () => {
    const r = rollingCorrelation(a, b, 90)
    expect(r.points.every((p) => p.observations === 90)).toBe(true)
  })

  it('solo se publican ventanas completas', () => {
    const r = rollingCorrelation(a, b, 60)
    // 300 días comunes menos la primera ventana incompleta.
    expect(r.points).toHaveLength(300 - 60 + 1)
    expect(r.points[0]!.date).toBe('2024-02-29')
  })

  it('sin datos para una sola ventana, se dice en vez de devolver cero', () => {
    const corta = serie('x', [0.1, -0.2, 0.3])
    const r = rollingCorrelation(corta, serie('y', [0.2, 0.1, -0.1]), 30)
    expect(r.points).toEqual([])
    expect(r.latest).toBeNull()
    expect(r.reason).toBe('insufficient_sample')
  })

  it('dos series sin días comunes no producen ningún punto', () => {
    const a1 = serie('a', Array.from({ length: 100 }, () => 0.01))
    const b1: ReturnSeries = {
      id: 'b',
      label: 'B',
      returns: a1.returns.map((p) => ({ date: `2030-${p.date.slice(5)}`, value: p.value })),
    }
    expect(rollingCorrelation(a1, b1, 30).points).toEqual([])
  })
})

describe('downside: la diversificación se evapora cuando hace falta', () => {
  // En los días malos del mercado, a y b se mueven idénticos; el resto del
  // tiempo son independientes. Es el patrón que arruina una cartera.
  const r1 = ruido(3)
  const r2 = ruido(41)
  const n = 400

  const mercado: number[] = []
  const va: number[] = []
  const vb: number[] = []
  for (let i = 0; i < n; i += 1) {
    const m = r1()
    mercado.push(m)
    if (m < 0) {
      const comun = r2()
      va.push(comun)
      vb.push(comun)
    } else {
      va.push(r2())
      vb.push(r1())
    }
  }

  const a = serie('a', va)
  const b = serie('b', vb)
  const cartera = serie('cartera', mercado)

  it('la correlación bajista es mayor que la global', () => {
    const d = downsideDependency(a, b, cartera)
    expect(d.downside).not.toBeNull()
    expect(d.downside!).toBeGreaterThan(d.overall!)
    expect(d.worsensInDrawdown).toBe(true)
  })

  it('el número nunca viaja sin su definición', () => {
    const d = downsideDependency(a, b, cartera)
    expect(d.condition).toBe(DOWNSIDE_CONDITION)
    expect(d.condition).toMatch(/cerró en negativo/)
  })

  it('dice sobre cuántos días malos está calculado', () => {
    const d = downsideDependency(a, b, cartera)
    expect(d.downsideObservations).toBeGreaterThan(0)
    expect(d.downsideObservations).toBeLessThan(d.observations)
  })

  it('es simétrica: la condición no depende de cuál se mire', () => {
    const ab = downsideDependency(a, b, cartera)
    const ba = downsideDependency(b, a, cartera)
    expect(ab.downside).toBeCloseTo(ba.downside!, 12)
    expect(ab.overall).toBeCloseTo(ba.overall!, 12)
  })

  it('sin días malos suficientes no se publica una correlación bajista', () => {
    // Un mercado que casi nunca cae: hay datos de sobra, pero no días malos.
    const casiSiempreSube = serie(
      'cartera',
      Array.from({ length: 400 }, (_, i) => (i === 0 ? -0.01 : 0.01)),
    )
    const d = downsideDependency(a, b, casiSiempreSube)
    expect(d.overall).not.toBeNull()
    expect(d.downside).toBeNull()
    expect(d.reason).toBe('insufficient_downside_sample')
    // Y no se marca como que empeora: no se sabe.
    expect(d.worsensInDrawdown).toBe(false)
  })

  it('sin muestra suficiente en total, tampoco hay número global', () => {
    const corta = serie('a', [0.1, -0.2, 0.3])
    const d = downsideDependency(corta, serie('b', [0.2, 0.1, -0.1]), serie('m', [-0.1, -0.2, 0.1]))
    expect(d.overall).toBeNull()
    expect(d.reason).toBe('insufficient_sample')
  })
})
