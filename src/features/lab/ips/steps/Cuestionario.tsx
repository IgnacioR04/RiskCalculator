/**
 * Cuestionario ordinal reutilizable (LAB-208).
 *
 * Lo comparten los pasos de tolerancia y de conocimientos, que preguntan cosas
 * distintas con la misma forma. Las preguntas y su puntuación viven en
 * `src/lib/lab/analytics/`; aquí solo se dibujan.
 *
 * Tres cosas que la tarea pide y que son de este componente:
 *
 * - **Ninguna opción viene marcada.** Un valor por defecto es una sugerencia
 *   disfrazada, y el usuario tiende a dejarlo.
 * - **«Prefiero no responder» está siempre disponible** y no es un punto medio:
 *   se guarda como respuesta explícita, pero el cálculo la trata como ausente.
 * - **Cada pregunta dice para qué se usa.** Va en un desplegable para no
 *   convertir el formulario en un muro de texto, pero está al alcance del
 *   teclado y de un lector de pantalla como parte de la pregunta.
 */
import { useId } from 'react'
import { SIN_RESPUESTA } from '../../../../lib/lab/analytics/toleranceBand'

export interface PreguntaRenderizable {
  readonly id: string
  readonly text: string
  readonly porQue: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
}

export interface CuestionarioProps {
  readonly preguntas: readonly PreguntaRenderizable[]
  readonly answers: Readonly<Record<string, string>>
  readonly onChange: (answers: Readonly<Record<string, string>>) => void
}

export function Cuestionario(props: CuestionarioProps) {
  const idBase = useId()

  function responder(preguntaId: string, valor: string) {
    props.onChange({ ...props.answers, [preguntaId]: valor })
  }

  return (
    <ol className="ips-preguntas">
      {props.preguntas.map((pregunta, indice) => {
        const grupo = `${idBase}-${pregunta.id}`
        const elegida = props.answers[pregunta.id]
        return (
          <li key={pregunta.id}>
            <fieldset className="ips-pregunta">
              <legend>
                <span className="ips-pregunta__num" aria-hidden="true">
                  {indice + 1}
                </span>
                {pregunta.text}
              </legend>

              <details className="ips-porque">
                <summary>¿Por qué se pregunta esto?</summary>
                <p className="muted tiny mb-0">{pregunta.porQue}</p>
              </details>

              {pregunta.options.map((opcion) => (
                <label key={opcion.value} htmlFor={`${grupo}-${opcion.value}`}>
                  <input
                    id={`${grupo}-${opcion.value}`}
                    type="radio"
                    name={grupo}
                    value={opcion.value}
                    checked={elegida === opcion.value}
                    onChange={() => responder(pregunta.id, opcion.value)}
                  />
                  <span>{opcion.label}</span>
                </label>
              ))}

              <label htmlFor={`${grupo}-${SIN_RESPUESTA}`} className="ips-sin-respuesta">
                <input
                  id={`${grupo}-${SIN_RESPUESTA}`}
                  type="radio"
                  name={grupo}
                  value={SIN_RESPUESTA}
                  checked={elegida === SIN_RESPUESTA}
                  onChange={() => responder(pregunta.id, SIN_RESPUESTA)}
                />
                <span>Prefiero no responder</span>
              </label>
            </fieldset>
          </li>
        )
      })}
    </ol>
  )
}
