import { lazy, Suspense } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { endDemoSession, getDemoSession } from './lib/demoAuth'
import { getSupabase } from './lib/supabase'

const ResumenPage = lazy(() =>
  import('./pages/ResumenPage').then((module) => ({ default: module.ResumenPage })),
)
const CalculadoraPage = lazy(() =>
  import('./pages/CalculadoraPage').then((module) => ({ default: module.CalculadoraPage })),
)
const PortfolioPage = lazy(() =>
  import('./pages/PortfolioPage').then((module) => ({ default: module.PortfolioPage })),
)
const EscenariosPage = lazy(() =>
  import('./pages/EscenariosPage').then((module) => ({ default: module.EscenariosPage })),
)
const ImportarPage = lazy(() =>
  import('./pages/ImportarPage').then((module) => ({ default: module.ImportarPage })),
)
const PerfilPage = lazy(() =>
  import('./pages/PerfilPage').then((module) => ({ default: module.PerfilPage })),
)

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
              const supabase = getSupabase()
              if (supabase !== null) {
                void supabase.auth.signOut().finally(() => window.location.reload())
              } else {
                window.location.reload()
              }
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
        <Suspense fallback={<div className="route-loading">Cargando…</div>}>
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
        </Suspense>
      </main>
      <footer className="disclaimer">
        RiskCalculator ofrece cálculos y análisis con fines educativos. No es asesoramiento
        financiero, no recomienda comprar ni vender y no predice precios. Los datos de mercado
        pueden ser demorados o estimados.
      </footer>
    </div>
  )
}
