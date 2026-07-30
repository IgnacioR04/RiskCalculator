/**
 * Medidas de diversificación de una cartera, calculadas sobre la matriz de
 * covarianzas. Son medidas establecidas en la literatura, no invenciones:
 *
 * · Ratio de diversificación (DR) — Choueifaty & Coignard (2008), «Toward
 *   Maximum Diversification», Journal of Portfolio Management:
 *       DR = (Σ wᵢ·σᵢ) / σ_cartera
 *   Compara la volatilidad que tendrías si los activos se movieran todos a la
 *   vez con la que realmente tienes. DR = 1 significa que no diversificas
 *   nada; cuanto más alto, más te está compensando repartir.
 *
 * · Reducción de volatilidad = 1 − 1/DR. La misma idea expresada como «qué
 *   parte del riesgo te has quitado por repartir».
 *
 * · Número efectivo de apuestas de riesgo — entropía de las contribuciones al
 *   riesgo (Meucci, 2009, «Managing Diversification»):
 *       ENB = exp(−Σ pᵢ·ln pᵢ),  pᵢ = contribución de i al riesgo total
 *   Responde a «¿entre cuántas fuentes de riesgo independientes está repartido
 *   de verdad mi dinero?». No es lo mismo que el número de activos: diez
 *   activos que se mueven igual son una sola apuesta.
 *
 * · Correlación media implícita entre pares, despejada de la identidad
 *       σ²_cartera = Σ wᵢ²σᵢ² + ρ̄ · Σ_{i≠j} wᵢwⱼσᵢσⱼ
 *
 * Todas describen el pasado de la muestra usada. Ninguna predice nada.
 */

export interface DiversificationMetrics {
  /** Volatilidad anualizada de la cartera, σ_cartera. */
  portfolioVolatility: number
  /** Σ wᵢ·σᵢ: la volatilidad que tendrías sin ningún efecto diversificador. */
  weightedAverageVolatility: number
  /** Σ wᵢσᵢ / σ_cartera. Siempre ≥ 1 en carteras solo-largas. */
  diversificationRatio: number
  /** Fracción de volatilidad eliminada al repartir: 1 − 1/DR ∈ [0, 1). */
  volatilityReduction: number
  /**
   * Número efectivo de apuestas de riesgo. null cuando alguna contribución es
   * negativa (hay coberturas): la entropía no está definida y no se inventa.
   */
  effectiveBets: number | null
  /** Correlación media implícita entre pares; null si no es despejable. */
  averageCorrelation: number | null
}

/**
 * @param weights      pesos de cada activo (suman ≈ 1)
 * @param covariance   matriz de covarianzas anualizadas
 * @param riskContributions fracciones de contribución al riesgo (suman ≈ 1)
 */
export function diversificationMetrics(
  weights: readonly number[],
  covariance: readonly (readonly number[])[],
  riskContributions?: readonly number[],
): DiversificationMetrics | null {
  const n = weights.length
  if (n === 0 || covariance.length !== n) return null

  // Volatilidad individual de cada activo: raíz de su varianza (diagonal).
  const sigmas: number[] = []
  for (let i = 0; i < n; i++) {
    const variance = covariance[i]?.[i]
    if (variance === undefined || !Number.isFinite(variance) || variance < 0) return null
    sigmas.push(Math.sqrt(variance))
  }

  // σ² = w'Σw
  let variance = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cov = covariance[i]?.[j]
      if (cov === undefined || !Number.isFinite(cov)) return null
      variance += (weights[i] ?? 0) * (weights[j] ?? 0) * cov
    }
  }
  if (variance < 0) return null
  const portfolioVolatility = Math.sqrt(variance)

  const weightedAverageVolatility = weights.reduce(
    (sum, weight, i) => sum + Math.abs(weight) * (sigmas[i] ?? 0),
    0,
  )
  if (weightedAverageVolatility <= 0 || portfolioVolatility <= 0) return null

  const diversificationRatio = weightedAverageVolatility / portfolioVolatility

  // Correlación media implícita: se despeja de σ² = Σwᵢ²σᵢ² + ρ̄·Σ_{i≠j} wᵢwⱼσᵢσⱼ
  let ownTerms = 0
  let crossTerms = 0
  for (let i = 0; i < n; i++) {
    const wi = weights[i] ?? 0
    const si = sigmas[i] ?? 0
    ownTerms += wi * wi * si * si
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      crossTerms += wi * (weights[j] ?? 0) * si * (sigmas[j] ?? 0)
    }
  }
  const averageCorrelation =
    Math.abs(crossTerms) > 1e-12 ? (variance - ownTerms) / crossTerms : null

  // Número efectivo de apuestas: entropía de las contribuciones al riesgo.
  // Una contribución nula (p. ej. el efectivo, con volatilidad 0) no invalida
  // nada: por convención p·ln p → 0 cuando p → 0, así que simplemente no suma.
  // Lo que sí rompe la entropía es una contribución negativa (cobertura neta).
  let effectiveBets: number | null = null
  if (riskContributions !== undefined && riskContributions.length === n) {
    const total = riskContributions.reduce((sum, value) => sum + value, 0)
    const noNegatives = riskContributions.every((value) => value >= 0)
    if (noNegatives && Math.abs(total) > 1e-12) {
      let entropy = 0
      for (const contribution of riskContributions) {
        const p = contribution / total
        if (p > 0) entropy -= p * Math.log(p)
      }
      effectiveBets = Math.exp(entropy)
    }
  }

  return {
    portfolioVolatility,
    weightedAverageVolatility,
    diversificationRatio,
    volatilityReduction: 1 - 1 / diversificationRatio,
    effectiveBets,
    averageCorrelation:
      averageCorrelation !== null && Number.isFinite(averageCorrelation)
        ? averageCorrelation
        : null,
  }
}

/* ── Bandas de referencia ──────────────────────────────────────────────────
   Orientación para leer cada cifra, no umbrales oficiales: no existe un
   «ratio correcto» universal. Las fronteras son coherentes con
   describeDiversification y se presentan siempre como referencia. */

export type BandLevel = 'ok' | 'warn' | 'high'

export interface MetricBand {
  /** Rango tal y como se muestra, p. ej. «1,2–1,5». */
  range: string
  /** Qué significa ese rango. */
  meaning: string
  level: BandLevel
  /** Si el valor observado cae en esta banda. */
  matches: (value: number) => boolean
}

/** Ratio de diversificación: 1,00 = ninguna diversificación. */
export const RATIO_BANDS: MetricBand[] = [
  { range: '< 1,05', meaning: 'casi nula', level: 'high', matches: (v) => v < 1.05 },
  { range: '1,05–1,2', meaning: 'escasa', level: 'warn', matches: (v) => v >= 1.05 && v < 1.2 },
  { range: '1,2–1,5', meaning: 'razonable', level: 'ok', matches: (v) => v >= 1.2 && v < 1.5 },
  { range: '> 1,5', meaning: 'buena', level: 'ok', matches: (v) => v >= 1.5 },
]

/** Riesgo eliminado al repartir = 1 − 1/DR (equivalente a las bandas del DR). */
export const REDUCTION_BANDS: MetricBand[] = [
  { range: '< 5 %', meaning: 'casi nula', level: 'high', matches: (v) => v < 0.05 },
  { range: '5–17 %', meaning: 'escasa', level: 'warn', matches: (v) => v >= 0.05 && v < 0.17 },
  { range: '17–33 %', meaning: 'razonable', level: 'ok', matches: (v) => v >= 0.17 && v < 0.33 },
  { range: '> 33 %', meaning: 'notable', level: 'ok', matches: (v) => v >= 0.33 },
]

/** Correlación media entre pares: cuanto más baja, mejor reparte el riesgo. */
export const CORRELATION_BANDS: MetricBand[] = [
  { range: '< 0,3', meaning: 'bien repartido', level: 'ok', matches: (v) => v < 0.3 },
  { range: '0,3–0,6', meaning: 'moderado', level: 'warn', matches: (v) => v >= 0.3 && v < 0.6 },
  { range: '> 0,6', meaning: 'se mueven juntos', level: 'high', matches: (v) => v >= 0.6 },
]

/**
 * Apuestas efectivas: se leen SIEMPRE en relación al número de activos.
 * Tener 3 apuestas reales es excelente con 4 activos y pobre con 20.
 */
export function effectiveBetsBands(assetCount: number): MetricBand[] {
  const half = assetCount / 2
  const threeQuarters = (assetCount * 3) / 4
  const fmt = (value: number) => value.toFixed(1).replace('.', ',')
  return [
    {
      range: `< ${fmt(half)}`,
      meaning: 'mucha redundancia',
      level: 'high',
      matches: (v) => v < half,
    },
    {
      range: `${fmt(half)}–${fmt(threeQuarters)}`,
      meaning: 'aceptable',
      level: 'warn',
      matches: (v) => v >= half && v < threeQuarters,
    },
    {
      range: `> ${fmt(threeQuarters)}`,
      meaning: 'bien repartido',
      level: 'ok',
      matches: (v) => v >= threeQuarters,
    },
  ]
}

/** Lectura en lenguaje llano del ratio de diversificación. */
export function describeDiversification(ratio: number): {
  level: 'ok' | 'warn' | 'high'
  text: string
} {
  if (ratio >= 1.5) {
    return {
      level: 'ok',
      text: 'Tus activos se mueven bastante por su cuenta: repartir te está quitando una buena parte del riesgo.',
    }
  }
  if (ratio >= 1.2) {
    return {
      level: 'ok',
      text: 'Hay diversificación real, aunque varios activos comparten parte de sus movimientos.',
    }
  }
  if (ratio >= 1.05) {
    return {
      level: 'warn',
      text: 'Diversificas poco: tus activos tienden a subir y bajar a la vez, así que se comportan casi como uno solo.',
    }
  }
  return {
    level: 'high',
    text: 'Prácticamente no diversificas: el conjunto se mueve como si tuvieras un único activo.',
  }
}
