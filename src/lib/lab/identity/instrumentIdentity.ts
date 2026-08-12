/**
 * Identidad canónica de instrumentos (LAB-402).
 *
 * Hasta ahora la exposición real agrupaba por **ticker**, y un ticker no
 * identifica una empresa. `SAN` es Banco Santander en Madrid y Sandstorm Gold
 * en Toronto; `BMW` cotiza en Fráncfort y `BMW.DE`, `BMWYY` o `BMW3` son la
 * misma empresa escrita de cuatro maneras. Agrupar por el texto del ticker
 * suma cosas distintas y separa cosas iguales, y las dos son mentiras con
 * apariencia de dato.
 *
 * La regla que gobierna este módulo: **ante la duda no se agrupa**. Un ticker
 * que podría ser dos instrumentos se queda sin resolver y se dice cuál es la
 * duda, en vez de asignarlo al candidato más probable. Un falso positivo aquí
 * no se nota —dos posiciones fundidas parecen una sola, más grande— y falsear
 * una concentración es justo lo contrario de para qué existe la herramienta.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 *
 * ## Alcance declarado
 *
 * El plan (`LAB-402`) contemplaba además un catálogo `instruments` en Supabase,
 * escrito solo por servicio. Queda **pospuesto y no implementado**: poblar un
 * catálogo canónico exige una fuente de identidades con licencia, y `LAB-401`
 * concluyó que no disponemos de ninguna. Un catálogo vacío o rellenado a ojo
 * sería peor que no tenerlo. Lo que sí se puede hacer sin fuente externa —usar
 * el ISIN y el mercado que el usuario ya tiene, y negarse a adivinar el resto—
 * es lo que hay aquí.
 */

/**
 * Clave canónica de un instrumento.
 *
 * Opaca a propósito: su formato puede cambiar, y nada fuera de este módulo
 * debería construirla a mano ni interpretarla.
 */
export type InstrumentKey = string & { readonly __brand: 'InstrumentKey' }

/** Con qué grado de certeza se ha identificado un instrumento. */
export type IdentityStrength =
  /** ISIN: identifica el valor mundialmente. No hay ambigüedad posible. */
  | 'isin'
  /** Ticker + mercado: identifica la línea de cotización concreta. */
  | 'ticker_market'
  /** Solo ticker: **no** identifica nada por sí mismo. */
  | 'ticker_only'

export interface InstrumentIdentity {
  readonly key: InstrumentKey
  readonly strength: IdentityStrength
  /** Ticker tal y como se mostrará. */
  readonly symbol: string
  readonly isin?: string
  readonly market?: string
  readonly currency?: string
}

/** Lo mínimo que hace falta para identificar algo. Un `Asset` lo cumple. */
export interface Identifiable {
  readonly symbol: string
  readonly isin?: string | undefined
  readonly exchange?: string | undefined
  readonly quoteCurrency?: string | undefined
}

const normalizar = (texto: string) => texto.trim().toUpperCase()

/**
 * Identidad de un instrumento, con la mejor evidencia disponible.
 *
 * El ISIN manda sobre el mercado y el mercado sobre el ticker suelto, porque
 * ese es el orden en el que dejan de existir los homónimos.
 */
export function identify(item: Identifiable): InstrumentIdentity {
  const symbol = normalizar(item.symbol)
  const isin = item.isin === undefined || item.isin.trim() === '' ? undefined : normalizar(item.isin)
  const market =
    item.exchange === undefined || item.exchange.trim() === '' ? undefined : normalizar(item.exchange)
  const currency =
    item.quoteCurrency === undefined || item.quoteCurrency.trim() === ''
      ? undefined
      : normalizar(item.quoteCurrency)

  if (isin !== undefined) {
    return {
      key: `isin:${isin}` as InstrumentKey,
      strength: 'isin',
      symbol,
      isin,
      ...(market === undefined ? {} : { market }),
      ...(currency === undefined ? {} : { currency }),
    }
  }

  if (market !== undefined) {
    return {
      key: `mic:${market}:${symbol}` as InstrumentKey,
      strength: 'ticker_market',
      symbol,
      market,
      ...(currency === undefined ? {} : { currency }),
    }
  }

  return {
    key: `sym:${symbol}` as InstrumentKey,
    strength: 'ticker_only',
    symbol,
    ...(currency === undefined ? {} : { currency }),
  }
}

/* ── Resolución de un ticker suelto contra lo que ya se conoce ─────────────── */

export type Resolution =
  /** El ticker apunta a un único instrumento conocido. */
  | { readonly status: 'resolved'; readonly key: InstrumentKey; readonly via: IdentityStrength }
  /** Varios instrumentos comparten ese ticker. **No se elige ninguno.** */
  | { readonly status: 'ambiguous'; readonly candidates: readonly InstrumentIdentity[] }
  /** Nadie en la cartera usa ese ticker: es un instrumento nuevo y débil. */
  | { readonly status: 'unknown' }

/**
 * Índice de los instrumentos conocidos, para resolver tickers sueltos contra
 * ellos. Se construye una vez y se consulta muchas.
 */
export interface IdentityIndex {
  /** Todos los instrumentos indexados, por clave. */
  readonly byKey: ReadonlyMap<InstrumentKey, InstrumentIdentity>
  /** Qué instrumentos usan cada ticker. Más de uno significa homónimos. */
  readonly bySymbol: ReadonlyMap<string, readonly InstrumentIdentity[]>
}

export function buildIdentityIndex(items: readonly Identifiable[]): IdentityIndex {
  const byKey = new Map<InstrumentKey, InstrumentIdentity>()
  const bySymbol = new Map<string, InstrumentIdentity[]>()

  for (const item of items) {
    const identidad = identify(item)
    if (byKey.has(identidad.key)) continue
    byKey.set(identidad.key, identidad)

    const mismos = bySymbol.get(identidad.symbol)
    if (mismos === undefined) bySymbol.set(identidad.symbol, [identidad])
    else mismos.push(identidad)
  }

  return { byKey, bySymbol }
}

/**
 * A qué instrumento se refiere un ticker suelto.
 *
 * Es el caso de las posiciones declaradas dentro de un fondo: los emisores
 * publican el ticker de cada componente, casi nunca su ISIN. Ese ticker hay que
 * casarlo con lo que el usuario tiene en cartera para poder sumar «lo que tengo
 * directo» con «lo que llevo dentro».
 *
 * **Un único candidato se acepta; dos o más no se deshacen adivinando.** Es el
 * criterio de aceptación de LAB-402: un ticker sin mercado ambiguo no se
 * autoasigna.
 */
export function resolveSymbol(index: IdentityIndex, symbol: string): Resolution {
  const candidatos = index.bySymbol.get(normalizar(symbol))
  if (candidatos === undefined || candidatos.length === 0) return { status: 'unknown' }
  if (candidatos.length === 1) {
    const unico = candidatos[0]!
    return { status: 'resolved', key: unico.key, via: unico.strength }
  }
  return { status: 'ambiguous', candidates: candidatos }
}

/* ── Diagnóstico para la interfaz ──────────────────────────────────────────── */

export interface AmbiguousSymbol {
  readonly symbol: string
  readonly candidates: readonly InstrumentIdentity[]
}

/**
 * Tickers que aparecen en más de un instrumento de la cartera.
 *
 * Existe para poder **decirlo en pantalla**: un solape que no se ha podido
 * calcular por ambigüedad tiene que verse, porque si no el usuario lee un cero
 * como «no comparten nada» cuando significa «no lo sé».
 */
export function ambiguousSymbols(index: IdentityIndex): readonly AmbiguousSymbol[] {
  const salida: AmbiguousSymbol[] = []
  for (const [symbol, candidatos] of index.bySymbol) {
    if (candidatos.length > 1) salida.push({ symbol, candidates: candidatos })
  }
  return salida.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

/** Etiqueta corta para mostrar un instrumento sin confundirlo con su homónimo. */
export function displayLabel(identidad: InstrumentIdentity): string {
  if (identidad.market !== undefined) return `${identidad.symbol} · ${identidad.market}`
  if (identidad.isin !== undefined) return `${identidad.symbol} · ${identidad.isin}`
  return identidad.symbol
}
