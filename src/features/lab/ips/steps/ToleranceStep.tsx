/**
 * Paso 4 del asistente: tolerancia (LAB-208).
 *
 * Aquí se pregunta por una **preferencia**: qué está uno dispuesto a soportar.
 * El paso anterior preguntaba por hechos. Son dos cosas distintas y el modelo
 * las guarda por separado, porque confundirlas produce carteras que el usuario
 * aguanta en la encuesta y no en la práctica (ADR-002 §2).
 *
 * La banda solo aparece con las cinco preguntas contestadas, y es la **mediana**
 * de las respuestas: con cuatro de cinco no se enseña un resultado provisional,
 * porque la que falta puede ser justamente la que decide.
 */
import { Note } from '../../../../components/ui'
import { RISK_BAND_INFO } from '../../../../lib/lab/domain/investmentPolicy'
import {
  TOLERANCE_QUESTIONS,
  deriveToleranceBand,
  missingToleranceAnswers,
} from '../../../../lib/lab/analytics/toleranceBand'
import { Cuestionario } from './Cuestionario'

export interface ToleranceStepProps {
  readonly answers: Readonly<Record<string, string>>
  readonly onChange: (answers: Readonly<Record<string, string>>) => void
}

export function ToleranceStep(props: ToleranceStepProps) {
  const faltan = missingToleranceAnswers(props.answers)
  const banda = deriveToleranceBand(props.answers)

  return (
    <div className="ips-step">
      <p className="muted">
        Ahora sí se pregunta por lo que prefieres. No hay respuestas mejores ni peores: cada una
        lleva a una cartera distinta, y ninguna opción está recomendada ni marcada por defecto.
      </p>

      <Cuestionario
        preguntas={TOLERANCE_QUESTIONS}
        answers={props.answers}
        onChange={props.onChange}
      />

      {banda === null ? (
        <Note>
          {faltan.length === TOLERANCE_QUESTIONS.length
            ? 'Aún no has contestado ninguna pregunta.'
            : `${faltan.length === 1 ? 'Falta 1 pregunta' : `Faltan ${faltan.length} preguntas`} por contestar.`}{' '}
          Hasta tenerlas todas no se calcula ninguna banda de tolerancia: con una respuesta menos,
          el resultado podría ser otro.
        </Note>
      ) : (
        <Note kind="info">
          Tu tolerancia declarada es <strong>{RISK_BAND_INFO[banda].nombre.toLowerCase()}</strong>.{' '}
          {RISK_BAND_INFO[banda].lectura} Sale de la mediana de tus cinco respuestas, no de una
          media: las bandas se ordenan, no se promedian. Sigue siendo lo que dices que
          aguantarías, no lo que puedes permitirte perder.
        </Note>
      )}
    </div>
  )
}
