import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LabSection } from './LabSection'
import { LAB_ROUTES, LAB_ROUTE_IDS, labPath, type LabRouteId } from './routes/labRoutes'

function SondaDeRuta() {
  const location = useLocation()
  return <span data-testid="ruta-actual">{location.pathname}</span>
}

/** Monta la sección como lo hace `App`: anidada bajo `/laboratorio/*`. */
function montarEn(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/laboratorio/*" element={<LabSection />} />
        <Route path="/resumen" element={<span>Resumen de la aplicación</span>} />
      </Routes>
      <SondaDeRuta />
    </MemoryRouter>,
  )
}

/** Rutas sin parámetros dinámicos: se navegan por su path tal cual. */
const RUTAS_ESTATICAS = LAB_ROUTE_IDS.filter((id) => LAB_ROUTES[id].param === undefined)

describe('LabSection · navegación directa', () => {
  it('cada ruta estática se abre por su URL y muestra su título', () => {
    expect(RUTAS_ESTATICAS).toHaveLength(14)
    for (const id of RUTAS_ESTATICAS) {
      const { unmount } = montarEn(labPath(id))
      expect(
        screen.getByRole('heading', { level: 1, name: LAB_ROUTES[id].title }),
      ).toBeInTheDocument()
      unmount()
    }
  })

  it('resuelve las rutas con parámetro', () => {
    montarEn(labPath('lab.run', { runId: 'abc123' }))
    expect(
      screen.getByRole('heading', { level: 1, name: LAB_ROUTES['lab.run'].title }),
    ).toBeInTheDocument()
  })

  it('la portada responde en la raíz de la sección', () => {
    montarEn('/laboratorio')
    expect(screen.getByRole('heading', { level: 1, name: 'Laboratorio' })).toBeInTheDocument()
  })
})

describe('LabSection · rutas desconocidas', () => {
  it('una subruta inexistente vuelve a la portada del Laboratorio, no a la de la app', () => {
    montarEn('/laboratorio/no-existe')
    expect(screen.getByTestId('ruta-actual')).toHaveTextContent('/laboratorio')
    expect(screen.getByRole('heading', { level: 1, name: 'Laboratorio' })).toBeInTheDocument()
    expect(screen.queryByText('Resumen de la aplicación')).not.toBeInTheDocument()
  })
})

describe('LabSection · portadas informativas', () => {
  it('dice que la pantalla no está construida, sin mostrar cifras', () => {
    montarEn(labPath('lab.stability.dependence'))
    expect(
      screen.getByText('Correlaciones, clusters y factores todavía no está construido.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/las métricas de estabilidad, con paridad demostrada/),
    ).toBeInTheDocument()
  })

  it('Riesgo ya no es una portada: muestra la pantalla migrada (LAB-105)', () => {
    montarEn(labPath('lab.stability.risk'))
    expect(screen.queryByText(/todavía no está construido/)).not.toBeInTheDocument()
    expect(screen.getByText(/versión actual del análisis de riesgo/)).toBeInTheDocument()
  })

  it('Exposición tampoco es una portada: muestra Diversificación (LAB-106)', () => {
    montarEn(labPath('lab.stability.exposure'))
    expect(screen.queryByText(/todavía no está construido/)).not.toBeInTheDocument()
    expect(screen.getByText(/versión actual del reparto de la cartera/)).toBeInTheDocument()
  })

  it('la portada del Laboratorio no promete una fase concreta', () => {
    montarEn('/laboratorio')
    expect(screen.getByText('Laboratorio todavía no está construido.')).toBeInTheDocument()
    expect(screen.queryByText(/Esta pantalla llega con/)).not.toBeInTheDocument()
  })

  it('toda ruta estática mantiene la shell alrededor', () => {
    for (const id of RUTAS_ESTATICAS as LabRouteId[]) {
      const { unmount } = montarEn(labPath(id))
      expect(screen.getByRole('navigation', { name: 'Ruta' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Contexto del análisis' })).toBeInTheDocument()
      unmount()
    }
  })
})
