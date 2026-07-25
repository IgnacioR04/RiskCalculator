import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell/AppShell'
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

export function App() {
  return (
    <AppShell>
      <Suspense fallback={<div className="route-loading">Cargando…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/resumen" replace />} />
          <Route path="/resumen" element={<ResumenPage />} />
          <Route path="/calculadora" element={<CalculadoraPage />} />
          <Route path="/cartera" element={<PortfolioPage />} />
          <Route path="/riesgo" element={<RiesgoPage />} />
          <Route path="/diversificacion" element={<DiversificacionPage />} />
          <Route path="/simular" element={<SimularPage />} />
          <Route path="/importar" element={<ImportarPage />} />
          <Route path="/perfil" element={<PerfilPage />} />

          {/* Rutas anteriores: se conservan para no romper enlaces guardados. */}
          <Route path="/portfolio" element={<Navigate to="/cartera" replace />} />
          <Route path="/escenarios" element={<Navigate to="/simular" replace />} />

          <Route path="*" element={<Navigate to="/resumen" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
