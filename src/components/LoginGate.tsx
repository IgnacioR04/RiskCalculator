import { useState, type ReactNode } from 'react'
import {
  checkDemoCredentials,
  DEMO_HINT,
  getDemoSession,
  startDemoSession,
} from '../lib/demoAuth'
import { isSupabaseConfigured } from '../lib/supabase'

/**
 * Puerta de acceso: exige usuario/contraseña de demo antes de entrar a la app.
 * Es una pantalla de acceso del piloto, NO seguridad real (ver demoAuth.ts).
 * La sesión vive en sessionStorage (se cierra al cerrar la pestaña).
 */
export function LoginGate(props: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => getDemoSession() !== null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (authed) return <>{props.children}</>

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (checkDemoCredentials(user, password)) {
      startDemoSession(user)
      setAuthed(true)
    } else {
      setError('Usuario o contraseña incorrectos.')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card card">
        <div className="login-brand">
          Risk<span>Calculator</span>
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>
          Calculadora y gestor de inversiones. Accede para continuar.
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-user">Usuario</label>
            <input
              id="login-user"
              autoComplete="username"
              value={user}
              onChange={(e) => {
                setUser(e.target.value)
                setError(null)
              }}
              placeholder="admin1"
            />
          </div>
          <div className="field">
            <label htmlFor="login-pass">Contraseña</label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              placeholder="••••"
            />
          </div>
          {error !== null && (
            <div className="note negative" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn primary" style={{ width: '100%' }}>
            Entrar
          </button>
        </form>
        <div className="note info" style={{ marginTop: 'var(--space-4)' }}>
          <strong>Acceso de prueba:</strong> usuario <code className="mono">{DEMO_HINT.user}</code>,
          contraseña <code className="mono">{DEMO_HINT.password}</code>.
        </div>
        <p className="muted" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
          Esta es una puerta de acceso de demo, no seguridad real (app de solo-navegador).
          {isSupabaseConfigured()
            ? ' La autenticación real por email está disponible dentro, en Perfil.'
            : ' La autenticación real (enlace mágico de Supabase) se activa al configurar el backend.'}
        </p>
      </div>
    </div>
  )
}
