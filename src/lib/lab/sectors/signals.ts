/**
 * Señales sectoriales (LAB-705, LAB-706, LAB-707).
 *
 * Las tres señales que [`ADR-008`](../../../../docs/adr/ADR-008-sector-signals.md)
 * aprobó, cada una con su hipótesis falsable escrita al lado del cálculo.
 *
 * ## La regla que gobierna las tres
 *
 * **Ninguna se calcula con datos que no existían en la fecha de cálculo.** Es
 * fácil de decir y fácil de incumplir sin darse cuenta: basta pasar la serie
 * entera y tomar los últimos N puntos. Aquí todas reciben una `asOf` y
 * descartan cualquier observación posterior antes de mirar nada.
 *
 * ## Y una segunda: sin muestra no hay señal
 *
 * Un momentum calculado sobre cuatro meses no es un momentum débil: es otra
 * cosa. Cuando falta muestra se devuelve `null` con el motivo, nunca un número
 * pequeño que parezca una señal floja.
 *
 * Funciones puras: no tocan red, ni almacenamiento, ni reloj.
 */

export const SIGNALS_VERSION = 'sector-signals-v1'

/** Observación de precio de un representante sectorial. */
export interface PricePoint {
  readonly date: string
  readonly close: number
}

export type SignalReason =
  /** No hay bastantes observaciones en la ventana. */
  | 'insufficient_history'
  /** El precio de referencia no es utilizable (cero o negativo). */
  | 'invalid_price'
  /** La serie no oscila: no se puede dividir por su volatilidad. */
  | 'constant_series'

export type SignalValue =
  | { readonly ok: true; readonly value: number; readonly observations: number }
  | { readonly ok: false; readonly reason: SignalReason; readonly observations: number }

/** Días de mercado aproximados por mes. Convención declarada. */
export const DIAS_POR_MES = 21

/**
 * Recorta la serie a lo que existía en `asOf`, ordenada.
 *
 * Es la función que impide el sesgo de anticipación. Todo lo demás la usa.
 */
export function upTo(series: readonly PricePoint[], asOf: string): readonly PricePoint[] {
  return series
    .filter((p) => p.date <= asOf && Number.isFinite(p.close))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
}

/* ── LAB-705: momentum 12-1 ────────────────────────────────────────────────── */

export const MOMENTUM_MODEL_KEY = 'sector.momentum'

export const MOMENTUM_HYPOTHESIS =
  'Los sectores que más han subido en los últimos doce meses, excluyendo el último, tienden a subir más que los que menos han subido durante los tres meses siguientes.'

export const MOMENTUM_FALSIFICATION =
  'Si en el backtest walk-forward el grupo superior no bate al inferior de forma consistente, o si la diferencia desaparece al descontar costes, la señal se retira.'

/**
 * Rentabilidad de los doce meses anteriores, **excluyendo el último**.
 *
 * El mes que se salta no es un capricho: a un mes vista domina la reversión a
 * corto plazo, que empuja en sentido contrario y contamina la medida. Saltarlo
 * es la convención estándar desde Jegadeesh y Titman, no una elección propia.
 *
 * Se mide sobre precios, así que **no incluye dividendos**. En ETF de
 * acumulación da igual; en los de distribución infravalora sistemáticamente la
 * rentabilidad, y queda declarado en la metodología.
 */
export function momentum12_1(series: readonly PricePoint[], asOf: string): SignalValue {
  const historia = upTo(series, asOf)
  const rango = ventana12_1(historia.length)

  if (rango === null) {
    return { ok: false, reason: 'insufficient_history', observations: historia.length }
  }

  const inicio = historia[rango.inicio]!
  const fin = historia[rango.fin]!

  if (!(inicio.close > 0) || !(fin.close > 0)) {
    return { ok: false, reason: 'invalid_price', observations: historia.length }
  }

  return { ok: true, value: fin.close / inicio.close - 1, observations: historia.length }
}

/**
 * Los dos índices que delimitan la ventana 12-1.
 *
 * `fin` es el **último día anterior al mes excluido**, no el primero de ese mes:
 * si fuera el primero, un desplome del último mes entraría en la medida y la
 * señal dejaría de ser «12-1» para ser «12». Es un desplazamiento de un solo
 * índice y cambia por completo lo que mide.
 *
 * Se cuenta hacia atrás desde el último dato disponible y no desde `asOf`: si el
 * mercado cerró, la última observación es anterior y sigue siendo la buena.
 */
function ventana12_1(longitud: number): { inicio: number; fin: number } | null {
  const fin = longitud - 1 - DIAS_POR_MES
  const inicio = longitud - 1 - 12 * DIAS_POR_MES
  return inicio < 0 || fin <= inicio ? null : { inicio, fin }
}

/* ── LAB-706: momentum ajustado por volatilidad ────────────────────────────── */

export const VOL_ADJUSTED_MODEL_KEY = 'sector.volAdjustedMomentum'

export const VOL_ADJUSTED_HYPOTHESIS =
  'Ordenar los sectores por rentabilidad dividida entre su volatilidad produce un ranking más estable en el tiempo que el momentum a secas, con menos rotación para un resultado comparable.'

export const VOL_ADJUSTED_FALSIFICATION =
  'Si su rotación mensual no es menor que la del momentum simple, o si su resultado es peor sin compensarlo con menos rotación, no aporta nada y se retira.'

/** Volatilidad de los retornos diarios de una ventana, anualizada. */
function volatilidad(historia: readonly PricePoint[], desde: number, hasta: number): number | null {
  const retornos: number[] = []
  for (let i = desde + 1; i < hasta; i += 1) {
    const previo = historia[i - 1]!.close
    const actual = historia[i]!.close
    if (previo > 0 && actual > 0) retornos.push(Math.log(actual / previo))
  }
  if (retornos.length < 2) return null

  const media = retornos.reduce((s, r) => s + r, 0) / retornos.length
  const varianza =
    retornos.reduce((s, r) => s + (r - media) * (r - media), 0) / (retornos.length - 1)
  return Math.sqrt(varianza * 252)
}

/**
 * Momentum 12-1 dividido entre la volatilidad del mismo periodo.
 *
 * La hipótesis de esta señal **no es sobre rentabilidad**, es sobre
 * estabilidad: un sector que sube mucho a base de sobresaltos cambia de puesto
 * en el ranking con facilidad, y cada cambio de puesto cuesta una operación.
 */
export function volAdjustedMomentum(series: readonly PricePoint[], asOf: string): SignalValue {
  const base = momentum12_1(series, asOf)
  if (!base.ok) return base

  const historia = upTo(series, asOf)
  const rango = ventana12_1(historia.length)
  const vol = rango === null ? null : volatilidad(historia, rango.inicio, rango.fin + 1)

  if (vol === null || vol <= 1e-9) {
    return { ok: false, reason: 'constant_series', observations: historia.length }
  }

  return { ok: true, value: base.value / vol, observations: base.observations }
}

/* ── LAB-707: diversificación marginal ─────────────────────────────────────── */

export const MARGINAL_DIVERSIFICATION_MODEL_KEY = 'sector.marginalDiversification'

export const MARGINAL_DIVERSIFICATION_HYPOTHESIS =
  'Añadir un sector poco correlacionado con la cartera actual reduce más la volatilidad de la cartera resultante que añadir uno muy correlacionado, para el mismo importe.'

export const MARGINAL_DIVERSIFICATION_FALSIFICATION =
  'Es aritmética sobre la covarianza: se comprueba en un caso construido a mano. Si no reproduce la reducción esperada, está mal implementada.'

export interface MarginalInput {
  /** Volatilidad anualizada de la cartera actual. */
  readonly portfolioVolatility: number
  /** Volatilidad anualizada del sector candidato. */
  readonly sectorVolatility: number
  /** Correlación entre la cartera y el sector. */
  readonly correlation: number
  /** Peso que tendría el sector si se añadiera, fracción 0–1. */
  readonly weight: number
}

/**
 * Cuánto cambiaría la volatilidad de la cartera al añadir un sector.
 *
 * Devuelve la diferencia: **negativa significa que la reduce**. No predice
 * nada; es aritmética sobre lo que ya se ha medido, y por eso es la única de
 * las tres señales que no puede fallar por falta de muestra —fallará, si acaso,
 * porque la covarianza que la alimenta sea mala—.
 */
export function marginalDiversification(input: MarginalInput): number {
  const w = Math.min(1, Math.max(0, input.weight))
  const sp = input.portfolioVolatility
  const ss = input.sectorVolatility

  // Volatilidad de la mezcla: √((1−w)²σp² + w²σs² + 2w(1−w)ρσpσs).
  const nueva = Math.sqrt(
    (1 - w) * (1 - w) * sp * sp +
      w * w * ss * ss +
      2 * w * (1 - w) * input.correlation * sp * ss,
  )

  return nueva - sp
}

/* ── Catálogo, para el registro de modelos ────────────────────────────────── */

export const SIGNAL_CATALOG = [
  {
    modelKey: MOMENTUM_MODEL_KEY,
    label: 'Momentum a doce meses',
    hypothesis: MOMENTUM_HYPOTHESIS,
    falsification: MOMENTUM_FALSIFICATION,
    predictive: true,
  },
  {
    modelKey: VOL_ADJUSTED_MODEL_KEY,
    label: 'Momentum ajustado por volatilidad',
    hypothesis: VOL_ADJUSTED_HYPOTHESIS,
    falsification: VOL_ADJUSTED_FALSIFICATION,
    predictive: true,
  },
  {
    modelKey: MARGINAL_DIVERSIFICATION_MODEL_KEY,
    label: 'Diversificación marginal',
    hypothesis: MARGINAL_DIVERSIFICATION_HYPOTHESIS,
    falsification: MARGINAL_DIVERSIFICATION_FALSIFICATION,
    /** No predice nada: describe la cartera de hoy. */
    predictive: false,
  },
] as const

/** Aviso obligatorio junto a cualquier señal predictiva. */
export const MOMENTUM_DISCLAIMER =
  'El momentum es una regularidad estadística documentada que falla durante años seguidos. Que un sector encabece esta lista no dice nada sobre lo que hará el mes que viene.'
