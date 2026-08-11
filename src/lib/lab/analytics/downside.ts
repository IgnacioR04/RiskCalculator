/**
 * Métricas de caída: VaR, CVaR y perfil de drawdown (LAB-309, LAB-310).
 *
 * Amplían lo que ya había en `lib/finance/historical.ts` sin tocarlo: aquello
 * mide dispersión —volatilidad, Sharpe, correlación—, y esto mide **lo que
 * duele**, que es otra pregunta.
 *
 * Una regla domina el archivo entero, y es el criterio de aceptación de la
 * tarea: **el VaR no es la pérdida máxima**. Es el umbral que el peor `x %` de
 * los días supera. Decir «como mucho perderás esto» sería falso y además
 * peligroso, porque justo los días que quedan fuera son los que arruinan planes.
 * Por eso el VaR viaja siempre acompañado del CVaR, que sí dice cuánto se pierde
 * de media **cuando** se cruza ese umbral.
 *
 * Todo es histórico: describe lo que pasó en la muestra, no lo que pasará.
 */

export interface SeriesPoint {
  readonly date: string
  readonly close: number
}

export type TailResult<T> =
  | { readonly ok: true; readonly value: T; readonly observations: number }
  | {
      readonly ok: false
      readonly reason: 'insufficient_data' | 'no_losses'
      readonly observations: number
      readonly required: number
    }

/**
 * Observaciones mínimas para publicar una métrica de cola.
 *
 * Es más exigente que el mínimo general de 30 y tiene motivo: con 30 días, el
 * 5 % peor son **un día y medio**. Un solo dato no es una cola, es una anécdota.
 * Con 100, el 5 % son cinco días, que ya permite promediar algo.
 */
export const MIN_TAIL_OBSERVATIONS = 100

/* ── VaR y CVaR históricos ────────────────────────────────────────────────── */

export interface TailRisk {
  /** Umbral que el peor `1 - confidence` de los días supera. Positivo = pérdida. */
  readonly var: number
  /** Pérdida media **dentro** de esa cola. Siempre ≥ VaR. */
  readonly cvar: number
  readonly confidence: number
  /** Días que componen la cola. Si son pocos, el CVaR es frágil y se ve. */
  readonly tailSize: number
}

/**
 * VaR y CVaR históricos sobre retornos diarios.
 *
 * Método: percentil empírico, sin ajustar a ninguna distribución. No se asume
 * normalidad **a propósito**: la normal subestima justo las colas, que es lo
 * único que esta función existe para medir.
 *
 * Se devuelven como números positivos porque son pérdidas: un VaR de 0,021
 * significa «caídas del 2,1 % o peores».
 */
export function historicalTailRisk(
  returns: readonly number[],
  confidence = 0.95,
): TailResult<TailRisk> {
  const observations = returns.length
  if (observations < MIN_TAIL_OBSERVATIONS) {
    return {
      ok: false,
      reason: 'insufficient_data',
      observations,
      required: MIN_TAIL_OBSERVATIONS,
    }
  }

  const ordenados = [...returns].sort((a, b) => a - b)
  // Tamaño de la cola. Se redondea hacia arriba para que nunca quede vacía,
  // pero con un margen antes de redondear: `1 - 0.95` da 0,050000000000000044
  // en coma flotante, y sin margen una muestra de 100 usaría **seis** días en
  // vez de cinco. Un día de más en una cola de cinco cambia el CVaR un 20 %.
  const corte = Math.max(1, Math.ceil(observations * (1 - confidence) - 1e-9))
  const cola = ordenados.slice(0, corte)

  const umbral = cola[cola.length - 1] as number
  const media = cola.reduce((suma, r) => suma + r, 0) / cola.length

  return {
    ok: true,
    observations,
    value: {
      var: -umbral,
      cvar: -media,
      confidence,
      tailSize: cola.length,
    },
  }
}

/**
 * Frase obligatoria al presentar un VaR. Está aquí y no en la interfaz para que
 * no pueda enseñarse el número sin ella.
 */
export const VAR_DISCLAIMER =
  'El VaR no es la pérdida máxima: es el umbral que supera el peor de los días medidos. Lo que se pierde cuando se cruza lo dice el CVaR.'

/* ── Perfil de caída ──────────────────────────────────────────────────────── */

export interface DrawdownProfile {
  /** Caída máxima desde un máximo previo, como fracción positiva. */
  readonly maxDrawdown: number
  readonly peakDate: string
  readonly troughDate: string
  /** Días naturales entre el máximo y el fondo. */
  readonly declineDays: number
  /**
   * Días desde el fondo hasta recuperar el máximo anterior. `null` significa
   * **que todavía no se ha recuperado**, no que tardara cero.
   */
  readonly recoveryDays: number | null
  readonly recovered: boolean
}

const DIA_MS = 24 * 60 * 60 * 1000

function dias(desde: string, hasta: string): number {
  return Math.round(
    (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / DIA_MS,
  )
}

/**
 * Perfil completo de la peor caída: cuánto, desde cuándo, hasta cuándo y si se
 * recuperó.
 *
 * La duración importa tanto como la profundidad. Un −30 % que se recupera en
 * seis meses y un −30 % que sigue abajo cuatro años después son experiencias
 * distintas, y la segunda es la que hace abandonar planes.
 */
export function drawdownProfile(series: readonly SeriesPoint[]): TailResult<DrawdownProfile> {
  const ordenada = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const observations = ordenada.length
  if (observations < 2) {
    return { ok: false, reason: 'insufficient_data', observations, required: 2 }
  }

  let maximo = ordenada[0] as SeriesPoint
  let peor = { caida: 0, pico: maximo, fondo: maximo }

  for (const punto of ordenada) {
    if (punto.close > maximo.close) maximo = punto
    if (maximo.close <= 0) continue
    const caida = (maximo.close - punto.close) / maximo.close
    if (caida > peor.caida) peor = { caida, pico: maximo, fondo: punto }
  }

  if (peor.caida <= 0) {
    return { ok: false, reason: 'no_losses', observations, required: 2 }
  }

  // La recuperación es el primer cierre posterior al fondo que iguala el pico.
  const recuperacion = ordenada.find(
    (punto) => punto.date > peor.fondo.date && punto.close >= peor.pico.close,
  )

  return {
    ok: true,
    observations,
    value: {
      maxDrawdown: peor.caida,
      peakDate: peor.pico.date,
      troughDate: peor.fondo.date,
      declineDays: dias(peor.pico.date, peor.fondo.date),
      recoveryDays: recuperacion === undefined ? null : dias(peor.fondo.date, recuperacion.date),
      recovered: recuperacion !== undefined,
    },
  }
}

/* ── Estabilidad por ventanas (LAB-310) ───────────────────────────────────── */

export interface WindowSpec {
  readonly id: string
  readonly label: string
  readonly days: number
}

export const DEFAULT_WINDOWS: readonly WindowSpec[] = [
  { id: '1a', label: '1 año', days: 365 },
  { id: '3a', label: '3 años', days: 365 * 3 },
  { id: '5a', label: '5 años', days: 365 * 5 },
]

export interface WindowOutcome<T> {
  readonly window: WindowSpec
  /**
   * `unavailable` significa que la serie **no llega** a cubrir esa ventana. No
   * se estira lo que hay ni se extrapola: una ventana que no existe no se
   * simula, que es el criterio de aceptación de LAB-310.
   */
  readonly status: 'ok' | 'unavailable'
  readonly result?: T
  readonly observations: number
}

/**
 * Aplica una métrica sobre varias ventanas temporales.
 *
 * La ventana se recorta por **fecha**, no por número de puntos: pedir «el
 * último año» y quedarse con los últimos 252 registros daría un año distinto en
 * una serie con huecos.
 */
export function overWindows<T>(
  series: readonly SeriesPoint[],
  metric: (tramo: readonly SeriesPoint[]) => T | null,
  windows: readonly WindowSpec[] = DEFAULT_WINDOWS,
): readonly WindowOutcome<T>[] {
  const ordenada = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const ultima = ordenada[ordenada.length - 1]
  const primera = ordenada[0]

  return windows.map((window) => {
    if (ultima === undefined || primera === undefined) {
      return { window, status: 'unavailable', observations: 0 }
    }

    const cubierto = dias(primera.date, ultima.date)
    if (cubierto < window.days) {
      // Falta historia. Se dice, y no se calcula con lo que hay haciéndolo
      // pasar por una ventana completa.
      return { window, status: 'unavailable', observations: ordenada.length }
    }

    const desde = new Date(
      new Date(`${ultima.date}T00:00:00Z`).getTime() - window.days * DIA_MS,
    )
      .toISOString()
      .slice(0, 10)
    const tramo = ordenada.filter((punto) => punto.date >= desde)
    const valor = metric(tramo)

    return valor === null
      ? { window, status: 'unavailable', observations: tramo.length }
      : { window, status: 'ok', result: valor, observations: tramo.length }
  })
}
