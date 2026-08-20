import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    // Quince desde LAB-905, que añade el historial de cálculos.
    expect(RUTAS_ESTATICAS).toHaveLength(15)
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
    // Estrés sigue siendo portada. Dependencia dejó de serlo en LAB-413: se
    // cambia de ruta en vez de aflojar la prueba, porque lo que comprueba
    // —que una pantalla sin construir no enseña números— sigue haciendo falta.
    montarEn(labPath('lab.stability.stress'))
    expect(screen.getByText('Pruebas de estrés todavía no está construido.')).toBeInTheDocument()
    expect(
      screen.getByText(/las métricas de estabilidad, con paridad demostrada/),
    ).toBeInTheDocument()
  })

  it('Dependencia ya no es una portada: mide de verdad (LAB-413)', () => {
    montarEn(labPath('lab.stability.dependence'))
    expect(screen.queryByText(/todavía no está construido/)).not.toBeInTheDocument()
    // Sin cartera montada enseña su estado vacío, que también es contenido
    // real: dice qué hace falta en vez de «todavía no está construido».
    expect(
      screen.getByText('Hacen falta al menos dos posiciones con historial'),
    ).toBeInTheDocument()
  })

  it('Riesgo ya no es una portada: muestra la pantalla migrada (LAB-105)', () => {
    montarEn(labPath('lab.stability.risk'))
    expect(screen.queryByText(/todavía no está construido/)).not.toBeInTheDocument()
    expect(screen.getByText(/versión actual del análisis de riesgo/)).toBeInTheDocument()
  })

  it('Escenarios pasa a ser el motor con supuestos declarados (LAB-508)', () => {
    montarEn(labPath('lab.future.scenarios'))
    expect(screen.queryByText(/todavía no está construido/)).not.toBeInTheDocument()
    // Sin cartera valorada enseña qué hace falta, que es contenido real: un
    // escenario aplica un supuesto sobre algo, y sin ese algo no hay escenario.
    expect(screen.getByText('Hace falta una cartera valorada')).toBeInTheDocument()
  })

  it('Escenarios conserva el simulador de aportaciones (LAB-107)', () => {
    // `/simular` redirige aquí desde LAB-107. El motor de escenarios no cubre
    // las aportaciones hipotéticas, así que quitarlo rompería un recorrido que
    // G1 declaró disponible.
    montarEn(labPath('lab.future.scenarios'))
    // El encabezado «Simular» solo sale en su propia ruta; dentro del
    // Laboratorio el contenido se reconoce por sus tarjetas.
    expect(screen.getByText('Escenarios de estrés')).toBeInTheDocument()
  })

  it('Exposición no es una portada: exposición real y el reparto de siempre (LAB-409)', () => {
    montarEn(labPath('lab.stability.exposure'))
    expect(screen.queryByText(/todavía no está construido/)).not.toBeInTheDocument()
    // Desde LAB-409 la pantalla añade la exposición real mirando dentro de los
    // fondos, pero **conserva** el reparto clásico: `/diversificacion` redirige
    // aquí desde LAB-108 y quitarlo rompería un recorrido que G1 declaró
    // disponible.
    expect(screen.getByText(/mirar por dentro/)).toBeInTheDocument()
    expect(screen.getByText('Sin posiciones valoradas')).toBeInTheDocument()
  })

  it('la portada ya no es un placeholder: presenta las dos mitades (LAB-109)', () => {
    montarEn('/laboratorio')
    expect(screen.queryByText(/todavía no está construido/)).not.toBeInTheDocument()
    expect(screen.getByText('¿Qué tengo y qué puede hacerme daño?')).toBeInTheDocument()
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

describe('LabSection · la capacidad declarada se hace cumplir (LAB-1013)', () => {
  // `vi.stubEnv` es estado global: se restaura siempre.
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const EXPOSICION = labPath('lab.stability.exposure')

  it('con la capacidad publicada se muestra la pantalla real', () => {
    vi.stubEnv('VITE_LAB_FLAGS', 'labShell,labLookThrough')
    montarEn(EXPOSICION)
    expect(screen.queryByText(/no está disponible en esta versión/)).not.toBeInTheDocument()
  })

  it('con la capacidad apagada se muestra la portada, no la pantalla', () => {
    // Este era el hueco: el campo `feature` estaba declarado en el catálogo de
    // rutas y no lo leía nadie, así que apagar `labLookThrough` en el workflow
    // no ocultaba nada. La lista de capacidades del despliegue decía una cosa y
    // la aplicación hacía otra.
    vi.stubEnv('VITE_LAB_FLAGS', 'labShell')
    montarEn(EXPOSICION)
    expect(screen.getByText(/no está disponible en esta versión/)).toBeInTheDocument()
  })

  it('la ruta sigue montada y con su shell: apagar no es un 404', () => {
    vi.stubEnv('VITE_LAB_FLAGS', 'labShell')
    montarEn(EXPOSICION)
    expect(screen.getByTestId('ruta-actual')).toHaveTextContent(EXPOSICION)
    expect(
      screen.getByRole('heading', { level: 1, name: LAB_ROUTES['lab.stability.exposure'].title }),
    ).toBeInTheDocument()
  })

  it('una pantalla que aún no existe sigue diciendo que no está construida', () => {
    // No es lo mismo «apagada» que «sin construir», y decírselo mal a quien
    // espera la Fase 8 le haría esperar algo que no viene por ese camino.
    vi.stubEnv('VITE_LAB_FLAGS', 'labShell,labCompanyResearch')
    montarEn(labPath('lab.future.companies'))
    expect(screen.getByText(/todavía no está construido/)).toBeInTheDocument()
  })

  it('sin capacidad declarada, la ruta no depende de ninguna bandera', () => {
    vi.stubEnv('VITE_LAB_FLAGS', 'labShell')
    montarEn(labPath('lab.runs'))
    expect(screen.queryByText(/no está disponible en esta versión/)).not.toBeInTheDocument()
  })
})
