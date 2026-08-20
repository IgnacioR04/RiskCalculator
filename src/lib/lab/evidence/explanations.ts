/**
 * Generador determinista de explicaciones (LAB-903).
 *
 * Convierte una evidencia en una frase que un humano entiende, **sin usar
 * ningún modelo de lenguaje**.
 *
 * ## Por qué plantillas y no un LLM
 *
 * `CLAUDE.md` §3 prohíbe que un LLM produzca pesos, rentabilidades o
 * puntuaciones. Este módulo va un paso más allá y no lo usa **ni para
 * redactar**, por una razón que no es de política sino de arquitectura:
 *
 * **Una explicación no puede cambiar el resultado.** Es el criterio de
 * aceptación de LAB-903. Con plantillas, la explicación es una función pura del
 * resultado: mismo dato, misma frase, siempre. Con un LLM en medio, dos
 * ejecuciones del mismo cálculo podrían describirse distinto, y el usuario no
 * tendría forma de saber si cambió el número o cambió la redacción.
 *
 * El LLM opcional de `LAB-909` se construye **encima** de esto, nunca en su
 * lugar.
 *
 * ## Qué se prioriza
 *
 * Las limitaciones van antes que el número cuando la evidencia no es un hecho.
 * No es prudencia: es que el orden en que se leen las cosas decide qué se
 * recuerda, y de una estimación lo que hay que recordar es de qué depende.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import {
  EVIDENCE_KIND_LABEL,
  EVIDENCE_KIND_MEANING,
  isDemo,
  needsContext,
  oldestAsOf,
  type EvidenceItem,
} from './contracts'
import { describeReason } from './reasonCodes'

export const EXPLANATION_VERSION = 'explanations-v1'

/** Una frase de la explicación, con su papel. */
export interface ExplanationLine {
  readonly role: 'claim' | 'method' | 'source' | 'limitation' | 'warning'
  readonly text: string
}

export interface Explanation {
  readonly version: string
  readonly lines: readonly ExplanationLine[]
  /** `true` si la evidencia no se puede presentar sin su contexto. */
  readonly requiresContext: boolean
  /** Cómo se generó. Que sea siempre esto es la garantía. */
  readonly generator: 'deterministic-template'
}

const pct = (f: number) => `${(f * 100).toFixed(0)} %`

/**
 * Explica una evidencia.
 *
 * El orden de las líneas es la decisión de diseño: para un hecho basta la
 * afirmación; para todo lo demás, la naturaleza y las limitaciones van antes de
 * que el usuario se quede con el número.
 */
export function explain(item: EvidenceItem): Explanation {
  const lines: ExplanationLine[] = []

  // 1. Qué clase de afirmación es. Solo cuando no es un hecho: decir «esto es
  //    un hecho» delante de un hecho es ruido.
  if (item.kind !== 'fact') {
    lines.push({
      role: 'warning',
      text: `${EVIDENCE_KIND_LABEL[item.kind]}. ${EVIDENCE_KIND_MEANING[item.kind]}`,
    })
  }

  // 2. Los datos de demostración se avisan antes que nada más: leer una cifra
  //    de demostración como propia es el malentendido más caro posible.
  if (isDemo(item)) {
    lines.push({
      role: 'warning',
      text: 'Calculado con datos de demostración. No son tus cifras.',
    })
  }

  lines.push({ role: 'claim', text: item.claim })
  lines.push({ role: 'method', text: `Cómo se calcula: ${item.method}` })

  // 3. Fuentes y fecha. La más antigua manda.
  const fecha = oldestAsOf(item)
  const fuentes = item.sources.map((s) => s.label).join(', ')
  const observaciones = item.sources.find((s) => s.observations !== undefined)?.observations
  lines.push({
    role: 'source',
    text:
      `Datos de ${fuentes}${fecha === null ? '' : `, a ${fecha}`}` +
      (observaciones === undefined ? '.' : `, sobre ${observaciones} observaciones.`),
  })

  if (item.coverage !== null && item.coverage < 1) {
    lines.push({
      role: 'limitation',
      text: `Calculado sobre el ${pct(item.coverage)} de lo que debería cubrir. El resto no entra.`,
    })
  }

  for (const limitacion of item.limitations) {
    lines.push({ role: 'limitation', text: limitacion })
  }

  return {
    version: EXPLANATION_VERSION,
    lines,
    requiresContext: needsContext(item),
    generator: 'deterministic-template',
  }
}

/**
 * Explica por qué algo **no** se ha podido calcular.
 *
 * Es la mitad que más se olvida: un hueco sin explicación se lee como un fallo
 * de la aplicación, y a veces lo es, pero casi siempre es una decisión.
 */
export function explainMissing(codes: readonly string[]): Explanation {
  const lines: ExplanationLine[] = codes.flatMap((code) => {
    const razon = describeReason(code)
    const salida: ExplanationLine[] = [{ role: 'claim', text: razon.text }]
    if (razon.remediation !== undefined) {
      salida.push({ role: 'method', text: razon.remediation })
    }
    return salida
  })

  return {
    version: EXPLANATION_VERSION,
    lines,
    requiresContext: false,
    generator: 'deterministic-template',
  }
}

/**
 * La explicación en un solo párrafo, para sitios donde no cabe una lista.
 *
 * Conserva el orden, así que sigue poniendo el contexto antes del número.
 */
export function explainAsText(item: EvidenceItem): string {
  return explain(item)
    .lines.map((l) => l.text)
    .join(' ')
}
