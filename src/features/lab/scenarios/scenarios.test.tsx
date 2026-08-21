/**
 * Pruebas de la pantalla de Escenarios (LAB-508).
 *
 * Los bloques son puros: se prueban con un objeto fijo. La regla que más
 * importa comprobar es que **ningún número se enseña sin sus supuestos**.
 */
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { ScenarioResult } from '../../../lib/lab/scenarios/contracts'
import type { SensitivityResult } from '../../../lib/lab/scenarios/scenarioSensitivity'
import {
  AssumptionsBlock,
  ContributionsBlock,
  ScenarioOutcomeBlock,
  ScenarioPicker,
  SensitivityBlock,
} from './ScenarioBlocks'
import { builtinDeterministicScenarios } from '../../../lib/lab/scenarios/deterministicScenario'

const RESULTADO: ScenarioResult = {
  definitionId: 'recesion',
  definitionVersion: 1,
  modelVersion: 'scenario-deterministic-v1',
  asOf: '2026-08-12',
  baseValue: 10_000,
  baseCurrency: 'EUR',
  outcome: { finalValue: 6_500, changePct: -0.35 },
  contributions: [
    { assetId: 'btc', symbol: 'BTC', before: 4000, after: 1400, shareOfChange: 0.74 },
    { assetId: 'aapl', symbol: 'AAPL', before: 6000, after: 5100, shareOfChange: 0.26 },
  ],
  assumptions: [
    { label: 'La cartera no reacciona', detail: 'Nadie vende ni rebalancea durante el golpe.' },
  ],
  notCovered: [],
}

const SENSIBILIDAD: SensitivityResult = {
  baseChangePct: -0.35,
  drivers: [
    {
      label: 'Shock de cripto',
      path: 'params.byType.crypto',
      baseValue: -0.65,
      points: [
        { factor: 0.5, value: -0.325, changePct: -0.22 },
        { factor: 0.75, value: -0.4875, changePct: -0.28 },
        { factor: 1, value: -0.65, changePct: -0.35 },
        { factor: 1.5, value: -0.975, changePct: -0.48 },
        { factor: 2, value: -1, changePct: -0.5 },
      ],
      swing: 0.28,
    },
  ],
  runs: 5,
  limitations: ['Se varía un supuesto cada vez: no se ven las interacciones.'],
}

const pintar = (nodo: React.ReactElement) => render(<MemoryRouter>{nodo}</MemoryRouter>)

describe('el resultado', () => {
  it('enseña el cambio y el antes y el después', () => {
    pintar(<ScenarioOutcomeBlock result={RESULTADO} name="Recesión" />)
    expect(screen.getByText('-35,0 %')).toBeInTheDocument()
    expect(screen.getByText(/De 10\.000,00/)).toBeInTheDocument()
  })

  it('lo que se quedó fuera se nombra en vez de omitirse', () => {
    pintar(
      <ScenarioOutcomeBlock
        result={{ ...RESULTADO, notCovered: ['XYZ: sin valoración'] }}
        name="Recesión"
      />,
    )
    expect(screen.getByText(/XYZ: sin valoración/)).toBeInTheDocument()
    expect(screen.getByText(/No se cuentan como si no se movieran/)).toBeInTheDocument()
  })

  it('cuando el escenario no cubre toda la cartera, lo dice', () => {
    pintar(<ScenarioOutcomeBlock result={RESULTADO} name="COVID" coverage={0.6} />)
    expect(screen.getByText(/60 % de la cartera que tiene historial/)).toBeInTheDocument()
  })

  it('sin resultado calculable no se enseña un cero', () => {
    pintar(
      <ScenarioOutcomeBlock
        result={{ ...RESULTADO, outcome: { finalValue: null, changePct: null } }}
        name="COVID"
      />,
    )
    expect(screen.getByText(/No se ha podido calcular/)).toBeInTheDocument()
    expect(screen.queryByText('0,0 %')).toBeNull()
  })
})

describe('ningún número viaja sin sus supuestos', () => {
  it('los supuestos se enseñan con su detalle', () => {
    pintar(<AssumptionsBlock assumptions={RESULTADO.assumptions} />)
    expect(screen.getByText('La cartera no reacciona')).toBeInTheDocument()
    expect(screen.getByText(/Nadie vende ni rebalancea/)).toBeInTheDocument()
  })

  it('el bloque se titula por lo que hace, no por lo que es', () => {
    pintar(<AssumptionsBlock assumptions={RESULTADO.assumptions} />)
    expect(screen.getByText('De qué depende este número')).toBeInTheDocument()
  })
})

describe('de dónde sale el golpe', () => {
  it('cada posición enseña su antes, su después y su parte', () => {
    pintar(<ContributionsBlock result={RESULTADO} />)
    const fila = screen.getByRole('row', { name: /BTC/ })
    expect(within(fila).getByText('74 %')).toBeInTheDocument()
  })

  it('el que más pierde va primero', () => {
    pintar(<ContributionsBlock result={RESULTADO} />)
    const filas = screen.getAllByRole('row').slice(1)
    expect(within(filas[0]!).getByText('BTC')).toBeInTheDocument()
  })

  it('sin reparto conocido se escribe una raya, no un cero', () => {
    pintar(
      <ContributionsBlock
        result={{
          ...RESULTADO,
          contributions: [
            { assetId: 'a', symbol: 'AAPL', before: 100, after: 100, shareOfChange: null },
          ],
        }}
      />,
    )
    expect(within(screen.getByRole('row', { name: /AAPL/ })).getByText('—')).toBeInTheDocument()
  })
})

describe('qué supuesto manda', () => {
  it('enseña el resultado con el supuesto a la mitad, tal cual y al doble', () => {
    pintar(<SensitivityBlock sensitivity={SENSIBILIDAD} />)
    const fila = screen.getByRole('row', { name: /Shock de cripto/ })
    expect(within(fila).getByText('-22,0 %')).toBeInTheDocument()
    expect(within(fila).getByText('-50,0 %')).toBeInTheDocument()
  })

  it('nombra el supuesto que más manda, y avisa de lo que implica', () => {
    pintar(<SensitivityBlock sensitivity={SENSIBILIDAD} />)
    expect(screen.getByText(/el número entero lo es/)).toBeInTheDocument()
  })

  it('declara lo que el análisis no ve', () => {
    pintar(<SensitivityBlock sensitivity={SENSIBILIDAD} />)
    expect(screen.getByText(/no se ven las interacciones/)).toBeInTheDocument()
  })

  it('sin supuestos que variar no se enseña una tabla vacía', () => {
    const { container } = pintar(
      <SensitivityBlock sensitivity={{ ...SENSIBILIDAD, drivers: [] }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('un supuesto que no mueve nada no llena la tabla de ceros', () => {
    // El escenario «Corrección» trae shock de materias primas; quien no tiene
    // materias primas vería una fila entera de ceros que no informa de nada.
    const conInerte = {
      ...SENSIBILIDAD,
      drivers: [
        ...SENSIBILIDAD.drivers,
        {
          label: 'Shock de materias primas',
          path: 'params.byType.commodity',
          baseValue: -0.06,
          points: SENSIBILIDAD.drivers[0]!.points.map((p) => ({ ...p, changePct: -0.35 })),
          swing: 0,
        },
      ],
    }
    pintar(<SensitivityBlock sensitivity={conInerte} />)

    expect(screen.queryByRole('row', { name: /materias primas/ })).toBeNull()
    // Pero no desaparece en silencio: se cuenta y se explica por qué.
    expect(screen.getByText(/no afecta a tu cartera/)).toBeInTheDocument()
  })

  it('si todos los supuestos son inertes, no se enseña la tabla', () => {
    const { container } = pintar(
      <SensitivityBlock
        sensitivity={{
          ...SENSIBILIDAD,
          drivers: SENSIBILIDAD.drivers.map((d) => ({ ...d, swing: 0 })),
        }}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('elegir escenario', () => {
  const escenarios = builtinDeterministicScenarios()

  it('ofrece el catálogo de la aplicación', () => {
    pintar(
      <ScenarioPicker
        scenarios={escenarios}
        selectedId={escenarios[0]!.id}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Escenario' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(escenarios.length)
  })

  it('describe el escenario elegido, que ya se calcula al elegirlo', () => {
    pintar(
      <ScenarioPicker
        scenarios={escenarios}
        selectedId={escenarios[0]!.id}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText(escenarios[0]!.description!)).toBeInTheDocument()
  })
})
