import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoginGate } from './components/LoginGate'
import './styles/global.css'

// HashRouter: funciona igual en local, Vercel y GitHub Pages (subpath
// /RiskCalculator/) sin necesitar reescrituras del servidor ni 404.html.
//
// El router va POR ENCIMA de la puerta de acceso: así `LoginGate` sabe qué
// ruta se está pidiendo y puede dejar pasar las públicas, como el Laboratorio,
// sin dejar de inicializar la caché local ni la sesión en todas.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <LoginGate>
          <App />
        </LoginGate>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
)
