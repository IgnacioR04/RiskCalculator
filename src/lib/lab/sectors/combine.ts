/**
 * Normalización y combinación de señales (LAB-708).
 *
 * Dos señales en unidades distintas no se pueden sumar. El momentum es una
 * fracción; el momentum ajustado por volatilidad es un cociente sin unidad
 * clara. Sumarlos tal cual daría un número con la forma de un resultado y sin
 * significado.
 *
 * ## Por qué rangos y no z-scores
 *
 * La conversión estándar sería estandarizar restando la media y dividiendo por
 * la desviación típica. **No se usa**, por dos razones:
 *
 * 1. Con ocho o diez sectores, la media y la desviación se estiman con esa misma
 *    muestra minúscula: un sector extremo mueve el z-score de todos los demás.
 * 2. Un z-score invita a leerse como «está a 1,8 desviaciones», que sugiere una
 *    distribución normal que nadie ha comprobado.
 *
 * Se usa el **rango percentil**: qué fracción de sectores queda por debajo. Es
 * robusto a extremos, no supone ninguna distribución, y se lee como lo que es:
 * una posición en una lista.
 *
 * ## Lo que la combinación NO hace
 *
 * No produce una puntuación de calidad ni una nota. Produce **un orden**, y el
 * orden se presenta como tal. Un «7,4 sobre 10» sugiere una precisión que estos
 * datos no tienen.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export const COMBINE_VERSION = 'sector-combine-v1'

export interface SignalReading {
  readonly sector: string
  /** Valor bruto, o `null` si la señal no se pudo calcular para ese sector. */
  readonly value: number | null
}

export interface NormalizedReading {
  readonly sector: string
  /** Rango percentil de 0 a 1, o `null` si no había valor. */
  readonly rank: number | null
  readonly raw: number | null
}

/**
 * Rango percentil dentro del conjunto.
 *
 * Los empates comparten el rango medio: si no, el resultado dependería del orden
 * de entrada y dejaría de ser reproducible.
 *
 * Los `null` **no se rellenan con la media**. Un sector sin señal no está «en el
 * medio»: es que no se sabe, y arrastra ese desconocimiento hasta el final.
 */
export function normalizeByRank(readings: readonly SignalReading[]): readonly NormalizedReading[] {
  const conValor = readings.filter(
    (r): r is SignalReading & { value: number } => r.value !== null && Number.isFinite(r.value),
  )

  if (conValor.length === 0) {
    return readings.map((r) => ({ sector: r.sector, rank: null, raw: r.value }))
  }

  const ordenados = [...conValor].sort((a, b) => a.value - b.value)
  const n = ordenados.length

  const rangoDe = (valor: number): number => {
    // Índice medio de los empatados, normalizado a [0, 1].
    const primero = ordenados.findIndex((r) => r.value === valor)
    let ultimo = primero
    while (ultimo + 1 < n && ordenados[ultimo + 1]!.value === valor) ultimo += 1
    const medio = (primero + ultimo) / 2
    return n === 1 ? 0.5 : medio / (n - 1)
  }

  return readings.map((r) => ({
    sector: r.sector,
    rank: r.value === null || !Number.isFinite(r.value) ? null : rangoDe(r.value),
    raw: r.value,
  }))
}

/* ── Combinación ───────────────────────────────────────────────────────────── */

export interface WeightedSignal {
  readonly modelKey: string
  readonly label: string
  readonly weight: number
  readonly readings: readonly SignalReading[]
}

export interface CombinedSector {
  readonly sector: string
  /** Puesto en el orden, empezando en 1. */
  readonly position: number
  /** Media ponderada de los rangos disponibles, de 0 a 1. */
  readonly score: number | null
  /** Rango de cada señal, para poder explicar el puesto. */
  readonly bySignal: Readonly<Record<string, number | null>>
  /** Señales que no se pudieron calcular para este sector. */
  readonly missing: readonly string[]
  /**
   * Fracción del peso total que se ha podido usar.
   *
   * Un sector con la mitad de sus señales sin calcular tiene cobertura 0,5, y
   * eso hay que enseñarlo: su puesto se ha decidido con la mitad de información
   * que el de los demás.
   */
  readonly coverage: number
}

export interface CombinationResult {
  readonly version: string
  readonly ranking: readonly CombinedSector[]
  /** Sectores descartados por no tener ninguna señal calculable. */
  readonly unranked: readonly string[]
  /** Cobertura mínima exigida para entrar en el ranking. */
  readonly minCoverage: number
  readonly limitations: readonly string[]
}

export const COMBINE_LIMITATIONS = [
  'El orden sale de una media de rangos, no de una puntuación de calidad. Dos sectores consecutivos pueden estar prácticamente empatados.',
  'Los pesos de cada señal son una elección declarada, no un resultado de optimizarlos: optimizarlos con esta muestra sería ajustar al ruido.',
] as const

/**
 * Cobertura mínima para entrar en el ranking.
 *
 * Por debajo de la mitad del peso, el puesto se decidiría con menos información
 * que la que tienen los demás y no sería comparable con ellos.
 */
export const MIN_COVERAGE = 0.5

/**
 * Combina varias señales en un orden.
 *
 * Cada señal se normaliza **por separado** antes de mezclarse, y el peso de una
 * señal que falta para un sector **no se redistribuye**: se descuenta de su
 * cobertura. Redistribuirlo haría que un sector con una sola señal pareciera tan
 * informado como uno con tres.
 */
export function combineSignals(signals: readonly WeightedSignal[]): CombinationResult {
  const sectores = [
    ...new Set(signals.flatMap((s) => s.readings.map((r) => r.sector))),
  ].sort()

  const normalizadas = signals.map((s) => ({
    modelKey: s.modelKey,
    weight: Math.max(0, s.weight),
    porSector: new Map(normalizeByRank(s.readings).map((r) => [r.sector, r.rank])),
  }))

  const pesoTotal = normalizadas.reduce((s, x) => s + x.weight, 0)

  const evaluados = sectores.map((sector) => {
    const bySignal: Record<string, number | null> = {}
    const missing: string[] = []
    let suma = 0
    let pesoUsado = 0

    for (const s of normalizadas) {
      const rank = s.porSector.get(sector) ?? null
      bySignal[s.modelKey] = rank
      if (rank === null) {
        missing.push(s.modelKey)
        continue
      }
      suma += rank * s.weight
      pesoUsado += s.weight
    }

    return {
      sector,
      score: pesoUsado > 0 ? suma / pesoUsado : null,
      bySignal,
      missing,
      coverage: pesoTotal > 0 ? pesoUsado / pesoTotal : 0,
    }
  })

  const dentro = evaluados.filter((e) => e.score !== null && e.coverage >= MIN_COVERAGE)
  const fuera = evaluados.filter((e) => e.score === null || e.coverage < MIN_COVERAGE)

  // De mayor a menor puntuación. El empate se rompe por nombre para que el
  // orden no dependa del recorrido del conjunto.
  const ordenados = [...dentro].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || a.sector.localeCompare(b.sector),
  )

  return {
    version: COMBINE_VERSION,
    ranking: ordenados.map((e, i) => ({ ...e, position: i + 1 })),
    unranked: fuera.map((e) => e.sector),
    minCoverage: MIN_COVERAGE,
    limitations: [...COMBINE_LIMITATIONS],
  }
}
