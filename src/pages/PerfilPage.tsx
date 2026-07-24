import { useState } from 'react'
import { Card, Note, Segmented } from '../components/ui'
import type { Currency, RiskCategory } from '../lib/domain'
import { formatDateTime } from '../lib/format'
import { useAppStore } from '../state/store'

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
      riskProfile: state.riskProfile,
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
      <h1>Perfil y ajustes</h1>

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
          <>
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
          </>
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
          Todo se guarda localmente en tu navegador. Puedes exportarlo o borrarlo cuando quieras.
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
                  'Esto borra TODOS tus datos locales (cuentas, operaciones, escenarios y perfil). ¿Continuar?',
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

      <Note kind="info">
        RiskCalculator ofrece cálculos y análisis educativos; no es asesoramiento financiero ni
        realiza predicciones. Sin comisiones, impuestos ni spread en este piloto (ver
        docs/DECISIONS.md).
      </Note>
    </>
  )
}
