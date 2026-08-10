/**
 * Paso 3 del asistente: situación financiera y liquidez (LAB-208).
 *
 * Aquí se completan los cuatro hechos de capacidad que faltaban tras el
 * horizonte. Son **hechos**, no preferencias: describen lo que pasaría si esta
 * cartera cayera, no lo que a uno le gustaría que pasara.
 *
 * Nada de lo que se responda aquí sale de la tolerancia, y nada de lo que se
 * responda en tolerancia entra aquí. Es la regla innegociable de ADR-002 §2, y
 * por eso son dos pasos distintos y dos bloques distintos del modelo.
 *
 * **Un campo en blanco se queda sin declarar.** No se rellena con la media, ni
 * con un valor «típico», ni con nada deducido de otra respuesta: mientras falte
 * uno, no hay banda de capacidad.
 */
import { useId, useState } from 'react'
import { Card, Note } from '../../../../components/ui'
import type {
  CapacityAssessment,
  CapacityFactsUpdate,
} from '../../../../lib/lab/domain/investmentPolicy'

export interface SituationStepProps {
  readonly capacity: CapacityAssessment
  readonly onChange: (cambio: CapacityFactsUpdate) => void
}

type Estabilidad = 'estable' | 'variable' | 'incierta'

const ESTABILIDAD: readonly { value: Estabilidad; label: string }[] = [
  { value: 'estable', label: 'Estables: sé con qué cuento cada mes.' },
  { value: 'variable', label: 'Variables: cambian según el año o la temporada.' },
  { value: 'incierta', label: 'Inciertos: no sé con qué contaré.' },
]

/** Rangos del contrato (`capacityAssessmentSchema`), para no guardar lo que no entraría. */
const LIMITES = {
  emergencyFundMonths: { min: 0, max: 120, entero: false },
  dependents: { min: 0, max: 20, entero: true },
  /** Se pregunta en porcentaje y se guarda en fracción: ojo con los dos órdenes. */
  shareOfNetWorth: { min: 0, max: 100, entero: false },
} as const

export function SituationStep(props: SituationStepProps) {
  const idBase = useId()

  return (
    <div className="ips-step">
      <p className="muted">
        Estas cuatro preguntas son sobre hechos, no sobre lo que estarías dispuesto a soportar.
        Miden qué pasaría de verdad si esta cartera cayera en el peor momento.
      </p>

      <Card>
        <CampoNumerico
          id={`${idBase}-colchon`}
          etiqueta="Meses de gastos cubiertos por tu colchón"
          porQue="Decide si un imprevisto te obliga a vender en mal momento. Sin colchón, cualquier caída se convierte en pérdida realizada."
          sufijo="meses"
          limites={LIMITES.emergencyFundMonths}
          valor={props.capacity.emergencyFundMonths}
          onChange={(v) => props.onChange({ emergencyFundMonths: v })}
        />

        <fieldset className="ips-pregunta">
          <legend>¿Cómo son tus ingresos?</legend>
          <details className="ips-porque">
            <summary>¿Por qué se pregunta esto?</summary>
            <p className="muted tiny mb-0">
              Unos ingresos que fallan en el mismo momento en que cae el mercado obligan a vender
              justo cuando peor viene.
            </p>
          </details>
          {ESTABILIDAD.map((opcion) => (
            <label key={opcion.value} htmlFor={`${idBase}-${opcion.value}`}>
              <input
                id={`${idBase}-${opcion.value}`}
                type="radio"
                name={`${idBase}-ingresos`}
                value={opcion.value}
                checked={props.capacity.incomeStability === opcion.value}
                onChange={() => props.onChange({ incomeStability: opcion.value })}
              />
              <span>{opcion.label}</span>
            </label>
          ))}
          <label htmlFor={`${idBase}-ingresos-nolose`} className="ips-sin-respuesta">
            <input
              id={`${idBase}-ingresos-nolose`}
              type="radio"
              name={`${idBase}-ingresos`}
              value="sin-respuesta"
              checked={props.capacity.incomeStability === undefined}
              onChange={() => props.onChange({ incomeStability: undefined })}
            />
            <span>No lo sé todavía</span>
          </label>
        </fieldset>

        <CampoNumerico
          id={`${idBase}-dependientes`}
          etiqueta="Personas que dependen económicamente de ti"
          porQue="No cambia lo que puede caer la cartera, pero sí lo que cuesta equivocarse."
          limites={LIMITES.dependents}
          valor={props.capacity.dependents}
          onChange={(v) => props.onChange({ dependents: v })}
        />

        <CampoNumerico
          id={`${idBase}-peso`}
          etiqueta="Porcentaje de tu patrimonio que representa esta cartera"
          porQue="Es el dato más determinante: si aquí está casi todo, no hay nada detrás que absorba una caída."
          sufijo="%"
          limites={LIMITES.shareOfNetWorth}
          // Se pregunta en porcentaje y se guarda en fracción 0–1.
          valor={props.capacity.shareOfNetWorth === undefined ? undefined : props.capacity.shareOfNetWorth * 100}
          onChange={(v) => props.onChange({ shareOfNetWorth: v === undefined ? undefined : v / 100 })}
        />
      </Card>

      <Note>
        Si algún dato no lo sabes, déjalo en blanco. Se queda sin declarar y se dice cuál falta;
        no se sustituye por un valor medio ni se deduce de tus respuestas sobre riesgo.
      </Note>
    </div>
  )
}

interface CampoNumericoProps {
  readonly id: string
  readonly etiqueta: string
  readonly porQue: string
  readonly sufijo?: string
  readonly limites: { readonly min: number; readonly max: number; readonly entero: boolean }
  readonly valor: number | undefined
  readonly onChange: (valor: number | undefined) => void
}

/**
 * Campo numérico de capacidad. Lo que el contrato rechazaría no se guarda: se
 * señala y el dato queda sin declarar, en vez de dejar almacenado un número que
 * la frontera tumbaría al releerlo.
 */
function CampoNumerico(props: CampoNumericoProps) {
  // El texto es local y el número vive en la política. Hacen falta los dos: sin
  // el texto no se puede escribir «3.» camino de «3.5», porque un valor a medio
  // escribir no es un número válido y el campo se vaciaría solo.
  const [texto, setTexto] = useState(props.valor === undefined ? '' : redondear(props.valor))

  function interpretar(bruto: string): number | undefined {
    if (!/^\d+([.,]\d+)?$/.test(bruto)) return undefined
    const numero = Number(bruto.replace(',', '.'))
    if (numero < props.limites.min || numero > props.limites.max) return undefined
    if (props.limites.entero && !Number.isInteger(numero)) return undefined
    return numero
  }

  const invalido = texto !== '' && interpretar(texto) === undefined
  const idAyuda = `${props.id}-hint`
  const idError = `${props.id}-error`

  return (
    <div className="field">
      <label htmlFor={props.id}>{props.etiqueta}</label>
      <details className="ips-porque">
        <summary>¿Por qué se pregunta esto?</summary>
        <p className="muted tiny mb-0">{props.porQue}</p>
      </details>
      <div className={props.sufijo !== undefined ? 'input-suffix' : undefined}>
        <input
          id={props.id}
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          aria-invalid={invalido}
          aria-describedby={invalido ? `${idAyuda} ${idError}` : idAyuda}
          onChange={(e) => {
            setTexto(e.target.value)
            // Lo que no entraría en el contrato deja el dato sin declarar en vez
            // de guardarse a la espera de que alguien lo rechace más tarde.
            props.onChange(interpretar(e.target.value))
          }}
        />
        {props.sufijo !== undefined && <span className="suffix">{props.sufijo}</span>}
      </div>
      <span className="hint" id={idAyuda}>
        {props.limites.entero ? 'Un número entero' : 'Un número'} entre {props.limites.min} y{' '}
        {props.limites.max}. En blanco significa «sin declarar».
      </span>
      {invalido && (
        <span className="error" id={idError} role="alert">
          Ese valor no vale aquí, así que el dato queda sin declarar.
        </span>
      )}
    </div>
  )
}

/** Evita que 0.35 × 100 se muestre como 35.000000000000004. */
function redondear(valor: number): string {
  return String(Math.round(valor * 1e6) / 1e6)
}
