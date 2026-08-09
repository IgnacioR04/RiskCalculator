/**
 * Portada mínima informativa de una pantalla del Laboratorio (LAB-103).
 *
 * Cada ruta existe ya y es navegable, pero su contenido lo construyen fases
 * posteriores. En vez de una pantalla en blanco —o, peor, de números de
 * relleno— se dice qué irá aquí. Es un estado vacío honesto, no un adelanto
 * simulado.
 */
import { LAB_FEATURES } from '../../../lib/features/flags'
import { LabShell } from '../components/LabShell'
import { LAB_ROUTES, type LabRouteId } from '../routes/labRoutes'

/** Qué construye cada fase, para explicar la espera sin prometer fechas. */
const OBJETIVO_POR_FASE: Readonly<Record<number, string>> = {
  1: 'la navegación del Laboratorio',
  2: 'la política de inversión y la calidad de los datos',
  3: 'las métricas de estabilidad, con paridad demostrada',
  4: 'la exposición real mirando dentro de los fondos',
  5: 'los escenarios',
  6: 'las carteras candidatas',
  7: 'los sectores para investigar',
  8: 'las empresas para investigar',
  9: 'las explicaciones y la trazabilidad',
}

export function LabPlaceholderPage(props: { routeId: LabRouteId }) {
  const ruta = LAB_ROUTES[props.routeId]
  // La fase la declara el catálogo de capacidades: aquí no se duplica.
  const fase = ruta.feature === undefined ? null : LAB_FEATURES[ruta.feature].phase
  const objetivo = fase === null ? undefined : OBJETIVO_POR_FASE[fase]

  return (
    <LabShell routeId={props.routeId}>
      <div className="lab-placeholder">
        <p>{ruta.title} todavía no está construido.</p>
        {objetivo !== undefined && (
          <p className="muted">
            Esta pantalla llega con {objetivo}. Hasta entonces no se muestra ningún dato
            aquí, porque cualquier cifra sería inventada.
          </p>
        )}
      </div>
    </LabShell>
  )
}
