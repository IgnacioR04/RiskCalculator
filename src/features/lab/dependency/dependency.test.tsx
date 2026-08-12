/**
 * Pruebas de la pantalla de Dependencia (LAB-413).
 *
 * Los bloques son puros, así que se prueban con un objeto fijo: comprobar cómo
 * se pinta una correlación de 0,92 es escribir `0.92`, sin montar una cartera ni
 * simular una descarga.
 *
 * El criterio de aceptación de la tarea —el mapa de calor tiene alternativa
 * textual— se comprueba aquí abajo, en «la matriz se puede leer sin ver color».
 */
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { ClusteringResult } from '../../../lib/lab/dependency/dependencyClustering'
import type { DependencyCell, DependencyMatrix } from '../../../lib/lab/dependency/dependencyMatrix'
import type { DownsideDependency } from '../../../lib/lab/dependency/rollingDependency'
import { DOWNSIDE_CONDITION } from '../../../lib/lab/dependency/rollingDependency'
import { BetsBlock, DownsideBlock, MatrixBlock, PairsBlock } from './DependencyBlocks'

const ETIQUETAS = { a: 'AAPL', b: 'MSFT', c: 'BND' }

const CLUSTERING: ClusteringResult = {
  version: 'hclust-avg-v1',
  clusters: [
    { label: 'Grupo 1', members: ['a', 'b'], averageCorrelation: 0.93 },
    { label: 'Grupo 2', members: ['c'], averageCorrelation: null },
  ],
  leafOrder: ['a', 'b', 'c'],
  unclustered: [],
  threshold: 0.25,
}

const CELDA: DependencyCell = {
  a: 'a',
  b: 'b',
  value: 0.93,
  observations: 240,
  from: '2025-08-12',
  to: '2026-08-12',
}

const MATRIZ: DependencyMatrix = {
  ids: ['a', 'b', 'c'],
  labels: ETIQUETAS,
  method: 'pearson',
  cells: [
    CELDA,
    { a: 'a', b: 'c', value: -0.12, observations: 240, from: '2025-08-12', to: '2026-08-12' },
    { a: 'b', b: 'c', value: null, observations: 8, from: null, to: null, reason: 'insufficient_sample' },
  ],
  minObservations: 30,
  unavailablePairs: 1,
}

const pintar = (nodo: React.ReactElement) => render(<MemoryRouter>{nodo}</MemoryRouter>)

/* ── La conclusión, antes que los datos ───────────────────────────────────── */

describe('cuántas apuestas hay de verdad', () => {
  it('traduce el número de posiciones a número de apuestas', () => {
    pintar(<BetsBlock clustering={CLUSTERING} totalPositions={3} labels={ETIQUETAS} />)
    expect(screen.getByText('3 → 2')).toBeInTheDocument()
  })

  it('lo que no se pudo agrupar cuenta en el titular, no desaparece', () => {
    // Contar solo los grupos daría «4 → 2» por haber medido menos, que es la
    // clase de número bonito que este proyecto no publica.
    pintar(
      <BetsBlock
        clustering={{ ...CLUSTERING, unclustered: ['d'] }}
        totalPositions={4}
        labels={{ ...ETIQUETAS, d: 'NUEVO' }}
      />,
    )
    expect(screen.getByText('4 → 3')).toBeInTheDocument()
  })

  it('enseña quién va con quién, con nombres reconocibles', () => {
    pintar(<BetsBlock clustering={CLUSTERING} totalPositions={3} labels={ETIQUETAS} />)
    expect(screen.getByText('AAPL, MSFT')).toBeInTheDocument()
  })

  it('las etiquetas de grupo son genéricas, nunca temáticas', () => {
    pintar(<BetsBlock clustering={CLUSTERING} totalPositions={3} labels={ETIQUETAS} />)
    expect(screen.getByText('Grupo 1')).toBeInTheDocument()
    expect(screen.getByText(/no sectores ni estilos/)).toBeInTheDocument()
  })

  it('lo que no se pudo agrupar se dice, no se coloca a ojo', () => {
    pintar(
      <BetsBlock
        clustering={{ ...CLUSTERING, unclustered: ['c'] }}
        totalPositions={3}
        labels={ETIQUETAS}
      />,
    )
    expect(screen.getByText(/Sin historial suficiente para agrupar: BND/)).toBeInTheDocument()
  })

  it('sin ningún grupo, lo dice en vez de enseñar una lista vacía', () => {
    pintar(
      <BetsBlock
        clustering={{ ...CLUSTERING, clusters: [{ label: 'Grupo 1', members: ['a'], averageCorrelation: null }] }}
        totalPositions={1}
        labels={ETIQUETAS}
      />,
    )
    expect(screen.getByText(/cada una es una apuesta distinta/)).toBeInTheDocument()
  })
})

/* ── La muestra viaja con el número ───────────────────────────────────────── */

describe('las parejas más correlacionadas', () => {
  it('cada pareja enseña su propia muestra y su periodo', () => {
    pintar(
      <PairsBlock pairs={[CELDA]} labels={ETIQUETAS} minObservations={30} unavailablePairs={0} />,
    )
    const fila = screen.getByRole('row', { name: /AAPL y MSFT/ })
    expect(within(fila).getByText('240')).toBeInTheDocument()
    expect(within(fila).getByText(/2025-08-12 → 2026-08-12/)).toBeInTheDocument()
  })

  it('lo que no se pudo calcular no se cuenta como cero', () => {
    pintar(
      <PairsBlock pairs={[CELDA]} labels={ETIQUETAS} minObservations={30} unavailablePairs={2} />,
    )
    expect(screen.getByText(/No cuentan como cero/)).toBeInTheDocument()
  })

  it('sin ninguna pareja calculable lo dice, con el mínimo exigido', () => {
    pintar(<PairsBlock pairs={[]} labels={ETIQUETAS} minObservations={30} unavailablePairs={3} />)
    expect(screen.getByText(/al menos 30 días en común/)).toBeInTheDocument()
  })
})

/* ── El número nunca sin su definición ────────────────────────────────────── */

describe('qué pasa cuando el mercado cae', () => {
  const empeora: DownsideDependency = {
    a: 'a',
    b: 'b',
    overall: 0.4,
    downside: 0.88,
    downsideObservations: 96,
    observations: 240,
    condition: DOWNSIDE_CONDITION,
    worsensInDrawdown: true,
  }

  it('enseña los dos números juntos, para poder compararlos', () => {
    pintar(<DownsideBlock items={[empeora]} labels={ETIQUETAS} />)
    const fila = screen.getByRole('row', { name: /AAPL y MSFT/ })
    expect(within(fila).getByText('0,40')).toBeInTheDocument()
    expect(within(fila).getByText('0,88')).toBeInTheDocument()
  })

  it('la definición de «día malo» aparece junto al número', () => {
    pintar(<DownsideBlock items={[empeora]} labels={ETIQUETAS} />)
    expect(screen.getByText(DOWNSIDE_CONDITION)).toBeInTheDocument()
  })

  it('avisa cuando el reparto se deshace justo en las caídas', () => {
    pintar(<DownsideBlock items={[empeora]} labels={ETIQUETAS} />)
    expect(screen.getByText(/arruina una cartera que parecía repartida/)).toBeInTheDocument()
  })

  it('sin días malos suficientes no se enseña ninguna cifra', () => {
    pintar(
      <DownsideBlock
        items={[{ ...empeora, downside: null, worsensInDrawdown: false, reason: 'insufficient_downside_sample' }]}
        labels={ETIQUETAS}
      />,
    )
    expect(screen.getByText(/sin inventar/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

/* ── El criterio de aceptación de LAB-413 ─────────────────────────────────── */

describe('la matriz se puede leer sin ver color', () => {
  it('cada casilla lleva su número impreso, no solo un tono', () => {
    pintar(<MatrixBlock matrix={MATRIZ} order={['a', 'b', 'c']} />)
    // El mapa de calor y su alternativa textual son el mismo objeto.
    expect(screen.getAllByText('0,93').length).toBeGreaterThan(0)
    expect(screen.getAllByText('-0,12').length).toBeGreaterThan(0)
  })

  it('una casilla sin dato no aparece como cero', () => {
    pintar(<MatrixBlock matrix={MATRIZ} order={['a', 'b', 'c']} />)
    expect(screen.getByText(/nunca un cero/)).toBeInTheDocument()
  })

  it('con menos de dos activos no se dibuja una matriz de una casilla', () => {
    const { container } = pintar(
      <MatrixBlock matrix={{ ...MATRIZ, ids: ['a'], cells: [] }} order={['a']} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('se ordena por grupos, para que los bloques se vean juntos', () => {
    pintar(<MatrixBlock matrix={MATRIZ} order={['c', 'a', 'b']} />)
    expect(screen.getByText(/Ordenada por grupos/)).toBeInTheDocument()
  })
})
