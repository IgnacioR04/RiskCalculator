/**
 * Rellenado de lo derivable de una política (LAB-208).
 *
 * Un único sitio donde se recalcula todo lo que **no** se pregunta: banda de
 * capacidad, banda de tolerancia, nivel de conocimientos y riesgo efectivo. Que
 * esté centralizado importa: si cada pantalla derivara por su cuenta, dos vistas
 * de la misma política podrían discrepar.
 *
 * Tres invariantes, y las tres son la misma idea:
 *
 * - Lo que no se puede derivar **se borra**, no se conserva. Un dato derivado
 *   que sobrevive a la desaparición de su origen es un fósil que miente.
 * - Nada se estima. Si falta un hecho, el resultado es la ausencia del campo.
 * - Nada se cruza: la capacidad no mira a la tolerancia ni la tolerancia a la
 *   capacidad. Solo el riesgo efectivo las combina, y lo hace con `min()`.
 *
 * `ahora` entra como argumento por la misma razón que en el resto del motor: una
 * función que lee el reloj por su cuenta no se puede reproducir.
 */
import type {
  CapacityAssessment,
  InvestmentPolicy,
  KnowledgeAssessment,
  RiskAssessment,
  ToleranceAssessment,
} from '../domain/investmentPolicy'
import { deriveCapacityBand } from './capacityBand'
import { deriveKnowledgeLevel } from './knowledgeLevel'
import { computeEffectiveRisk } from './policyAssessment'
import { deriveToleranceBand } from './toleranceBand'

/**
 * Devuelve la política con sus campos derivados al día.
 *
 * `assessedAt` solo aparece junto a su resultado, y se refresca cada vez que el
 * resultado se recalcula: es la fecha de *esta* lectura, no la del primer
 * intento.
 */
export function withDerivedBands(policy: InvestmentPolicy, ahora: string): InvestmentPolicy {
  const tolerance = conBandaDeTolerancia(policy.assessment.tolerance, ahora)
  const capacity = conBandaDeCapacidad(policy.assessment.capacity, ahora)
  const knowledge =
    policy.assessment.knowledge === undefined
      ? undefined
      : conNivelDeConocimientos(policy.assessment.knowledge, ahora)

  const assessment: RiskAssessment = {
    ...policy.assessment,
    tolerance,
    capacity,
    ...(knowledge === undefined ? {} : { knowledge }),
  }

  const effectiveRisk = computeEffectiveRisk(assessment)

  // Se aparta el valor anterior antes de esparcir la política: si ya no puede
  // calcularse, la clave tiene que **desaparecer**. Conservarla dejaría un
  // riesgo efectivo huérfano de la capacidad que lo justificaba, que es
  // exactamente el fósil que este módulo existe para evitar.
  const { effectiveRisk: _anterior, ...resto } = policy

  return {
    ...resto,
    assessment,
    ...(effectiveRisk === null ? {} : { effectiveRisk }),
  }
}

function conBandaDeTolerancia(
  tolerance: ToleranceAssessment,
  ahora: string,
): ToleranceAssessment {
  const band = deriveToleranceBand(tolerance.answers)
  if (band !== null) {
    return { answers: tolerance.answers, band, assessedAt: ahora, source: 'cuestionario' }
  }

  // La banda traída del perfil anterior no la produce este cuestionario, así que
  // tampoco la borra: sus preguntas eran otras y no hay nada que recalcular. Se
  // conserva hasta que el cuestionario nuevo dé un resultado, y el asistente
  // avisa mientras tanto de que hay que revisarla.
  if (tolerance.source === 'perfil-anterior' && tolerance.band !== undefined) return tolerance

  // Cualquier otra banda se reconstruye desde `answers`: si el usuario retira
  // una respuesta, desaparece con ella.
  return { answers: tolerance.answers }
}

function conBandaDeCapacidad(capacity: CapacityAssessment, ahora: string): CapacityAssessment {
  const band = deriveCapacityBand(capacity)
  const { band: _anterior, assessedAt: _fecha, ...hechos } = capacity
  return { ...hechos, ...(band === null ? {} : { band, assessedAt: ahora }) }
}

function conNivelDeConocimientos(
  knowledge: KnowledgeAssessment,
  ahora: string,
): KnowledgeAssessment {
  const level = deriveKnowledgeLevel(knowledge.answers)
  return { answers: knowledge.answers, ...(level === null ? {} : { level, assessedAt: ahora }) }
}
