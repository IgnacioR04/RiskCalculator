/**
 * Pipeline del análisis automático (LAB-1204, endurecido en LAB-1212).
 *
 * ## La propiedad que gobierna el orden de las etapas
 *
 * **Lo que se puede calcular sin red se publica antes de tocar la red.** La
 * concentración sale de los pesos, y los pesos ya están en el dispositivo: hacer
 * esperar ese número a una descarga es regalar diez segundos de pantalla vacía a
 * cambio de nada.
 *
 * De ahí que `onStage` reciba un informe **completo y utilizable** en cada
 * etapa, no un porcentaje. Lo que todavía no se sabe va marcado, y se pinta
 * distinto de un cero.
 *
 * ## Ni un cero inventado
 *
 * Es la regla que más código ocupa aquí y la que más se nota en pantalla. Un
 * HHI de 0 significaría «reparto infinitamente diversificado»; un drawdown de 0,
 * «esta cartera nunca ha caído»; un peso de 0, «esta posición no pesa nada». Las
 * tres son afirmaciones, y ninguna es lo que quiere decir un dato que falta.
 *
 * Lo mismo con la cobertura por valor: dividir el valor conocido entre sí mismo
 * daba **100 % con la mitad de la cartera sin precio**. Ahora es `null` cuando
 * no se puede calcular, y se ofrece la cobertura por número, que sí se conoce.
 *
 * ## Lo que este módulo no hace
 *
 * No descarga: recibe `seriesFor` inyectado. Por eso se puede probar entero sin
 * red y la cola puede compartir una caché entre ámbitos.
 *
 * Y no calcula casi nada de lo que llegará: covarianza, correlaciones,
 * contribuciones al riesgo, Sharpe, Sortino, VaR, CVaR, beta, alpha, escenarios,
 * bootstrap, optimización y robustez siguen **pendientes y declaradas como
 * tales**. Esto no es un diagnóstico completo todavía.
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
  /** Identidad completa: estructura + valoración + configuración de modelo. */
  readonly fingerprint: string
  readonly structuralFingerprint: string
  readonly valuationVersion: string
  readonly modelConfigFingerprint: string
  readonly scope: AnalysisScope
  readonly asOf: string
  readonly baseCurrency: Currency
  /** Todas las posiciones de la cartera; el ámbito filtra aquí dentro. */
  readonly positions: readonly AnalysisPosition[]
  readonly seriesFor: (
    assetIds: readonly string[],
  ) => Promise<ReadonlyMap<string, readonly DatedReturn[]>>
  /** Instrumentos que el adaptador no pudo traer, con su motivo. */
  readonly seriesFailures?: ReadonlyMap<string, string>
}

/** Mínimo de observaciones comunes para dar el riesgo por bueno. */
export const MIN_OBSERVACIONES_RIESGO = 60

/**
 * Lo que este análisis todavía no calcula.
 *
 * Se declara pieza a pieza y no como «faltan cosas»: una limitación concreta se
 * puede comprobar y se puede tachar; una genérica se queda para siempre.
 */
export const MODULOS_PENDIENTES = [
  'covarianza y correlación',
  'contribuciones al riesgo',
  'Sharpe y Sortino',
  'VaR y CVaR',
  'beta, alpha y R²',
  'escenarios de estrés',
  'bootstrap por bloques',
  'optimización y frontera',
  'robustez y fuera de muestra',
] as const

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
  const snapshot = construirSnapshot(posiciones, input)
  publicar(
    {
      snapshot:
        posiciones.length === 0
          ? insufficient(
              'empty_portfolio',
              'No hay posiciones en este ámbito, así que no hay nada que analizar.',
            )
          : available(snapshot, input.asOf, { coverage: coberturaPorNumero(posiciones) }),
    },
    'snapshot',
  )

  if (posiciones.length === 0) return { ...informe, status: 'insufficient' }

  /* Etapa 2 — métricas locales. No esperan a la red, y esa es toda la gracia. */
  const conc = medirConcentracion(snapshot)
  publicar({ concentration: estadoConcentracion(conc, input.asOf) }, 'localMetrics')

  /* Etapa 3 — datos de mercado. */
  const conValor = snapshot.positions.filter((p) => p.value !== null && p.value > 0)
  const series = await input.seriesFor(conValor.map((p) => p.assetId))
  publicar({}, 'marketData')

  /* Etapa 4 — cobertura. */
  const calidad = medirCalidad(snapshot, series, input.seriesFailures)
  publicar({ quality: available(calidad, input.asOf) }, 'quality')

  /* Etapa 5 — riesgo. Depende de la anterior; las demás no dependen de esta. */
  publicar({ risk: medirRiesgo(snapshot, series, input.asOf) }, 'riskAndDependence')

  /* Etapa 6 — diagnóstico. */
  return publicar({ findings: diagnosticar(snapshot, conc, calidad) }, 'diagnosis')
}

/* ── Etapas ────────────────────────────────────────────────────────────────── */

function informeInicial(input: FullAnalysisInput): PortfolioHealthReport {
  const pendiente = <T>() => insufficient<T>('not_calculated_yet', 'Todavía no se ha calculado.')

  return {
    runId: input.runId,
    fingerprint: input.fingerprint,
    structuralFingerprint: input.structuralFingerprint,
    valuationVersion: input.valuationVersion,
    modelConfigFingerprint: input.modelConfigFingerprint,
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
        code: 'modules_pending',
        message: `Este análisis todavía no incluye: ${MODULOS_PENDIENTES.join(', ')}. No es un diagnóstico completo.`,
        affects: [...MODULOS_PENDIENTES],
      },
    ],
  }
}

function construirSnapshot(
  posiciones: readonly AnalysisPosition[],
  input: FullAnalysisInput,
): PortfolioSnapshot {
  const conocido = posiciones
    .filter((p) => p.value !== null && p.value > 0)
    .reduce((s, p) => s + (p.value ?? 0), 0)

  return {
    asOf: input.asOf,
    baseCurrency: input.baseCurrency,
    positions: posiciones,
    knownValue: conocido,
    unvalued: posiciones.filter((p) => p.value === null).map((p) => p.symbol),
    // `null` y no 0: no se sabe cuánto pesa, que no es lo mismo que no pesar.
    weights: posiciones.map((p) =>
      p.value === null || conocido <= 0 ? null : p.value / conocido,
    ),
    valuationVersion: input.valuationVersion,
  }
}

function medirConcentracion(snapshot: PortfolioSnapshot): ConcentrationSummary {
  const valores = snapshot.positions.flatMap((p) =>
    p.value !== null && p.value > 0 ? [p.value] : [],
  )
  const r = concentration(valores)

  if (r.hhi === null || r.effectivePositions === null) {
    return {
      top1: null,
      top5: null,
      hhi: null,
      effectivePositions: null,
      positions: valores.length,
      reasonCode: 'no_positive_values',
    }
  }

  const ordenados = snapshot.weights
    .flatMap((w) => (w === null ? [] : [w]))
    .sort((a, b) => b - a)

  return {
    top1: ordenados[0] ?? null,
    top5: ordenados.length === 0 ? null : ordenados.slice(0, 5).reduce((s, w) => s + w, 0),
    hhi: r.hhi.toNumber(),
    effectivePositions: r.effectivePositions.toNumber(),
    positions: valores.length,
  }
}

function estadoConcentracion(
  conc: ConcentrationSummary,
  asOf: string,
): PortfolioHealthReport['concentration'] {
  if (conc.hhi === null) {
    return insufficient(
      'no_positive_values',
      'Ninguna posición tiene valor conocido, así que no se puede medir la concentración.',
      ['Precio de al menos una posición'],
    )
  }
  return available(conc, asOf)
}

function medirCalidad(
  snapshot: PortfolioSnapshot,
  series: ReadonlyMap<string, readonly DatedReturn[]>,
  fallos: ReadonlyMap<string, string> | undefined,
): DataQualitySummary {
  const total = snapshot.positions.length
  const conPrecio = snapshot.positions.filter((p) => p.value !== null && p.value > 0)
  const haySinValorar = snapshot.unvalued.length > 0

  const valorCon = (predicado: (p: AnalysisPosition) => boolean) =>
    snapshot.knownValue > 0
      ? conPrecio.filter(predicado).reduce((s, p) => s + (p.value ?? 0), 0) / snapshot.knownValue
      : 0

  const porSimbolo = new Map(snapshot.positions.map((p) => [p.assetId, p.symbol]))

  return {
    // Si falta el valor de alguna posición, el denominador correcto —el valor
    // total— es justo el que no se conoce. Decir 100 % aquí sería tranquilizador
    // y falso.
    pricedCoverage: haySinValorar ? null : 1,
    pricedCoverageByCount: total === 0 ? 0 : conPrecio.length / total,
    historyCoverage: valorCon((p) => (series.get(p.assetId)?.length ?? 0) >= MIN_OBSERVACIONES_RIESGO),
    missingSeries: conPrecio
      .filter((p) => (series.get(p.assetId)?.length ?? 0) < MIN_OBSERVACIONES_RIESGO)
      .map((p) => p.symbol),
    failures: [...(fallos ?? new Map())].map(([assetId, reason]) => ({
      symbol: porSimbolo.get(assetId) ?? assetId,
      reason,
    })),
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
    const peso = snapshot.weights[i]
    return s === undefined || s.length === 0 || peso === null || peso === undefined
      ? []
      : [{ peso, serie: s }]
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
    return insufficient('no_value', 'Las posiciones con historial no tienen valor conocido.')
  }

  const cartera = comunes.map((fecha) =>
    conSerie.reduce((s, c, k) => s + (c.peso / pesoTotal) * (mapas[k]!.get(fecha) ?? 0), 0),
  )

  const vol = annualizedVolatility(cartera)
  if (!vol.ok) {
    return insufficient(vol.reason, 'No se puede medir la volatilidad con estas observaciones.')
  }

  // Se reconstruye la riqueza porque `maxDrawdown` trabaja con niveles, no con
  // rendimientos.
  let nivel = 100
  const niveles: SeriesPoint[] = comunes.map((fecha, i) => {
    nivel *= 1 + cartera[i]!
    return { date: fecha, close: nivel }
  })
  const dd = maxDrawdown(niveles)

  return available(
    {
      annualizedVolatility: vol.value,
      // `null` si no se pudo medir: un 0 diría que nunca ha caído.
      maxDrawdown: dd.ok ? dd.value.maxDrawdown : null,
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
      claim: `${snapshot.unvalued.length} ${snapshot.unvalued.length === 1 ? 'posición no tiene precio' : 'posiciones no tienen precio'}: ${snapshot.unvalued.join(', ')}. No se sabe cuánto pesan, así que las demás cifras describen solo el resto.`,
      evidenceIds: ['snapshot.unvalued'],
      actionType: 'complete_data',
      route: '/cartera',
      limitations: ['La cobertura por valor no se puede calcular mientras falte un precio.'],
    })
  }

  if (calidad.failures.length > 0) {
    salida.push({
      code: 'series_failures',
      severity: 'attention',
      confidence: 'high',
      claim: `No llegó el historial de ${calidad.failures.length}: ${calidad.failures.map((f) => f.symbol).join(', ')}.`,
      evidenceIds: ['quality.failures'],
      actionType: 'complete_data',
      route: '/laboratorio/estabilidad/datos',
      limitations: ['El riesgo se mide solo con las posiciones cuya serie sí llegó.'],
    })
  }

  if (calidad.historyCoverage < 0.5) {
    salida.push({
      code: 'insufficient_history_coverage',
      severity: 'critical',
      confidence: 'high',
      claim: `Solo el ${Math.round(calidad.historyCoverage * 100)} % del valor conocido tiene historial suficiente, así que el riesgo medido no representa al conjunto.`,
      evidenceIds: ['quality.historyCoverage'],
      affectedWeight: 1 - calidad.historyCoverage,
      actionType: 'complete_data',
      route: '/laboratorio/estabilidad/datos',
      limitations: ['Volatilidad y caída máxima solo cubren la parte con historial.'],
    })
  }

  if (conc.top1 !== null && conc.top1 > 0.3) {
    salida.push({
      code: 'high_single_position',
      severity: conc.top1 > 0.5 ? 'critical' : 'attention',
      confidence: 'high',
      claim: `Tu mayor posición es el ${Math.round(conc.top1 * 100)} % del valor conocido.`,
      evidenceIds: ['concentration.top1'],
      affectedWeight: conc.top1,
      actionType: 'review_concentration',
      route: '/laboratorio/estabilidad/exposicion',
      limitations: [
        'La concentración describe el reparto del capital, no juzga la calidad del activo.',
      ],
    })
  }

  if (
    conc.effectivePositions !== null &&
    conc.positions > 0 &&
    conc.effectivePositions < conc.positions / 2
  ) {
    salida.push({
      code: 'low_effective_positions',
      severity: 'attention',
      confidence: 'medium',
      claim: `Tienes ${conc.positions} posiciones valoradas, pero el reparto equivale a ${conc.effectivePositions.toFixed(1)}.`,
      evidenceIds: ['concentration.effectivePositions'],
      actionType: 'review_concentration',
      route: '/laboratorio/estabilidad/exposicion',
      limitations: ['Mide el reparto del capital, no cuántas fuentes de riesgo distintas hay.'],
    })
  }

  return salida
}

const coberturaPorNumero = (posiciones: readonly AnalysisPosition[]): number =>
  posiciones.length === 0
    ? 0
    : posiciones.filter((p) => p.value !== null).length / posiciones.length

/** Cuántas etapas tiene el análisis. Para pintar «3 de 6» sin saberse la lista. */
export const TOTAL_STAGES = ANALYSIS_STAGES.length
