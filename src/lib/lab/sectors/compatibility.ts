/**
 * Compatibilidad entre un sector y la cartera (LAB-712).
 *
 * Contesta la única pregunta sectorial que [`LAB-710`](../../../../docs/models/sector-signals-v1-validation.md)
 * dejó en pie: **¿qué le falta a mi cartera?**
 *
 * No es un ranking de sectores buenos. Es una lectura de la cartera que ya se
 * tiene: qué sectores aportarían algo distinto y cuáles serían más de lo mismo.
 * La diferencia importa, porque la primera pregunta se puede contestar con la
 * covarianza que ya se estima y la segunda exigiría predecir el futuro.
 *
 * ## Lo que se mide
 *
 * Para cada sector candidato, cuánto cambiaría la volatilidad de la cartera si
 * se le diera un peso pequeño. Negativo significa que la reduciría.
 *
 * Un sector puede reducir la volatilidad **y** ser una mala idea por otras
 * razones que esto no mira: coste, fiscalidad, o que el usuario no lo entienda.
 * Por eso el resultado se presenta como una observación, no como una sugerencia.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import { marginalDiversification } from './signals'

export const COMPATIBILITY_VERSION = 'sector-compatibility-v1'

/** Peso hipotético con que se evalúa cada sector. Declarado, no óptimo. */
export const TEST_WEIGHT = 0.05

export interface SectorCandidate {
  readonly sector: string
  readonly symbol: string
  /** Volatilidad anualizada del sector. */
  readonly volatility: number
  /** Correlación con la cartera actual. */
  readonly correlation: number
  /** Observaciones con que se estimó la correlación. */
  readonly observations: number
  /** Peso que el sector ya tiene en la cartera, fracción. */
  readonly currentWeight: number
}

export interface CompatibilityInput {
  readonly portfolioVolatility: number
  readonly candidates: readonly SectorCandidate[]
  /** Mínimo de observaciones para publicar una correlación. */
  readonly minObservations: number
  /** Peso a partir del cual el sector ya está presente de sobra. */
  readonly saturationWeight?: number
}

export type CompatibilityLabel =
  /** Aportaría algo distinto a lo que ya hay. */
  | 'aporta_algo_distinto'
  /** Se movería casi igual que lo que ya tienes. */
  | 'mas_de_lo_mismo'
  /** Ya lo tienes de sobra: añadir más concentra. */
  | 'ya_lo_tienes'
  /** No hay muestra para decir nada. */
  | 'sin_datos'

export interface SectorCompatibility {
  readonly sector: string
  readonly symbol: string
  readonly label: CompatibilityLabel
  /** Cambio en la volatilidad de la cartera, o `null` si no se puede calcular. */
  readonly volatilityChange: number | null
  readonly correlation: number | null
  readonly observations: number
  readonly currentWeight: number
  /** Frase para la interfaz, escrita aquí y no en cada pantalla. */
  readonly explanation: string
}

export interface CompatibilityResult {
  readonly version: string
  /** Ordenados por cuánto reducirían la volatilidad, de más a menos. */
  readonly sectors: readonly SectorCompatibility[]
  readonly testWeight: number
  readonly disclaimer: string
  readonly limitations: readonly string[]
}

export const COMPATIBILITY_DISCLAIMER =
  'Esto describe qué le falta a tu cartera, no qué comprar. Un sector puede reducir la volatilidad y ser mala idea por su coste, su fiscalidad o porque no lo entiendas.'

export const COMPATIBILITY_LIMITATIONS = [
  'La correlación se estima con el historial disponible y cambia justo cuando más falta hace: en un desplome, casi todo correlaciona más.',
  'Se evalúa un peso pequeño y fijo. Con un peso mayor el efecto no es proporcional.',
  'No mira rentabilidad esperada de ningún sector, porque no se estima ninguna.',
] as const

/** Correlación por encima de la cual el sector es «más de lo mismo». */
export const SIMILARITY_THRESHOLD = 0.85

/** Orden de presentación de las categorías. No es un orden de bondad. */
const ORDEN_CATEGORIA: Readonly<Record<CompatibilityLabel, number>> = {
  aporta_algo_distinto: 0,
  mas_de_lo_mismo: 1,
  ya_lo_tienes: 2,
  sin_datos: 3,
}

export function assessCompatibility(input: CompatibilityInput): CompatibilityResult {
  const saturacion = input.saturationWeight ?? 0.25

  const evaluados = input.candidates.map<SectorCompatibility>((c) => {
    const base = {
      sector: c.sector,
      symbol: c.symbol,
      observations: c.observations,
      currentWeight: c.currentWeight,
    }

    if (c.observations < input.minObservations || !Number.isFinite(c.correlation)) {
      return {
        ...base,
        label: 'sin_datos',
        volatilityChange: null,
        correlation: null,
        explanation: `No hay historial suficiente para decir nada sobre ${c.sector}: harían falta ${input.minObservations} observaciones y hay ${c.observations}.`,
      }
    }

    const cambio = marginalDiversification({
      portfolioVolatility: input.portfolioVolatility,
      sectorVolatility: c.volatility,
      correlation: c.correlation,
      weight: TEST_WEIGHT,
    })

    // El orden de las comprobaciones importa: tenerlo ya de sobra manda sobre
    // que además se parezca, porque es lo que hay que mirar primero.
    if (c.currentWeight >= saturacion) {
      return {
        ...base,
        label: 'ya_lo_tienes',
        volatilityChange: cambio,
        correlation: c.correlation,
        explanation: `Ya tienes un ${pct(c.currentWeight)} en ${c.sector}. Añadir más concentra en vez de repartir.`,
      }
    }

    if (c.correlation >= SIMILARITY_THRESHOLD) {
      return {
        ...base,
        label: 'mas_de_lo_mismo',
        volatilityChange: cambio,
        correlation: c.correlation,
        explanation: `${c.sector} se ha movido casi igual que tu cartera (${c.correlation.toFixed(2).replace('.', ',')}). Añadirlo sería más de lo mismo.`,
      }
    }

    return {
      ...base,
      label: 'aporta_algo_distinto',
      volatilityChange: cambio,
      correlation: c.correlation,
      explanation:
        cambio < 0
          ? `${c.sector} se ha movido distinto a tu cartera. Un ${pct(TEST_WEIGHT)} habría bajado su oscilación.`
          : `${c.sector} se ha movido distinto a tu cartera, pero es tan volátil que un ${pct(TEST_WEIGHT)} habría subido su oscilación igualmente.`,
    }
  })

  return {
    version: COMPATIBILITY_VERSION,
    // **Agrupado por categoría, no ordenado por efecto.**
    //
    // Ordenar por «cuánto reduce la oscilación» ponía arriba sectores
    // etiquetados «ya lo tienes», y la primera fila de una tabla se lee como la
    // mejor opción por mucho que la etiqueta diga lo contrario. Agrupar es
    // describir; ordenar por bondad sería recomendar.
    //
    // Dentro de cada grupo sí manda el efecto, y lo desconocido va al final: no
    // es ni bueno ni malo.
    sectors: [...evaluados].sort((a, b) => {
      const porCategoria = ORDEN_CATEGORIA[a.label] - ORDEN_CATEGORIA[b.label]
      if (porCategoria !== 0) return porCategoria
      if (a.volatilityChange === null || b.volatilityChange === null) {
        return a.sector.localeCompare(b.sector)
      }
      return a.volatilityChange - b.volatilityChange || a.sector.localeCompare(b.sector)
    }),
    testWeight: TEST_WEIGHT,
    disclaimer: COMPATIBILITY_DISCLAIMER,
    limitations: [...COMPATIBILITY_LIMITATIONS],
  }
}

function pct(fraccion: number): string {
  return `${(fraccion * 100).toFixed(0)} %`
}
