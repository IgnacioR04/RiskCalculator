import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { LAB_ROUTES } from '../features/lab/routes/labRoutes'
import {
  checkDemoCredentials,
  DEMO_HINT,
  getDemoSession,
  startDemoSession,
} from '../lib/demoAuth'
import { authRedirectUrl, getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { activateGuestCache, activateUserCache, pullFromCloud, startAutoSync, stopAutoSync } from '../lib/sync'

type AccessMode = 'login' | 'signup' | 'reset' | 'update-password' | 'demo'

/**
 * Rutas que no exigen cuenta. El Laboratorio es una herramienta de análisis
 * sobre datos locales o de demostración: pedir credenciales para mirarlo
 * contradice el requisito de que las funciones esenciales funcionen sin
 * registro. La sesión se sigue inicializando igual, y quien quiera sincronizar
 * entra desde Perfil.
 */
const PREFIJOS_PUBLICOS = [LAB_ROUTES['lab.home'].path]

function esRutaPublica(pathname: string): boolean {
  return PREFIJOS_PUBLICOS.some(
    (prefijo) => pathname === prefijo || pathname.startsWith(`${prefijo}/`),
  )
}

export function LoginGate(props: { children: ReactNode }) {
  const configured = isSupabaseConfigured()
  const location = useLocation()
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [checkingText, setCheckingText] = useState('Comprobando tu sesión...')
  const [mode, setMode] = useState<AccessMode>(configured ? 'login' : 'demo')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [demoUser, setDemoUser] = useState('')
  const [demoPassword, setDemoPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const activeUserIdRef = useRef<string | null>(null)
  const initializingUserIdRef = useRef<string | null>(null)

  const initializeSession = useCallback(async (session: Session | null) => {
    if (session === null) {
      activeUserIdRef.current = null
      initializingUserIdRef.current = null
      await activateGuestCache()
      if (!mountedRef.current) return
      setAllowed(getDemoSession() !== null)
      setChecking(false)
      return
    }

    if (
      activeUserIdRef.current === session.user.id ||
      initializingUserIdRef.current === session.user.id
    ) {
      return
    }

    initializingUserIdRef.current = session.user.id
    setCheckingText('Cargando tus datos...')
    setChecking(true)
    setMessage(null)

    await activateUserCache(session.user.id, session.user.email ?? null)
    const result = await pullFromCloud()
    startAutoSync(session.user.id)

    if (!mountedRef.current) return
    activeUserIdRef.current = session.user.id
    initializingUserIdRef.current = null
    setAllowed(true)
    setChecking(false)
    if (!result.ok) setMessage(result.message)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const supabase = getSupabase()
    if (supabase === null) {
      void activateGuestCache().then(() => {
        if (!mountedRef.current) return
        setAllowed(getDemoSession() !== null)
        setChecking(false)
      })
      return () => {
        mountedRef.current = false
        stopAutoSync()
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      void initializeSession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAllowed(false)
        setChecking(false)
        setMode('update-password')
        setMessage('Introduce una contraseña nueva para terminar la recuperación.')
        return
      }
      if (event === 'SIGNED_OUT') {
        void initializeSession(null)
        return
      }
      if (session !== null) void initializeSession(session)
    })

    return () => {
      mountedRef.current = false
      data.subscription.unsubscribe()
      stopAutoSync()
    }
  }, [initializeSession])

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
        if (error !== null) {
          setMessage(error.message)
        } else if (data.session !== null) {
          await initializeSession(data.session)
        } else {
          setMessage('Cuenta creada. Confirma el enlace enviado a tu email para entrar.')
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error !== null) {
          setMessage(error.message)
        } else if (data.session !== null) {
          await initializeSession(data.session)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault()
    const supabase = getSupabase()
    if (supabase === null) return
    setBusy(true)
    setMessage(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirectUrl(),
      })
      setMessage(
        error !== null
          ? error.message
          : 'Te hemos enviado un enlace para cambiar la contraseña.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault()
    const supabase = getSupabase()
    if (supabase === null) return
    setBusy(true)
    setMessage(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error !== null) {
        setMessage(error.message)
        return
      }
      const { data } = await supabase.auth.getSession()
      await initializeSession(data.session)
      setMessage('Contraseña actualizada.')
    } finally {
      setBusy(false)
    }
  }

  async function submitDemo(event: FormEvent) {
    event.preventDefault()
    if (checkDemoCredentials(demoUser, demoPassword)) {
      await activateGuestCache()
      startDemoSession(demoUser)
      setAllowed(true)
      setMessage(null)
      return
    }
    setMessage('Usuario o contraseña de demostración incorrectos.')
  }

  if (checking) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <LoginBrand />
          <p className="muted center">{checkingText}</p>
        </div>
      </div>
    )
  }
  // Con sesión, o en una ruta pública, se entra. La caché local ya está
  // activada por el efecto de arriba en ambos casos.
  if (allowed || esRutaPublica(location.pathname)) return <>{props.children}</>

  return (
    <div className="login-screen">
      <div className="login-card">
        <LoginBrand />
        <p className="login-tagline">
          Accede a tu cartera privada y mantenla sincronizada con Supabase.
        </p>

        {configured && mode !== 'update-password' && (
          <div className="segmented auth-tabs" role="tablist" aria-label="Tipo de acceso">
            {[
              ['login', 'Entrar'],
              ['signup', 'Crear cuenta'],
              ['reset', 'Recuperar'],
              ['demo', 'Demo'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                aria-checked={mode === value}
                onClick={() => {
                  setMode(value as AccessMode)
                  setMessage(null)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === 'update-password' && configured && (
          <form onSubmit={(event) => void submitNewPassword(event)}>
            <div className="field">
              <label htmlFor="new-password">Nueva contraseña</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
              />
            </div>
            <button type="submit" className="btn primary wide" disabled={busy}>
              {busy ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
          </form>
        )}

        {(mode === 'login' || mode === 'signup') && configured && (
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
              {busy ? 'Un momento...' : mode === 'signup' ? 'Crear mi cuenta' : 'Entrar'}
            </button>
          </form>
        )}

        {mode === 'reset' && configured && (
          <form onSubmit={(event) => void submitReset(event)}>
            <div className="field">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@email.com"
                required
              />
            </div>
            <button type="submit" className="btn primary wide" disabled={busy}>
              {busy ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
          </form>
        )}

        {mode === 'demo' && (
          <form onSubmit={(event) => void submitDemo(event)}>
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
                placeholder="****"
              />
            </div>
            <button type="submit" className="btn primary wide">
              Probar la aplicación
            </button>
            <p className="muted tiny center">
              Acceso demo: {DEMO_HINT.user} / {DEMO_HINT.password}. No usa Supabase.
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

function LoginBrand() {
  return (
    <div className="login-brand">
      <span className="mark">R</span>
      <span className="name">RiskCalculator</span>
    </div>
  )
}
