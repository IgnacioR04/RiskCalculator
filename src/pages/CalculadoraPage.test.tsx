import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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

describe('CalculadoraPage', () => {
  it('modo restaurar: caso de aceptación 1 con los valores por defecto', () => {
    const { container } = render(<CalculadoraPage />)
    // A = 5,24 € como cifra principal
    expect(screen.getAllByText(textMatcher('5,24 €')).length).toBeGreaterThan(0)
    // Capital total 105,24 € y advertencia de que no es equilibrio
    expect(screen.getAllByText(textMatcher('105,24 €')).length).toBeGreaterThan(0)
    expect(normalize(container.textContent ?? '')).toContain(
      'significa recuperar todo tu dinero',
    )
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
})
