/**
 * Pipeline del análisis automático (LAB-1204).
 *
 * ## La propiedad que gobierna el orden de las etapas
 *
 * **Lo que se puede calcular sin red se publica antes de tocar la red.** La
 * concentración de una cartera sale de los pesos, y los pesos ya están en el
 * dispositivo: hacer esperar ese número a que termine una descarga de historial
 * es regalar diez segundos de pantalla vacía a cambio de nada.
 *
 * De ahí que `onStage` reciba un informe **completo y utilizable** en cada
 * etapa, no un porcentaje. Lo que todavía no se sabe va marcado como
 * `insufficient`, que se pinta distinto de un cero.
 *
 * ## Lo que no hace este módulo
 *
 * No descarga. Recibe `seriesFor` inyectado, y esa es la razón de que se pueda
 * probar entero sin red y de que la cola pueda compartir una caché entre la
 * cartera consolidada y cada cuenta. Un pipeline que sabe de proveedores no se
 * puede ejecutar dos veces sin pedir dos veces.
 *
 * Tampoco optimiza ni simula: esas etapas llegan con las fases siguientes y hoy
 * salen declaradas como pendientes en vez de omitidas.
 */
import { annualizedVolatility, maxDrawdown, type SeriesPoint } from '../../finance/historical'
import { concentration } from '../../finance/metrics'
import {
  ANALYSIS_STAGES,
  available,
  FULL_ANALYSIS_MODEL_VERSION,
  insufficient,
  type AnalysisScope,
  type AnalysisStage,
  type AnalysisPosition,
  type ConcentrationSummary,
  type DataQualitySummary,
  type PortfolioFinding,
  type PortfolioHealthReport,
  type PortfolioSnapshot,
  type RiskSummary,
} from './contracts'
import type { Currency } from '../../domain'

/** Rendimiento diario de un activo. */
export interface DatedReturn {
  readonly date: string
  readonly value: number
}

export interface FullAnalysisInput {
  readonly runId: string
  readonly fingerprint: string
  readonly scope: AnalysisScope
  readonly asOf: string
  readonly baseCurrency: Currency
  /** Todas las posiciones de la cartera; el ámbito filtra aquí dentro. */
  readonly positions: readonly AnalysisPosition[]
  /**
   * Devuelve las series de los activos pedidos. Inyectado a propósito: así el
   * pipeline no sabe que existen los proveedores y la cola puede compartir una
   * caché entre ámbitos.
   */
  readonly seriesFor: (assetIds: readonly string[]) => Promise<ReadonlyMap<string, readonly DatedReturn[]>>
}

/** Mínimo de observaciones comunes para dar riesgo por bueno. */
export const MIN_OBSERVACIONES_RIESGO = 60

/**
 * Ejecuta el análisis publicando resultados por etapas.
 *
 * `onStage` se llama con el informe entero cada vez que una etapa termina, y el
 * informe devuelto al final es el mismo objeto de la última llamada.
 */
export async function runFullAnalysis(
  input: FullAnalysisInput,
  onStage?: (informe: PortfolioHealthReport, etapa: AnalysisStage) => void,
): Promise<PortfolioHealthReport> {
  const completadas: AnalysisStage[] = []
  let informe = informeInicial(input)

  const publicar = (parcial: Partial<PortfolioHealthReport>, etapa: AnalysisStage) => {
    completadas.push(etapa)
    informe = {
      ...informe,
      ...parcial,
      completedStages: [...completadas],
      status: etapa === 'diagnosis' ? 'ready' : 'partial',
    }
    onStage?.(informe, etapa)
    return informe
  }

  /* Etapa 1 — instantánea. Solo aritmética sobre lo que ya está guardado. */
  const posiciones = input.positions.filter((p) =>
    input.scope.kind === 'portfolio' ? true : p.accountId === input.scope.accountId,
  )
  const snapshot = construirSnapshot(posiciones, input.asOf, input.baseCurrency)
  publicar(
    {
      snapshot:
        snapshot.positions.length === 0
          ? insufficient(
              'empty_portfolio',
              'No hay posiciones en este ámbito, así que no hay nada que analizar.',
            )
          : available(snapshot, input.asOf, { coverage: cobertura(posiciones) }),
    },
    'snapshot',
  )

  if (snapshot.positions.length === 0) {
    return { ...informe, status: 'insufficient' }
  }

  /* Etapa 2 — métricas locales. No esperan a la red, y esa es toda la gracia. */
  publicar({ concentration: available(medirConcentracion(snapshot), input.asOf) }, 'localMetrics')

  /* Etapa 3 — datos de mercado. */
  const conValor = snapshot.positions.filter((p) => p.value !== null && p.value > 0)
  const series = await input.seriesFor(conValor.map((p) => p.assetId))
  publicar({}, 'marketData')

  /* Etapa 4 — cobertura. */
  const calidad = medirCalidad(snapshot, series)
  publicar({ quality: available(calidad, input.asOf) }, 'quality')

  /* Etapa 5 — riesgo. Depende de la etapa anterior; las demás no. */
  publicar({ risk: medirRiesgo(snapshot, series, input.asOf) }, 'riskAndDependence')

  /* Etapa 6 — diagnóstico. */
  const informeFinal = publicar(
    { findings: diagnosticar(snapshot, medirConcentracion(snapshot), calidad) },
    'diagnosis',
  )

  return informeFinal
}

/* ── Etapas ────────────────────────────────────────────────────────────────── */

function informeInicial(input: FullAnalysisInput): PortfolioHealthReport {
  const pendiente = <T>() =>
    insufficient<T>('not_calculated_yet', 'Todavía no se ha calculado.')

  return {
    runId: input.runId,
    fingerprint: input.fingerprint,
    scope: input.scope,
    asOf: input.asOf,
    createdAt: new Date().toISOString(),
    modelVersion: FULL_ANALYSIS_MODEL_VERSION,
    status: 'normalizing',
    completedStages: [],
    snapshot: pendiente<PortfolioSnapshot>(),
    concentration: pendiente<ConcentrationSummary>(),
    quality: pendiente<DataQualitySummary>(),
    risk: pendiente<RiskSummary>(),
    findings: [],
    limitations: [
      {
        code: 'stages_pending',
        message:
          'Optimización, escenarios, simulación y robustez todavía no forman parte del análisis automático: llegan en fases siguientes.',
        affects: ['optimization', 'stress', 'simulation', 'robustness'],
      },
    ],
  }
}

function construirSnapshot(
  posiciones: readonly AnalysisPosition[],
  asOf: string,
  baseCurrency: Currency,
): PortfolioSnapshot {
  const conValor = posiciones.filter((p) => p.value !== null && p.value > 0)
  const total = conValor.reduce((s, p) => s + (p.value ?? 0), 0)

  return {
    asOf,
    baseCurrency,
    positions: posiciones,
    totalValue: total,
    // Se nombran, no se cuentan como cero: una posición sin precio no vale
    // cero, es que no se sabe cuánto vale.
    unvalued: posiciones.filter((p) => p.value === null).map((p) => p.symbol),
    weights: posiciones.map((p) => (total > 0 ? (p.value ?? 0) / total : 0)),
  }
}

function medirConcentracion(snapshot: PortfolioSnapshot): ConcentrationSummary {
  const valores = snapshot.positions.flatMap((p) => (p.value !== null && p.value > 0 ? [p.value] : []))
  const r = concentration(valores)
  const ordenados = [...snapshot.weights].sort((a, b) => b - a)

  return {
    top1: ordenados[0] ?? 0,
    top5: ordenados.slice(0, 5).reduce((s, w) => s + w, 0),
    hhi: r.hhi === null ? 0 : r.hhi.toNumber(),
    effectivePositions: r.effectivePositions === null ? 0 : r.effectivePositions.toNumber(),
    positions: valores.length,
  }
}

function medirCalidad(
  snapshot: PortfolioSnapshot,
  series: ReadonlyMap<string, readonly DatedReturn[]>,
): DataQualitySummary {
  const total = snapshot.totalValue
  const valorCon = (predicado: (p: AnalysisPosition) => boolean) =>
    total > 0
      ? snapshot.positions.filter(predicado).reduce((s, p) => s + (p.value ?? 0), 0) / total
      : 0

  return {
    pricedCoverage: valorCon((p) => p.value !== null && p.value > 0),
    historyCoverage: valorCon(
      (p) => (series.get(p.assetId)?.length ?? 0) >= MIN_OBSERVACIONES_RIESGO,
    ),
    missingSeries: snapshot.positions
      .filter((p) => (series.get(p.assetId)?.length ?? 0) < MIN_OBSERVACIONES_RIESGO)
      .map((p) => p.symbol),
    stalestPriceDays: null,
  }
}

/**
 * Riesgo de la cartera a partir de las series alineadas.
 *
 * Se usan **solo las fechas comunes a todas las posiciones con serie**. Rellenar
 * un hueco con cero inventaría un día plano para un activo que no cotizó, y eso
 * baja su volatilidad y su correlación con el resto: haría la cartera más
 * tranquila de lo que es.
 */
function medirRiesgo(
  snapshot: PortfolioSnapshot,
  series: ReadonlyMap<string, readonly DatedReturn[]>,
  asOf: string,
): PortfolioHealthReport['risk'] {
  const conSerie = snapshot.positions.flatMap((p, i) => {
    const s = series.get(p.assetId)
    return s === undefined || s.length === 0 ? [] : [{ peso: snapshot.weights[i]!, serie: s }]
  })

  if (conSerie.length === 0) {
    return insufficient(
      'insufficient_history',
      'Ninguna posición tiene historial descargado, así que no se puede medir el riesgo.',
      ['Historial de precios de al menos una posición'],
    )
  }

  const mapas = conSerie.map((c) => new Map(c.serie.map((p) => [p.date, p.value])))
  const comunes = [...mapas[0]!.keys()].filter((f) => mapas.every((m) => m.has(f))).sort()

  if (comunes.length < MIN_OBSERVACIONES_RIESGO) {
    return insufficient(
      'insufficient_data',
      `Hay ${comunes.length} observaciones comunes y hacen falta ${MIN_OBSERVACIONES_RIESGO}.`,
      [`${MIN_OBSERVACIONES_RIESGO - comunes.length} días más de historial común`],
    )
  }

  const pesoTotal = conSerie.reduce((s, c) => s + c.peso, 0)
  if (pesoTotal <= 0) {
    return insufficient('no_value', 'Las posiciones con historial no tienen valor.')
  }

  const cartera = comunes.map((fecha) =>
    conSerie.reduce((s, c, k) => s + (c.peso / pesoTotal) * (mapas[k]!.get(fecha) ?? 0), 0),
  )

  const vol = annualizedVolatility(cartera)
  if (!vol.ok) {
    return insufficient(vol.reason, 'No se puede medir la volatilidad con estas observaciones.')
  }

  // Se reconstruye la riqueza para el drawdown: `maxDrawdown` trabaja con
  // niveles, no con rendimientos.
  let nivel = 100
  const niveles: SeriesPoint[] = comunes.map((fecha, i) => {
    nivel *= 1 + cartera[i]!
    return { date: fecha, close: nivel }
  })
  const dd = maxDrawdown(niveles)

  return available(
    {
      annualizedVolatility: vol.value,
      maxDrawdown: dd.ok ? dd.value.maxDrawdown : 0,
      observations: comunes.length,
    },
    asOf,
    { observations: comunes.length, coverage: pesoTotal },
  )
}

/**
 * Hallazgos, en el orden que impone el contrato.
 *
 * Los datos que invalidan cálculos van primero **siempre**: enseñar una
 * conclusión sobre concentración antes de avisar de que falta la mitad de los
 * precios es dar por buena una cifra que no lo es.
 */
function diagnosticar(
  snapshot: PortfolioSnapshot,
  conc: ConcentrationSummary,
  calidad: DataQualitySummary,
): readonly PortfolioFinding[] {
  const salida: PortfolioFinding[] = []

  if (snapshot.unvalued.length > 0) {
    salida.push({
      code: 'unvalued_positions',
      severity: 'critical',
      confidence: 'high',
      claim: `${snapshot.unvalued.length} ${snapshot.unvalued.length === 1 ? 'posición no tiene precio' : 'posiciones no tienen precio'}: ${snapshot.unvalued.join(', ')}. Todo lo demás se calcula sin ellas.`,
      evidenceIds: ['snapshot.unvalued'],
      actionType: 'complete_data',
      route: '/cartera',
      limitations: ['Los pesos y la concentración se calculan sobre el valor conocido.'],
    })
  }

  if (calidad.historyCoverage < 0.5) {
    salida.push({
      code: 'insufficient_history_coverage',
      severity: 'critical',
      confidence: 'high',
      claim: `Solo el ${Math.round(calidad.historyCoverage * 100)} % de tu cartera tiene historial suficiente, así que el riesgo medido no representa al conjunto.`,
      evidenceIds: ['quality.historyCoverage'],
      affectedWeight: 1 - calidad.historyCoverage,
      actionType: 'complete_data',
      route: '/laboratorio/estabilidad/datos',
      limitations: ['Volatilidad, correlaciones y caída máxima solo cubren la parte con historial.'],
    })
  }

  if (conc.top1 > 0.3) {
    salida.push({
      code: 'high_single_position',
      severity: conc.top1 > 0.5 ? 'critical' : 'attention',
      confidence: 'high',
      claim: `Tu mayor posición es el ${Math.round(conc.top1 * 100)} % de la cartera.`,
      evidenceIds: ['concentration.top1'],
      affectedWeight: conc.top1,
      actionType: 'review_concentration',
      route: '/laboratorio/estabilidad/exposicion',
      limitations: [
        'La concentración describe el reparto del capital, no juzga la calidad del activo.',
      ],
    })
  }

  if (conc.effectivePositions > 0 && conc.effectivePositions < conc.positions / 2) {
    salida.push({
      code: 'low_effective_positions',
      severity: 'attention',
      confidence: 'medium',
      claim: `Tienes ${conc.positions} posiciones, pero el reparto equivale a ${conc.effectivePositions.toFixed(1)}.`,
      evidenceIds: ['concentration.effectivePositions'],
      actionType: 'review_concentration',
      route: '/laboratorio/estabilidad/exposicion',
      limitations: ['Mide el reparto del capital, no cuántas fuentes de riesgo distintas hay.'],
    })
  }

  return salida
}

const cobertura = (posiciones: readonly AnalysisPosition[]): number => {
  const total = posiciones.length
  return total === 0 ? 0 : posiciones.filter((p) => p.value !== null).length / total
}

/** Cuántas etapas tiene el análisis. Para pintar «3 de 6» sin saberse la lista. */
export const TOTAL_STAGES = ANALYSIS_STAGES.length
