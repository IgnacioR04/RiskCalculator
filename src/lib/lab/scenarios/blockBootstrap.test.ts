/**
 * Pruebas del bootstrap por bloques (LAB-505).
 *
 * El criterio de aceptación: **conserva la dependencia transversal al muestrear
 * bloques comunes**. Es la propiedad que hace correcto el método, y la que se
 * rompería sin darse cuenta si cada activo eligiera sus propios días.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_PATHS,
  blockBootstrap,
  createRng,
  percentiles,
  successRate,
} from './blockBootstrap'

/** Historia de `n` días para dos activos, con la relación que diga `f`. */
function historia(n: number, f: (i: number) => [number, number]): number[][] {
  return Array.from({ length: n }, (_, i) => f(i))
}

const correlacion = (a: readonly number[], b: readonly number[]): number => {
  const n = a.length
  const ma = a.reduce((s, x) => s + x, 0) / n
  const mb = b.reduce((s, x) => s + x, 0) / n
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < n; i += 1) {
    cov += (a[i]! - ma) * (b[i]! - mb)
    va += (a[i]! - ma) ** 2
    vb += (b[i]! - mb) ** 2
  }
  return cov / Math.sqrt(va * vb)
}

describe('reproducibilidad', () => {
  const base = { history: historia(200, (i) => [Math.sin(i) / 100, Math.cos(i) / 100]), blockDays: 20, horizonDays: 60, paths: 50 }

  it('la misma semilla da exactamente el mismo resultado', () => {
    const a = blockBootstrap({ ...base, seed: 7 })
    const b = blockBootstrap({ ...base, seed: 7 })
    expect(a).toEqual(b)
  })

  it('semillas distintas dan resultados distintos', () => {
    const a = blockBootstrap({ ...base, seed: 7 })
    const b = blockBootstrap({ ...base, seed: 8 })
    expect(a).not.toEqual(b)
  })

  it('la semilla usada viaja en el resultado', () => {
    const r = blockBootstrap({ ...base, seed: 123 })
    expect(r.ok && r.seed).toBe(123)
  })

  it('el generador no depende de Math.random', () => {
    const rng = createRng(1)
    const primeros = [rng(), rng(), rng()]
    const otra = createRng(1)
    expect([otra(), otra(), otra()]).toEqual(primeros)
  })

  it('el generador produce valores en [0, 1)', () => {
    const rng = createRng(99)
    for (let i = 0; i < 1000; i += 1) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('conserva la dependencia entre activos', () => {
  it('dos activos idénticos siguen siéndolo en la simulación', () => {
    // Si cada activo eligiera sus propios días, esto se rompería y saldría una
    // cartera artificialmente diversificada.
    const r = blockBootstrap({
      history: historia(300, (i) => {
        const v = Math.sin(i * 0.7) / 50
        return [v, v]
      }),
      blockDays: 20,
      horizonDays: 120,
      paths: 20,
      seed: 5,
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const trayectoria of r.paths) {
      const a = trayectoria.map((d) => d[0]!)
      const b = trayectoria.map((d) => d[1]!)
      expect(a).toEqual(b)
    }
  })

  it('dos activos opuestos siguen siendo opuestos', () => {
    const r = blockBootstrap({
      history: historia(300, (i) => [Math.sin(i * 0.4) / 50, -Math.sin(i * 0.4) / 50]),
      blockDays: 25,
      horizonDays: 100,
      paths: 10,
      seed: 11,
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    const t = r.paths[0]!
    expect(correlacion(t.map((d) => d[0]!), t.map((d) => d[1]!))).toBeCloseTo(-1, 6)
  })

  it('la correlación histórica se mantiene en la simulación', () => {
    const hist = historia(400, (i) => [Math.sin(i * 0.3) / 40, Math.sin(i * 0.3 + 0.6) / 40])
    const original = correlacion(hist.map((d) => d[0]!), hist.map((d) => d[1]!))

    const r = blockBootstrap({ history: hist, blockDays: 30, horizonDays: 240, paths: 30, seed: 3 })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const simulada =
      r.paths.reduce(
        (s, t) => s + correlacion(t.map((d) => d[0]!), t.map((d) => d[1]!)),
        0,
      ) / r.paths.length

    expect(simulada).toBeCloseTo(original, 1)
  })
})

describe('conserva las rachas dentro del bloque', () => {
  it('los días de un bloque salen consecutivos de la historia', () => {
    // Historia numerada: cada día vale su índice, así se ve si van seguidos.
    const r = blockBootstrap({
      history: historia(100, (i) => [i, i]),
      blockDays: 10,
      horizonDays: 10,
      paths: 5,
      seed: 42,
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const t of r.paths) {
      const valores = t.map((d) => d[0]!)
      for (let i = 1; i < valores.length; i += 1) {
        expect(valores[i]).toBe(valores[i - 1]! + 1)
      }
    }
  })

  it('un horizonte más largo que un bloque encadena varios', () => {
    const r = blockBootstrap({
      history: historia(100, (i) => [i, i]),
      blockDays: 10,
      horizonDays: 35,
      paths: 1,
      seed: 1,
    })
    expect(r.ok && r.blocksPerPath).toBe(4)
    expect(r.ok && r.paths[0]!.length).toBe(35)
  })
})

describe('formas y límites', () => {
  const hist = historia(100, (i) => [i / 1000, i / 2000])

  it('genera exactamente las trayectorias pedidas, con el largo pedido', () => {
    const r = blockBootstrap({ history: hist, blockDays: 10, horizonDays: 30, paths: 7, seed: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.paths).toHaveLength(7)
    expect(r.paths.every((t) => t.length === 30)).toBe(true)
    expect(r.paths.every((t) => t.every((d) => d.length === 2))).toBe(true)
  })

  it('sin historia se dice, no se simula sobre la nada', () => {
    const r = blockBootstrap({ history: [], blockDays: 10, horizonDays: 30, paths: 10, seed: 1 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('empty_history')
  })

  it('un bloque más largo que la historia se rechaza', () => {
    const r = blockBootstrap({ history: hist, blockDays: 200, horizonDays: 30, paths: 10, seed: 1 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('block_longer_than_history')
  })

  it('un bloque de un día destruiría lo que el método conserva', () => {
    const r = blockBootstrap({ history: hist, blockDays: 1, horizonDays: 30, paths: 10, seed: 1 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('invalid_block')
  })

  it('pasarse de trayectorias se rechaza en vez de colgar el navegador', () => {
    const r = blockBootstrap({
      history: hist,
      blockDays: 10,
      horizonDays: 30,
      paths: MAX_PATHS + 1,
      seed: 1,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('too_many_paths')
  })

  it('un horizonte de cero días no es un escenario', () => {
    const r = blockBootstrap({ history: hist, blockDays: 10, horizonDays: 0, paths: 10, seed: 1 })
    expect(r.ok).toBe(false)
  })
})

describe('percentiles y cumplimiento', () => {
  const muestra = Array.from({ length: 101 }, (_, i) => i)

  it('los percentiles salen donde deben en una muestra uniforme', () => {
    const p = percentiles(muestra)!
    expect(p.p50).toBeCloseTo(50, 9)
    expect(p.p05).toBeCloseTo(5, 9)
    expect(p.p95).toBeCloseTo(95, 9)
  })

  it('se interpola en vez de saltar al vecino', () => {
    // Con dos valores, la mediana es el punto medio, no uno de los dos.
    expect(percentiles([0, 10])!.p50).toBeCloseTo(5, 9)
  })

  it('están ordenados por construcción', () => {
    const p = percentiles([3, 1, 4, 1, 5, 9, 2, 6])!
    expect(p.p05).toBeLessThanOrEqual(p.p25)
    expect(p.p25).toBeLessThanOrEqual(p.p50)
    expect(p.p50).toBeLessThanOrEqual(p.p75)
    expect(p.p75).toBeLessThanOrEqual(p.p95)
  })

  it('sin muestra no se inventa una distribución', () => {
    expect(percentiles([])).toBeNull()
    expect(successRate([], 100)).toBeNull()
  })

  it('la frecuencia de cumplimiento cuenta los que llegan', () => {
    expect(successRate([90, 100, 110, 120], 100)).toBe(0.75)
    expect(successRate([1, 2, 3], 100)).toBe(0)
    expect(successRate([200, 300], 100)).toBe(1)
  })
})
