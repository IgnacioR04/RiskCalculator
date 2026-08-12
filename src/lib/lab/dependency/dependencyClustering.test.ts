/**
 * Pruebas de agrupación por dependencia (LAB-412).
 *
 * El criterio de aceptación: **permutar las entradas no cambia los clusters**,
 * salvo en un orden equivalente.
 */
import { describe, expect, it } from 'vitest'
import { MIN_OBSERVATIONS } from '../../finance/historical'
import {
  CLUSTERING_VERSION,
  clusterByDependency,
  correlationDistance,
  distinctBets,
} from './dependencyClustering'
import { dependencyMatrix, type ReturnSeries } from './dependencyMatrix'

const N = MIN_OBSERVATIONS + 30

function serie(id: string, f: (i: number) => number): ReturnSeries {
  return {
    id,
    label: id.toUpperCase(),
    returns: Array.from({ length: N }, (_, i) => ({
      date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
      value: f(i),
    })),
  }
}

/**
 * Fixture independiente del motor: tres activos que se mueven juntos, dos que
 * se mueven juntos entre sí, y uno que va por libre. Los grupos son evidentes
 * a simple vista, que es lo que hace la prueba comprobable.
 */
const CARTERA = [
  serie('tech1', (i) => Math.sin(i * 0.3)),
  serie('tech2', (i) => Math.sin(i * 0.3) + 0.001 * Math.cos(i)),
  serie('tech3', (i) => Math.sin(i * 0.3) * 1.5),
  serie('bono1', (i) => Math.cos(i * 0.11)),
  serie('bono2', (i) => Math.cos(i * 0.11) * 0.8),
  serie('solo', (i) => Math.sin(i * 2.7) + Math.cos(i * 0.53)),
]

describe('la distancia hace lo que dice', () => {
  it('dos activos idénticos distan cero', () => {
    expect(correlationDistance(1)).toBe(0)
  })

  it('dos activos opuestos distan uno', () => {
    expect(correlationDistance(-1)).toBe(1)
  })

  it('sin relación, la distancia es media', () => {
    expect(correlationDistance(0)).toBe(0.5)
  })
})

describe('los grupos son los que se ven a simple vista', () => {
  const resultado = clusterByDependency(dependencyMatrix(CARTERA))

  it('los que se mueven juntos acaban juntos', () => {
    const grupoTech = resultado.clusters.find((c) => c.members.includes('tech1'))
    expect(grupoTech?.members.sort()).toEqual(['tech1', 'tech2', 'tech3'])
  })

  it('los bonos forman su propio grupo, no se mezclan con tech', () => {
    const grupoBonos = resultado.clusters.find((c) => c.members.includes('bono1'))
    expect(grupoBonos?.members.sort()).toEqual(['bono1', 'bono2'])
  })

  it('el que va por libre se queda solo', () => {
    const grupoSolo = resultado.clusters.find((c) => c.members.includes('solo'))
    expect(grupoSolo?.members).toEqual(['solo'])
  })

  it('seis posiciones resultan ser tres apuestas', () => {
    expect(distinctBets(resultado)).toBe(3)
  })

  it('los grupos grandes se presentan primero', () => {
    const tamanos = resultado.clusters.map((c) => c.members.length)
    expect(tamanos).toEqual([...tamanos].sort((a, b) => b - a))
  })

  it('las etiquetas son genéricas, no temáticas', () => {
    // Llamarlo «Tecnología» afirmaría una causa que el cálculo no ha mirado.
    for (const c of resultado.clusters) expect(c.label).toMatch(/^Grupo \d+$/)
  })

  it('cada grupo dice cuánto se parecen sus miembros', () => {
    const grupoTech = resultado.clusters.find((c) => c.members.includes('tech1'))!
    expect(grupoTech.averageCorrelation).toBeGreaterThan(0.5)
  })

  it('el método va versionado: un resultado viejo no es comparable', () => {
    expect(resultado.version).toBe(CLUSTERING_VERSION)
  })
})

describe('reproducibilidad', () => {
  it('permutar las entradas no cambia los grupos', () => {
    const directo = clusterByDependency(dependencyMatrix(CARTERA))
    const inverso = clusterByDependency(dependencyMatrix([...CARTERA].reverse()))
    const barajado = clusterByDependency(
      dependencyMatrix([CARTERA[3]!, CARTERA[0]!, CARTERA[5]!, CARTERA[2]!, CARTERA[4]!, CARTERA[1]!]),
    )

    const normalizar = (r: typeof directo) =>
      r.clusters.map((c) => [...c.members].sort().join(',')).sort()

    expect(normalizar(inverso)).toEqual(normalizar(directo))
    expect(normalizar(barajado)).toEqual(normalizar(directo))
  })

  it('el orden de hojas es determinista', () => {
    const a = clusterByDependency(dependencyMatrix(CARTERA))
    const b = clusterByDependency(dependencyMatrix([...CARTERA].reverse()))
    expect(b.leafOrder).toEqual(a.leafOrder)
  })

  it('el orden de hojas contiene cada activo exactamente una vez', () => {
    const r = clusterByDependency(dependencyMatrix(CARTERA))
    expect([...r.leafOrder].sort()).toEqual(CARTERA.map((s) => s.id).sort())
  })
})

describe('lo que no se puede medir no se agrupa', () => {
  it('un activo sin muestra suficiente se aparta en vez de colocarse a ojo', () => {
    const corto: ReturnSeries = {
      id: 'nuevo',
      label: 'NUEVO',
      returns: [{ date: '2024-01-02', value: 0.01 }],
    }
    const r = clusterByDependency(dependencyMatrix([...CARTERA, corto]))

    expect(r.unclustered).toEqual(['nuevo'])
    expect(r.clusters.some((c) => c.members.includes('nuevo'))).toBe(false)
  })

  it('un umbral más exigente separa lo que antes estaba junto', () => {
    const flojo = clusterByDependency(dependencyMatrix(CARTERA), 0.4)
    const estricto = clusterByDependency(dependencyMatrix(CARTERA), 0.01)
    expect(estricto.clusters.length).toBeGreaterThanOrEqual(flojo.clusters.length)
  })

  it('sin activos no rompe', () => {
    const r = clusterByDependency(dependencyMatrix([]))
    expect(r.clusters).toEqual([])
    expect(distinctBets(r)).toBe(0)
  })
})
