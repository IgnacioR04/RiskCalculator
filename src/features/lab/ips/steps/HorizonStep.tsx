/**
 * Paso 2 del asistente: horizonte (LAB-207).
 *
 * El horizonte es un **hecho objetivo de capacidad**, no una preferencia: mide
 * cuánto tiempo puede estar el dinero invertido sin hacer falta. Por eso entra
 * en `capacity` y no en `tolerance`.
 *
 * Rellenarlo **no** produce una banda de capacidad. ADR-002 exige los cinco
 * hechos para eso, y los otros cuatro llegan en LAB-208. Hasta entonces la
 * capacidad sigue sin medir, y sin capacidad no hay riesgo efectivo.
 */
import { useId, useState } from 'react'
import { Card, Note } from '../../../../components/ui'
import type { InvestmentGoal } from '../../../../lib/lab/domain/investmentPolicy'

export interface HorizonStepProps {
  readonly horizonYears: number | undefined
  readonly goals: readonly InvestmentGoal[]
  /** `undefined` significa «sin declarar», nunca cero. */
  readonly onChange: (horizonYears: number | undefined) => void
  /** Fecha de referencia. Se inyecta para que la sugerencia sea reproducible. */
  readonly hoy: string
}

/** Milisegundos de un año medio, contando bisiestos. */
const MS_POR_ANO = 365.25 * 24 * 60 * 60 * 1000

/**
 * Años hasta el objetivo más cercano, a partir de sus fechas declaradas.
 *
 * Es aritmética sobre lo que el usuario ha escrito, no una estimación de su
 * situación: por eso se ofrece como sugerencia y nunca se aplica sola.
 */
export function horizonteSugerido(
  goals: readonly InvestmentGoal[],
  hoy: string,
): number | undefined {
  const fechas = goals
    .map((goal) => goal.targetDate)
    .filter((fecha) => fecha > hoy)
    .sort()
  const primera = fechas[0]
  if (primera === undefined) return undefined

  const desde = new Date(`${hoy}T00:00:00Z`).getTime()
  const hasta = new Date(`${primera}T00:00:00Z`).getTime()
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return undefined

  return Math.max(0, Math.floor((hasta - desde) / MS_POR_ANO))
}

/** El contrato admite enteros de 0 a 100 años (`capacityAssessmentSchema`). */
function esHorizonteValido(texto: string): boolean {
  if (!/^\d+$/.test(texto)) return false
  const valor = Number(texto)
  return Number.isInteger(valor) && valor >= 0 && valor <= 100
}

export function HorizonStep(props: HorizonStepProps) {
  const idBase = useId()
  const [texto, setTexto] = useState(props.horizonYears?.toString() ?? '')

  const sugerido = horizonteSugerido(props.goals, props.hoy)
  const invalido = texto !== '' && !esHorizonteValido(texto)

  /**
   * Lo que no es válido no se guarda, y además borra lo que hubiera: dejar
   * almacenado un `5` mientras la pantalla muestra `5,5` marcado como erróneo
   * sería mentir sobre qué se está usando.
   */
  function escribir(nuevo: string) {
    setTexto(nuevo)
    props.onChange(esHorizonteValido(nuevo) ? Number(nuevo) : undefined)
  }

  function aplicarSugerencia(anos: number) {
    setTexto(anos.toString())
    props.onChange(anos)
  }

  return (
    <div className="ips-step">
      <p className="muted">
        ¿Cuánto tiempo puede estar este dinero invertido sin que lo necesites? No es cuánto
        riesgo aceptas: es cuánto tiempo tienes.
      </p>

      <Card>
        <div className="field">
          <label htmlFor={`${idBase}-horizonte`}>Años hasta necesitar el dinero</label>
          <span className="hint" id={`${idBase}-hint`}>
            Un número entero de años, entre 0 y 100.
          </span>
          <input
            id={`${idBase}-horizonte`}
            inputMode="numeric"
            autoComplete="off"
            value={texto}
            onChange={(e) => escribir(e.target.value)}
            aria-invalid={invalido}
            aria-describedby={`${idBase}-hint${invalido ? ` ${idBase}-error` : ''}`}
          />
          {invalido && (
            <span className="error" id={`${idBase}-error`} role="alert">
              Escribe un número entero de años entre 0 y 100. Mientras tanto, el horizonte queda
              sin declarar.
            </span>
          )}
        </div>

        {sugerido !== undefined && (
          <Note>
            Tu objetivo más cercano vence dentro de unos {sugerido}{' '}
            {sugerido === 1 ? 'año' : 'años'}. Es aritmética sobre las fechas que has declarado,
            no una lectura de tu situación: puedes tener motivos para poner otro número.{' '}
            <button type="button" className="btn small" onClick={() => aplicarSugerencia(sugerido)}>
              Usar {sugerido}
            </button>
          </Note>
        )}
      </Card>

      <Note>
        El horizonte es uno de los cinco datos que componen tu capacidad de asumir pérdidas. Los
        otros cuatro se preguntan más adelante, y hasta tenerlos todos no se calcula ninguna banda
        de capacidad ni ningún riesgo efectivo.
      </Note>
    </div>
  )
}
