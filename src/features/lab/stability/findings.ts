/**
 * Hallazgos del resumen de estabilidad (LAB-312).
 *
 * Convierte las métricas ya calculadas en frases que dicen algo. Función pura:
 * se prueba con un objeto fijo, igual que los bloques de LAB-307.
 *
 * **Hay un máximo de hallazgos, y es el criterio de aceptación de la tarea.**
 * Una pantalla que enseña doce avisos no informa de doce cosas: no informa de
 * ninguna, porque nadie los lee. Se ordenan por severidad y se corta; lo que no
 * cabe sigue estando en las pantallas de detalle, que es donde toca.
 */
import type { DiversificationData } from './contracts'

/** Cuántos hallazgos se enseñan como mucho. */
export const MAX_FINDINGS = 4

export type FindingLevel = 'warning' | 'info'

export interface Finding {
  /** Código estable. El texto puede reescribirse; esto no. */
  readonly code: string
  readonly level: FindingLevel
  readonly text: string
  /**
   * De dónde sale el número. Sin esto un hallazgo es una opinión, y el criterio
   * de aceptación pide que la evidencia esté accesible.
   */
  readonly evidence: string
}

export interface StabilityFacts {
  /** Volatilidad anualizada de la cartera. */
  readonly volatility: number | null
  /** Caída máxima observada, fracción positiva. */
  readonly maxDrawdown: number | null
  /** Si esa caída ya se recuperó. `null` cuando no hay caída medida. */
  readonly recovered: boolean | null
  /** Días que lleva sin recuperarse, si sigue abajo. */
  readonly daysUnderwater: number | null
  readonly diversification: DiversificationData | null
  /** Fracción del valor de la cartera incluida en el análisis. */
  readonly coverage: number
  /** Días con precio en todos los activos. */
  readonly commonDays: number
  /** Peso del activo más grande, fracción. */
  readonly topWeight: number | null
}

/** Por debajo de esto, el análisis describe una parte y hay que decirlo. */
const COBERTURA_PARCIAL = 0.9
/** Un solo activo por encima de esto manda sobre la cartera entera. */
const CONCENTRACION_ALTA = 0.4
/** Ratio de diversificación por debajo del cual repartir no está reparando. */
const DIVERSIFICACION_POBRE = 1.1

function pct(fraccion: number, decimales = 0): string {
  return `${(fraccion * 100).toFixed(decimales).replace('.', ',')} %`
}

/**
 * Todos los hallazgos que producen estos datos, sin ordenar ni recortar.
 *
 * El orden en que se generan no es casual: es el de **qué invalida qué**. Si la
 * cobertura es parcial, todo lo demás describe media cartera, así que va
 * primero. De nada sirve avisar de concentración sobre un análisis que no sabe
 * lo que hay en la otra mitad.
 */
export function allStabilityFindings(facts: StabilityFacts): readonly Finding[] {
  const todos: Finding[] = []

  if (facts.coverage < COBERTURA_PARCIAL) {
    todos.push({
      code: 'partial_coverage',
      level: 'warning',
      text: `Este análisis cubre el ${pct(facts.coverage)} de tu cartera. Lo que sigue describe esa parte, no el conjunto.`,
      evidence: `Cobertura ponderada por valor: ${pct(facts.coverage, 1)}.`,
    })
  }

  if (facts.topWeight !== null && facts.topWeight > CONCENTRACION_ALTA) {
    todos.push({
      code: 'concentrated',
      level: 'warning',
      text: `Un solo activo pesa el ${pct(facts.topWeight)}. Lo que le pase a él le pasa a tu cartera.`,
      evidence: `Peso del mayor activo sobre el total analizado: ${pct(facts.topWeight, 1)}.`,
    })
  }

  if (facts.recovered === false && facts.daysUnderwater !== null) {
    todos.push({
      code: 'underwater',
      level: 'warning',
      text: `La mayor caída del periodo todavía no se ha recuperado: llevas ${facts.daysUnderwater} días por debajo del máximo anterior.`,
      evidence: 'Días entre el fondo de la caída y el último cierre disponible.',
    })
  }

  if (
    facts.diversification !== null &&
    facts.diversification.diversificationRatio < DIVERSIFICACION_POBRE
  ) {
    todos.push({
      code: 'poor_diversification',
      level: 'warning',
      text: `Repartir te está ahorrando poco: tus activos se mueven casi a la vez (ratio ${facts.diversification.diversificationRatio.toFixed(2).replace('.', ',')}).`,
      evidence: `Sin repartir tendrías ${pct(facts.diversification.weightedAverageVolatility, 1)} de volatilidad; repartiendo, ${pct(facts.diversification.portfolioVolatility, 1)}.`,
    })
  }

  if (facts.maxDrawdown !== null && facts.volatility !== null) {
    todos.push({
      code: 'observed_drawdown',
      level: 'info',
      text: `En este periodo llegaste a caer un ${pct(facts.maxDrawdown, 1)} desde máximos, con una volatilidad anual del ${pct(facts.volatility, 1)}.`,
      evidence: `Medido sobre ${facts.commonDays} días con precio en todos los activos.`,
    })
  }

  if (
    facts.diversification !== null &&
    facts.diversification.effectiveBets !== null &&
    facts.diversification.diversificationRatio >= DIVERSIFICACION_POBRE
  ) {
    todos.push({
      code: 'effective_bets',
      level: 'info',
      text: `Tu riesgo está repartido entre unas ${facts.diversification.effectiveBets.toFixed(1).replace('.', ',')} apuestas independientes.`,
      evidence: 'Número efectivo de apuestas, derivado de la matriz de covarianza.',
    })
  }

  return todos
}

/**
 * Los hallazgos que se enseñan: avisos primero y recortados a `MAX_FINDINGS`.
 *
 * Lo que no cabe no se pierde: sigue estando en las pantallas de detalle, y la
 * página dice cuántos ha dejado fuera.
 */
export function stabilityFindings(facts: StabilityFacts): readonly Finding[] {
  const todos = allStabilityFindings(facts)
  const avisos = todos.filter((f) => f.level === 'warning')
  const informativos = todos.filter((f) => f.level === 'info')
  return [...avisos, ...informativos].slice(0, MAX_FINDINGS)
}

/** Cuántos hallazgos se han dejado fuera por el tope. */
export function hiddenFindingsCount(facts: StabilityFacts): number {
  return allStabilityFindings(facts).length - stabilityFindings(facts).length
}
