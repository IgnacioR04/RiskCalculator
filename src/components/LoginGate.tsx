import { useState, type ReactNode } from 'react'
import { checkDemoCredentials, DEMO_HINT, getDemoSession, startDemoSession } from '../lib/demoAuth'
import { isSupabaseConfigured } from '../lib/supabase'

/**
 * Puerta de acceso (pantalla 00 del handoff). Tarjeta de 380 px centrada.
 * Es una puerta VISUAL del piloto, no seguridad real: la app es de solo
 * navegador, así que cualquier credencial embebida es legible en el bundle.
 * La autenticación real es el enlace mágico de Supabase (Perfil → Cuenta).
 */
export function LoginGate(props: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => getDemoSession() !== null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)

  if (authed) return <>{props.children}</>

  function enter(u: string, p: string) {
    if (checkDemoCredentials(u, p)) {
      startDemoSession(u)
      setAuthed(true)
    } else {
      setError('Usuario o contraseña incorrectos.')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="mark" aria-hidden="true">
            R
          </span>
          <span className="name">RiskCalculator</span>
        </div>
        <p className="login-tagline">Entiende tus inversiones sin hojas de cálculo.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            enter(user, password)
          }}
        >
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
            <div style={{ position: 'relative' }}>
              <input
                id="login-pass"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                placeholder="••••"
                style={{ paddingRight: 56 }}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPw ? 'ocultar' : 'mostrar'}
              </button>
            </div>
          </div>

          <label className="check-row" htmlFor="login-remember">
            <input
              id="login-remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Recordar sesión en este dispositivo
          </label>

          {error !== null && (
            <div className="note negative" role="alert">
              <span className="note-glyph" aria-hidden="true">
                ■
              </span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn primary" style={{ width: '100%' }}>
            Entrar
          </button>
        </form>

        <div className="login-sep">o</div>

        <button
          type="button"
          className="btn"
          style={{ width: '100%' }}
          onClick={() => enter(DEMO_HINT.user, DEMO_HINT.password)}
        >
          Entrar en modo demostración ({DEMO_HINT.user} / {DEMO_HINT.password})
        </button>

        <div className="login-links">
          <span aria-disabled="true" title="Disponible cuando se active el registro con Supabase.">
            Crear cuenta
          </span>
          <span aria-disabled="true" title="Disponible cuando se active el registro con Supabase.">
            He olvidado el acceso
          </span>
        </div>

        <p className="login-foot">
          El acceso de demostración es una puerta visual, no seguridad real.{' '}
          {isSupabaseConfigured()
            ? 'La autenticación real por email está disponible dentro, en Perfil.'
            : 'La arquitectura está lista para Supabase, todavía sin conectar.'}
        </p>
      </div>
    </div>
  )
}
