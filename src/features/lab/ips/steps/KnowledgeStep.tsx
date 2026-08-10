/**
 * Paso 5 del asistente: conocimientos y experiencia (LAB-208).
 *
 * **No cambia el riesgo efectivo.** ADR-002 §3 lo deja fuera del `min()` a
 * propósito: saber más no permite perder más, y saber menos no reduce lo que
 * alguien puede permitirse perder. Se recoge para poder avisar cuando un
 * producto sea más complejo que la experiencia declarada.
 *
 * Se dice en pantalla, y no solo aquí, porque un cuestionario cuyo propósito no
 * se explica invita a responder lo que uno cree que le conviene.
 */
import { Note } from '../../../../components/ui'
import { KNOWLEDGE_LEVEL_INFO } from '../../../../lib/lab/domain/investmentPolicy'
import {
  KNOWLEDGE_QUESTIONS,
  deriveKnowledgeLevel,
  missingKnowledgeAnswers,
} from '../../../../lib/lab/analytics/knowledgeLevel'
import { Cuestionario } from './Cuestionario'

const NOMBRE_NIVEL = { basico: 'básico', medio: 'medio', avanzado: 'avanzado' } as const

export interface KnowledgeStepProps {
  readonly answers: Readonly<Record<string, string>>
  readonly onChange: (answers: Readonly<Record<string, string>>) => void
}

export function KnowledgeStep(props: KnowledgeStepProps) {
  const faltan = missingKnowledgeAnswers(props.answers)
  const nivel = deriveKnowledgeLevel(props.answers)

  return (
    <div className="ips-step">
      <p className="muted">
        Tres preguntas sobre lo que ya has hecho, no sobre lo que sabes de teoría. No hay nota ni
        aprobado.
      </p>

      <Cuestionario
        preguntas={KNOWLEDGE_QUESTIONS}
        answers={props.answers}
        onChange={props.onChange}
      />

      {nivel === null ? (
        <Note>
          {faltan.length === 1 ? 'Falta 1 pregunta' : `Faltan ${faltan.length} preguntas`} por
          contestar. Dejarlo incompleto no bloquea nada: los conocimientos no entran en el cálculo
          del riesgo.
        </Note>
      ) : (
        <Note kind="info">
          Experiencia declarada: <strong>{NOMBRE_NIVEL[nivel]}</strong>.{' '}
          {KNOWLEDGE_LEVEL_INFO[nivel]}
        </Note>
      )}

      <Note>
        Esto <strong>no</strong> cambia tu riesgo efectivo. Saber más no permite perder más, y
        saber menos no reduce lo que puedes permitirte perder. Sirve para avisarte si más adelante
        aparece un producto más complejo que lo que has declarado.
      </Note>
    </div>
  )
}
