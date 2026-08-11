/**
 * Evaluación de calidad de datos (LAB-210).
 *
 * Dos cosas puras y comprobables: la **cobertura ponderada** del documento 02
 * §8.3 y la comparación de las evidencias contra la matriz de umbrales.
 *
 * La regla que gobierna el archivo entero: **ausente no es cero**. Una posición
 * cuyo valor se desconoce no entra en la cobertura como un cero —eso subiría el
 * porcentaje cubierto fingiendo que no hay nada que cubrir—, sino que se aparta
 * y se cuenta como lo que es: un agujero que impide afirmar la cobertura.
 *
 * Aquí no se lee ningún reloj ni ninguna fuente. La frescura la deciden los
 * adaptadores de LAB-211, que conocen el calendario de cada proveedor; esta capa
 * solo recibe qué entidades vienen viejas y la traduce a estado.
 */
import {
  hasBlockingIssues,
  type DataQualityIssue,
  type DataQualityStatus,
  type RemediationCode,
} from '../domain/dataQuality'
import { requirementFor, THRESHOLDS_VERSION, type LabCalculation } from './thresholds'

/**
 * Margen para comparar coberturas.
 *
 * Los pesos son fracciones y sumarlos en coma flotante puede dejar una cartera
 * entera en 0,8999999999999999. Sin margen, un resultado que cumple justo el
 * umbral se bloquearía por un artefacto de redondeo, y el usuario no tendría
 * forma de entender por qué.
 */
const EPS = 1e-9

/* ── Cobertura ponderada ──────────────────────────────────────────────────── */

export interface CoverageEntry {
  readonly entityId: string
  /**
   * Valor de la posición en moneda base. `null` significa **desconocido**, que
   * no es lo mismo que `0`: una posición cerrada vale cero y se sabe; una sin
   * precio no se sabe cuánto vale.
   */
  readonly value: number | null
  /** Si esta entidad aporta el dato que el cálculo necesita. */
  readonly valid: boolean
}

export interface CoverageResult {
  /**
   * Fracción del capital conocido que sí aporta el dato, de 0 a 1.
   *
   * `null` cuando no hay nada sobre lo que calcularla: sin capital conocido, un
   * `0` diría «no hay nada cubierto» cuando lo cierto es «no hay nada que
   * cubrir», y son dos situaciones distintas.
   */
  readonly covered: number | null
  /** Capital con valor conocido. Es el denominador. */
  readonly knownValue: number
  /** Capital conocido que sí aporta el dato. Es el numerador. */
  readonly validValue: number
  /** Entidades cuyo valor se desconoce. No entran en ninguna de las dos sumas. */
  readonly unknownValueEntities: readonly string[]
  /** Entidades con valor conocido que no aportan el dato. */
  readonly missingDataEntities: readonly string[]
}

/**
 * Cobertura ponderada por capital (documento 02 §8.3).
 *
 * Un valor negativo se acepta —una posición corta lo es— pero se señala aparte,
 * porque una suma con signos mezclados puede dar una fracción mayor que uno y
 * eso no es una cobertura, es una incoherencia.
 */
export function weightedCoverage(entries: readonly CoverageEntry[]): CoverageResult {
  const conocidas = entries.filter((entry) => entry.value !== null)
  const knownValue = conocidas.reduce((total, entry) => total + (entry.value as number), 0)
  const validValue = conocidas
    .filter((entry) => entry.valid)
    .reduce((total, entry) => total + (entry.value as number), 0)

  return {
    covered: knownValue === 0 ? null : validValue / knownValue,
    knownValue,
    validValue,
    unknownValueEntities: entries.filter((e) => e.value === null).map((e) => e.entityId),
    missingDataEntities: conocidas.filter((e) => !e.valid).map((e) => e.entityId),
  }
}

/* ── Evaluación contra los umbrales ───────────────────────────────────────── */

export interface QualityEvidence {
  /** Cobertura ya calculada. Se omite en cálculos que no dependen de posiciones. */
  readonly coverage?: CoverageResult
  /** Tamaño de muestra disponible: observaciones, o pares alineados. */
  readonly observations?: number
  /**
   * Entidades cuyos datos vienen viejos. Quién lo decide es el adaptador, que
   * conoce el calendario de su fuente; aquí solo se traduce a estado.
   */
  readonly staleEntities?: readonly string[]
}

export interface QualityAssessment {
  readonly calculation: LabCalculation
  readonly status: DataQualityStatus
  readonly issues: readonly DataQualityIssue[]
  /** Si el cálculo puede presentarse, aunque sea degradado. */
  readonly usable: boolean
  /** Versión de los umbrales bajo la que se evaluó. */
  readonly thresholdsVersion: number
}

/**
 * Evalúa un cálculo contra sus mínimos.
 *
 * Devuelve **todas** las incidencias, no la primera: quien mira esta pantalla
 * quiere saber cuánto le falta, no descubrirlo de una en una.
 *
 * El orden de las incidencias es estable —el de las comprobaciones de esta
 * función—, de modo que dos evaluaciones de los mismos datos dan la misma lista.
 */
export function evaluateCalculation(
  calculation: LabCalculation,
  evidence: QualityEvidence,
): QualityAssessment {
  const requisito = requirementFor(calculation)
  const issues: DataQualityIssue[] = []
  const { coverage } = evidence

  // 1. Incoherencias primero: si los datos se contradicen, el resto de las
  // comprobaciones mediría sobre arena.
  if (coverage !== undefined && coverage.covered !== null && coverage.covered > 1 + EPS) {
    issues.push({
      code: 'inconsistent_values',
      dimension: 'consistency',
      scope: 'portfolio',
      severity: 'blocking',
      messageKey: 'quality.inconsistent.coverage',
      observed: coverage.covered,
      required: 1,
      remediation: 'review_inputs',
    })
  }

  // 2. Nada que medir. No es un fallo del usuario ni un error: es un estado.
  // Si el valor conocido es cero y tampoco hay nada pendiente de valorar, no hay
  // cartera sobre la que decir nada.
  if (
    coverage !== undefined &&
    coverage.knownValue === 0 &&
    coverage.unknownValueEntities.length === 0
  ) {
    issues.push({
      code: 'no_data',
      dimension: 'availability',
      scope: 'portfolio',
      severity: 'blocking',
      messageKey: 'quality.noData',
      remediation: 'complete_portfolio',
    })
  }

  // 3. Valores desconocidos. Impiden **afirmar** la cobertura, y por eso se
  // dicen aunque el porcentaje sobre lo conocido salga bien: el que falta podría
  // ser el grande. Donde hay un mínimo de cobertura que cumplir, bloquean;
  // donde no lo hay, el resultado es parcial y basta con avisar.
  if (coverage !== undefined && coverage.unknownValueEntities.length > 0) {
    const comun = {
      code: 'value_unknown',
      dimension: 'completeness',
      scope: 'portfolio',
      messageKey: 'quality.valueUnknown',
      observed: coverage.unknownValueEntities.length,
    } as const
    issues.push(
      requisito.minCoverage === undefined
        ? { ...comun, severity: 'warning', remediation: 'update_prices' }
        : { ...comun, severity: 'blocking', remediation: 'update_prices' },
    )
  }

  // 4. Cobertura por debajo del mínimo.
  if (
    requisito.minCoverage !== undefined &&
    coverage !== undefined &&
    coverage.covered !== null &&
    coverage.covered < requisito.minCoverage - EPS
  ) {
    issues.push({
      code: 'coverage_below_minimum',
      dimension: 'completeness',
      scope: 'portfolio',
      severity: requisito.onShortfall === 'block' ? 'blocking' : 'warning',
      messageKey: 'quality.coverageBelowMinimum',
      observed: coverage.covered,
      required: requisito.minCoverage,
      // Excluir lo que no tiene datos sube la cobertura de lo que queda, y deja
      // dicho qué parte se ha dejado fuera.
      remediation: 'exclude_asset',
    })
  }

  // 5. Muestra por debajo del mínimo, y por debajo de lo deseable.
  if (requisito.minObservations !== undefined && evidence.observations !== undefined) {
    if (evidence.observations < requisito.minObservations) {
      issues.push({
        code: 'sample_below_minimum',
        dimension: 'temporalCoverage',
        scope: 'series',
        severity: 'blocking',
        messageKey: 'quality.sampleBelowMinimum',
        observed: evidence.observations,
        required: requisito.minObservations,
        remediation: 'add_history',
      })
    }
  }

  if (
    requisito.preferredObservations !== undefined &&
    evidence.observations !== undefined &&
    evidence.observations < requisito.preferredObservations
  ) {
    issues.push({
      code: 'sample_below_preferred',
      dimension: 'temporalCoverage',
      scope: 'series',
      severity: 'warning',
      messageKey: 'quality.sampleBelowPreferred',
      observed: evidence.observations,
      required: requisito.preferredObservations,
      remediation: 'add_history',
    })
  }

  // 6. Datos viejos. Nunca bloquean por sí solos: un dato de ayer sigue siendo
  // un dato, y decidir que no sirve es del usuario.
  for (const entityId of evidence.staleEntities ?? []) {
    issues.push({
      code: 'data_stale',
      dimension: 'freshness',
      scope: 'instrument',
      entityId,
      severity: 'warning',
      messageKey: 'quality.dataStale',
      remediation: 'update_prices',
    })
  }

  const status = resolveStatus(issues)
  return {
    calculation,
    status,
    issues,
    usable: status !== 'insufficient' && status !== 'invalid',
    thresholdsVersion: THRESHOLDS_VERSION,
  }
}

/**
 * Estado agregado a partir de las incidencias.
 *
 * El orden de precedencia es deliberado: primero lo que no se arregla con más
 * datos (`invalid`), luego lo que sí (`insufficient`), y solo después los
 * matices. Un dato viejo que además está incompleto es, sobre todo, incompleto.
 */
export function resolveStatus(issues: readonly DataQualityIssue[]): DataQualityStatus {
  if (issues.some((issue) => issue.code === 'inconsistent_values')) return 'invalid'
  if (hasBlockingIssues(issues)) return 'insufficient'

  const avisos = issues.filter((issue) => issue.severity === 'warning')
  if (avisos.length === 0) return 'good'
  // Solo se llama viejo a lo que únicamente es viejo: si además falta algo, lo
  // que importa es lo que falta.
  if (avisos.every((issue) => issue.code === 'data_stale')) return 'stale'
  return 'partial'
}

/**
 * Todas las acciones distintas que desbloquearían el cálculo, sin repetir.
 *
 * Solo mira las incidencias que bloquean: un aviso no pide ninguna acción, y
 * mezclarlos daría una lista de deberes que nadie tiene que hacer.
 */
export function blockingRemediations(
  assessment: QualityAssessment,
): readonly RemediationCode[] {
  const acciones = assessment.issues.flatMap((issue) =>
    issue.severity === 'blocking' ? [issue.remediation] : [],
  )
  return [...new Set(acciones)]
}
