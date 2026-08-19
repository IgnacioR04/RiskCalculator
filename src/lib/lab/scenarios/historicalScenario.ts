/**
 * Escenario histórico (LAB-503).
 *
 * Contesta: «si el tramo que va de febrero a marzo de 2020 volviera a pasar
 * **con la cartera que tengo hoy**, ¿qué me pasaría?».
 *
 * ## Lo que este escenario NO dice
 *
 * No dice que el usuario tuviera esa cartera entonces. Casi seguro que no la
 * tenía: puede que ni existiera alguna de sus posiciones. Es el criterio de
 * aceptación de LAB-503 y no es un matiz legal, es la diferencia entre un
 * escenario y un backtest falso.
 *
 * Confundir las dos cosas produce la peor clase de error de este dominio: creer
 * que uno «habría aguantado» una caída que en realidad nunca vivió, con un
 * dinero que entonces no tenía y una cartera que entonces no era esta.
 *
 * ## Lo que no se conoce no se rellena
 *
 * Un activo sin historia en ese periodo **no se sustituye por su índice, ni por
 * la media de los demás, ni por cero**. Se aparta, se nombra y se descuenta de
 * la cobertura. Rellenarlo sería inventar el dato más importante del cálculo.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { Currency } from '../../domain'
import type {
  ScenarioContribution,
  ScenarioDefinition,
  ScenarioResult,
} from './contracts'

export const HISTORICAL_MODEL_VERSION = 'scenario-historical-v1'

export const HISTORICAL_ASSUMPTIONS = [
  {
    label: 'No tenías esta cartera entonces',
    detail:
      'Se aplica el comportamiento de aquel periodo a las posiciones que tienes hoy. No es lo que te pasó: es lo que te pasaría si aquello se repitiera ahora.',
  },
  {
    label: 'La historia no se repite igual',
    detail:
      'Que un periodo ocurriera una vez no dice nada sobre su probabilidad de volver a ocurrir, ni sobre si sería igual de intenso.',
  },
  {
    label: 'Nadie toca la cartera durante el periodo',
    detail: 'Sin ventas, sin compras y sin rebalanceo: una cartera real haría alguna de las tres.',
  },
] as const

export interface HistoricalPosition {
  readonly assetId: string
  readonly symbol: string
  /** Valor actual en divisa de presentación. */
  readonly value: number
  /**
   * Serie de cierres del activo, `YYYY-MM-DD` → precio, ya en la divisa de
   * presentación. Convertir es responsabilidad de quien llama (LAB-301).
   */
  readonly series: readonly { readonly date: string; readonly close: number }[]
}

export interface RunHistoricalInput {
  readonly definition: ScenarioDefinition
  readonly positions: readonly HistoricalPosition[]
  readonly baseCurrency: Currency
  readonly asOf: string
}

/** Rendimiento de una serie entre dos fechas, o `null` si no la cubre. */
export function periodReturn(
  series: readonly { readonly date: string; readonly close: number }[],
  from: string,
  to: string,
): { value: number; firstDate: string; lastDate: string } | null {
  const dentro = series
    .filter((p) => p.date >= from && p.date <= to && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Con un solo punto no hay variación que medir: no es cero, es que no se sabe.
  if (dentro.length < 2) return null

  const primero = dentro[0]!
  const ultimo = dentro[dentro.length - 1]!
  return {
    value: ultimo.close / primero.close - 1,
    firstDate: primero.date,
    lastDate: ultimo.date,
  }
}

export interface HistoricalResult extends ScenarioResult {
  /** Fracción del valor de la cartera que tenía historia en ese periodo. */
  readonly coverage: number
  /** Primer y último día realmente usados, que pueden no ser los pedidos. */
  readonly effectiveFrom: string | null
  readonly effectiveTo: string | null
}

/**
 * Aplica el rendimiento de un periodo pasado a la cartera de hoy.
 *
 * El cambio total se calcula **sobre lo cubierto**, no sobre el patrimonio
 * entero: si solo la mitad de la cartera tiene historia, decir «caes un 20 %»
 * daría por hecho que la otra mitad también cae, y eso no se sabe.
 */
export function runHistoricalScenario(input: RunHistoricalInput): HistoricalResult {
  const { definition, positions, baseCurrency, asOf } = input

  if (definition.params.kind !== 'historical') {
    throw new Error(
      `runHistoricalScenario recibió un escenario de tipo «${definition.params.kind}»`,
    )
  }
  const { from, to } = definition.params

  const contributions: ScenarioContribution[] = []
  const notCovered: string[] = []
  const fechasIniciales: string[] = []
  const fechasFinales: string[] = []

  let valorCubierto = 0
  let valorTotal = 0
  let valorFinalCubierto = 0

  for (const posicion of positions) {
    valorTotal += posicion.value

    const rendimiento = periodReturn(posicion.series, from, to)
    if (rendimiento === null) {
      // Sin historia en ese tramo. No se rellena con nada.
      notCovered.push(`${posicion.symbol}: sin historial entre ${from} y ${to}`)
      continue
    }

    fechasIniciales.push(rendimiento.firstDate)
    fechasFinales.push(rendimiento.lastDate)

    const after = posicion.value * (1 + rendimiento.value)
    valorCubierto += posicion.value
    valorFinalCubierto += after

    contributions.push({
      assetId: posicion.assetId,
      symbol: posicion.symbol,
      before: posicion.value,
      after,
      shareOfChange: 0,
    })
  }

  const cambio = valorFinalCubierto - valorCubierto
  const conReparto = contributions.map((c) => ({
    ...c,
    shareOfChange: cambio === 0 ? null : (c.after - c.before) / cambio,
  }))

  return {
    definitionId: definition.id,
    definitionVersion: definition.version,
    modelVersion: HISTORICAL_MODEL_VERSION,
    asOf,
    baseValue: valorCubierto,
    baseCurrency,
    outcome: {
      finalValue: contributions.length === 0 ? null : valorFinalCubierto,
      changePct: valorCubierto > 0 ? valorFinalCubierto / valorCubierto - 1 : null,
    },
    contributions: conReparto,
    assumptions: definition.assumptions,
    notCovered,
    coverage: valorTotal > 0 ? valorCubierto / valorTotal : 0,
    // La ventana efectiva es la intersección de lo que cada serie cubre de
    // verdad, no la que se pidió: pedir 2008 con series que empiezan en 2010
    // devolvería un periodo que nadie ha vivido.
    effectiveFrom: fechasIniciales.length === 0 ? null : fechasIniciales.slice().sort().at(-1)!,
    effectiveTo: fechasFinales.length === 0 ? null : fechasFinales.slice().sort()[0]!,
  }
}

/** Periodos históricos que la aplicación ofrece de partida. */
export const HISTORICAL_PERIODS: readonly {
  id: string
  name: string
  from: string
  to: string
  description: string
}[] = [
  {
    id: 'covid-2020',
    name: 'Desplome del COVID',
    from: '2020-02-19',
    to: '2020-03-23',
    description: 'Cinco semanas de caída vertical y generalizada.',
  },
  {
    id: 'crisis-2008',
    name: 'Crisis financiera de 2008',
    from: '2007-10-09',
    to: '2009-03-09',
    description: 'Diecisiete meses de descenso, con recuperación lenta.',
  },
  {
    id: 'inflacion-2022',
    name: 'Inflación y subida de tipos de 2022',
    from: '2022-01-03',
    to: '2022-10-12',
    description: 'Bolsa y bonos cayendo a la vez: el año que rompió el 60/40.',
  },
]

/** Convierte un periodo del catálogo en una definición versionada. */
export function periodToDefinition(
  periodo: (typeof HISTORICAL_PERIODS)[number],
): ScenarioDefinition {
  return {
    id: periodo.id,
    name: periodo.name,
    version: 1,
    horizon: {
      amount: Math.max(
        1,
        Math.round(
          (Date.parse(`${periodo.to}T00:00:00Z`) - Date.parse(`${periodo.from}T00:00:00Z`)) /
            86_400_000,
        ),
      ),
      unit: 'days',
    },
    params: { kind: 'historical', from: periodo.from, to: periodo.to },
    assumptions: [...HISTORICAL_ASSUMPTIONS],
    description: periodo.description,
    source: 'builtin',
  }
}
