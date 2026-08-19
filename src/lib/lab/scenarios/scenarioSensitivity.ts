/**
 * Sensibilidad de escenarios (LAB-506).
 *
 * Contesta la pregunta que hace útil a un escenario: **¿de qué supuesto depende
 * de verdad este resultado?**
 *
 * Un número solo —«caerías un 32 %»— invita a creérselo. El mismo número
 * acompañado de «y si el shock de cripto fuera la mitad, sería un 21 %» dice lo
 * que de verdad se sabe: que el resultado es una función de supuestos elegidos,
 * y cuáles mandan.
 *
 * ## Una variable cada vez, a propósito
 *
 * Se varía **un supuesto por ejecución** manteniendo el resto en su valor base.
 * Es el criterio de aceptación —«no combinatoria explosiva»— y no es solo una
 * cuestión de coste: una rejilla completa de 5 supuestos por 5 valores son 3.125
 * resultados que nadie mira, y el hallazgo útil (cuál manda) se pierde entre
 * ellos.
 *
 * Lo que se pierde es la **interacción** entre supuestos, y queda declarado: si
 * dos shocks se refuerzan entre sí, esto no lo verá.
 *
 * Función pura: recibe un ejecutor y no sabe nada de motores concretos.
 */
import type { ScenarioDefinition } from './contracts'

/** Multiplicadores aplicados al valor base de cada supuesto. */
export const SENSITIVITY_GRID = [0.5, 0.75, 1, 1.5, 2] as const

export interface SensitivityPoint {
  /** Multiplicador aplicado sobre el valor base. */
  readonly factor: number
  /** Valor que toma el supuesto con ese multiplicador. */
  readonly value: number
  /** Resultado de la cartera con ese valor, como fracción de cambio. */
  readonly changePct: number | null
}

export interface SensitivityDriver {
  /** Qué supuesto se ha variado, en palabras. */
  readonly label: string
  /** Ruta interna del parámetro, para poder reproducirlo. */
  readonly path: string
  readonly baseValue: number
  readonly points: readonly SensitivityPoint[]
  /**
   * Cuánto mueve el resultado, en puntos de cambio entre el extremo mejor y el
   * peor de la rejilla. Es la medida que ordena: el supuesto que más mueve es
   * el que hay que discutir.
   */
  readonly swing: number
}

export interface SensitivityResult {
  /** Cambio con los supuestos tal y como están. */
  readonly baseChangePct: number | null
  /** Supuestos ordenados por cuánto mueven el resultado, de más a menos. */
  readonly drivers: readonly SensitivityDriver[]
  /** Cuántas ejecuciones se han hecho. Para poder acotar el coste. */
  readonly runs: number
  /** Lo que este análisis no ve. */
  readonly limitations: readonly string[]
}

export const SENSITIVITY_LIMITATIONS = [
  'Se varía un supuesto cada vez: no se ven las interacciones entre dos supuestos que se refuercen entre sí.',
  'Los multiplicadores son una rejilla fija, no un rango de confianza: no dicen qué valores son probables.',
] as const

/** Ejecuta una definición y devuelve el cambio de la cartera, o `null`. */
export type ScenarioRunner = (definition: ScenarioDefinition) => number | null

interface Variable {
  readonly label: string
  readonly path: string
  readonly value: number
  readonly apply: (definition: ScenarioDefinition, valor: number) => ScenarioDefinition
}

/**
 * Qué supuestos se pueden variar en un escenario determinista.
 *
 * Solo los que ya están declarados: no se inventa un shock para una clase que
 * el escenario no menciona, porque variar de cero a cero no dice nada y variar
 * de cero a algo sería un escenario distinto, no una sensibilidad.
 */
function variablesDe(definition: ScenarioDefinition): Variable[] {
  const params = definition.params
  if (params.kind !== 'deterministic') return []

  const salida: Variable[] = []

  if (params.general !== undefined && params.general !== 0) {
    salida.push({
      label: 'Shock general',
      path: 'params.general',
      value: params.general,
      apply: (d, valor) => ({
        ...d,
        params: { ...(d.params as typeof params), general: valor },
      }),
    })
  }

  for (const [tipo, valor] of Object.entries(params.byType ?? {})) {
    if (typeof valor !== 'number' || valor === 0) continue
    salida.push({
      label: `Shock de ${ETIQUETA_TIPO[tipo] ?? tipo}`,
      path: `params.byType.${tipo}`,
      value: valor,
      apply: (d, nuevo) => {
        const p = d.params as typeof params
        return { ...d, params: { ...p, byType: { ...p.byType, [tipo]: nuevo } } }
      },
    })
  }

  if (params.fxForeign !== undefined && params.fxForeign !== 0) {
    salida.push({
      label: 'Movimiento de la divisa',
      path: 'params.fxForeign',
      value: params.fxForeign,
      apply: (d, valor) => ({
        ...d,
        params: { ...(d.params as typeof params), fxForeign: valor },
      }),
    })
  }

  return salida
}

const ETIQUETA_TIPO: Readonly<Record<string, string>> = {
  stock: 'acciones',
  etf: 'fondos',
  index: 'índices',
  crypto: 'cripto',
  commodity: 'materias primas',
  cash: 'efectivo',
  manual: 'posiciones manuales',
}

/**
 * Analiza de qué supuestos depende el resultado.
 *
 * El coste está acotado por construcción: `variables × 5` ejecuciones, no
 * `5 ^ variables`.
 */
export function scenarioSensitivity(
  definition: ScenarioDefinition,
  run: ScenarioRunner,
): SensitivityResult {
  const baseChangePct = run(definition)
  const variables = variablesDe(definition)

  const drivers: SensitivityDriver[] = variables.map((variable) => {
    const points: SensitivityPoint[] = SENSITIVITY_GRID.map((factor) => {
      // Un shock nunca puede ser peor que perderlo todo: el multiplicador se
      // recorta en −1 en vez de producir una cartera de valor negativo.
      const value = Math.max(-1, variable.value * factor)
      return {
        factor,
        value,
        changePct: factor === 1 ? baseChangePct : run(variable.apply(definition, value)),
      }
    })

    const conocidos = points.map((p) => p.changePct).filter((v): v is number => v !== null)

    return {
      label: variable.label,
      path: variable.path,
      baseValue: variable.value,
      points,
      swing: conocidos.length < 2 ? 0 : Math.max(...conocidos) - Math.min(...conocidos),
    }
  })

  return {
    baseChangePct,
    // De más a menos influyente; el empate se rompe por ruta para que el orden
    // no dependa del azar del recorrido de `Object.entries`.
    drivers: drivers.sort((a, b) => b.swing - a.swing || a.path.localeCompare(b.path)),
    runs: 1 + variables.length * (SENSITIVITY_GRID.length - 1),
    limitations: [...SENSITIVITY_LIMITATIONS],
  }
}
