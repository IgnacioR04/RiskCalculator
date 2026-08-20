/**
 * Universo sectorial con vigencia (LAB-703).
 *
 * Qué instrumento representa a qué sector, **y desde cuándo**.
 *
 * ## El sesgo que este módulo existe para no cometer
 *
 * El error clásico de cualquier backtest sectorial es **mirar hacia atrás con la
 * lista de hoy**. Si el usuario decide en agosto que un ETF representa
 * «energía» y se le evalúa desde enero, el resultado incluye información que en
 * enero no existía: la propia decisión de seguirlo.
 *
 * Eso infla sistemáticamente cualquier señal, y no se nota porque el número sale
 * plausible. Por eso una consulta a fecha **solo devuelve miembros cuya vigencia
 * había empezado ya**, que es el criterio de aceptación de LAB-703.
 *
 * ## Lo que este módulo NO puede arreglar
 *
 * Sigue habiendo **sesgo de selección**: el usuario elige hoy qué sectores le
 * parecen relevantes, y los que no se le ocurren no entran nunca. Eso está
 * declarado en [`ADR-008`](../../../../docs/adr/ADR-008-sector-signals.md) y no
 * hay código que lo resuelva.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export const UNIVERSE_VERSION = 'sector-universe-v1'

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

export interface SectorMember {
  /** Identidad canónica del instrumento (LAB-402). */
  readonly instrumentKey: string
  readonly symbol: string
  /** Etiqueta de sector del usuario. Sin taxonomía externa (ADR-008). */
  readonly sector: string
  /** Desde cuándo el usuario lo considera representativo, `YYYY-MM-DD`. */
  readonly from: string
  /** Hasta cuándo, si dejó de serlo. */
  readonly to?: string
}

export type SectorUniverse = readonly SectorMember[]

export type UniverseError =
  | 'invalid_date'
  | 'inverted_period'
  | 'duplicate_membership'
  | 'excluded_instrument'

export type UniverseResult =
  | { readonly ok: true; readonly universe: SectorUniverse }
  | { readonly ok: false; readonly reason: UniverseError; readonly detail: string }

export const UNIVERSE_ERROR_TEXT: Readonly<Record<UniverseError, string>> = {
  invalid_date: 'La fecha tiene que ser YYYY-MM-DD y existir en el calendario.',
  inverted_period: 'El periodo tiene que empezar antes de terminar.',
  duplicate_membership:
    'Ese instrumento ya representa a ese sector en un periodo que se solapa con este.',
  excluded_instrument:
    'Ese instrumento no puede representar un sector: los apalancados, los inversos y lo que no sea un vehículo diversificado quedan fuera (ADR-008).',
}

/** Lo que se necesita saber del instrumento para admitirlo. */
export interface CandidateInstrument {
  readonly instrumentKey: string
  readonly symbol: string
  readonly assetType: string
  readonly name?: string
}

/**
 * Palabras que delatan un producto apalancado o inverso.
 *
 * Es un filtro por nombre y por tanto imperfecto: se declara como tal. Un
 * producto apalancado que no las use en su nombre se colaría, y por eso el
 * rechazo se explica al usuario en vez de aplicarse en silencio.
 */
const EXCLUIDOS = [
  /\b\d+x\b/i,
  /\bleverage/i,
  /\bapalancad/i,
  /\binverse\b/i,
  /\binvers[oa]\b/i,
  /\bshort\b/i,
  /\bbear\b/i,
  /\bultra\b/i,
]

/** Tipos de activo que pueden representar un sector. */
const TIPOS_ADMITIDOS = new Set(['etf', 'index'])

export function isEligible(instrumento: CandidateInstrument): boolean {
  if (!TIPOS_ADMITIDOS.has(instrumento.assetType)) return false
  const texto = `${instrumento.symbol} ${instrumento.name ?? ''}`
  return !EXCLUIDOS.some((patron) => patron.test(texto))
}

function fechaValida(valor: string): boolean {
  if (!ES_FECHA.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

/** ¿Se solapan dos periodos? Un `to` ausente significa «hasta hoy». */
function seSolapan(a: SectorMember, b: SectorMember): boolean {
  const finA = a.to ?? '9999-12-31'
  const finB = b.to ?? '9999-12-31'
  return a.from <= finB && b.from <= finA
}

/**
 * Añade un instrumento al universo como representante de un sector.
 *
 * Un solapamiento con la misma pareja instrumento-sector se rechaza: dos
 * periodos que se pisan producirían dos respuestas para la misma fecha.
 */
export function addMember(
  universe: SectorUniverse,
  instrumento: CandidateInstrument,
  sector: string,
  periodo: { readonly from: string; readonly to?: string },
): UniverseResult {
  if (!isEligible(instrumento)) {
    return {
      ok: false,
      reason: 'excluded_instrument',
      detail: `${instrumento.symbol}: ${UNIVERSE_ERROR_TEXT.excluded_instrument}`,
    }
  }
  if (!fechaValida(periodo.from) || (periodo.to !== undefined && !fechaValida(periodo.to))) {
    return { ok: false, reason: 'invalid_date', detail: UNIVERSE_ERROR_TEXT.invalid_date }
  }
  if (periodo.to !== undefined && periodo.to <= periodo.from) {
    return { ok: false, reason: 'inverted_period', detail: UNIVERSE_ERROR_TEXT.inverted_period }
  }

  const nuevo: SectorMember = {
    instrumentKey: instrumento.instrumentKey,
    symbol: instrumento.symbol,
    sector: sector.trim(),
    from: periodo.from,
    ...(periodo.to === undefined ? {} : { to: periodo.to }),
  }

  const choca = universe.some(
    (m) =>
      m.instrumentKey === nuevo.instrumentKey && m.sector === nuevo.sector && seSolapan(m, nuevo),
  )
  if (choca) {
    return {
      ok: false,
      reason: 'duplicate_membership',
      detail: `${instrumento.symbol}: ${UNIVERSE_ERROR_TEXT.duplicate_membership}`,
    }
  }

  return { ok: true, universe: [...universe, nuevo] }
}

/**
 * Miembros vigentes en una fecha.
 *
 * **No devuelve nada cuya vigencia empiece después.** Es el criterio de
 * aceptación: una consulta a fecha no usa miembros futuros.
 */
export function membersAt(universe: SectorUniverse, fecha: string): SectorUniverse {
  return universe
    .filter((m) => m.from <= fecha && (m.to === undefined || m.to > fecha))
    .slice()
    .sort((a, b) => a.sector.localeCompare(b.sector) || a.symbol.localeCompare(b.symbol))
}

/** Los sectores con representante en esa fecha. */
export function sectorsAt(universe: SectorUniverse, fecha: string): readonly string[] {
  return [...new Set(membersAt(universe, fecha).map((m) => m.sector))].sort()
}

/** Quita una pertenencia concreta. La única forma de perder historial. */
export function removeMember(
  universe: SectorUniverse,
  instrumentKey: string,
  sector: string,
  from: string,
): SectorUniverse {
  return universe.filter(
    (m) => !(m.instrumentKey === instrumentKey && m.sector === sector && m.from === from),
  )
}

/**
 * Cierra una pertenencia en una fecha, en vez de borrarla.
 *
 * Es lo que hay que hacer cuando un ETF deja de representar a un sector: el
 * pasado siguió siendo verdad.
 */
export function closeMember(
  universe: SectorUniverse,
  instrumentKey: string,
  sector: string,
  from: string,
  to: string,
): UniverseResult {
  if (!fechaValida(to)) {
    return { ok: false, reason: 'invalid_date', detail: UNIVERSE_ERROR_TEXT.invalid_date }
  }
  if (to <= from) {
    return { ok: false, reason: 'inverted_period', detail: UNIVERSE_ERROR_TEXT.inverted_period }
  }
  return {
    ok: true,
    universe: universe.map((m) =>
      m.instrumentKey === instrumentKey && m.sector === sector && m.from === from
        ? { ...m, to }
        : m,
    ),
  }
}
