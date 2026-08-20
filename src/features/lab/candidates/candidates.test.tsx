/**
 * Pruebas de la pantalla de Carteras candidatas (LAB-612).
 *
 * El criterio de aceptación: **no hay ninguna candidata preseleccionada como la
 * mejor**. Una aplicación que preselecciona está recomendando aunque escriba
 * debajo que no recomienda.
 */
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CandidateMetrics } from '../../../lib/lab/candidates/evaluateCandidate'
import type { RobustnessReport } from '../../../lib/lab/candidates/candidateRobustness'
import type { FeasibilityReport } from '../../../lib/lab/candidates/constraintFeasibility'
import type { CoverageIssue } from '../../../lib/lab/candidates/constraintCompiler'
import {
  CandidateComparisonTable,
  CandidateStabilityPanel,
  CoverageBlock,
  InfeasibleBlock,
  WeightsTable,
} from './CandidateBlocks'

const pintar = (nodo: React.ReactElement) => render(<MemoryRouter>{nodo}</MemoryRouter>)

const metrica = (cambios: Partial<CandidateMetrics>): CandidateMetrics => ({
  method: 'current',
  label: 'Tu cartera actual',
  weights: [0.6, 0.4],
  volatility: 0.22,
  hhi: 0.52,
  effectivePositions: 1.92,
  maxWeight: 0.6,
  riskConcentration: 0.6,
  turnover: 0,
  cost: 0,
  costUnknown: [],
  violations: [],
  breaksHardConstraints: false,
  ...cambios,
})

const ACTUAL = metrica({})
const MINVAR = metrica({
  method: 'minimumVariance',
  label: 'Mínima varianza',
  weights: [0.3, 0.7],
  volatility: 0.15,
  turnover: 0.3,
  cost: 42,
})

const SIMBOLOS = ['AAPL', 'IWDA']

describe('nadie viene marcado como el mejor', () => {
  it('la tabla no destaca ninguna candidata', () => {
    pintar(
      <CandidateComparisonTable metrics={[ACTUAL, MINVAR]} currency="EUR" universeSymbols={SIMBOLOS} />,
    )
    expect(screen.queryByText(/recomendad/i)).toBeNull()
    expect(screen.queryByText(/la mejor opción/i)).toBeNull()
  })

  it('y se explica por qué no, en vez de callarlo', () => {
    pintar(
      <CandidateComparisonTable metrics={[ACTUAL, MINVAR]} currency="EUR" universeSymbols={SIMBOLOS} />,
    )
    expect(screen.getByText(/depende de cosas que esta aplicación no sabe de ti/)).toBeInTheDocument()
  })

  it('la cartera actual aparece como una fila más', () => {
    pintar(
      <CandidateComparisonTable metrics={[ACTUAL, MINVAR]} currency="EUR" universeSymbols={SIMBOLOS} />,
    )
    expect(screen.getByRole('row', { name: /Tu cartera actual/ })).toBeInTheDocument()
  })
})

describe('la comparación', () => {
  it('enseña volatilidad, concentración y rotación de cada una', () => {
    pintar(
      <CandidateComparisonTable metrics={[ACTUAL, MINVAR]} currency="EUR" universeSymbols={SIMBOLOS} />,
    )
    const fila = screen.getByRole('row', { name: /Mínima varianza/ })
    expect(within(fila).getByText('15,0 %')).toBeInTheDocument()
    expect(within(fila).getByText('30 %')).toBeInTheDocument()
  })

  it('la actual no tiene rotación: ya estás en ella', () => {
    pintar(<CandidateComparisonTable metrics={[ACTUAL]} currency="EUR" universeSymbols={SIMBOLOS} />)
    expect(within(screen.getByRole('row', { name: /Tu cartera actual/ })).getByText('—')).toBeInTheDocument()
  })

  it('un coste desconocido dice «No se sabe», nunca cero', () => {
    const sinCoste = metrica({
      method: 'equalWeight',
      label: 'A partes iguales',
      cost: null,
      costUnknown: ['AAPL: no se conoce el precio de compra.'],
    })
    pintar(<CandidateComparisonTable metrics={[sinCoste]} currency="EUR" universeSymbols={SIMBOLOS} />)
    expect(screen.getByText('No se sabe')).toBeInTheDocument()
    expect(screen.getByText(/«No se sabe» no es cero/)).toBeInTheDocument()
  })

  it('una candidata que incumple lo lleva escrito en su fila', () => {
    const mala = metrica({
      method: 'equalWeight',
      label: 'A partes iguales',
      violations: ['tech entre 0 % y 30 %'],
      breaksHardConstraints: true,
    })
    pintar(<CandidateComparisonTable metrics={[mala]} currency="EUR" universeSymbols={SIMBOLOS} />)
    expect(screen.getByText(/Incumple: tech entre 0 % y 30 %/)).toBeInTheDocument()
  })

  it('los pesos se enseñan posición a posición', () => {
    pintar(<WeightsTable metrics={[ACTUAL, MINVAR]} currency="EUR" universeSymbols={SIMBOLOS} />)
    const fila = screen.getByRole('row', { name: /AAPL/ })
    expect(within(fila).getByText('60,0 %')).toBeInTheDocument()
    expect(within(fila).getByText('30,0 %')).toBeInTheDocument()
  })
})

describe('cuando no hay solución', () => {
  const infactible: FeasibilityReport = {
    feasible: false,
    problems: [
      {
        kind: 'minimums_exceed_total',
        bounds: ['asset:a', 'asset:b'],
        detail: 'Los mínimos exigen 140,0 % de la cartera, y solo hay un 100 % que repartir.',
        remediation: 'Baja alguno de los mínimos: sobran 40,0 %.',
      },
    ],
    limitations: ['Solo detecta contradicciones que se explican en una frase.'],
  }

  it('se dice que no existe, no que no se encuentre', () => {
    pintar(<InfeasibleBlock feasibility={infactible} />)
    expect(screen.getByText('Tus reglas no admiten ninguna cartera')).toBeInTheDocument()
    expect(screen.getByText(/no es que no se encuentre: es que no existe/i)).toBeInTheDocument()
  })

  it('se nombra el problema concreto y qué aflojar', () => {
    pintar(<InfeasibleBlock feasibility={infactible} />)
    expect(screen.getByText(/140,0 %/)).toBeInTheDocument()
    expect(screen.getByText(/sobran 40,0 %/)).toBeInTheDocument()
  })
})

describe('reglas que no se han podido comprobar', () => {
  const issues: CoverageIssue[] = [
    {
      reason: 'dimension_unknown',
      severity: 'blocking',
      constraint: 'groupWeight',
      detail: 'No se puede comprobar «region = europa»: ninguno de tus activos declara esa dimensión.',
      remediation: 'Rellena esa dimensión en tus activos, o quita la restricción.',
    },
  ]

  it('se nombran, con su remedio', () => {
    pintar(<CoverageBlock issues={issues} />)
    expect(screen.getByText(/region = europa/)).toBeInTheDocument()
    expect(screen.getByText(/Rellena esa dimensión/)).toBeInTheDocument()
  })

  it('se avisa de que las candidatas se han calculado sin ellas', () => {
    pintar(<CoverageBlock issues={issues} />)
    expect(screen.getByText(/se han calculado sin ellas/)).toBeInTheDocument()
  })

  it('sin problemas no se enseña un bloque vacío', () => {
    const { container } = pintar(<CoverageBlock issues={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('estabilidad de los pesos', () => {
  const robustez: RobustnessReport = {
    version: 'candidate-robustness-v1',
    seed: 20260820,
    repetitions: 100,
    discarded: 0,
    noise: 0.15,
    ranges: [
      {
        index: 0,
        symbol: 'AAPL',
        base: 0.3,
        min: 0.05,
        max: 0.55,
        median: 0.3,
        selectionRate: 1,
        stability: 'inestable',
      },
      {
        index: 1,
        symbol: 'IWDA',
        base: 0.7,
        min: 0.68,
        max: 0.72,
        median: 0.7,
        selectionRate: 1,
        stability: 'estable',
      },
    ],
    hasUnstableWeights: true,
    limitations: ['Se perturba la covarianza, no los datos que la produjeron.'],
  }

  it('enseña el rango de cada peso, no solo el número', () => {
    pintar(<CandidateStabilityPanel robustness={robustez} />)
    const fila = screen.getByRole('row', { name: /AAPL/ })
    expect(within(fila).getByText(/5 % – 55 %/)).toBeInTheDocument()
  })

  it('llama ruido a lo que es ruido', () => {
    pintar(<CandidateStabilityPanel robustness={robustez} />)
    expect(screen.getByText(/es ruido con muchos decimales/)).toBeInTheDocument()
  })

  it('la semilla y las repeticiones quedan a la vista, para poder repetirlo', () => {
    pintar(<CandidateStabilityPanel robustness={robustez} />)
    expect(screen.getByText(/100 repeticiones con semilla 20260820/)).toBeInTheDocument()
  })

  it('con todo estable no se inventa una advertencia', () => {
    pintar(
      <CandidateStabilityPanel
        robustness={{
          ...robustez,
          hasUnstableWeights: false,
          ranges: [robustez.ranges[1]!],
        }}
      />,
    )
    expect(screen.queryByText(/es ruido con muchos decimales/)).toBeNull()
  })

  it('sin análisis no se enseña un panel vacío', () => {
    const { container } = pintar(
      <CandidateStabilityPanel robustness={{ ...robustez, ranges: [] }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
