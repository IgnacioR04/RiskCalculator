/**
 * LAB-1014. La prueba que importa es la primera: **el resumen sin materializar
 * las trayectorias tiene que dar exactamente lo mismo** que calcularlo desde
 * `blockBootstrap`. Es un cambio de cómo se ejecuta, no de qué se calcula, y si
 * esta prueba cae es que el modelo ha cambiado sin que nadie lo decidiera.
 */
import { describe, expect, it } from 'vitest'
import { blockBootstrap } from './blockBootstrap'
import { alignReturns, bootstrapOutcome } from './bootstrapOutcome'
import type { ReturnSeries } from '../dependency/dependencyMatrix'

/** Ruido determinista: dos series distintas y sin periodicidad que las alinee. */
function historia(dias: number, activos: number): number[][] {
  const filas: number[][] = []
  for (let d = 0; d < dias; d += 1) {
    const fila: number[] = []
    for (let a = 0; a < activos; a += 1) {
      fila.push(Math.sin((d + 1) * (a + 3) * 0.7) * 0.02)
    }
    filas.push(fila)
  }
  return filas
}

/** El mismo cálculo, pero desde las trayectorias completas del motor original. */
function resumenDesdeMotor(
  history: number[][],
  values: number[],
  blockDays: number,
  horizonDays: number,
  paths: number,
  seed: number,
) {
  const motor = blockBootstrap({ history, blockDays, horizonDays, paths, seed })
  if (!motor.ok) throw new Error(motor.reason)

  return motor.paths.map((trayectoria) => {
    const actual = values.slice()
    for (const fila of trayectoria) {
      for (let i = 0; i < actual.length; i += 1) actual[i]! *= 1 + (fila[i] ?? 0)
    }
    return actual.reduce((s, v) => s + v, 0)
  })
}

describe('bootstrapOutcome · equivalencia con el motor original', () => {
  it('produce la misma distribución que calcular desde las trayectorias', () => {
    const history = historia(120, 4)
    const values = [1000, 2500, 400, 1100]

    const finales = resumenDesdeMotor(history, values, 20, 60, 200, 12345)
    const orden = [...finales].sort((a, b) => a - b)
    const en = (q: number) => {
      const pos = (orden.length - 1) * q
      const bajo = Math.floor(pos)
      const alto = Math.ceil(pos)
      return bajo === alto ? orden[bajo]! : orden[bajo]! + (orden[alto]! - orden[bajo]!) * (pos - bajo)
    }

    const resumen = bootstrapOutcome({
      history,
      values,
      blockDays: 20,
      horizonDays: 60,
      paths: 200,
      seed: 12345,
    })

    expect(resumen.ok).toBe(true)
    if (!resumen.ok) return
    for (const [q, valor] of [
      [0.05, resumen.distribution.p05],
      [0.5, resumen.distribution.p50],
      [0.95, resumen.distribution.p95],
    ] as const) {
      // Tolerancia de punto flotante, no de modelo: es la misma aritmética en
      // otro orden de acumulación.
      expect(valor).toBeCloseTo(en(q), 6)
    }
  })

  it('un horizonte que no es múltiplo del bloque no desfasa el generador', () => {
    // `blockBootstrap` sortea todos los bloques y recorta al final. Si aquí se
    // dejara de sortear al cubrir el horizonte, la secuencia aleatoria se
    // separaría y las dos rutas dejarían de coincidir en la segunda trayectoria.
    const history = historia(90, 3)
    const values = [500, 500, 500]
    const finales = resumenDesdeMotor(history, values, 20, 55, 50, 7)
    const resumen = bootstrapOutcome({
      history,
      values,
      blockDays: 20,
      horizonDays: 55,
      paths: 50,
      seed: 7,
    })
    expect(resumen.ok).toBe(true)
    if (!resumen.ok) return
    const mediana = [...finales].sort((a, b) => a - b)
    const pos = (mediana.length - 1) * 0.5
    const esperada =
      mediana[Math.floor(pos)]! +
      (mediana[Math.ceil(pos)]! - mediana[Math.floor(pos)]!) * (pos - Math.floor(pos))
    expect(resumen.distribution.p50).toBeCloseTo(esperada, 6)
  })

  it('la misma semilla da el mismo resultado dos veces', () => {
    const entrada = {
      history: historia(80, 2),
      values: [1000, 1000],
      blockDays: 10,
      horizonDays: 40,
      paths: 100,
      seed: 99,
    }
    expect(bootstrapOutcome(entrada)).toEqual(bootstrapOutcome(entrada))
  })
})

describe('bootstrapOutcome · lo que rechaza', () => {
  const base = {
    history: historia(60, 2),
    values: [100, 100],
    blockDays: 10,
    horizonDays: 20,
    paths: 10,
    seed: 1,
  }

  it('sin historia no calcula', () => {
    expect(bootstrapOutcome({ ...base, history: [] })).toEqual({
      ok: false,
      reason: 'empty_history',
    })
  })

  it('un bloque más largo que la historia no calcula', () => {
    expect(bootstrapOutcome({ ...base, blockDays: 200 })).toEqual({
      ok: false,
      reason: 'block_longer_than_history',
    })
  })

  it('una cartera sin valor no calcula, en vez de devolver ceros', () => {
    // Devolver una distribución de ceros parecería un resultado. No lo es.
    expect(bootstrapOutcome({ ...base, values: [0, 0] })).toEqual({ ok: false, reason: 'no_value' })
  })

  it('no acepta más trayectorias que el tope del contrato', () => {
    expect(bootstrapOutcome({ ...base, paths: 10_001 })).toEqual({
      ok: false,
      reason: 'too_many_paths',
    })
  })
})

describe('bootstrapOutcome · progreso y objetivo', () => {
  const entrada = {
    history: historia(80, 2),
    values: [1000, 1000],
    blockDays: 10,
    horizonDays: 40,
    paths: 200,
    seed: 3,
  }

  it('informa del progreso y termina siempre en el total', () => {
    const avisos: [number, number][] = []
    bootstrapOutcome(entrada, (hechas, total) => avisos.push([hechas, total]))
    expect(avisos.length).toBeGreaterThan(1)
    expect(avisos.at(-1)).toEqual([200, 200])
    // Monótono: una barra que retrocede es peor que no tenerla.
    for (let i = 1; i < avisos.length; i += 1) {
      expect(avisos[i]![0]).toBeGreaterThanOrEqual(avisos[i - 1]![0])
    }
  })

  it('sin objetivo no inventa una tasa de éxito', () => {
    const r = bootstrapOutcome(entrada)
    expect(r.ok && 'successRate' in r).toBe(false)
  })

  it('con objetivo devuelve la fracción que lo alcanza', () => {
    const r = bootstrapOutcome({ ...entrada, target: 0 })
    expect(r.ok && r.successRate).toBe(1)
  })
})

describe('alignReturns', () => {
  const serie = (id: string, puntos: [string, number][]): ReturnSeries => ({
    id,
    label: id,
    returns: puntos.map(([date, value]) => ({ date, value })),
  })

  it('se queda solo con los días que tienen todas las series', () => {
    const a = serie('a', [
      ['2026-01-02', 0.01],
      ['2026-01-03', 0.02],
      ['2026-01-06', 0.03],
    ])
    const b = serie('b', [
      ['2026-01-02', -0.01],
      ['2026-01-06', -0.03],
    ])
    const alineado = alignReturns([a, b])
    expect(alineado.dates).toEqual(['2026-01-02', '2026-01-06'])
    expect(alineado.rows).toEqual([
      [0.01, -0.01],
      [0.03, -0.03],
    ])
  })

  it('no rellena el hueco con cero', () => {
    // Un cero inventaría un día plano para un activo que no cotizó, y eso baja
    // su volatilidad y su correlación: haría la cartera más diversificada de lo
    // que es. Justo la mentira que el Laboratorio existe para desmontar.
    const a = serie('a', [
      ['2026-01-02', 0.01],
      ['2026-01-03', 0.02],
    ])
    const b = serie('b', [['2026-01-02', -0.01]])
    expect(alignReturns([a, b]).rows).toHaveLength(1)
  })

  it('ordena por fecha aunque la serie venga desordenada', () => {
    const a = serie('a', [
      ['2026-01-06', 0.03],
      ['2026-01-02', 0.01],
    ])
    const b = serie('b', [
      ['2026-01-06', -0.03],
      ['2026-01-02', -0.01],
    ])
    expect(alignReturns([a, b]).dates).toEqual(['2026-01-02', '2026-01-06'])
  })
})
