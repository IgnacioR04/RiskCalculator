import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  checkDemoCredentials,
  DEMO_HINT,
  getDemoSession,
  startDemoSession,
} from '../lib/demoAuth'
import { authRedirectUrl, getSupabase, isSupabaseConfigured } from '../lib/supabase'

type AccessMode = 'login' | 'signup' | 'demo'

export function LoginGate(props: { children: ReactNode }) {
  const configured = isSupabaseConfigured()
  const [allowed, setAllowed] = useState(() => getDemoSession() !== null)
  const [checking, setChecking] = useState(configured && !allowed)
  const [mode, setMode] = useState<AccessMode>(configured ? 'login' : 'demo')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [demoUser, setDemoUser] = useState('')
  const [demoPassword, setDemoPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (supabase === null) {
      setChecking(false)
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session !== null) setAllowed(true)
      setChecking(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session !== null) setAllowed(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div className="login-screen">
        <div className="login-card card">
          <div className="login-brand">
            Risk<span>Calculator</span>
          </div>
          <p className="muted center">Comprobando tu sesión…</p>
        </div>
      </div>
    )
  }
  if (allowed) return <>{props.children}</>

  async function submitAccount(event: FormEvent) {
    event.preventDefault()
    const supabase = getSupabase()
    if (supabase === null) return
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: authRedirectUrl() },
        })
        if (error !== null) setMessage(error.message)
        else if (data.session !== null) setAllowed(true)
        else setMessage('Cuenta creada. Confirma el enlace que hemos enviado a tu email.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error !== null) setMessage(error.message)
      }
    } finally {
      setBusy(false)
    }
  }

  function submitDemo(event: FormEvent) {
    event.preventDefault()
    if (checkDemoCredentials(demoUser, demoPassword)) {
      startDemoSession(demoUser)
      setAllowed(true)
      return
    }
    setMessage('Usuario o contraseña de demostración incorrectos.')
  }

  return (
    <div className="login-screen">
      <div className="login-card card">
        <div className="login-brand">
          Risk<span>Calculator</span>
        </div>
        <p className="muted center">
          Entiende tu cartera y toma decisiones con números, no con intuiciones.
        </p>

        {configured && (
          <div className="segmented auth-tabs" role="tablist" aria-label="Tipo de acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              aria-checked={mode === 'login'}
              onClick={() => {
                setMode('login')
                setMessage(null)
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              aria-checked={mode === 'signup'}
              onClick={() => {
                setMode('signup')
                setMessage(null)
              }}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'demo'}
              aria-checked={mode === 'demo'}
              onClick={() => {
                setMode('demo')
                setMessage(null)
              }}
            >
              Demo
            </button>
          </div>
        )}

        {mode !== 'demo' && configured ? (
          <form onSubmit={(event) => void submitAccount(event)}>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@email.com"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
              />
            </div>
            <button type="submit" className="btn primary wide" disabled={busy}>
              {busy ? 'Un momento…' : mode === 'signup' ? 'Crear mi cuenta' : 'Entrar de forma segura'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitDemo}>
            <div className="field">
              <label htmlFor="demo-user">Usuario de prueba</label>
              <input
                id="demo-user"
                autoComplete="username"
                value={demoUser}
                onChange={(event) => setDemoUser(event.target.value)}
                placeholder="admin1"
              />
            </div>
            <div className="field">
              <label htmlFor="demo-password">Contraseña</label>
              <input
                id="demo-password"
                type="password"
                autoComplete="current-password"
                value={demoPassword}
                onChange={(event) => setDemoPassword(event.target.value)}
                placeholder="••••"
              />
            </div>
            <button type="submit" className="btn primary wide">
              Probar la aplicación
            </button>
            <p className="muted tiny center">
              Acceso demo: {DEMO_HINT.user} / {DEMO_HINT.password}. Solo simula una sesión y no
              protege datos.
            </p>
          </form>
        )}
        {message !== null && (
          <div className="note info" role="status">
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
