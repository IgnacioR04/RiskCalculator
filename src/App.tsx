import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppShell } from './components/shell/AppShell'
import { RedireccionLegacy } from './features/lab/components/RedireccionLegacy'
import { isFeatureEnabled } from './lib/features/flags'
import { lazyWithReload } from './lib/lazyChunk'

/* Carga diferida por página: mantiene el build dividido por rutas. */
const ResumenPage = lazyWithReload(() =>
  import('./pages/ResumenPage').then((module) => ({ default: module.ResumenPage })),
)
const CalculadoraPage = lazyWithReload(() =>
  import('./pages/CalculadoraPage').then((module) => ({ default: module.CalculadoraPage })),
)
const PortfolioPage = lazyWithReload(() =>
  import('./pages/PortfolioPage').then((module) => ({ default: module.PortfolioPage })),
)
const RiesgoPage = lazyWithReload(() =>
  import('./pages/RiesgoPage').then((module) => ({ default: module.RiesgoPage })),
)
const DiversificacionPage = lazyWithReload(() =>
  import('./pages/DiversificacionPage').then((module) => ({ default: module.DiversificacionPage })),
)
const SimularPage = lazyWithReload(() =>
  import('./pages/SimularPage').then((module) => ({ default: module.SimularPage })),
)
const ImportarPage = lazyWithReload(() =>
  import('./pages/ImportarPage').then((module) => ({ default: module.ImportarPage })),
)
const PerfilPage = lazyWithReload(() =>
  import('./pages/PerfilPage').then((module) => ({ default: module.PerfilPage })),
)
/* El Laboratorio entero viaja en un chunk aparte: no toca el arranque de la
   aplicación mientras la capacidad esté apagada. */
const LabSection = lazyWithReload(() =>
  import('./features/lab/LabSection').then((module) => ({ default: module.LabSection })),
)

export function App() {
  const location = useLocation()
  // Capacidad, no autorización: decide si el Laboratorio se muestra. Apagada,
  // sus rutas no existen y un enlace guardado aterriza en el resumen.
  const laboratorioVisible = isFeatureEnabled('labShell')

  return (
    <AppShell>
      {/* Boundary por ruta: si una página lanza, la shell (navegación, divisa)
          sigue usable y al navegar a otra ruta el error se descarta solo.
          El boundary de main.tsx queda como última red para la propia shell. */}
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<div className="route-loading">Cargando…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/resumen" replace />} />
            <Route path="/resumen" element={<ResumenPage />} />
            <Route path="/calculadora" element={<CalculadoraPage />} />
            <Route path="/cartera" element={<PortfolioPage />} />
            {/* Las tres herramientas migradas conservan su URL: con el
                Laboratorio activo redirigen a su nuevo sitio; con la capacidad
                apagada siguen sirviendo la pantalla de siempre. */}
            <Route
              path="/riesgo"
              element={
                laboratorioVisible ? (
                  <RedireccionLegacy destino="lab.stability.risk" />
                ) : (
                  <RiesgoPage />
                )
              }
            />
            <Route
              path="/diversificacion"
              element={
                laboratorioVisible ? (
                  <RedireccionLegacy destino="lab.stability.exposure" />
                ) : (
                  <DiversificacionPage />
                )
              }
            />
            <Route
              path="/simular"
              element={
                laboratorioVisible ? (
                  <RedireccionLegacy destino="lab.future.scenarios" />
                ) : (
                  <SimularPage />
                )
              }
            />
            <Route path="/importar" element={<ImportarPage />} />
            <Route path="/perfil" element={<PerfilPage />} />
            <Route
              path="/laboratorio/*"
              element={laboratorioVisible ? <LabSection /> : <Navigate to="/resumen" replace />}
            />

            {/* Rutas anteriores: se conservan para no romper enlaces guardados. */}
            <Route path="/portfolio" element={<Navigate to="/cartera" replace />} />
            <Route path="/escenarios" element={<Navigate to="/simular" replace />} />

            <Route path="*" element={<Navigate to="/resumen" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
}
