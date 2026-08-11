/**
 * Adaptador de calidad sobre los datos que ya existen (LAB-211).
 *
 * Traduce lo que la aplicación ya tiene —cotizaciones, tipos de cambio, series
 * históricas y las posiciones ya construidas— al modelo de calidad de LAB-210.
 * No añade datos, no los corrige y **no hace ninguna llamada de red**: recibe lo
 * que hay en memoria y dice qué se puede afirmar con ello.
 *
 * Que no haga red no es una promesa: este archivo no importa nada de
 * `lib/market/service`, y hay una prueba que recorre el fuente para comprobarlo.
 * Una convención sin guardián se rompe sola.
 *
 * `asOf` entra como argumento. Sin él, el mismo informe cambiaría solo por
 * mirarlo más tarde, y el criterio de aceptación de la tarea es justo el
 * contrario: **la misma cartera produce el mismo informe**.
 */
import type { Currency, DataQuality, FxRate, Quote } from '../../domain'
import type { PositionView } from '../../portfolio'
import type { SeriesPoint } from '../../market/seriesCache'
import type {
  DataQualityIssue,
  DataQualityStatus,
} from '../domain/dataQuality'
import { evaluateCalculation, resolveStatus, weightedCoverage } from './quality'
import type { CoverageEntry, CoverageResult, QualityAssessment } from './quality'
import {
  CALCULATION_REQUIREMENTS,
  FRESHNESS_LIMITS,
  THRESHOLDS_VERSION,
  type LabCalculation,
} from './thresholds'

/* ── Entrada y salida ─────────────────────────────────────────────────────── */

export interface PortfolioQualityInput {
  /** Posiciones ya construidas por `buildPortfolioView`. */
  readonly positions: readonly PositionView[]
  readonly quotes: Readonly<Record<string, Quote>>
  readonly fxRates: readonly FxRate[]
  readonly displayCurrency: Currency
  /**
   * Series ya descargadas, por identificador de activo. Ausente significa «no
   * hay historia en memoria», que **no** es lo mismo que «no existe»: el
   * informe lo dice como falta de dato, no como serie vacía.
   */
  readonly series?: Readonly<Record<string, readonly SeriesPoint[]>>
}

/**
 * Estado de un campo en la tabla de cobertura (documento 01 §6.2).
 *
 * `missing` y `not_applicable` son distintos a propósito: al primero le falta un
 * dato que debería estar; el segundo no lo necesita. Un fondo indexado sin
 * componentes declarados es lo primero; una acción suelta, lo segundo.
 */
export type FieldState =
  | 'ok'
  | 'stale'
  | 'manual'
  | 'estimated'
  | 'demo'
  | 'missing'
  | 'not_applicable'

/** Una fila de la tabla de cobertura por activo. */
export interface AssetQualityRow {
  readonly assetId: string
  readonly symbol: string
  readonly name: string
  /** Valor en divisa de presentación. `null` cuando no se conoce. */
  readonly value: number | null
  readonly price: FieldState
  readonly fx: FieldState
  readonly history: FieldState
  readonly classification: FieldState
  readonly lookThrough: FieldState
  /** Instante del dato más reciente que sostiene la fila. */
  readonly lastUpdate?: string
  readonly source?: string
  readonly status: DataQualityStatus
  readonly issues: readonly DataQualityIssue[]
}

export interface PortfolioQualityReport {
  readonly asOf: string
  readonly baseCurrency: Currency
  readonly rows: readonly AssetQualityRow[]
  readonly coverage: {
    readonly price: CoverageResult
    readonly history: CoverageResult
    readonly lookThrough: CoverageResult
  }
  /** Evaluación por cálculo, en orden estable. */
  readonly calculations: readonly QualityAssessment[]
  readonly thresholdsVersion: number
}

/* ── Traducción de la calidad existente ───────────────────────────────────── */

/**
 * `DataQuality` de la aplicación actual → estado de campo.
 *
 * `delayed` se traduce a `ok`: un precio con retardo sigue siendo un precio de
 * mercado, y la antigüedad se mide aparte, con fechas, no con esta etiqueta.
 */
const ESTADO_POR_CALIDAD: Readonly<Record<DataQuality, FieldState>> = {
  real: 'ok',
  delayed: 'ok',
  estimated: 'estimated',
  manual: 'manual',
  demo: 'demo',
}

/** Estados de campo que sirven para calcular. `demo` no cuenta como dato real. */
const APORTA_DATO: ReadonlySet<FieldState> = new Set<FieldState>([
  'ok',
  'stale',
  'manual',
  'estimated',
])

/* ── Informe ──────────────────────────────────────────────────────────────── */

/**
 * Evalúa la cartera contra el modelo de calidad.
 *
 * El orden de las filas es el de las posiciones recibidas, y el de las
 * incidencias el de las comprobaciones: dos ejecuciones con los mismos datos
 * producen el mismo objeto, hasta en el orden de las listas.
 */
export function assessPortfolioQuality(
  input: PortfolioQualityInput,
  asOf: string,
): PortfolioQualityReport {
  const rows = input.positions.map((posicion) => evaluarPosicion(posicion, input, asOf))

  const coverage = {
    price: weightedCoverage(rows.map((fila) => entrada(fila, fila.price))),
    history: weightedCoverage(rows.map((fila) => entrada(fila, fila.history))),
    lookThrough: weightedCoverage(rows.map((fila) => entrada(fila, fila.lookThrough))),
  }

  const viejos = rows.filter((fila) => fila.price === 'stale').map((fila) => fila.assetId)
  const observaciones = observacionesAlineadas(input)

  // Solo se evalúan los cálculos para los que hay evidencia. `sectorSignal`
  // queda fuera: no hay universo ni factores hasta la Fase 7, y evaluarlo sin
  // evidencia devolvería «suficiente», que sería justo lo contrario de la
  // verdad.
  const calculations: QualityAssessment[] = [
    evaluateCalculation('directExposure', { coverage: coverage.price, staleEntities: viejos }),
    evaluateCalculation('lookThrough', { coverage: coverage.lookThrough }),
    evaluateCalculation('volatility', {
      coverage: coverage.history,
      observations: observaciones,
    }),
    evaluateCalculation('correlation', {
      coverage: coverage.history,
      observations: observaciones,
    }),
    evaluateCalculation('historicalCVaR', {
      coverage: coverage.history,
      observations: observaciones,
    }),
  ]

  return {
    asOf,
    baseCurrency: input.displayCurrency,
    rows,
    coverage,
    calculations,
    thresholdsVersion: THRESHOLDS_VERSION,
  }
}

function entrada(fila: AssetQualityRow, estado: FieldState): CoverageEntry {
  return { entityId: fila.assetId, value: fila.value, valid: APORTA_DATO.has(estado) }
}

/* ── Una posición ─────────────────────────────────────────────────────────── */

function evaluarPosicion(
  posicion: PositionView,
  input: PortfolioQualityInput,
  asOf: string,
): AssetQualityRow {
  const { asset } = posicion
  const issues: DataQualityIssue[] = []
  const cotizacion = input.quotes[asset.id] ?? posicion.quote ?? null

  const price = estadoDelPrecio(posicion, cotizacion, asOf, issues)
  const fx = estadoDelCambio(asset.quoteCurrency, input, asOf, issues)
  const history = estadoDeLaHistoria(asset.id, input, asOf, issues)
  const classification: FieldState = asset.sector === undefined ? 'missing' : 'ok'
  const lookThrough = estadoDelLookThrough(posicion)

  comprobarCoherencia(posicion, cotizacion, issues)

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    value: posicion.value === null ? null : posicion.value.toNumber(),
    price,
    fx,
    history,
    classification,
    lookThrough,
    ...(cotizacion === null ? {} : { lastUpdate: cotizacion.timestamp, source: cotizacion.provider }),
    status: resolveStatus(issues),
    issues,
  }
}

function estadoDelPrecio(
  posicion: PositionView,
  cotizacion: Quote | null,
  asOf: string,
  issues: DataQualityIssue[],
): FieldState {
  if (cotizacion === null) {
    if (posicion.asset.manualPrice !== undefined) return 'manual'
    issues.push({
      code: 'value_unknown',
      dimension: 'availability',
      scope: 'instrument',
      entityId: posicion.asset.id,
      severity: 'blocking',
      messageKey: 'quality.asset.noPrice',
      remediation: 'update_prices',
    })
    return 'missing'
  }

  // El origen se comprueba **antes** que la antigüedad. Un precio de
  // demostración caducado no es «un precio algo viejo»: no es un precio. Al
  // revés, la fila diría solo «antiguo» y el dato inventado pasaría por bueno
  // con actualizarlo, que es justo lo contrario de lo que hace falta.
  if (cotizacion.quality === 'demo') {
    issues.push({
      code: 'no_data',
      dimension: 'sourceReliability',
      scope: 'instrument',
      entityId: posicion.asset.id,
      severity: 'blocking',
      messageKey: 'quality.asset.demoPrice',
      remediation: 'enter_manually',
    })
    return 'demo'
  }

  if (esViejo(cotizacion.timestamp, asOf, FRESHNESS_LIMITS.quoteDays)) {
    issues.push({
      code: 'data_stale',
      dimension: 'freshness',
      scope: 'instrument',
      entityId: posicion.asset.id,
      severity: 'warning',
      messageKey: 'quality.asset.stalePrice',
      observed: cotizacion.timestamp,
      required: `${FRESHNESS_LIMITS.quoteDays} días`,
      remediation: 'update_prices',
    })
    return 'stale'
  }

  return ESTADO_POR_CALIDAD[cotizacion.quality]
}

/**
 * Estado del cambio necesario para expresar la posición en divisa de
 * presentación. Si el activo ya cotiza en esa divisa, no hace falta ninguno.
 */
function estadoDelCambio(
  divisa: Currency,
  input: PortfolioQualityInput,
  asOf: string,
  issues: DataQualityIssue[],
): FieldState {
  if (divisa === input.displayCurrency) return 'not_applicable'

  const cambio = input.fxRates.find(
    (fx) =>
      (fx.base === divisa && fx.quote === input.displayCurrency) ||
      (fx.base === input.displayCurrency && fx.quote === divisa),
  )

  if (cambio === undefined) {
    issues.push({
      code: 'value_unknown',
      dimension: 'availability',
      scope: 'portfolio',
      severity: 'blocking',
      messageKey: 'quality.fx.missing',
      observed: `${divisa}/${input.displayCurrency}`,
      remediation: 'update_prices',
    })
    return 'missing'
  }

  if (esViejo(`${cambio.date}T00:00:00Z`, asOf, FRESHNESS_LIMITS.fxDays)) {
    issues.push({
      code: 'data_stale',
      dimension: 'freshness',
      scope: 'portfolio',
      severity: 'warning',
      messageKey: 'quality.fx.stale',
      observed: cambio.date,
      required: `${FRESHNESS_LIMITS.fxDays} días`,
      remediation: 'update_prices',
    })
    return 'stale'
  }

  return ESTADO_POR_CALIDAD[cambio.quality]
}

function estadoDeLaHistoria(
  assetId: string,
  input: PortfolioQualityInput,
  asOf: string,
  issues: DataQualityIssue[],
): FieldState {
  // Falta de historia **avisa** en la fila, no bloquea. Si bloquea o no depende
  // del cálculo, y eso ya lo decide la evaluación por cálculo a partir de la
  // cobertura: sin serie, la cobertura histórica cae y la volatilidad se corta
  // sola. Bloquear también aquí contaría el mismo problema dos veces y pintaría
  // de rojo una cartera cuyo valor y exposición se conocen perfectamente.
  const serie = input.series?.[assetId]
  if (serie === undefined || serie.length === 0) {
    issues.push({
      code: 'no_data',
      dimension: 'temporalCoverage',
      scope: 'series',
      entityId: assetId,
      severity: 'warning',
      messageKey: 'quality.history.missing',
      remediation: 'add_history',
    })
    return 'missing'
  }

  const minimo = CALCULATION_REQUIREMENTS.volatility.minObservations ?? 0
  if (serie.length < minimo) {
    issues.push({
      code: 'sample_below_minimum',
      dimension: 'temporalCoverage',
      scope: 'series',
      entityId: assetId,
      severity: 'warning',
      messageKey: 'quality.history.short',
      observed: serie.length,
      required: minimo,
      remediation: 'add_history',
    })
    return 'missing'
  }

  const ultima = serie.reduce((max, punto) => (punto.date > max ? punto.date : max), serie[0]!.date)
  if (esViejo(`${ultima}T00:00:00Z`, asOf, FRESHNESS_LIMITS.historyDays)) {
    issues.push({
      code: 'data_stale',
      dimension: 'freshness',
      scope: 'series',
      entityId: assetId,
      severity: 'warning',
      messageKey: 'quality.history.stale',
      observed: ultima,
      required: `${FRESHNESS_LIMITS.historyDays} días`,
      remediation: 'add_history',
    })
    return 'stale'
  }

  return 'ok'
}

/**
 * Solo los envoltorios necesitan componentes; una acción suelta no.
 *
 * `index` entra porque un producto que replica un índice también tiene dentro
 * algo que mirar. Los demás tipos del catálogo actual —acción, cripto, materia
 * prima, efectivo, manual— son posiciones directas: pedirles componentes sería
 * marcar como incompleto lo que está completo.
 */
const ENVOLTORIOS: ReadonlySet<PositionView['asset']['assetType']> = new Set(['etf', 'index'])

function estadoDelLookThrough(posicion: PositionView): FieldState {
  if (!ENVOLTORIOS.has(posicion.asset.assetType)) return 'not_applicable'
  const componentes = posicion.asset.holdings
  return componentes === undefined || componentes.length === 0 ? 'missing' : 'ok'
}

/**
 * Incoherencias entre datos que existen. No son huecos: son contradicciones, y
 * conseguir más datos no las arregla.
 */
function comprobarCoherencia(
  posicion: PositionView,
  cotizacion: Quote | null,
  issues: DataQualityIssue[],
): void {
  const { asset } = posicion

  if (asset.symbol.trim() === '') {
    issues.push({
      code: 'inconsistent_values',
      dimension: 'validity',
      scope: 'instrument',
      entityId: asset.id,
      severity: 'blocking',
      messageKey: 'quality.asset.emptySymbol',
      remediation: 'review_inputs',
    })
  }

  if (cotizacion !== null && cotizacion.currency !== asset.quoteCurrency) {
    // Un precio en otra divisa que la del activo se convertiría dos veces, o
    // ninguna. En ambos casos el valor sale mal sin que nada falle.
    issues.push({
      code: 'inconsistent_values',
      dimension: 'consistency',
      scope: 'instrument',
      entityId: asset.id,
      severity: 'blocking',
      messageKey: 'quality.asset.currencyMismatch',
      observed: cotizacion.currency,
      required: asset.quoteCurrency,
      remediation: 'review_inputs',
    })
  }

  if (cotizacion !== null && !esNumeroPositivo(cotizacion.price)) {
    issues.push({
      code: 'inconsistent_values',
      dimension: 'validity',
      scope: 'instrument',
      entityId: asset.id,
      severity: 'blocking',
      messageKey: 'quality.asset.invalidPrice',
      observed: cotizacion.price,
      remediation: 'review_inputs',
    })
  }
}

/* ── Utilidades ───────────────────────────────────────────────────────────── */

/** Días naturales entre dos instantes ISO. Negativo si el dato es del futuro. */
export function diasDesde(instante: string, asOf: string): number | null {
  const desde = new Date(instante).getTime()
  const hasta = new Date(asOf).getTime()
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return null
  return (hasta - desde) / (24 * 60 * 60 * 1000)
}

/**
 * Una fecha ilegible **no** se considera vieja: se considera inválida, y de eso
 * se encarga la comprobación de coherencia. Devolver `true` aquí mezclaría dos
 * problemas distintos bajo el mismo aviso.
 */
function esViejo(instante: string, asOf: string, limiteDias: number): boolean {
  const dias = diasDesde(instante, asOf)
  return dias !== null && dias > limiteDias
}

function esNumeroPositivo(valor: string): boolean {
  const numero = Number(valor)
  return Number.isFinite(numero) && numero > 0
}

/**
 * Observaciones utilizables: el tamaño de la **intersección estricta** de fechas
 * entre las series disponibles (documento 02 §9.1).
 *
 * No se rellenan huecos. Un día sin dato en un activo no vale cero para ese día:
 * puede ser que el mercado estuviera cerrado, y el plan lo prohíbe expresamente.
 *
 * Sin ninguna serie en memoria el resultado es **cero**, no «no se sabe»: la
 * pregunta que responde esta función es cuántas observaciones hay disponibles
 * ahora mismo, y no hay ninguna. Cuánta historia existe en el proveedor es otra
 * pregunta, y de esa se encarga el aviso `no_data` de cada fila, que además dice
 * cómo conseguirla.
 */
export function observacionesAlineadas(input: PortfolioQualityInput): number {
  const series = Object.values(input.series ?? {}).filter((serie) => serie.length > 0)
  if (series.length === 0) return 0

  const [primera, ...resto] = series
  let comunes = new Set((primera as readonly SeriesPoint[]).map((punto) => punto.date))
  for (const serie of resto) {
    const fechas = new Set(serie.map((punto) => punto.date))
    comunes = new Set([...comunes].filter((fecha) => fechas.has(fecha)))
  }
  return comunes.size
}

/** Cálculos que este adaptador sabe evaluar hoy. */
export const CALCULOS_EVALUADOS: readonly LabCalculation[] = [
  'directExposure',
  'lookThrough',
  'volatility',
  'correlation',
  'historicalCVaR',
]
