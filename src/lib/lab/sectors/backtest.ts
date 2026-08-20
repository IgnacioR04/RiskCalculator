/**
 * Backtest walk-forward de señales sectoriales (LAB-709).
 *
 * Comprueba si una señal predice algo, con el único método que no se engaña a sí
 * mismo: **elegir con datos de antes y medir con datos de después**.
 *
 * ## Lo que este motor está diseñado para no hacer
 *
 * Un backtest de señal es el sitio del proyecto donde es más fácil producir un
 * número bonito y falso. Cuatro decisiones lo impiden:
 *
 * 1. **La cartera se forma con lo que se sabía en la fecha de formación.** El
 *    almacén de LAB-704 devuelve lo que estaba disponible entonces, no lo
 *    corregido después.
 * 2. **El rendimiento se mide en el periodo siguiente**, nunca en el mismo que
 *    produjo la señal.
 * 3. **Los costes se descuentan.** Una señal que solo gana antes de costes no
 *    gana.
 * 4. **El resultado incluye el número de periodos.** Con doce observaciones, la
 *    diferencia entre el grupo superior y el inferior no distingue una señal de
 *    la suerte, y el informe lo dirá con esas palabras.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export const BACKTEST_VERSION = 'sector-backtest-v1'

export interface PeriodObservation {
  readonly sector: string
  /** Valor de la señal conocido en la fecha de formación. */
  readonly signal: number | null
  /** Rentabilidad **del periodo siguiente**. `null` si no se conoce. */
  readonly forwardReturn: number | null
}

export interface BacktestPeriod {
  /** Fecha de formación de la cartera. */
  readonly formedAt: string
  readonly observations: readonly PeriodObservation[]
}

export interface BacktestInput {
  readonly periods: readonly BacktestPeriod[]
  /** Cuántos sectores entran en cada grupo. */
  readonly groupSize: number
  /** Coste por rotación completa, en fracción. Se aplica sobre lo que cambia. */
  readonly costPerTurnover: number
}

export interface PeriodResult {
  readonly formedAt: string
  readonly topReturn: number
  readonly bottomReturn: number
  /** Diferencia bruta, antes de costes. */
  readonly spread: number
  /** Fracción de la cartera que cambió respecto al periodo anterior. */
  readonly turnover: number
  /** Diferencia después de descontar el coste de rotar. */
  readonly netSpread: number
  readonly topSectors: readonly string[]
}

export type BacktestOutcome =
  | { readonly ok: true; readonly result: BacktestResult }
  | { readonly ok: false; readonly reason: 'no_usable_periods'; readonly periodsSeen: number }

export interface BacktestResult {
  readonly version: string
  readonly periods: readonly PeriodResult[]
  /** Media de la diferencia bruta por periodo. */
  readonly meanSpread: number
  /** Media después de costes. Es la que cuenta. */
  readonly meanNetSpread: number
  /** Fracción de periodos en que el grupo superior batió al inferior. */
  readonly hitRate: number
  /** Rotación media por periodo. */
  readonly meanTurnover: number
  /**
   * Número de periodos utilizables.
   *
   * Va en el resultado y no en una nota al pie porque **es lo que decide si el
   * resto de los números significan algo**.
   */
  readonly usablePeriods: number
  /**
   * `true` si la muestra basta para distinguir la señal de la suerte.
   *
   * Con el umbral declarado abajo. Cuando es `false`, el resto del resultado se
   * publica igual pero **no sostiene ninguna conclusión**.
   */
  readonly sampleSufficient: boolean
  readonly limitations: readonly string[]
}

/**
 * Periodos mínimos para que una diferencia media signifique algo.
 *
 * Es una **convención declarada**, no un contraste formal: con menos de dos
 * años de observaciones mensuales, el error típico de la media es del orden de
 * la propia media. Se escribe aquí para poder discutirlo.
 */
export const MIN_PERIODS = 24

export const BACKTEST_LIMITATIONS = [
  'Elegir el tamaño de grupo y el horizonte después de ver los datos convierte cualquier resultado en un ajuste al ruido. Los dos se fijaron en ADR-008, antes de medir.',
  'El coste se aplica como una fracción de la rotación. No modela horquilla ni impuestos, así que es un suelo del coste real.',
  'No hay corrección por múltiples pruebas: si se probaran veinte variantes, alguna saldría bien por azar.',
] as const

/**
 * Ejecuta el backtest.
 *
 * Un periodo sin bastantes sectores con señal **y** rentabilidad conocida se
 * descarta entero: mezclar periodos con cinco sectores y periodos con dos daría
 * una media que no describe ninguno de los dos.
 */
export function runBacktest(input: BacktestInput): BacktestOutcome {
  const tam = Math.max(1, Math.trunc(input.groupSize))
  const resultados: PeriodResult[] = []
  let anteriores: readonly string[] = []

  for (const periodo of input.periods) {
    const utilizables = periodo.observations.filter(
      (o): o is PeriodObservation & { signal: number; forwardReturn: number } =>
        o.signal !== null &&
        o.forwardReturn !== null &&
        Number.isFinite(o.signal) &&
        Number.isFinite(o.forwardReturn),
    )

    // Hacen falta dos grupos disjuntos para que la diferencia signifique algo.
    if (utilizables.length < tam * 2) continue

    // Empate roto por nombre: sin esto el resultado dependería del orden de
    // entrada y el backtest dejaría de ser reproducible.
    const ordenados = [...utilizables].sort(
      (a, b) => b.signal - a.signal || a.sector.localeCompare(b.sector),
    )

    const arriba = ordenados.slice(0, tam)
    const abajo = ordenados.slice(-tam)

    const media = (xs: readonly { forwardReturn: number }[]) =>
      xs.reduce((s, x) => s + x.forwardReturn, 0) / xs.length

    const topReturn = media(arriba)
    const bottomReturn = media(abajo)
    const spread = topReturn - bottomReturn

    const topSectors = arriba.map((o) => o.sector)
    const cambiados = topSectors.filter((s) => !anteriores.includes(s)).length
    const turnover = anteriores.length === 0 ? 1 : cambiados / tam

    resultados.push({
      formedAt: periodo.formedAt,
      topReturn,
      bottomReturn,
      spread,
      turnover,
      // El coste se paga por rotar la cartera larga; la corta se supone
      // simétrica, así que se cuenta dos veces.
      netSpread: spread - turnover * input.costPerTurnover * 2,
      topSectors,
    })

    anteriores = topSectors
  }

  if (resultados.length === 0) {
    return { ok: false, reason: 'no_usable_periods', periodsSeen: input.periods.length }
  }

  const promedio = (f: (r: PeriodResult) => number) =>
    resultados.reduce((s, r) => s + f(r), 0) / resultados.length

  return {
    ok: true,
    result: {
      version: BACKTEST_VERSION,
      periods: resultados,
      meanSpread: promedio((r) => r.spread),
      meanNetSpread: promedio((r) => r.netSpread),
      hitRate: resultados.filter((r) => r.spread > 0).length / resultados.length,
      meanTurnover: promedio((r) => r.turnover),
      usablePeriods: resultados.length,
      sampleSufficient: resultados.length >= MIN_PERIODS,
      limitations: [...BACKTEST_LIMITATIONS],
    },
  }
}

/**
 * Veredicto sobre la hipótesis de una señal.
 *
 * Es deliberadamente severo y **empieza por la muestra**: sin periodos
 * suficientes, ni siquiera un resultado espectacular sostiene nada. Es el error
 * más común al leer un backtest, y aquí se corta antes de mirar el número.
 */
export type Verdict = 'insufficient_sample' | 'not_supported' | 'weak_support' | 'supported'

export interface VerdictReport {
  readonly verdict: Verdict
  readonly explanation: string
  /** Qué habría que ver para cambiar de veredicto. */
  readonly whatWouldChangeIt: string
}

export function assessHypothesis(result: BacktestResult): VerdictReport {
  if (!result.sampleSufficient) {
    return {
      verdict: 'insufficient_sample',
      explanation: `Solo hay ${result.usablePeriods} periodos utilizables, y hacen falta ${MIN_PERIODS} para distinguir una señal de la suerte. El resultado no sostiene ninguna conclusión, ni a favor ni en contra.`,
      whatWouldChangeIt: `Acumular hasta ${MIN_PERIODS} periodos de observaciones mensuales.`,
    }
  }

  if (result.meanNetSpread <= 0) {
    return {
      verdict: 'not_supported',
      explanation:
        'Después de costes, el grupo superior no bate al inferior. La hipótesis no se sostiene y la señal debe retirarse.',
      whatWouldChangeIt: 'Una diferencia neta positiva y consistente en más periodos.',
    }
  }

  if (result.hitRate < 0.55) {
    return {
      verdict: 'weak_support',
      explanation: `La diferencia neta media es positiva, pero solo acierta el ${(result.hitRate * 100).toFixed(0)} % de los periodos. Eso es compatible con la suerte.`,
      whatWouldChangeIt: 'Un acierto por encima del 55 % sostenido en más periodos.',
    }
  }

  return {
    verdict: 'supported',
    explanation: `La diferencia neta media es positiva y acierta el ${(result.hitRate * 100).toFixed(0)} % de los periodos, sobre ${result.usablePeriods} observaciones.`,
    whatWouldChangeIt: 'Que la diferencia neta se vuelva negativa o el acierto baje del 55 %.',
  }
}
