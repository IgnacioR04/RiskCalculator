import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { endDemoSession, getDemoSession } from './lib/demoAuth'
import { CalculadoraPage } from './pages/CalculadoraPage'
import { EscenariosPage } from './pages/EscenariosPage'
import { ImportarPage } from './pages/ImportarPage'
import { PerfilPage } from './pages/PerfilPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { ResumenPage } from './pages/ResumenPage'

const NAV_ITEMS = [
  { to: '/resumen', icon: '◉', label: 'Resumen' },
  { to: '/calculadora', icon: '∑', label: 'Calculadora' },
  { to: '/portfolio', icon: '▤', label: 'Portfolio' },
  { to: '/escenarios', icon: '⇄', label: 'Escenarios' },
  { to: '/importar', icon: '⬆', label: 'Importar' },
  { to: '/perfil', icon: '☰', label: 'Perfil' },
] as const

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/resumen" className="brand">
          Risk<span>Calculator</span>
        </NavLink>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {getDemoSession() !== null && (
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              {getDemoSession()}
            </span>
          )}
          <button
            type="button"
            className="btn small"
            onClick={() => {
              endDemoSession()
              window.location.reload()
            }}
          >
            Salir
          </button>
        </div>
      </header>
      <nav className="app-nav" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            <span className="icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/resumen" replace />} />
          <Route path="/resumen" element={<ResumenPage />} />
          <Route path="/calculadora" element={<CalculadoraPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/escenarios" element={<EscenariosPage />} />
          <Route path="/importar" element={<ImportarPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="*" element={<Navigate to="/resumen" replace />} />
        </Routes>
      </main>
      <footer className="disclaimer">
        RiskCalculator ofrece cálculos y análisis con fines educativos. No es asesoramiento
        financiero, no recomienda comprar ni vender y no predice precios. Los datos de mercado
        pueden ser demorados o estimados.
      </footer>
    </div>
  )
}
