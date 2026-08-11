import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../../state/store'
import { LabHomePage } from './LabHomePage'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/laboratorio']}>
      <LabHomePage />
    </MemoryRouter>,
  )
}

/** Deja el store como una instalación recién estrenada. */
function vaciarCartera() {
  useAppStore.setState({ assets: [], accounts: [], transactions: [], quotes: {}, fxRates: [], demoLoaded: false })
}

describe('portada del Laboratorio', () => {
  beforeEach(() => {
    vaciarCartera()
  })

  it('presenta las dos mitades con su pregunta', () => {
    const { container } = montar()
    // Acotado a la tarjeta: la shell ya expone sus propios enlaces de área.
    const mundos = container.querySelector('.lab-mundos')
    expect(mundos).not.toBeNull()
    const dentro = within(mundos as HTMLElement)

    expect(dentro.getAllByRole('link')).toHaveLength(2)
    expect(dentro.getByText('¿Qué tengo y qué puede hacerme daño?')).toBeInTheDocument()
    expect(dentro.getByText('¿Qué decisiones merece la pena estudiar?')).toBeInTheDocument()
  })

  it('sin cartera ofrece demo, importar y alta manual, y no enseña ninguna cifra', () => {
    const { container } = montar()

    expect(screen.getByText('Todavía no hay nada que analizar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'cargar datos de demostración' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'importar la tuya' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'añadir posiciones a mano' })).toBeInTheDocument()

    // Criterio de aceptación: sin datos no puede aparecer ningún número.
    const zonaDeEstado = container.querySelector('.card')
    expect(zonaDeEstado?.textContent ?? '').not.toMatch(/\d/)
  })

  it('con cartera, las cifras que muestra salen de la cartera', () => {
    useAppStore.getState().loadDemoData()
    montar()

    const posiciones = useAppStore.getState().assets.length
    expect(posiciones).toBeGreaterThan(0)
    // Se busca dentro del contenido, no en toda la página: desde LAB-213 la
    // cabecera de contexto también dice cuántas posiciones hay, y las dos
    // apariciones son legítimas.
    expect(
      within(screen.getByRole('main')).getByText(new RegExp(`${posiciones} posiciones`)),
    ).toBeInTheDocument()
    expect(screen.queryByText('Todavía no hay nada que analizar')).not.toBeInTheDocument()
  })

  it('no insinúa hallazgos que todavía no se calculan', () => {
    montar()
    expect(screen.getByText(/esta portada no muestra hallazgos/)).toBeInTheDocument()
  })
})
