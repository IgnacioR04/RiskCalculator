import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { labPath, type LabRouteId } from '../routes/labRoutes'
import { LabShell, type LabShellProps } from './LabShell'

/** Muestra la ruta actual para poder comprobar navegaciones. */
function SondaDeRuta() {
  const location = useLocation()
  return <span data-testid="ruta-actual">{location.pathname}</span>
}

function montar(props: Partial<LabShellProps> & { routeId: LabRouteId }) {
  return render(
    <MemoryRouter initialEntries={[labPath(props.routeId)]}>
      <LabShell {...props} />
      <SondaDeRuta />
    </MemoryRouter>,
  )
}

describe('LabShell · estructura y landmarks', () => {
  it('expone los landmarks de navegación y contenido', () => {
    montar({ routeId: 'lab.stability.risk' })

    expect(screen.getByRole('navigation', { name: 'Ruta' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Contexto del análisis' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Áreas del Laboratorio' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('titula la pantalla con el título de la ruta', () => {
    montar({ routeId: 'lab.stability.risk' })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Riesgo total y contribuciones' }),
    ).toBeInTheDocument()
  })

  it('muestra el contenido que recibe', () => {
    montar({ routeId: 'lab.home', children: <p>Contenido de prueba</p> })
    expect(screen.getByText('Contenido de prueba')).toBeInTheDocument()
  })
})

describe('LabShell · migas', () => {
  it('van de la portada a la ruta y solo la última es la actual', () => {
    montar({ routeId: 'lab.stability.risk' })
    const migas = screen.getByRole('navigation', { name: 'Ruta' })

    expect(within(migas).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Laboratorio',
      'Estabilidad',
      'Riesgo',
    ])
    // Los ancestros son enlaces; la ruta actual no.
    expect(within(migas).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Laboratorio',
      'Estabilidad',
    ])
    expect(within(migas).getByText('Riesgo')).toHaveAttribute('aria-current', 'page')
  })

  it('en la portada hay una sola miga y sin enlace', () => {
    montar({ routeId: 'lab.home' })
    const migas = screen.getByRole('navigation', { name: 'Ruta' })
    expect(within(migas).getAllByRole('listitem')).toHaveLength(1)
    expect(within(migas).queryAllByRole('link')).toHaveLength(0)
  })
})

describe('LabShell · áreas', () => {
  it('marca como actual solo el área de la ruta', () => {
    montar({ routeId: 'lab.future.scenarios' })
    const areas = screen.getByRole('navigation', { name: 'Áreas del Laboratorio' })

    const futuro = within(areas).getByRole('link', { name: /Escenarios y oportunidades/ })
    const estabilidad = within(areas).getByRole('link', { name: /Estabilidad/ })
    expect(futuro).toHaveAttribute('aria-current', 'page')
    expect(estabilidad).not.toHaveAttribute('aria-current')
  })

  it('ninguna área es la actual en rutas sin área', () => {
    montar({ routeId: 'lab.home' })
    const areas = screen.getByRole('navigation', { name: 'Áreas del Laboratorio' })
    for (const enlace of within(areas).getAllByRole('link')) {
      expect(enlace).not.toHaveAttribute('aria-current')
    }
  })
})

describe('LabShell · navegación secundaria', () => {
  it('lista las secciones del área y marca la actual', () => {
    montar({ routeId: 'lab.stability.stress' })
    const sub = screen.getByRole('navigation', { name: 'Secciones de Estabilidad' })

    const enlaces = within(sub).getAllByRole('link')
    expect(enlaces).toHaveLength(7)
    const actual = enlaces.filter((a) => a.getAttribute('aria-current') === 'page')
    expect(actual).toHaveLength(1)
    expect(actual[0]).toHaveTextContent('Estrés')
  })

  it('no hay navegación secundaria en rutas sin área', () => {
    montar({ routeId: 'lab.home' })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('el desplegable de móvil ofrece las mismas secciones y navega al elegir', async () => {
    const usuario = userEvent.setup()
    montar({ routeId: 'lab.stability' })

    const selector = screen.getByRole('combobox')
    expect(within(selector).getAllByRole('option')).toHaveLength(7)
    expect(selector).toHaveValue('lab.stability')

    await usuario.selectOptions(selector, 'lab.stability.stress')
    expect(screen.getByTestId('ruta-actual')).toHaveTextContent(
      '/laboratorio/estabilidad/estres',
    )
  })
})

describe('LabShell · cabecera de contexto', () => {
  it('declara los huecos sin dato en vez de inventarlos', () => {
    montar({ routeId: 'lab.home' })
    // Siete campos. Desde LAB-213 la moneda sí tiene fuente —sale de los
    // ajustes—, así que quedan seis huecos declarados en vez de inventados.
    expect(screen.getAllByText('No disponible')).toHaveLength(6)
    expect(screen.getByText('EUR')).toBeInTheDocument()
  })

  it('muestra los datos que sí existen', () => {
    montar({
      routeId: 'lab.home',
      context: {
        portfolioName: 'Mi cartera',
        asOf: '2026-08-09',
        currency: 'EUR',
        ipsStatus: 'incompleta',
        dataQuality: 'parcial',
      },
    })

    expect(screen.getByText('Mi cartera')).toBeInTheDocument()
    expect(screen.getByText('2026-08-09')).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.getByText('Incompleta')).toBeInTheDocument()
    expect(screen.getByText('Parcial')).toBeInTheDocument()
    // Los dos campos restantes siguen sin dato.
    expect(screen.getAllByText('No disponible')).toHaveLength(2)
  })

  it('no recalcula solo: avisa de que hay datos más recientes', () => {
    montar({ routeId: 'lab.home', hasFresherData: true, onRefresh: () => {} })
    expect(screen.getByRole('status')).toHaveTextContent('Hay datos más recientes')
  })

  it('el botón de actualizar queda deshabilitado si no hay acción', () => {
    montar({ routeId: 'lab.home' })
    expect(screen.getByRole('button', { name: 'Actualizar análisis' })).toBeDisabled()
  })

  it('el botón dispara la acción cuando existe', async () => {
    const usuario = userEvent.setup()
    const alActualizar = vi.fn()
    montar({ routeId: 'lab.home', onRefresh: alActualizar })

    await usuario.click(screen.getByRole('button', { name: 'Actualizar análisis' }))
    expect(alActualizar).toHaveBeenCalledTimes(1)
  })
})

describe('LabShell · teclado', () => {
  it('empieza por las migas y alcanza el botón y el desplegable', async () => {
    const usuario = userEvent.setup()
    montar({ routeId: 'lab.stability.risk', onRefresh: () => {} })

    await usuario.tab()
    expect(screen.getByRole('navigation', { name: 'Ruta' })).toContainElement(
      document.activeElement as HTMLElement,
    )

    const alcanzados: string[] = []
    for (let i = 0; i < 20; i++) {
      await usuario.tab()
      const activo = document.activeElement
      if (activo !== null && activo !== document.body) alcanzados.push(activo.tagName)
    }
    expect(alcanzados).toContain('BUTTON')
    expect(alcanzados).toContain('SELECT')
  })

  it('el botón deshabilitado queda fuera del orden de tabulación', async () => {
    const usuario = userEvent.setup()
    // Sin `onRefresh` no hay acción posible, así que el botón no debe robar
    // una parada del tabulador.
    montar({ routeId: 'lab.stability.risk' })

    const boton = screen.getByRole('button', { name: 'Actualizar análisis' })
    for (let i = 0; i < 20; i++) {
      await usuario.tab()
      expect(document.activeElement).not.toBe(boton)
    }
  })
})
