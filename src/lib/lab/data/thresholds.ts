/**
 * Umbrales de calidad por cálculo (LAB-210).
 *
 * «Los umbrales no se esconden en componentes. Se centralizan y versionan»
 * —documento 02 §8.4—. Este archivo es ese sitio único, y `THRESHOLDS_VERSION`
 * es lo que permite explicar meses después por qué un resultado antiguo se
 * bloqueó: se guarda con el resultado, igual que la versión de la regla de
 * riesgo efectivo.
 *
 * **Los números salen de la matriz del plan, no de una calibración.** El propio
 * plan dice que «los valores definitivos se calibran»; lo que hay aquí son los
 * mínimos orientativos que fija el contrato. Cambiarlos cambia qué resultados se
 * bloquean, así que obliga a subir la versión.
 *
 * Donde el plan no da un número, aquí **no hay número**. Un umbral inventado es
 * peor que un umbral ausente: el ausente se nota, y el inventado parece medido.
 */

/** Versión del juego de umbrales. Se guarda junto a cada evaluación. */
export const THRESHOLDS_VERSION = 1

/** Cálculos del Laboratorio que dependen de la calidad de los datos. */
export type LabCalculation =
  | 'directExposure'
  | 'lookThrough'
  | 'volatility'
  | 'correlation'
  | 'historicalCVaR'
  | 'sectorSignal'

/**
 * Qué hacer cuando no se cumple un mínimo.
 *
 * `partial` y `degrade` se parecen y no son lo mismo: `partial` calcula sobre lo
 * que hay y dice qué parte queda fuera; `degrade` calcula pero rebaja lo que se
 * afirma del resultado. `exclude` deja fuera al sujeto entero.
 */
export type ShortfallPolicy = 'block' | 'degrade' | 'partial' | 'exclude'

export interface CalculationRequirement {
  /** Observaciones por debajo de las cuales el cálculo no se sostiene. */
  readonly minObservations?: number
  /**
   * Observaciones deseables. Por debajo se avisa, pero se calcula: es la
   * diferencia entre «no se puede» y «se puede con menos confianza».
   */
  readonly preferredObservations?: number
  /** Cobertura mínima en capital, como fracción de 0 a 1. Nunca porcentaje. */
  readonly minCoverage?: number
  readonly onShortfall: ShortfallPolicy
  /** Por qué es así, en una frase. Se lee al revisar el archivo, no en pantalla. */
  readonly nota: string
}

/**
 * Matriz de mínimos iniciales (documento 02 §8.4).
 *
 * Sobre `historicalCVaR`: el plan habla de «250 observaciones **preferidas**» y
 * de «bloquear o advertencia fuerte». Las 250 entran como preferidas, que es lo
 * que el plan dice; el suelo por debajo del cual habría que bloquear **no está
 * calibrado**, así que no se inventa. Lo que sí bloquea es la cobertura, que sí
 * viene con número.
 */
export const CALCULATION_REQUIREMENTS: Readonly<Record<LabCalculation, CalculationRequirement>> = {
  directExposure: {
    // El snapshot tiene que estar completo: una exposición que no suma el total
    // conocido no es una exposición, es una parte de ella con otro nombre.
    minCoverage: 1,
    onShortfall: 'block',
    nota: 'Snapshot completo. Si el valor no cuadra, se bloquea.',
  },
  lookThrough: {
    // Sin mínimo: mirar dentro de la mitad de los fondos ya dice algo, siempre
    // que se diga qué mitad.
    onShortfall: 'partial',
    nota: 'Resultado parcial: se muestra qué porcentaje se ha podido mirar por dentro.',
  },
  volatility: {
    minObservations: 60,
    minCoverage: 0.9,
    onShortfall: 'degrade',
    nota: '60 observaciones y 90 % del capital. Según el uso, puede escalar a bloqueo.',
  },
  correlation: {
    // La cobertura se mide par a par, no sobre la cartera: dos activos pueden
    // solaparse poco aunque los dos tengan historia larga.
    minObservations: 60,
    onShortfall: 'partial',
    nota: '60 pares alineados. Se muestra el N de cada celda en vez de un único número.',
  },
  historicalCVaR: {
    preferredObservations: 250,
    minCoverage: 0.9,
    onShortfall: 'block',
    nota: '250 observaciones preferidas y 90 % del capital. El suelo de bloqueo por muestra está sin calibrar.',
  },
  sectorSignal: {
    // El plan dice «definido por factor»: no hay un número común, y ponerlo
    // aquí sería fingir que existe.
    onShortfall: 'exclude',
    nota: 'Universo mínimo definido por cada factor. Sin datos suficientes, el sector se excluye.',
  },
}

export const LAB_CALCULATIONS = Object.keys(CALCULATION_REQUIREMENTS) as readonly LabCalculation[]

/** Nombre legible de cada cálculo, para poder decir qué está bloqueado. */
export const CALCULATION_LABEL: Readonly<Record<LabCalculation, string>> = {
  directExposure: 'Exposición directa',
  lookThrough: 'Exposición mirando dentro de los fondos',
  volatility: 'Volatilidad',
  correlation: 'Correlaciones',
  historicalCVaR: 'CVaR histórico',
  sectorSignal: 'Señal sectorial',
}

export function requirementFor(calculation: LabCalculation): CalculationRequirement {
  return CALCULATION_REQUIREMENTS[calculation]
}
