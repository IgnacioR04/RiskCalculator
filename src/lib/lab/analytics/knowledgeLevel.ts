/**
 * Cuestionario de conocimientos y experiencia (LAB-208).
 *
 * **No participa en el riesgo efectivo.** ADR-002 §3 lo deja fuera del `min()`
 * a propósito: la experiencia no cambia lo que alguien puede permitirse perder.
 * Se recoge para poder avisar cuando un producto es más complejo que la
 * experiencia declarada, que es uno de los conflictos del documento de producto.
 *
 * Misma agregación que la tolerancia: **mediana** de tres respuestas ordinales,
 * que siempre coincide con una de ellas.
 */
import type { KnowledgeLevel } from '../domain/investmentPolicy'
import { SIN_RESPUESTA } from './toleranceBand'

export interface OpcionConocimiento {
  readonly value: string
  readonly label: string
  readonly level: KnowledgeLevel
}

export interface PreguntaConocimiento {
  readonly id: string
  readonly text: string
  readonly porQue: string
  readonly options: readonly OpcionConocimiento[]
}

/** Orden de la escala. `indexOf` da la posición ordinal. */
const ORDEN: readonly KnowledgeLevel[] = ['basico', 'medio', 'avanzado']

export const KNOWLEDGE_QUESTIONS: readonly PreguntaConocimiento[] = [
  {
    id: 'antiguedad',
    text: '¿Cuánto tiempo llevas invirtiendo?',
    porQue: 'El tiempo no enseña por sí solo, pero sin él no se ha visto un ciclo completo.',
    options: [
      { value: 'menos-1', label: 'Menos de un año, o nada todavía.', level: 'basico' },
      { value: 'entre-1-5', label: 'Entre uno y cinco años.', level: 'medio' },
      { value: 'mas-5', label: 'Más de cinco años.', level: 'avanzado' },
    ],
  },
  {
    id: 'productos',
    text: '¿Con qué productos has invertido alguna vez?',
    porQue:
      'Un producto complejo mal entendido puede perder de formas que no se ven venir. Sirve para avisar, no para prohibir.',
    options: [
      { value: 'deposito', label: 'Depósitos o cuentas remuneradas.', level: 'basico' },
      { value: 'fondos', label: 'Fondos, ETF o acciones.', level: 'medio' },
      {
        value: 'complejos',
        label: 'Además, derivados, apalancamiento o estructurados.',
        level: 'avanzado',
      },
    ],
  },
  {
    id: 'caida-vivida',
    text: '¿Has pasado alguna caída grande del mercado con dinero invertido?',
    porQue:
      'Haberla vivido cambia lo que se sabe de uno mismo. Es la diferencia entre creer que se aguanta y saberlo.',
    options: [
      { value: 'ninguna', label: 'No.', level: 'basico' },
      { value: 'una', label: 'Sí, una.', level: 'medio' },
      { value: 'varias', label: 'Sí, varias.', level: 'avanzado' },
    ],
  },
]

/** Preguntas sin contestar, o contestadas con «prefiero no responder». */
export function missingKnowledgeAnswers(
  answers: Readonly<Record<string, string>>,
): readonly string[] {
  return KNOWLEDGE_QUESTIONS.filter((pregunta) => {
    const respuesta = answers[pregunta.id]
    return respuesta === undefined || respuesta === SIN_RESPUESTA
  }).map((pregunta) => pregunta.id)
}

/** Nivel declarado: mediana de las tres respuestas. `null` si falta alguna. */
export function deriveKnowledgeLevel(
  answers: Readonly<Record<string, string>>,
): KnowledgeLevel | null {
  if (missingKnowledgeAnswers(answers).length > 0) return null

  const posiciones = KNOWLEDGE_QUESTIONS.map((pregunta) => {
    const elegida = pregunta.options.find((opcion) => opcion.value === answers[pregunta.id])
    return elegida === undefined ? undefined : ORDEN.indexOf(elegida.level)
  })

  if (posiciones.some((posicion) => posicion === undefined)) return null

  const ordenadas = (posiciones as number[]).slice().sort((a, b) => a - b)
  return ORDEN[ordenadas[Math.floor(ordenadas.length / 2)] as number] as KnowledgeLevel
}
