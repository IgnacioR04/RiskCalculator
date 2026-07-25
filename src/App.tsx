import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell/AppShell'
import { CalculadoraPage } from './pages/CalculadoraPage'
import { DiversificacionPage } from './pages/DiversificacionPage'
import { ImportarPage } from './pages/ImportarPage'
import { PerfilPage } from './pages/PerfilPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { ResumenPage } from './pages/ResumenPage'
import { RiesgoPage } from './pages/RiesgoPage'
import { SimularPage } from './pages/SimularPage'

export function App() {
  return (
    <AppShell>
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
    </AppShell>
  )
}
