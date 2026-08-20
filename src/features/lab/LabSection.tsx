/**
 * Sección del Laboratorio (LAB-103).
 *
 * Declara las rutas anidadas bajo `/laboratorio/*` a partir del contrato de
 * LAB-101, de modo que añadir una pantalla sea añadir una entrada al catálogo
 * y nada más.
 *
 * Se carga como **un solo chunk diferido**. Partirlo en dieciséis no aportaría
 * nada mientras las pantallas son portadas informativas, y sí ensuciaría el
 * manifiesto; cuando una pantalla traiga su propio motor, se separa entonces.
 */
import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LabPlaceholderPage } from './pages/LabPlaceholderPage'
import { LabExposurePage } from './pages/LabExposurePage'
import { LabDependencyPage } from './pages/LabDependencyPage'
import { LabDataQualityPage } from './pages/LabDataQualityPage'
import { LabHomePage } from './pages/LabHomePage'
import { LabStabilitySummaryPage } from './pages/LabStabilitySummaryPage'
import { LabRiskLegacyPage } from './pages/LabRiskLegacyPage'
import { LabScenariosPage } from './pages/LabScenariosPage'
import { LabCandidatesPage } from './pages/LabCandidatesPage'
import { LabRepairPage } from './pages/LabRepairPage'
import { LabSectorsPage } from './pages/LabSectorsPage'
import { LabRunsPage } from './pages/LabRunsPage'
import { LAB_ROUTE_IDS, LAB_ROUTES, labRelativePath, type LabRouteId } from './routes/labRoutes'
import { isFeatureEnabled } from '../../lib/features/flags'

/**
 * Pantallas ya migradas. El resto muestra su portada informativa hasta que su
 * fase las construya.
 */
const PANTALLAS: Partial<Record<LabRouteId, ReactElement>> = {
  'lab.home': <LabHomePage />,
  'lab.stability': <LabStabilitySummaryPage />,
  'lab.stability.data': <LabDataQualityPage />,
  'lab.stability.risk': <LabRiskLegacyPage />,
  'lab.stability.exposure': <LabExposurePage />,
  'lab.stability.dependence': <LabDependencyPage />,
  'lab.future.scenarios': <LabScenariosPage />,
  'lab.future.candidates': <LabCandidatesPage />,
  'lab.future.repair': <LabRepairPage />,
  'lab.future.sectors': <LabSectorsPage />,
  'lab.runs': <LabRunsPage />,
}

/**
 * Una pantalla se muestra si está construida **y** su capacidad está publicada.
 *
 * Hasta LAB-1013 el campo `feature` del catálogo de rutas estaba declarado y no
 * lo leía nadie: apagar `labLookThrough` no ocultaba Exposición, así que la
 * lista de capacidades del despliegue decía una cosa y la aplicación hacía
 * otra. Aquí se hace cumplir, que es lo que hace reversible encender una
 * capacidad: si algo sale mal en producción, apagarla en `deploy-pages.yml`
 * ahora basta de verdad.
 *
 * Las rutas siguen montadas y siguen siendo navegables: la portada informativa
 * es un estado vacío honesto, y borrar el enlace dejaría al usuario con un 404
 * en un sitio donde ayer había algo.
 */
function pantallaDe(id: LabRouteId) {
  const construida = PANTALLAS[id]
  const capacidad = LAB_ROUTES[id].feature
  const publicada = capacidad === undefined || isFeatureEnabled(capacidad)
  if (construida !== undefined && publicada) return construida
  return <LabPlaceholderPage routeId={id} construida={construida !== undefined} />
}

export function LabSection() {
  return (
    <Routes>
      {LAB_ROUTE_IDS.map((id) => (
        <Route key={id} path={labRelativePath(id)} element={pantallaDe(id)} />
      ))}
      {/* Una subruta desconocida vuelve a la portada del Laboratorio, no a la
          de la aplicación: el usuario sigue donde quería estar. */}
      <Route path="*" element={<Navigate to={LAB_ROUTES['lab.home'].path} replace />} />
    </Routes>
  )
}

export default LabSection
