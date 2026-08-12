/**
 * Pruebas de los bloques del análisis de estabilidad (LAB-307).
 *
 * ACEPTACIÓN: **cada componente se prueba con un objeto fijo**. Ninguna de
 * estas pruebas monta una cartera, descarga una serie ni toca el store: se
 * escribe el dato y se comprueba cómo se pinta. Eso es lo que el desmontaje
 * hacía posible y antes no lo era.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContributionBlock } from './ContributionBlock'
import { DiversificationBlock } from './DiversificationBlock'
import { PerAssetBlock } from './PerAssetBlock'
import { RelationsBlock } from './RelationsBlock'
import { StabilityKpis } from './StabilityKpis'
import type { AssetMetricRow, ContributionRow, DiversificationData } from './contracts'

describe('StabilityKpis', () => {
  const completo = {
    complete: true,
    volatility: 0.18,
    coverage: 0.92,
    twr: 0.07,
    commonDays: 240,
  }

  it('pinta las cuatro cifras del objeto', () => {
    render(<StabilityKpis data={completo} />)
    expect(screen.getByText('18,0 %')).toBeInTheDocument()
    expect(screen.getByText('92 %')).toBeInTheDocument()
    expect(screen.getByText('7,0 %')).toBeInTheDocument()
    expect(screen.getByText('240 días')).toBeInTheDocument()
  })

  it('con cobertura parcial no lo llama «volatilidad de cartera»', () => {
    render(<StabilityKpis data={{ ...completo, complete: false }} />)
    expect(screen.getByText('Volatilidad del segmento')).toBeInTheDocument()
    expect(screen.queryByText('Volatilidad de cartera')).toBeNull()
  })

  it('lo que no se pudo calcular se dice, no se pinta como cero', () => {
    render(<StabilityKpis data={{ ...completo, volatility: null, twr: null }} />)
    expect(screen.getByText('Datos insuf.')).toBeInTheDocument()
    expect(screen.getByText('No disp.')).toBeInTheDocument()
    expect(screen.queryByText('0,0 %')).toBeNull()
  })
})

describe('DiversificationBlock', () => {
  const datos: DiversificationData = {
    diversificationRatio: 1.35,
    volatilityReduction: 0.26,
    effectiveBets: 3.4,
    averageCorrelation: 0.42,
    weightedAverageVolatility: 0.24,
    portfolioVolatility: 0.178,
  }

  it('pinta las cuatro medidas con coma decimal', () => {
    render(<DiversificationBlock data={datos} />)
    expect(screen.getByText('1,35')).toBeInTheDocument()
    expect(screen.getByText('3,4')).toBeInTheDocument()
    expect(screen.getByText('0,42')).toBeInTheDocument()
    expect(screen.getByText('26,0 %')).toBeInTheDocument()
  })

  it('lo que no se pudo calcular es una raya, no un cero', () => {
    render(<DiversificationBlock data={{ ...datos, effectiveBets: null, averageCorrelation: null }} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('compara la volatilidad sin repartir con la real', () => {
    render(<DiversificationBlock data={datos} />)
    expect(screen.getByText('24,0 %')).toBeInTheDocument()
    expect(screen.getByText('17,8 %')).toBeInTheDocument()
  })
})

describe('ContributionBlock', () => {
  const filas: ContributionRow[] = [
    { assetId: 'a', symbol: 'AAA', weight: 0.2, contribution: 0.45 },
    { assetId: 'b', symbol: 'BBB', weight: 0.5, contribution: 0.2 },
    { assetId: 'c', symbol: 'CCC', weight: 0.3, contribution: 0.35 },
  ]

  it('enseña la diferencia entre lo que pesa y lo que aporta', () => {
    render(<ContributionBlock rows={filas} />)
    const fila = screen.getByRole('row', { name: /AAA/ })
    // Pesa 20 %, aporta 45 %: la diferencia es lo que este bloque existe para
    // enseñar.
    expect(within(fila).getByText('20,0 %')).toBeInTheDocument()
    expect(within(fila).getByText('45,0 %')).toBeInTheDocument()
    expect(within(fila).getByText('+25,0 %')).toBeInTheDocument()
  })

  it('una contribución menor que el peso se marca como amortiguador', () => {
    render(<ContributionBlock rows={filas} />)
    const fila = screen.getByRole('row', { name: /BBB/ })
    expect(within(fila).getByText('-30,0 %')).toHaveClass('positive')
  })

  it('una diferencia pequeña no se colorea: sería ruido', () => {
    render(<ContributionBlock rows={[{ assetId: 'x', symbol: 'XXX', weight: 0.3, contribution: 0.31 }]} />)
    const celda = screen.getByText('+1,0 %')
    expect(celda).not.toHaveClass('negative')
    expect(celda).not.toHaveClass('positive')
  })
})

describe('RelationsBlock', () => {
  const base = {
    labels: ['AAA', 'BBB'],
    correlation: [
      [1, 0.8],
      [0.8, 1],
    ],
    covariance: [
      [0.04, 0.02],
      [0.02, 0.05],
    ],
    insights: [],
    onKindChange: vi.fn(),
  }

  it('cambia el título según la matriz que se mire', () => {
    const { unmount } = render(<RelationsBlock {...base} kind="correlacion" />)
    expect(screen.getByText('Cómo se mueven entre sí')).toBeInTheDocument()
    unmount()

    render(<RelationsBlock {...base} kind="covarianza" />)
    expect(screen.getByText('Cuánto riesgo comparten')).toBeInTheDocument()
  })

  it('sin covarianza calculable lo dice en vez de pintar una matriz vacía', () => {
    render(<RelationsBlock {...base} covariance={null} kind="covarianza" />)
    expect(screen.getByText('Se necesitan al menos 30 retornos comunes.')).toBeInTheDocument()
  })

  it('muestra las conclusiones de pares cuando las hay', () => {
    render(
      <RelationsBlock
        {...base}
        kind="correlacion"
        insights={[{ kind: 'warning', text: 'AAA y BBB se han movido casi igual.' }]}
      />,
    )
    expect(screen.getByText('AAA y BBB se han movido casi igual.')).toBeInTheDocument()
  })
})

describe('PerAssetBlock', () => {
  const filas: AssetMetricRow[] = [
    {
      assetId: 'a',
      symbol: 'AAA',
      name: 'Activo A',
      provider: 'twelvedata',
      volatility: 0.22,
      maxDrawdown: 0.31,
      sharpe: 0.85,
      sortino: 1.12,
    },
    {
      assetId: 'b',
      symbol: 'BBB',
      name: 'Activo B',
      provider: 'coingecko',
      volatility: null,
      maxDrawdown: null,
      sharpe: null,
      sortino: null,
    },
  ]

  it('pinta las métricas del objeto fijo', () => {
    render(
      <PerAssetBlock rows={filas} benchmarkId="a" onBenchmarkChange={vi.fn()} benchmarkRows={[]} />,
    )
    const fila = screen.getByRole('row', { name: /AAA/ })
    expect(within(fila).getByText('22,0 %')).toBeInTheDocument()
    expect(within(fila).getByText('31,0 %')).toBeInTheDocument()
    expect(within(fila).getByText('0.85')).toBeInTheDocument()
  })

  it('lo que no se pudo calcular es una raya y nunca un cero', () => {
    render(
      <PerAssetBlock rows={filas} benchmarkId="a" onBenchmarkChange={vi.fn()} benchmarkRows={[]} />,
    )
    const fila = screen.getByRole('row', { name: /BBB/ })
    expect(within(fila).getAllByText('—')).toHaveLength(4)
    expect(within(fila).queryByText('0.00')).toBeNull()
  })

  it('la tabla de beta enseña siempre las observaciones', () => {
    render(
      <PerAssetBlock
        rows={filas}
        benchmarkId="a"
        onBenchmarkChange={vi.fn()}
        benchmarkRows={[
          { assetId: 'b', symbol: 'BBB', beta: 1.4, alpha: 0.03, r2: 0.6, observations: 45 },
        ]}
      />,
    )
    // Una beta sobre 45 dias y otra sobre 300 no son comparables, y el numero
    // es lo unico que lo dice.
    expect(screen.getByText('45')).toBeInTheDocument()
    expect(screen.getByText('1.40')).toBeInTheDocument()
  })

  it('sin benchmark no se inventa una tabla de comparacion', () => {
    render(
      <PerAssetBlock rows={filas} benchmarkId="" onBenchmarkChange={vi.fn()} benchmarkRows={[]} />,
    )
    expect(screen.queryByText('Alpha anual')).toBeNull()
  })
})
