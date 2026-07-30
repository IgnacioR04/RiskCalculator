import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../state/store'
import { CalculadoraPage } from './CalculadoraPage'

/** Normaliza todo el espaciado (incluye NBSP de Intl es-ES) a espacio simple. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ')
}

function textMatcher(expected: string) {
  return (_content: string, element: Element | null): boolean =>
    element !== null &&
    element.children.length === 0 &&
    normalize(element.textContent ?? '').includes(expected)
}

function resetStore() {
  useAppStore.setState({
    settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
    accounts: [],
    assets: [],
    transactions: [],
    quotes: {},
    fxRates: [],
    scenarios: [],
    importBatches: [],
    riskProfile: null,
    riskResults: [],
    demoLoaded: false,
    cloudSync: {
      userId: null,
      email: null,
      status: 'local',
      message: 'Datos guardados en este dispositivo.',
      lastSyncedAt: null,
    },
  })
}

describe('CalculadoraPage', () => {
  beforeEach(() => {
    resetStore()
  })

  it('modo restaurar: caso de aceptación 1 con los valores por defecto', () => {
    const { container } = render(<CalculadoraPage />)
    // A = 5,24 € como cifra principal
    expect(screen.getAllByText(textMatcher('5,24 €')).length).toBeGreaterThan(0)
    // Capital total 105,24 € y advertencia de que no es equilibrio
    expect(screen.getAllByText(textMatcher('105,24 €')).length).toBeGreaterThan(0)
    expect(normalize(container.textContent ?? '')).toContain(
      'recuperar todo tu dinero',
    )
  })

  it('modo restaurar: muestra SIEMPRE las dos cifras y su diferencia', () => {
    // Invariante de producto: restaurar valor y equilibrio real nunca se
    // muestran por separado. Con C_ref=100, V=90, g=5 %:
    //   restaurar   = 100/1,05 − 90            = 5,24 €
    //   equilibrio  = (100 − 90·1,05)/0,05     = 110,00 €
    //   diferencia                             = 104,76 €
    const { container } = render(<CalculadoraPage />)
    const text = normalize(container.textContent ?? '')

    expect(screen.getAllByText(textMatcher('5,24 €')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(textMatcher('110,00 €')).length).toBeGreaterThan(0)
    expect(text).toContain('Punto de equilibrio real')
    expect(text).toContain('¿Por qué no coinciden?')
    expect(text).toContain('104,76 €')
    // Y no puede seguir remitiendo a otra pestaña para la segunda cifra.
    expect(text).not.toContain('usa la pestaña')
  })

  it('modo equilibrio: caso Bitcoin muestra 10,69 € y 165,71 € y explica la diferencia', async () => {
    const user = userEvent.setup()
    const { container } = render(<CalculadoraPage />)
    await user.click(screen.getByRole('radio', { name: 'Punto de equilibrio real' }))

    expect(await screen.findByText(textMatcher('10,69 €'))).toBeInTheDocument()
    expect(screen.getAllByText(textMatcher('165,71 €')).length).toBeGreaterThan(0)
    expect(normalize(container.textContent ?? '')).toContain('¿Por qué no coinciden?')
  })

  it('valida entradas no numéricas sin romper', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)
    const field = screen.getByLabelText('Valor actual de tu posición')
    await user.clear(field)
    await user.type(field, 'abc')
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
  })

  it('guarda el escenario y su resultado de cálculo enlazado', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)

    await user.click(screen.getByRole('button', { name: 'Guardar cálculo' }))

    const state = useAppStore.getState()
    expect(state.scenarios).toHaveLength(1)
    expect(state.riskResults).toHaveLength(1)
    expect(state.riskResults[0]).toMatchObject({
      resultType: 'calculator',
      sourceId: state.scenarios[0]!.id,
      inputs: expect.objectContaining({ mode: 'restore', currency: 'EUR' }),
      result: expect.objectContaining({
        contribution: '5.23809523809523809523809524',
        // El cálculo archivado guarda las dos cifras, no solo la mostrada.
        breakevenStatus: 'achievable',
        breakevenContribution: '110',
      }),
    })
  })
})
