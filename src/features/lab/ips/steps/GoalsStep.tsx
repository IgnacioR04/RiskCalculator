/**
 * Paso 1 del asistente de política de inversión: objetivos (LAB-207).
 *
 * Varios objetivos con prioridad, importe, divisa y fecha. La prioridad importa
 * de verdad: cuando la necesidad supere al riesgo efectivo, una de las salidas
 * del conflicto es reducir un objetivo, y hace falta saber cuál duele menos.
 *
 * No se calcula nada aquí. El paso recoge lo que el usuario declara y lo guarda;
 * derivar la necesidad de rentabilidad es trabajo de otra tarea.
 *
 * Sobre la validación: el botón de añadir **nunca se deshabilita**. Un botón
 * apagado no explica qué falta, y con teclado ni siquiera se puede alcanzar para
 * preguntárselo. En su lugar, al intentar añadir se marcan los campos que fallan
 * y el foco salta al primero.
 */
import { useId, useRef, useState } from 'react'
import { Card, Note } from '../../../../components/ui'
import type { Currency } from '../../../../lib/domain'
import { uid } from '../../../../lib/domain'
import type { GoalPriority, InvestmentGoal } from '../../../../lib/lab/domain/investmentPolicy'
import { investmentGoalSchema } from '../../../../lib/lab/schemas/investmentPolicy'

export interface GoalsStepProps {
  readonly goals: readonly InvestmentGoal[]
  readonly onChange: (goals: readonly InvestmentGoal[]) => void
}

const PRIORIDADES: readonly { value: GoalPriority; label: string; ayuda: string }[] = [
  { value: 'esencial', label: 'Esencial', ayuda: 'No renunciarías a esto.' },
  {
    value: 'importante',
    label: 'Importante',
    ayuda: 'Lo ajustarías antes que perder lo esencial.',
  },
  { value: 'deseable', label: 'Deseable', ayuda: 'Sería bienvenido, pero puede esperar.' },
]

const ETIQUETA_PRIORIDAD: Readonly<Record<GoalPriority, string>> = {
  esencial: 'Esencial',
  importante: 'Importante',
  deseable: 'Deseable',
}

type Borrador = Omit<InvestmentGoal, 'id'>

const BORRADOR_VACIO: Borrador = {
  name: '',
  priority: 'importante',
  currency: 'EUR',
  targetAmount: '',
  targetDate: '',
  dateFlexible: false,
  amountFlexible: false,
}

type CampoConError = 'name' | 'targetAmount' | 'targetDate'

/**
 * Mensajes por campo. Se escriben aquí, en español y en concreto, en vez de
 * mostrar los de zod: el esquema es la frontera del dato, no un texto de
 * interfaz, y sus mensajes por defecto están en inglés.
 */
function validar(borrador: Borrador): Readonly<Partial<Record<CampoConError, string>>> {
  const errores: Partial<Record<CampoConError, string>> = {}

  const nombre = borrador.name.trim()
  if (nombre === '') errores.name = 'Ponle un nombre para poder reconocerlo.'
  else if (nombre.length > 120) errores.name = 'El nombre no puede pasar de 120 caracteres.'

  if (borrador.targetAmount === '') {
    errores.targetAmount = 'Indica cuánto dinero necesitas para este objetivo.'
  } else if (!/^\d+(\.\d+)?$/.test(borrador.targetAmount)) {
    errores.targetAmount = 'Escribe solo cifras, con punto decimal si hace falta.'
  } else if (Number(borrador.targetAmount) <= 0) {
    errores.targetAmount = 'El importe debe ser mayor que cero.'
  }

  if (borrador.targetDate === '') errores.targetDate = 'Indica para cuándo lo necesitas.'

  return errores
}

export function GoalsStep(props: GoalsStepProps) {
  const idBase = useId()
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO)
  const [intentado, setIntentado] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const refNombre = useRef<HTMLInputElement>(null)
  const refImporte = useRef<HTMLInputElement>(null)
  const refFecha = useRef<HTMLInputElement>(null)

  const errores = validar(borrador)
  // Antes del primer intento no se marca nada: un formulario recién abierto no
  // está «mal rellenado», está sin rellenar.
  const visibles = intentado ? errores : {}

  function anadir() {
    setIntentado(true)
    const problemas = validar(borrador)

    if (problemas.name !== undefined) {
      refNombre.current?.focus()
      return
    }
    if (problemas.targetAmount !== undefined) {
      refImporte.current?.focus()
      return
    }
    if (problemas.targetDate !== undefined) {
      refFecha.current?.focus()
      return
    }

    const candidato: InvestmentGoal = { ...borrador, name: borrador.name.trim(), id: uid() }

    // Segunda comprobación contra el contrato real. Los mensajes de arriba son
    // para leer; esta es la que impide que entre al borrador algo que luego no
    // pasaría la validación de la frontera.
    const validado = investmentGoalSchema.safeParse(candidato)
    if (!validado.success) {
      setFallo(validado.error.issues[0]?.message ?? 'El objetivo no cumple el formato esperado.')
      return
    }

    setFallo(null)
    props.onChange([...props.goals, candidato])
    setBorrador(BORRADOR_VACIO)
    setIntentado(false)
    refNombre.current?.focus()
  }

  function describedBy(campo: CampoConError, ayuda?: string): string | undefined {
    const partes = [ayuda, visibles[campo] !== undefined ? `${idBase}-${campo}-error` : undefined]
    const texto = partes.filter((p) => p !== undefined).join(' ')
    return texto === '' ? undefined : texto
  }

  return (
    <div className="ips-step">
      <p className="muted">
        ¿Para qué es este dinero? Puedes declarar varios objetivos; su prioridad se usará más
        adelante, si alguno resulta incompatible con tu perfil, para saber cuál tocar primero.
      </p>

      {props.goals.length === 0 ? (
        <Note>
          Todavía no hay ningún objetivo. Puedes continuar sin declarar ninguno y volver después,
          pero sin al menos uno la política no podrá activarse.
        </Note>
      ) : (
        <ul className="ips-goals">
          {props.goals.map((goal) => (
            <li key={goal.id}>
              <Card>
                <div className="ips-goal">
                  <div>
                    <strong>{goal.name}</strong>
                    <p className="muted tiny mb-0">
                      {ETIQUETA_PRIORIDAD[goal.priority]} · {goal.targetAmount} {goal.currency} ·{' '}
                      <time dateTime={goal.targetDate}>{goal.targetDate}</time>
                      {goal.dateFlexible && ' · fecha flexible'}
                      {goal.amountFlexible && ' · importe flexible'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => props.onChange(props.goals.filter((g) => g.id !== goal.id))}
                  >
                    Quitar {goal.name}
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <fieldset className="ips-fieldset">
          <legend>Añadir un objetivo</legend>

          <div className="field">
            <label htmlFor={`${idBase}-name`}>Nombre</label>
            <input
              id={`${idBase}-name`}
              ref={refNombre}
              value={borrador.name}
              onChange={(e) => setBorrador({ ...borrador, name: e.target.value })}
              placeholder="Entrada de una casa"
              aria-invalid={visibles.name !== undefined}
              aria-describedby={describedBy('name')}
            />
            {visibles.name !== undefined && (
              <span className="error" id={`${idBase}-name-error`} role="alert">
                {visibles.name}
              </span>
            )}
          </div>

          <fieldset className="ips-prioridad">
            <legend>Prioridad</legend>
            {PRIORIDADES.map((prioridad) => (
              <label key={prioridad.value} htmlFor={`${idBase}-${prioridad.value}`}>
                <input
                  id={`${idBase}-${prioridad.value}`}
                  type="radio"
                  name={`${idBase}-prioridad`}
                  value={prioridad.value}
                  checked={borrador.priority === prioridad.value}
                  onChange={() => setBorrador({ ...borrador, priority: prioridad.value })}
                />
                <span>{prioridad.label}</span>
                <span className="muted tiny">{prioridad.ayuda}</span>
              </label>
            ))}
          </fieldset>

          <div className="ips-campos">
            <div className="field">
              <label htmlFor={`${idBase}-targetAmount`}>Importe objetivo</label>
              <input
                id={`${idBase}-targetAmount`}
                ref={refImporte}
                inputMode="decimal"
                autoComplete="off"
                value={borrador.targetAmount}
                onChange={(e) => setBorrador({ ...borrador, targetAmount: e.target.value })}
                aria-invalid={visibles.targetAmount !== undefined}
                aria-describedby={describedBy('targetAmount', `${idBase}-targetAmount-hint`)}
              />
              <span className="hint" id={`${idBase}-targetAmount-hint`}>
                En la divisa que elijas al lado.
              </span>
              {visibles.targetAmount !== undefined && (
                <span className="error" id={`${idBase}-targetAmount-error`} role="alert">
                  {visibles.targetAmount}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor={`${idBase}-currency`}>Divisa</label>
              <select
                id={`${idBase}-currency`}
                value={borrador.currency}
                onChange={(e) => setBorrador({ ...borrador, currency: e.target.value as Currency })}
              >
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor={`${idBase}-targetDate`}>¿Para cuándo?</label>
              <input
                id={`${idBase}-targetDate`}
                ref={refFecha}
                type="date"
                value={borrador.targetDate}
                onChange={(e) => setBorrador({ ...borrador, targetDate: e.target.value })}
                aria-invalid={visibles.targetDate !== undefined}
                aria-describedby={describedBy('targetDate', `${idBase}-targetDate-hint`)}
              />
              <span className="hint" id={`${idBase}-targetDate-hint`}>
                Día, mes y año. Si aún no lo sabes, pon una fecha aproximada y márcala flexible.
              </span>
              {visibles.targetDate !== undefined && (
                <span className="error" id={`${idBase}-targetDate-error`} role="alert">
                  {visibles.targetDate}
                </span>
              )}
            </div>
          </div>

          <div className="ips-flexibles">
            <label htmlFor={`${idBase}-dateFlexible`}>
              <input
                id={`${idBase}-dateFlexible`}
                type="checkbox"
                checked={borrador.dateFlexible}
                onChange={(e) => setBorrador({ ...borrador, dateFlexible: e.target.checked })}
              />{' '}
              La fecha puede moverse
            </label>
            <label htmlFor={`${idBase}-amountFlexible`}>
              <input
                id={`${idBase}-amountFlexible`}
                type="checkbox"
                checked={borrador.amountFlexible}
                onChange={(e) => setBorrador({ ...borrador, amountFlexible: e.target.checked })}
              />{' '}
              El importe puede ajustarse
            </label>
          </div>

          <button type="button" className="btn primary" onClick={anadir}>
            Añadir objetivo
          </button>

          {fallo !== null && (
            <span className="error" role="alert">
              {fallo}
            </span>
          )}
        </fieldset>
      </Card>
    </div>
  )
}
