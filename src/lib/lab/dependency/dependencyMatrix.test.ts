/**
 * Pruebas de la matriz de dependencia (LAB-410).
 *
 * El criterio de aceptación es que **no se fuerce una intersección global**:
 * cada par se estima con su propio solape y lleva encima su tamaño de muestra.
 */
import { describe, expect, it } from 'vitest'
import { MIN_OBSERVATIONS } from '../../finance/historical'
import {
  cellFor,
  dependencyMatrix,
  strongestPairs,
  type ReturnSeries,
} from './dependencyMatrix'

/** Serie de `n` días desde 2024-01-01, con el valor que dé `f`. */
function serie(id: string, n: number, f: (i: number) => number, desde = 0): ReturnSeries {
  const returns = []
  for (let i = desde; i < desde + n; i += 1) {
    const fecha = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)
    returns.push({ date: fecha, value: f(i) })
  }
  return { id, label: id.toUpperCase(), returns }
}

const N = MIN_OBSERVATIONS + 20

describe('lo que la matriz debe acertar', () => {
  it('dos series idénticas correlacionan 1', () => {
    const m = dependencyMatrix([
      serie('a', N, (i) => Math.sin(i)),
      serie('b', N, (i) => Math.sin(i)),
    ])
    expect(cellFor(m, 'a', 'b')?.value).toBeCloseTo(1, 10)
  })

  it('una serie y su opuesta correlacionan −1', () => {
    const m = dependencyMatrix([
      serie('a', N, (i) => Math.sin(i)),
      serie('b', N, (i) => -Math.sin(i)),
    ])
    expect(cellFor(m, 'a', 'b')?.value).toBeCloseTo(-1, 10)
  })

  it('la matriz es simétrica: da igual el orden en que se pregunte', () => {
    const m = dependencyMatrix([
      serie('a', N, (i) => Math.sin(i)),
      serie('b', N, (i) => Math.cos(i * 0.7)),
    ])
    expect(cellFor(m, 'a', 'b')).toEqual(cellFor(m, 'b', 'a'))
  })

  it('solo devuelve el triángulo superior, sin duplicar pares', () => {
    const m = dependencyMatrix([
      serie('a', N, (i) => i),
      serie('b', N, (i) => i * 2),
      serie('c', N, (i) => Math.sin(i)),
    ])
    // 3 activos = 3 pares, no 9 ni 6.
    expect(m.cells).toHaveLength(3)
  })

  it('un activo consigo mismo no es una celda', () => {
    const m = dependencyMatrix([serie('a', N, (i) => Math.sin(i))])
    expect(cellFor(m, 'a', 'a')).toBeNull()
  })
})

describe('la muestra viaja con cada celda, no con la matriz', () => {
  it('cada par se estima con su propio solape', () => {
    // `c` empieza 40 días más tarde: no debe recortar el par a–b.
    const m = dependencyMatrix([
      serie('a', 200, (i) => Math.sin(i)),
      serie('b', 200, (i) => Math.cos(i)),
      serie('c', 60, (i) => Math.sin(i * 1.3), 140),
    ])

    const ab = cellFor(m, 'a', 'b')!
    const ac = cellFor(m, 'a', 'c')!
    // Si se hubiera forzado la intersección global, ab tendría 60, no 200.
    expect(ab.observations).toBe(200)
    expect(ac.observations).toBe(60)
    expect(ab.observations).toBeGreaterThan(ac.observations)
  })

  it('cada celda dice de qué periodo es', () => {
    const m = dependencyMatrix([serie('a', N, (i) => Math.sin(i)), serie('b', N, (i) => i)])
    const ab = cellFor(m, 'a', 'b')!
    expect(ab.from).toBe('2024-01-01')
    expect(ab.to).not.toBeNull()
    expect(ab.from! < ab.to!).toBe(true)
  })

  it('una muestra corta no se publica: se dice por qué', () => {
    const corta = MIN_OBSERVATIONS - 1
    const m = dependencyMatrix([
      serie('a', corta, (i) => Math.sin(i)),
      serie('b', corta, (i) => Math.cos(i)),
    ])
    const ab = cellFor(m, 'a', 'b')!
    expect(ab.value).toBeNull()
    expect(ab.reason).toBe('insufficient_sample')
    expect(ab.observations).toBe(corta)
    expect(m.unavailablePairs).toBe(1)
  })

  it('dos series sin ningún día en común no se inventan un cero', () => {
    const m = dependencyMatrix([
      serie('a', 50, (i) => Math.sin(i), 0),
      serie('b', 50, (i) => Math.sin(i), 500),
    ])
    const ab = cellFor(m, 'a', 'b')!
    expect(ab.value).toBeNull()
    expect(ab.reason).toBe('no_overlap')
    expect(ab.observations).toBe(0)
  })

  it('una serie plana se distingue de una serie corta', () => {
    const m = dependencyMatrix([serie('a', N, () => 0), serie('b', N, (i) => Math.sin(i))])
    const ab = cellFor(m, 'a', 'b')!
    expect(ab.value).toBeNull()
    // No se arregla esperando más datos: es otra cosa, y se nombra distinto.
    expect(ab.reason).toBe('constant_series')
  })
})

describe('Spearman va aparte, no mezclada', () => {
  it('mide el sentido aunque la relación no sea proporcional', () => {
    // y = x³ es monótona pero no lineal: Spearman = 1, Pearson < 1.
    const pearson = dependencyMatrix([
      serie('a', N, (i) => i - N / 2),
      serie('b', N, (i) => (i - N / 2) ** 3),
    ])
    const spearman = dependencyMatrix(
      [serie('a', N, (i) => i - N / 2), serie('b', N, (i) => (i - N / 2) ** 3)],
      'spearman',
    )

    // Spearman ve la monotonía perfecta; Pearson, que mide proporcionalidad,
    // se queda por debajo. El umbral exacto de Pearson no importa: lo que
    // importa es que las dos no dan el mismo número, y por eso no se mezclan.
    expect(cellFor(spearman, 'a', 'b')!.value).toBeCloseTo(1, 10)
    expect(cellFor(pearson, 'a', 'b')!.value).toBeLessThan(
      cellFor(spearman, 'a', 'b')!.value! - 0.05,
    )
  })

  it('el método usado se declara en el resultado', () => {
    expect(dependencyMatrix([], 'spearman').method).toBe('spearman')
    expect(dependencyMatrix([]).method).toBe('pearson')
  })

  it('los empates no dependen del orden de entrada', () => {
    const conEmpates = (id: string) => ({
      id,
      label: id,
      returns: serie(id, N, (i) => (i % 3 === 0 ? 1 : i % 3 === 1 ? 1 : 2)).returns,
    })
    const m = dependencyMatrix([conEmpates('a'), conEmpates('b')], 'spearman')
    expect(cellFor(m, 'a', 'b')!.value).toBeCloseTo(1, 10)
  })
})

describe('lo que hay que mirar primero', () => {
  it('los pares más correlacionados salen de mayor a menor', () => {
    const m = dependencyMatrix([
      serie('a', N, (i) => Math.sin(i)),
      serie('b', N, (i) => Math.sin(i)),
      serie('c', N, (i) => Math.sin(i * 0.31) + Math.cos(i * 1.7)),
    ])
    const top = strongestPairs(m, 2)
    expect(top).toHaveLength(2)
    expect(top[0]!.value).toBeGreaterThanOrEqual(top[1]!.value)
    // a y b son idénticas: tienen que encabezar la lista.
    expect([top[0]!.a, top[0]!.b].sort()).toEqual(['a', 'b'])
  })

  it('los pares no disponibles no se cuelan como si fueran cero', () => {
    const m = dependencyMatrix([
      serie('a', 10, (i) => Math.sin(i)),
      serie('b', 10, (i) => Math.cos(i)),
    ])
    expect(strongestPairs(m)).toEqual([])
  })
})

describe('determinismo', () => {
  it('el orden de entrada no cambia la matriz', () => {
    const s = [
      serie('c', N, (i) => Math.sin(i)),
      serie('a', N, (i) => Math.cos(i)),
      serie('b', N, (i) => i),
    ]
    expect(dependencyMatrix(s)).toEqual(dependencyMatrix([...s].reverse()))
  })

  it('sin series no rompe', () => {
    const m = dependencyMatrix([])
    expect(m.cells).toEqual([])
    expect(m.unavailablePairs).toBe(0)
  })
})
