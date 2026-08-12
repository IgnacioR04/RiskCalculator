/**
 * Motor de exposición real (LAB-405, LAB-407, LAB-408).
 *
 * Contesta la pregunta que la aplicación no sabía contestar: **¿cuánto tengo
 * de verdad de cada empresa?**
 *
 * Alguien con un ETF del MSCI World, otro del S&P 500 y acciones de Apple cree
 * tener cuatro cosas distintas. No las tiene: Apple está dentro de los dos
 * fondos. Su exposición real a Apple puede ser el doble o el triple de lo que
 * ve, y ese es un riesgo que no aparece en ninguna pantalla hasta que se mira
 * dentro.
 *
 * Función pura. No descarga nada: recibe las composiciones que otro le da, y le
 * da igual si vinieron de un registro público, de una API o escritas a mano.
 *
 * **Lo que no se conoce no se reparte.** Un fondo sin composición no se
 * distribuye a ojo entre lo que sí se conoce: se cuenta como no mirado y se
 * dice cuánto es. Repartirlo inflaría las exposiciones conocidas y daría una
 * falsa sensación de precisión justo donde hay menos.
 */
import type { Currency } from '../../domain'
import type {
  FundComposition,
  LookThroughExposure,
  LookThroughResult,
} from './contracts'

export interface PositionValue {
  readonly assetId: string
  readonly symbol: string
  readonly name?: string
  /** Valor en divisa de presentación. `null` si no se conoce. */
  readonly value: number | null
  /** Si es un envoltorio (ETF, fondo, índice) que puede tener algo dentro. */
  readonly isWrapper: boolean
}

export interface LookThroughInput {
  readonly positions: readonly PositionValue[]
  /** Composiciones disponibles, indexadas por `assetId`. */
  readonly compositions: Readonly<Record<string, FundComposition>>
  readonly baseCurrency: Currency
}

/**
 * Reparte el valor de cada fondo entre lo que lleva dentro y lo suma con lo que
 * se tiene directamente.
 *
 * Las claves de agrupación son los **símbolos**. Es una simplificación
 * declarada: dos líneas con el mismo ticker en mercados distintos se sumarían
 * como si fueran la misma empresa. Resolver la identidad canónica de un
 * instrumento es un problema propio —`LAB-402` en el plan— y hacerlo a medias
 * aquí sería peor que declarar el límite.
 */
export function lookThrough(input: LookThroughInput): LookThroughResult {
  const acumulado = new Map<
    string,
    { name?: string; directo: number; indirecto: number; fondos: Set<string> }
  >()

  const entrada = (symbol: string, name?: string) => {
    const previo = acumulado.get(symbol)
    if (previo !== undefined) {
      if (previo.name === undefined && name !== undefined) previo.name = name
      return previo
    }
    const nuevo = { ...(name === undefined ? {} : { name }), directo: 0, indirecto: 0, fondos: new Set<string>() }
    acumulado.set(symbol, nuevo)
    return nuevo
  }

  let totalAnalizado = 0
  let sinResolver = 0
  const fondosSinComposicion: string[] = []
  const fechas: string[] = []

  for (const posicion of input.positions) {
    // Una posición sin valor conocido no entra: no vale cero, es que no se
    // sabe. La cobertura de precio ya lo cuenta en su sitio (LAB-211).
    if (posicion.value === null) continue
    totalAnalizado += posicion.value

    if (!posicion.isWrapper) {
      entrada(posicion.symbol, posicion.name).directo += posicion.value
      continue
    }

    const composicion = input.compositions[posicion.assetId]
    if (composicion === undefined || composicion.holdings.length === 0) {
      // Fondo del que no se sabe qué lleva dentro. Se cuenta como no mirado y
      // **no** se reparte entre lo conocido.
      fondosSinComposicion.push(posicion.symbol)
      sinResolver += posicion.value
      continue
    }

    fechas.push(composicion.asOf)

    // Solo se reparte la parte cubierta por las posiciones declaradas. El resto
    // del fondo se queda sin resolver, que es lo que de verdad pasa: de esa
    // parte no se sabe qué contiene.
    const cubierto = posicion.value * clamp(composicion.coverage)
    sinResolver += posicion.value - cubierto

    const pesoDeclarado = composicion.holdings.reduce((suma, h) => suma + h.weight, 0)
    for (const holding of composicion.holdings) {
      // Los pesos se renormalizan sobre lo declarado: si las 20 posiciones
      // suman 0,25, cada una se lleva su parte proporcional del 25 % cubierto,
      // no su peso bruto sobre el fondo entero.
      const proporcion = pesoDeclarado > 0 ? holding.weight / pesoDeclarado : 0
      const acc = entrada(holding.symbol, holding.name)
      acc.indirecto += cubierto * proporcion
      acc.fondos.add(posicion.symbol)
    }
  }

  const exposures: LookThroughExposure[] = [...acumulado.entries()]
    .map(([symbol, datos]) => {
      const total = datos.directo + datos.indirecto
      return {
        symbol,
        ...(datos.name === undefined ? {} : { name: datos.name }),
        directValue: datos.directo,
        indirectValue: datos.indirecto,
        totalValue: total,
        weight: totalAnalizado > 0 ? total / totalAnalizado : 0,
        viaFunds: [...datos.fondos].sort(),
      }
    })
    // De mayor a menor: la primera fila es la que hay que mirar.
    .sort((a, b) => b.totalValue - a.totalValue)

  return {
    exposures,
    lookThroughCoverage:
      totalAnalizado > 0 ? (totalAnalizado - sinResolver) / totalAnalizado : 0,
    unresolvedValue: sinResolver,
    fundsWithoutComposition: fondosSinComposicion,
    baseCurrency: input.baseCurrency,
    // La más antigua manda: el conjunto es tan viejo como su pieza más vieja.
    oldestAsOf: fechas.length === 0 ? null : fechas.slice().sort()[0]!,
  }
}

/* ── Solapamiento entre fondos (LAB-408) ──────────────────────────────────── */

export interface FundOverlap {
  readonly a: string
  readonly b: string
  /**
   * Fracción que comparten, de 0 a 1. Es la suma de los mínimos de sus pesos:
   * la parte de cada euro que, esté en el fondo que esté, acaba en la misma
   * empresa.
   */
  readonly overlap: number
  /** Las posiciones que más aportan a ese solape, de mayor a menor. */
  readonly sharedTop: readonly { readonly symbol: string; readonly weight: number }[]
}

/**
 * Cuánto comparten dos fondos.
 *
 * Se usa la **suma de mínimos**, que es la medida estándar de solapamiento de
 * carteras: si un fondo tiene un 5 % de Apple y otro un 3 %, comparten un 3 %.
 * No es una correlación —que mide cómo se mueven— sino identidad: cuánto de lo
 * que hay dentro es literalmente lo mismo.
 *
 * El resultado se calcula **sobre lo declarado en cada fondo**, así que con
 * composiciones parciales es un suelo, no una medida exacta: el solape real solo
 * puede ser mayor. Conviene decirlo en pantalla.
 */
export function fundOverlap(
  a: FundComposition,
  b: FundComposition,
  simboloA: string,
  simboloB: string,
): FundOverlap {
  const pesosA = new Map(a.holdings.map((h) => [h.symbol, h.weight]))
  const compartidos: { symbol: string; weight: number }[] = []

  for (const holding of b.holdings) {
    const enA = pesosA.get(holding.symbol)
    if (enA === undefined) continue
    compartidos.push({ symbol: holding.symbol, weight: Math.min(enA, holding.weight) })
  }

  compartidos.sort((x, y) => y.weight - x.weight)
  return {
    a: simboloA,
    b: simboloB,
    overlap: compartidos.reduce((suma, c) => suma + c.weight, 0),
    sharedTop: compartidos.slice(0, 10),
  }
}

/** Todos los pares de fondos con composición conocida, de más a menos solape. */
export function allFundOverlaps(
  compositions: Readonly<Record<string, FundComposition>>,
  simbolos: Readonly<Record<string, string>>,
): readonly FundOverlap[] {
  const ids = Object.keys(compositions).sort()
  const salida: FundOverlap[] = []

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const idA = ids[i]!
      const idB = ids[j]!
      salida.push(
        fundOverlap(
          compositions[idA]!,
          compositions[idB]!,
          simbolos[idA] ?? idA,
          simbolos[idB] ?? idB,
        ),
      )
    }
  }

  return salida.sort((x, y) => y.overlap - x.overlap)
}

function clamp(valor: number): number {
  return Math.min(1, Math.max(0, valor))
}
