/**
 * Contrato de evidencia (LAB-901).
 *
 * Cada número que la aplicación enseña tiene que poder contestar cinco
 * preguntas: **qué es, de dónde salió, de cuándo es, cómo se calculó y qué no
 * cubre**.
 *
 * ## Por qué un contrato y no un comentario en cada pantalla
 *
 * Durante siete fases, cada motor ha ido acumulando su propia forma de decir lo
 * mismo: `assumptions` aquí, `limitations` allá, `notCovered` en otro sitio,
 * `modelVersion` y `asOf` en casi todos. Funciona, pero significa que una
 * pantalla nueva tiene que acordarse de leer cinco campos distintos, y la
 * primera que se olvide de uno enseñará un número sin su contexto.
 *
 * Este contrato es el denominador común. No sustituye a los campos de cada
 * motor: los **envuelve**, para que la interfaz tenga un solo sitio donde mirar.
 *
 * ## La distinción que sostiene todo el Laboratorio
 *
 * `kind` no es una etiqueta decorativa. Separa cosas que el usuario tiene
 * derecho a no confundir:
 *
 * - un **hecho** es lo que hay: «tienes 3.687,88 € en Apple»;
 * - una **estimación** es un cálculo sobre datos pasados: «tu volatilidad ha
 *   sido del 14,9 %»;
 * - un **escenario** es un supuesto: «si la bolsa cayera un 30 %…»;
 * - una **señal** es una regularidad estadística que falla durante años;
 * - una **candidata** es una cartera que cumple unas reglas.
 *
 * Presentar los cinco con el mismo formato sería el error de fondo del que este
 * proyecto lleva siete fases huyendo.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export const EVIDENCE_SCHEMA_VERSION = 1

/** Qué clase de afirmación es. El orden va de más a menos firme. */
export type EvidenceKind = 'fact' | 'estimate' | 'scenario' | 'signal' | 'candidate'

/** Cómo se presenta cada clase. Se escribe aquí, no en cada pantalla. */
export const EVIDENCE_KIND_LABEL: Readonly<Record<EvidenceKind, string>> = {
  fact: 'Hecho',
  estimate: 'Estimación',
  scenario: 'Escenario',
  signal: 'Señal',
  candidate: 'Cartera candidata',
}

/** Qué significa cada clase, en una frase. */
export const EVIDENCE_KIND_MEANING: Readonly<Record<EvidenceKind, string>> = {
  fact: 'Lo que hay, tomado de tus datos. No depende de ningún supuesto.',
  estimate: 'Un cálculo sobre lo que ha pasado. Supone que el pasado describe algo del futuro.',
  scenario: 'Qué pasaría si ocurriera un supuesto que has elegido tú. No dice que vaya a ocurrir.',
  signal: 'Una regularidad estadística. Falla durante años seguidos y no es una recomendación.',
  candidate: 'Una cartera que cumple tus reglas y optimiza un criterio. No es un consejo de compra.',
}

/** De dónde vienen los datos que sostienen la afirmación. */
export interface EvidenceSource {
  /** Nombre legible: «Twelve Data», «Introducido a mano», «Datos de demostración». */
  readonly label: string
  /** Fecha a la que se refieren los datos, `YYYY-MM-DD`. */
  readonly asOf: string
  /**
   * Desde cuándo estaban disponibles. Distinto de `asOf` cuando el dato tarda
   * en publicarse, y es lo que impide usar información del futuro.
   */
  readonly availableAt?: string
  /** Observaciones en que se basa, si aplica. */
  readonly observations?: number
}

export interface EvidenceItem {
  readonly kind: EvidenceKind
  /** Qué afirma, en una frase. */
  readonly claim: string
  /** Cómo se ha calculado, en lenguaje llano. */
  readonly method: string
  /** Versión del motor que lo produjo. Sin esto no se puede reproducir. */
  readonly modelVersion: string
  readonly sources: readonly EvidenceSource[]
  /**
   * Qué parte del problema cubre, de 0 a 1.
   *
   * `null` cuando no aplica —un hecho cubre lo que cubre— y **nunca 1 por
   * defecto**: decir «cobertura total» sin haberla medido es la clase de
   * afirmación que este contrato existe para impedir.
   */
  readonly coverage: number | null
  /** Lo que este número **no** dice. Obligatorio: un array vacío es una decisión. */
  readonly limitations: readonly string[]
  /** Referencias a las entradas, para poder rehacer el cálculo. */
  readonly inputRefs?: Readonly<Record<string, string | number>>
}

/* ── Construcción ──────────────────────────────────────────────────────────── */

export type EvidenceError = 'missing_claim' | 'missing_method' | 'missing_source' | 'bad_coverage'

export type EvidenceResult =
  | { readonly ok: true; readonly item: EvidenceItem }
  | { readonly ok: false; readonly reason: EvidenceError; readonly detail: string }

export const EVIDENCE_ERROR_TEXT: Readonly<Record<EvidenceError, string>> = {
  missing_claim: 'Una evidencia sin afirmación no explica nada.',
  missing_method: 'Sin decir cómo se calculó, el número es una opinión con formato de dato.',
  missing_source: 'Una afirmación sin fuente no se puede comprobar.',
  bad_coverage: 'La cobertura tiene que ser una fracción entre 0 y 1, o null si no aplica.',
}

/**
 * Construye una evidencia validando lo que no puede faltar.
 *
 * Es una función y no un objeto literal a propósito: obliga a pasar por la
 * validación. Un `EvidenceItem` construido a mano se salta estas reglas, y por
 * eso las pantallas usan esta función.
 */
export function buildEvidence(entrada: EvidenceItem): EvidenceResult {
  if (entrada.claim.trim() === '') {
    return { ok: false, reason: 'missing_claim', detail: EVIDENCE_ERROR_TEXT.missing_claim }
  }
  if (entrada.method.trim() === '') {
    return { ok: false, reason: 'missing_method', detail: EVIDENCE_ERROR_TEXT.missing_method }
  }
  if (entrada.sources.length === 0) {
    return { ok: false, reason: 'missing_source', detail: EVIDENCE_ERROR_TEXT.missing_source }
  }
  if (
    entrada.coverage !== null &&
    (!Number.isFinite(entrada.coverage) || entrada.coverage < 0 || entrada.coverage > 1)
  ) {
    return { ok: false, reason: 'bad_coverage', detail: EVIDENCE_ERROR_TEXT.bad_coverage }
  }

  return { ok: true, item: entrada }
}

/**
 * La fecha más antigua entre las fuentes.
 *
 * Un conjunto es tan viejo como su pieza más vieja: presentar la más reciente
 * daría una impresión de frescura que el resultado no tiene.
 */
export function oldestAsOf(item: EvidenceItem): string | null {
  const fechas = item.sources.map((s) => s.asOf).sort()
  return fechas[0] ?? null
}

/** `true` si alguna fuente son datos de demostración. */
export function isDemo(item: EvidenceItem): boolean {
  return item.sources.some((s) => /demostraci|demo/i.test(s.label))
}

/**
 * ¿Se puede presentar este número sin adornos?
 *
 * Solo un hecho con cobertura completa. Todo lo demás necesita su contexto al
 * lado, y esta función existe para que ninguna pantalla tenga que decidirlo por
 * su cuenta.
 */
export function needsContext(item: EvidenceItem): boolean {
  return item.kind !== 'fact' || (item.coverage !== null && item.coverage < 1)
}
