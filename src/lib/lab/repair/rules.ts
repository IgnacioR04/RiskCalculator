/**
 * Reglas de brechas (LAB-613).
 *
 * Contesta «¿qué le pasa a mi cartera?» con una lista **ordenada**, y el orden
 * es la mitad del valor.
 *
 * ## Por qué el orden importa más que la lista
 *
 * Una cartera con un 40 % en cripto y un 35 % en tecnología tiene dos problemas
 * de naturaleza muy distinta:
 *
 * - **Estructural**: la cartera está construida de forma que un mal año en un
 *   sitio se lleva la mitad del patrimonio. Eso es cierto hoy, mañana y dentro
 *   de un año, y se arregla cambiando la cartera.
 * - **Táctico**: «el bitcoin ha caído un 12 % esta semana». Eso es ruido, y
 *   mañana dirá otra cosa.
 *
 * Si se presentan mezcladas, lo táctico gana siempre: es más concreto, más
 * urgente y más fácil de entender. Y actuar sobre lo táctico ignorando lo
 * estructural es exactamente cómo se arruina una cartera.
 *
 * De ahí la regla que gobierna el módulo y es el criterio de aceptación de
 * LAB-613: **lo estructural va primero, siempre, aunque lo táctico sea más
 * llamativo**. No es una preferencia de ordenación: `sortFindings` no admite
 * ningún criterio que pueda colocar una señal táctica por encima de una
 * estructural.
 *
 * Las reglas son **declarativas**: cada una dice qué mira, cuándo se dispara y
 * qué evidencia aporta. Añadir una es añadir un objeto, no un `if` en medio de
 * una función de doscientas líneas.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

/** Naturaleza del hallazgo. El orden de este tipo **es** el orden de prioridad. */
export type FindingNature =
  /** Cómo está construida la cartera. Cierto hoy y dentro de un año. */
  | 'structural'
  /** Qué dicen los datos ahora mismo. Mañana dirá otra cosa. */
  | 'tactical'

export type FindingSeverity = 'alta' | 'media' | 'baja'

/** Cuánto patrimonio hay detrás. Una brecha sobre el 2 % no es una brecha. */
export interface Materiality {
  /** Fracción de la cartera afectada. */
  readonly weight: number
  /** Valor afectado en divisa de presentación. */
  readonly value: number
}

export interface Finding {
  readonly id: string
  readonly ruleId: string
  readonly nature: FindingNature
  readonly severity: FindingSeverity
  /** Titular en una frase. */
  readonly title: string
  /** Qué pasa exactamente, con los números. */
  readonly detail: string
  /**
   * De dónde sale. Sin esto un hallazgo es una opinión: el usuario tiene que
   * poder comprobar el número que lo dispara.
   */
  readonly evidence: readonly string[]
  readonly materiality: Materiality
  /**
   * Qué se puede simular para explorarlo. **No es un consejo**: es un enlace a
   * una herramienta donde el usuario mira por sí mismo.
   */
  readonly explore: readonly ExploreOption[]
}

export interface ExploreOption {
  readonly label: string
  /** Identificador de ruta del Laboratorio. */
  readonly routeId: string
}

/* ── Entrada ───────────────────────────────────────────────────────────────── */

/** Lo que las reglas necesitan saber. Todo ya calculado por otros módulos. */
export interface RepairContext {
  readonly totalValue: number
  readonly baseCurrency: string
  /** Peso de la mayor posición. */
  readonly maxWeight: number
  readonly maxWeightSymbol: string
  /** Número efectivo de posiciones (1/HHI). */
  readonly effectivePositions: number
  /** Posiciones con peso, para las reglas por grupo. */
  readonly positions: readonly {
    readonly symbol: string
    readonly weight: number
    readonly assetType: string
  }[]
  /** Cuántas apuestas distintas hay de verdad, de LAB-412. `null` si no se sabe. */
  readonly distinctBets: number | null
  /** Parejas que se mueven casi igual, de LAB-410. */
  readonly nearDuplicates: readonly {
    readonly a: string
    readonly b: string
    readonly correlation: number
  }[]
  /** Límites de la política que la cartera actual incumple. */
  readonly violations: readonly string[]
  /** Cobertura de precios, de LAB-211. `null` si no se ha evaluado. */
  readonly priceCoverage: number | null
}

/* ── Reglas ────────────────────────────────────────────────────────────────── */

export interface Rule {
  readonly id: string
  readonly nature: FindingNature
  /** Devuelve los hallazgos que produce, o vacío si no se dispara. */
  readonly evaluate: (ctx: RepairContext) => readonly Omit<Finding, 'id' | 'ruleId' | 'nature'>[]
}

/** Umbrales, declarados como dato para poder discutirlos. */
export const THRESHOLDS = {
  /** Peso a partir del cual una sola posición domina la cartera. */
  concentration: 0.3,
  /** Correlación a partir de la cual dos posiciones son casi la misma. */
  duplication: 0.9,
  /** Peso mínimo para que un hallazgo sea material. */
  materiality: 0.05,
  /** Cobertura de precios por debajo de la cual el análisis no es fiable. */
  coverage: 0.9,
} as const

const pct = (f: number) => `${(f * 100).toFixed(0)} %`

export const RULES: readonly Rule[] = [
  {
    id: 'concentration',
    nature: 'structural',
    evaluate: (ctx) => {
      if (ctx.maxWeight < THRESHOLDS.concentration) return []
      return [
        {
          severity: ctx.maxWeight >= 0.5 ? 'alta' : 'media',
          title: `${ctx.maxWeightSymbol} decide el resultado de tu cartera`,
          detail: `Pesa un ${pct(ctx.maxWeight)}. Un mal año de esa posición se lleva por delante lo que hagan las demás.`,
          evidence: [
            `Mayor posición: ${ctx.maxWeightSymbol}, ${pct(ctx.maxWeight)} de ${formatoValor(ctx.totalValue, ctx.baseCurrency)}.`,
            `Umbral declarado: ${pct(THRESHOLDS.concentration)}.`,
          ],
          materiality: { weight: ctx.maxWeight, value: ctx.totalValue * ctx.maxWeight },
          explore: [
            { label: 'Ver alternativas menos concentradas', routeId: 'lab.future.candidates' },
            { label: 'Ver qué pasaría en una caída', routeId: 'lab.future.scenarios' },
          ],
        },
      ]
    },
  },

  {
    id: 'fake_diversification',
    nature: 'structural',
    evaluate: (ctx) => {
      if (ctx.distinctBets === null) return []
      const posiciones = ctx.positions.length
      // Tener el doble de posiciones que de apuestas es la señal: la mitad de
      // lo que se tiene es repetición.
      if (posiciones < 3 || ctx.distinctBets >= posiciones / 2) return []
      return [
        {
          severity: 'alta',
          title: `Tus ${posiciones} posiciones son ${ctx.distinctBets} apuestas`,
          detail:
            'Varias se han movido juntas, así que reparten menos de lo que parece. Tener muchas cosas no diversifica si esas cosas suben y bajan a la vez.',
          evidence: [
            `${posiciones} posiciones agrupadas en ${ctx.distinctBets} grupos de comportamiento.`,
            `Número efectivo de posiciones por peso: ${ctx.effectivePositions.toFixed(1).replace('.', ',')}.`,
          ],
          materiality: { weight: 1, value: ctx.totalValue },
          explore: [{ label: 'Ver qué se mueve junto con qué', routeId: 'lab.stability.dependence' }],
        },
      ]
    },
  },

  {
    id: 'duplication',
    nature: 'structural',
    evaluate: (ctx) => {
      const pares = ctx.nearDuplicates.filter((p) => p.correlation >= THRESHOLDS.duplication)
      if (pares.length === 0) return []

      const pesoDe = (simbolo: string) =>
        ctx.positions.find((p) => p.symbol === simbolo)?.weight ?? 0

      return pares.map((par) => {
        const peso = pesoDe(par.a) + pesoDe(par.b)
        return {
          severity: peso >= 0.3 ? 'alta' : 'media',
          title: `${par.a} y ${par.b} son casi la misma posición`,
          detail: `Se han movido igual un ${pct(par.correlation)} del tiempo. Tenerlas las dos ocupa un ${pct(peso)} de tu cartera sin repartir nada.`,
          evidence: [
            // El umbral que se cita es siempre el real. Ajustarlo al valor
            // observado para que la frase suene más contundente —«1,00 por
            // encima de 0,99»— sería falsear la regla que se está aplicando.
            `Correlación ${par.correlation.toFixed(2).replace('.', ',')}, por encima del umbral de ${THRESHOLDS.duplication.toFixed(2).replace('.', ',')}.`,
            `Peso conjunto: ${pct(peso)}.`,
          ],
          materiality: { weight: peso, value: ctx.totalValue * peso },
          explore: [
            { label: 'Ver la matriz completa', routeId: 'lab.stability.dependence' },
            { label: 'Ver qué llevan dentro', routeId: 'lab.stability.exposure' },
          ],
        }
      })
    },
  },

  {
    id: 'policy_violation',
    nature: 'structural',
    evaluate: (ctx) => {
      if (ctx.violations.length === 0) return []
      return [
        {
          severity: 'alta',
          title: 'Tu cartera no cumple tus propias reglas',
          detail:
            'Escribiste una política y la cartera actual se sale de ella. No es una opinión de la aplicación: es lo que tú decidiste.',
          evidence: ctx.violations.map((v) => `Incumple: ${v}.`),
          materiality: { weight: 1, value: ctx.totalValue },
          explore: [
            { label: 'Ver alternativas que sí las cumplen', routeId: 'lab.future.candidates' },
          ],
        },
      ]
    },
  },

  {
    id: 'coverage',
    nature: 'tactical',
    evaluate: (ctx) => {
      if (ctx.priceCoverage === null || ctx.priceCoverage >= THRESHOLDS.coverage) return []
      return [
        {
          severity: 'media',
          title: 'Parte de tu cartera no tiene precio fiable',
          detail: `Solo se ha podido valorar el ${pct(ctx.priceCoverage)}. Todo lo demás que dice esta pantalla se calcula sobre esa parte.`,
          evidence: [`Cobertura de precios: ${pct(ctx.priceCoverage)} del valor.`],
          materiality: {
            weight: 1 - ctx.priceCoverage,
            value: ctx.totalValue * (1 - ctx.priceCoverage),
          },
          explore: [{ label: 'Ver qué falta', routeId: 'lab.stability.data' }],
        },
      ]
    },
  },
]

function formatoValor(valor: number, divisa: string): string {
  return `${valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${divisa}`
}
