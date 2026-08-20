import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Card, Note, SectionHeader, Segmented } from '../components/ui'
import { IpsWizard } from '../features/lab/ips/IpsWizard'
import type { Currency, RiskCategory, RiskResult } from '../lib/domain'
import { buildSignature } from '../lib/buildInfo'
import { isFeatureEnabled } from '../lib/features/flags'
import { formatDateTime, formatMoney } from '../lib/format'
import { providerStatus } from '../lib/market/service'
import { authRedirectUrl, getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { pullFromCloud, pushToCloud, signOutAndClearCloudSession } from '../lib/sync'
import { useAppStore } from '../state/store'
import { TableWrap } from '../components/TableWrap'

/** Cuestionario de perfil: exactamente cinco preguntas (especificación). */
const RISK_QUESTIONS = [
  {
    id: 'horizonte',
    text: '¿Cuál es tu horizonte previsto de inversión?',
    options: [
      { value: '0', label: 'Menos de 2 años' },
      { value: '1', label: 'Entre 2 y 7 años' },
      { value: '2', label: 'Más de 7 años' },
    ],
  },
  {
    id: 'necesidad',
    text: '¿Con qué probabilidad necesitarás disponer de este dinero?',
    options: [
      { value: '0', label: 'Es probable que lo necesite' },
      { value: '1', label: 'Podría necesitar una parte' },
      { value: '2', label: 'No cuento con necesitarlo' },
    ],
  },
  {
    id: 'capacidad',
    text: '¿Qué capacidad económica tienes para soportar pérdidas?',
    options: [
      { value: '0', label: 'Baja: una pérdida afectaría a mis gastos' },
      { value: '1', label: 'Media: podría asumir pérdidas moderadas' },
      { value: '2', label: 'Alta: mi día a día no depende de esta inversión' },
    ],
  },
  {
    id: 'caida',
    text: '¿Qué caída temporal máxima podrías tolerar sin abandonar el plan?',
    options: [
      { value: '0', label: 'Hasta un 10 %' },
      { value: '1', label: 'Hasta un 25 %' },
      { value: '2', label: 'Más de un 25 %' },
    ],
  },
  {
    id: 'objetivo',
    text: '¿Cuál es tu objetivo principal?',
    options: [
      { value: '0', label: 'Conservar el capital' },
      { value: '1', label: 'Equilibrio entre crecer y conservar' },
      { value: '2', label: 'Crecimiento a largo plazo' },
    ],
  },
] as const

const CATEGORY_LABEL: Record<RiskCategory, string> = {
  conservador: 'Conservador',
  moderado: 'Moderado',
  dinamico: 'Dinámico',
}

export function PerfilPage() {
  const store = useAppStore()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showQuiz, setShowQuiz] = useState(false)

  const allAnswered = RISK_QUESTIONS.every((q) => answers[q.id] !== undefined)

  function submitQuiz() {
    const score = RISK_QUESTIONS.reduce((acc, q) => acc + Number(answers[q.id] ?? 0), 0)
    const category: RiskCategory = score <= 3 ? 'conservador' : score <= 7 ? 'moderado' : 'dinamico'
    store.setRiskProfile({
      version: 1,
      answers,
      score,
      category,
      completedAt: new Date().toISOString(),
    })
    setShowQuiz(false)
    setAnswers({})
  }

  function exportData() {
    const state = useAppStore.getState()
    const payload = {
      exported_at: new Date().toISOString(),
      settings: state.settings,
      accounts: state.accounts,
      assets: state.assets,
      transactions: state.transactions,
      scenarios: state.scenarios,
      importBatches: state.importBatches,
      riskProfile: state.riskProfile,
      riskResults: state.riskResults,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `riskcalculator-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <SectionHeader num="08" title="Perfil" />

      <AccountCard />

      <Card title="Divisa de presentación">
        <p className="muted">
          Cambiarla recalcula todos los valores con el tipo de cambio disponible (se muestra tipo,
          fecha y fuente en cada dato); no es un simple cambio de símbolo.
        </p>
        <Segmented<Currency>
          label="Divisa global"
          value={store.settings.displayCurrency}
          onChange={store.setDisplayCurrency}
          options={[
            { value: 'EUR', label: 'EUR €' },
            { value: 'USD', label: 'USD $' },
          ]}
        />
      </Card>

      <Card title="Perfil de riesgo">
        {store.riskProfile !== null && !showQuiz && (
          /* El resultado aparece al cerrar el cuestionario: momento raro y de
             primera vez, así que entra con un puente en lugar de golpe. */
          <div className="enter-rise">
            <p>
              Tu perfil aproximado: <strong>{CATEGORY_LABEL[store.riskProfile.category]}</strong>{' '}
              (puntuación {store.riskProfile.score}/10, completado el{' '}
              {formatDateTime(store.riskProfile.completedAt)}).
            </p>
            <Note kind="info">
              Este perfil es orientativo y sirve para contextualizar métricas como la concentración
              o la volatilidad de tu cartera. No es una evaluación legal de idoneidad y nunca se usa
              para recomendarte comprar o vender.
            </Note>
            <button type="button" className="btn" onClick={() => setShowQuiz(true)}>
              Repetir el cuestionario
            </button>
          </div>
        )}
        {store.riskProfile === null && !showQuiz && (
          <>
            <p className="muted">
              Cinco preguntas rápidas para estimar tu perfil (conservador, moderado o dinámico).
            </p>
            <button type="button" className="btn primary" onClick={() => setShowQuiz(true)}>
              Hacer el cuestionario
            </button>
          </>
        )}
        {showQuiz && (
          <>
            {RISK_QUESTIONS.map((q) => (
              <div className="field" key={q.id}>
                <label htmlFor={`quiz-${q.id}`}>{q.text}</label>
                <select
                  id={`quiz-${q.id}`}
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                >
                  <option value="">— Elige una opción —</option>
                  {q.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="row">
              <button type="button" className="btn primary" disabled={!allAnswered} onClick={submitQuiz}>
                Guardar perfil
              </button>
              <button type="button" className="btn" onClick={() => setShowQuiz(false)}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </Card>

      <PoliticaInversionCard />

      <RiskResultsCard />

      <Card title="Proveedores de datos de mercado">
        <TableWrap>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Proveedor</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {providerStatus().map((p) => (
                <tr key={p.id}>
                  <td style={{ whiteSpace: 'normal' }}>{p.label}</td>
                  <td>{p.configured ? 'Disponible' : 'No configurado'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <p className="muted mb-0">
          Twelve Data requiere desplegar el proxy seguro (Supabase Edge Function) con la clave en el
          servidor; nunca se pone la clave en el navegador. Ver docs/DATA_SOURCES.md.
        </p>
      </Card>

      <Card title="Datos de demostración">
        {store.demoLoaded ? (
          <>
            <p className="muted">
              Los datos demo están cargados (cuentas, activos y operaciones ficticios, siempre
              etiquetados).
            </p>
            <button type="button" className="btn" onClick={store.removeDemoData}>
              Quitar datos de demostración
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              Carga cuentas y posiciones ficticias para explorar la aplicación sin registrar nada.
            </p>
            <button type="button" className="btn" onClick={store.loadDemoData}>
              Cargar datos de demostración
            </button>
          </>
        )}
      </Card>

      <Card title="Tus datos">
        <p className="muted">
          Puedes exportar o borrar la copia local de tus cuentas, operaciones, escenarios, cálculos
          y perfil.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={exportData}>
            Exportar mis datos (JSON)
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (
                window.confirm(
                  'Esto borra TODOS tus datos locales (cuentas, operaciones, escenarios, cálculos y perfil). ¿Continuar?',
                )
              ) {
                store.clearAll()
              }
            }}
          >
            Borrar todos mis datos
          </button>
        </div>
      </Card>

      {/* Versión exacta que se está usando (LAB-005). Sin esto, «a mí no me
          pasa» es una conversación sin salida. */}
      <p className="muted tiny">{buildSignature()}</p>

      <Note kind="info">
        RiskCalculator ofrece cálculos y análisis educativos; no es asesoramiento financiero ni
        realiza predicciones. Las comisiones son estimaciones configurables; impuestos y spread no
        se incluyen.
      </Note>
    </>
  )
}

/* ── Política de inversión (asistente del Laboratorio) ── */

/**
 * El asistente de IPS vive aquí, en la sección de Perfil, y no en una ruta
 * propia del Laboratorio: el contrato de rutas de LAB-102 no tiene ninguna para
 * un wizard, y la especificación de producto titula esta sección «Perfil e IPS».
 * Inventar una ruta fuera del contrato sería más ruido que utilidad.
 *
 * Detrás de `labIpsV2`, que es visibilidad y no permiso: lo que protege datos
 * sigue estando en la RLS de Supabase.
 */
function PoliticaInversionCard() {
  if (!isFeatureEnabled('labIpsV2')) return null

  return (
    <Card
      title="Política de inversión"
      sub="Objetivos y horizonte. Convive con el perfil de arriba; no lo sustituye todavía."
    >
      <IpsWizard />
    </Card>
  )
}

/* ── Cuenta (Supabase Auth con email y contraseña) ── */

function AccountCard() {
  const cloudSync = useAppStore((s) => s.cloudSync)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [emailConfirmedAt, setEmailConfirmedAt] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const configured = isSupabaseConfigured()

  function applyUser(user: User | null) {
    const email = user?.email ?? null
    setSessionEmail(email)
    setEmailConfirmedAt(user?.email_confirmed_at ?? null)
    setNewEmail(email ?? '')
  }

  useEffect(() => {
    const supabase = getSupabase()
    if (supabase === null) return
    void supabase.auth.getSession().then(({ data }) => {
      applyUser(data.session?.user ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!configured) {
    return (
      <Card title="Cuenta">
        <Note kind="info">
          La aplicación funciona en <strong>modo local</strong>: tus datos viven solo en este
          navegador. Para activar cuentas con email/contraseña y guardado en la nube, configura{' '}
          <code className="mono">VITE_SUPABASE_URL</code> y{' '}
          <code className="mono">VITE_SUPABASE_ANON_KEY</code> (ver README) y aplica las migraciones
          de <code className="mono">supabase/migrations</code>.
        </Note>
      </Card>
    )
  }

  async function updateEmail() {
    const supabase = getSupabase()
    if (supabase === null) return
    const email = newEmail.trim()
    if (!email.includes('@')) {
      setMessage('Introduce un email válido.')
      return
    }
    if (email === sessionEmail) {
      setMessage('El email ya coincide con la sesión actual.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo: authRedirectUrl() },
      )
      if (error !== null) {
        setMessage(`No se pudo cambiar el email: ${error.message}`)
        return
      }
      applyUser(data.user)
      setMessage('Cambio de email solicitado. Revisa tu correo para confirmarlo.')
    } finally {
      setBusy(false)
    }
  }

  async function updatePassword() {
    const supabase = getSupabase()
    if (supabase === null) return
    if (newPassword.length < 8) {
      setMessage('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error !== null) {
        setMessage(`No se pudo cambiar la contraseña: ${error.message}`)
        return
      }
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Contraseña actualizada.')
    } finally {
      setBusy(false)
    }
  }

  async function doSync(direction: 'push' | 'pull') {
    setBusy(true)
    setMessage(null)
    try {
      if (direction === 'pull') {
        const confirmed = window.confirm(
          'Descargar de la nube REEMPLAZA los datos locales actuales. ¿Continuar?',
        )
        if (!confirmed) return
      }
      const r = direction === 'push' ? await pushToCloud() : await pullFromCloud()
      setMessage(r.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    const supabase = getSupabase()
    if (supabase === null || deleteConfirmation !== 'ELIMINAR') return
    const confirmed = window.confirm(
      'Esto elimina tu usuario de Supabase y los datos remotos asociados. ¿Continuar?',
    )
    if (!confirmed) return

    setBusy(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        'delete-user',
        { method: 'POST' },
      )
      if (error !== null || data?.ok !== true) {
        setMessage(data?.error ?? `No se pudo eliminar la cuenta: ${error?.message ?? 'error desconocido'}`)
        return
      }
      await signOutAndClearCloudSession()
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Cuenta">
      {sessionEmail === null ? (
        <Note kind="info">
          Estás usando el modo demo/local. Para usar una cuenta real, cierra el modo demo y entra con
          email y contraseña desde la pantalla de acceso.
        </Note>
      ) : (
        <>
          <p>
            Sesión iniciada como <strong>{sessionEmail}</strong>.
          </p>
          <div className="stat-grid">
            <div className="kpi">
              <div className="kpi-label">Email</div>
              <div className="kpi-value">{emailConfirmedAt !== null ? 'Confirmado' : 'Pendiente'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Nube</div>
              <div className="kpi-value">{cloudSync.status}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Última sincronización</div>
              <div className="kpi-value">
                {cloudSync.lastSyncedAt !== null ? formatDateTime(cloudSync.lastSyncedAt) : 'Pendiente'}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <div className="field">
                <label htmlFor="account-email">Cambiar email</label>
                <input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                />
              </div>
              <button type="button" className="btn" disabled={busy} onClick={() => void updateEmail()}>
                Actualizar email
              </button>
            </div>
            <div>
              <div className="field">
                <label htmlFor="account-password">Nueva contraseña</label>
                <input
                  id="account-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div className="field">
                <label htmlFor="account-password-confirm">Confirmar contraseña</label>
                <input
                  id="account-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <button type="button" className="btn" disabled={busy} onClick={() => void updatePassword()}>
                Actualizar contraseña
              </button>
            </div>
          </div>

          <div className="row mt-2">
            <button type="button" className="btn" disabled={busy} onClick={() => void doSync('push')}>
              Subir datos locales a la nube
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void doSync('pull')}>
              Descargar de la nube
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                void signOutAndClearCloudSession().finally(() => window.location.reload())
              }}
            >
              Cerrar sesión
            </button>
          </div>

          <div className="field mt-2">
            <label htmlFor="delete-account-confirm">Eliminar cuenta</label>
            <span className="hint">Escribe ELIMINAR para activar el borrado remoto.</span>
            <input
              id="delete-account-confirm"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn danger"
            disabled={busy || deleteConfirmation !== 'ELIMINAR'}
            onClick={() => void deleteAccount()}
          >
            Eliminar cuenta y datos remotos
          </button>
          <p className="muted mt-2 mb-0">{cloudSync.message}</p>
        </>
      )}
      {message !== null && <Note kind="info">{message}</Note>}
    </Card>
  )
}

function RiskResultsCard() {
  const results = useAppStore((s) => s.riskResults)
  const removeRiskResult = useAppStore((s) => s.removeRiskResult)

  return (
    <Card title="Cálculos guardados">
      {results.length === 0 ? (
        <p className="muted mb-0">
          Todavía no hay cálculos guardados desde la calculadora.
        </p>
      ) : (
        <TableWrap>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col">Resultado</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 20).map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.calculatedAt)}</td>
                  <td>{riskResultLabel(entry)}</td>
                  <td>{riskResultSummary(entry)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => removeRiskResult(entry.id)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  )
}

function riskResultLabel(entry: RiskResult): string {
  if (entry.inputs.mode === 'restore') return 'Restaurar'
  if (entry.inputs.mode === 'breakeven') return 'Equilibrio real'
  return entry.resultType
}

function riskResultSummary(entry: RiskResult): string {
  const currency = entry.inputs.currency === 'USD' ? 'USD' : 'EUR'
  if (entry.inputs.mode === 'restore') {
    return moneySummary(entry.result.contribution, currency, 'Aportación')
  }
  if (entry.inputs.mode === 'breakeven') {
    if (entry.result.breakevenStatus === 'unreachable') return 'Equilibrio no alcanzable'
    const value =
      entry.result.breakevenStatus === 'already_achieved'
        ? '0'
        : entry.result.breakevenContribution
    return moneySummary(value, currency, 'Equilibrio')
  }
  return 'Resultado guardado'
}

function moneySummary(value: unknown, currency: Currency, label: string): string {
  if (typeof value !== 'string' && typeof value !== 'number') return `${label}: no disponible`
  return `${label}: ${formatMoney(value, currency)}`
}
