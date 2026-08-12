/**
 * Contratos de presentación del análisis de estabilidad (LAB-302, LAB-307).
 *
 * Los bloques de la pantalla reciben **datos ya calculados**, nunca el store ni
 * las series en bruto. Esa es la condición que los hace probables con un objeto
 * fijo: para comprobar cómo se pinta una volatilidad del 18 % basta escribir
 * `0.18`, sin montar una cartera ni descargar nada.
 *
 * Todo lo opcional es `null` y no `undefined` a propósito: `null` significa «se
 * intentó calcular y no se pudo», que es un estado que la pantalla tiene que
 * saber distinguir de «no aplica».
 */

export interface StabilityKpiData {
  /** Si el análisis cubre la cartera entera o solo un segmento. */
  readonly complete: boolean
  /** Volatilidad anualizada de la cartera. `null` si no se pudo calcular. */
  readonly volatility: number | null
  /** Fracción del valor de la cartera incluida en el análisis. */
  readonly coverage: number
  /** Rentabilidad ponderada por tiempo del periodo. */
  readonly twr: number | null
  /** Días con precio en todos los activos analizados. */
  readonly commonDays: number
}

export interface DiversificationData {
  readonly diversificationRatio: number
  readonly volatilityReduction: number
  readonly effectiveBets: number | null
  readonly averageCorrelation: number | null
  readonly weightedAverageVolatility: number
  readonly portfolioVolatility: number
}

/** Conclusión en lenguaje llano sobre un par de activos. */
export interface PairInsight {
  readonly kind: 'warning' | 'info'
  readonly text: string
}

/** Una fila de «quién aporta el riesgo». */
export interface ContributionRow {
  readonly assetId: string
  readonly symbol: string
  /** Peso en la cartera, fracción. */
  readonly weight: number
  /**
   * Parte del riesgo total que aporta, fracción que suma 1 entre todas. Puede
   * ser negativa: ese activo amortigua en esta muestra.
   */
  readonly contribution: number
}

/** Una fila de «activo por activo». Todo ya resuelto: `null` es «no se pudo». */
export interface AssetMetricRow {
  readonly assetId: string
  readonly symbol: string
  readonly name: string
  readonly provider: string
  readonly volatility: number | null
  readonly maxDrawdown: number | null
  readonly sharpe: number | null
  readonly sortino: number | null
}

/** Una fila de la tabla de beta y alpha frente al benchmark elegido. */
export interface BenchmarkRow {
  readonly assetId: string
  readonly symbol: string
  readonly beta: number | null
  readonly alpha: number | null
  readonly r2: number | null
  /** Observaciones comunes con el benchmark. Se enseña siempre. */
  readonly observations: number
}
