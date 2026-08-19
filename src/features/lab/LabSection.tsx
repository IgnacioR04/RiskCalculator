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
import { LAB_ROUTE_IDS, LAB_ROUTES, labRelativePath, type LabRouteId } from './routes/labRoutes'

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
}

export function LabSection() {
  return (
    <Routes>
      {LAB_ROUTE_IDS.map((id) => (
        <Route
          key={id}
          path={labRelativePath(id)}
          element={PANTALLAS[id] ?? <LabPlaceholderPage routeId={id} />}
        />
      ))}
      {/* Una subruta desconocida vuelve a la portada del Laboratorio, no a la
          de la aplicación: el usuario sigue donde quería estar. */}
      <Route path="*" element={<Navigate to={LAB_ROUTES['lab.home'].path} replace />} />
    </Routes>
  )
}

export default LabSection
