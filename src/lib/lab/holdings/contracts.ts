/**
 * Contratos de composición de fondos (LAB-403, LAB-406).
 *
 * Lo que hay dentro de un ETF, de dónde salió y de cuándo es. Las tres cosas
 * juntas, siempre: una lista de posiciones sin fuente ni fecha no se puede
 * auditar ni caducar, y lo que no se puede caducar acaba mintiendo.
 *
 * **El modelo es deliberadamente agnóstico de proveedor.** La composición puede
 * venir de un registro público, de una API con licencia o escrita a mano por el
 * usuario, y el motor de look-through no distingue: solo mira `source` para
 * poder decirlo en pantalla. Esa indiferencia es lo que permite empezar con lo
 * que hay gratis sin cerrarse la puerta a pagar por datos mejores después.
 */
import type { Currency } from '../../domain'

/**
 * De dónde viene la composición.
 *
 * Importa por dos motivos distintos: para saber cuánto fiarse, y para saber qué
 * se puede hacer con ella. Los datos de la SEC son de dominio público; los de un
 * proveedor con licencia, no necesariamente.
 */
export type HoldingsSource =
  /** Registro público de la SEC (formulario N-PORT). Dominio público. */
  | 'sec_edgar'
  /** Escrita por el usuario. Suya, y solo suya. */
  | 'manual'
  /** Proveedor con licencia. Su contrato manda sobre qué se puede hacer. */
  | 'licensed_provider'
  /** Datos de demostración. Nunca cuentan como reales. */
  | 'demo'

/** Una posición dentro del fondo. */
export interface FundHolding {
  /** Ticker o identificador de la posición dentro del fondo. */
  readonly symbol: string
  readonly name?: string
  /**
   * Peso dentro del fondo, fracción de 0 a 1. **Nunca porcentaje**: mezclar las
   * dos escalas es el error de dos órdenes de magnitud que no se nota hasta que
   * ha producido una conclusión absurda.
   */
  readonly weight: number
}

/**
 * La composición declarada de un fondo, con su procedencia.
 *
 * `coverage` es la pieza que hace esto honesto: casi nunca se tienen las 1.400
 * posiciones de un índice mundial, y decir «esto es lo que lleva dentro» cuando
 * se conoce el 60 % sería falso. Se declara qué parte se conoce y el motor
 * arrastra ese número hasta la pantalla.
 */
export interface FundComposition {
  /** Identificador del activo en la aplicación. */
  readonly assetId: string
  readonly source: HoldingsSource
  /** Fecha a la que se refiere la composición, `YYYY-MM-DD`. */
  readonly asOf: string
  readonly holdings: readonly FundHolding[]
  /**
   * Fracción del fondo que cubren las posiciones declaradas, de 0 a 1.
   *
   * Con las 20 mayores de un índice mundial suele rondar 0,25: es poco, pero es
   * justo donde vive el solapamiento que esta función existe para enseñar.
   */
  readonly coverage: number
  /** Quién publicó el dato, para poder citarlo. */
  readonly attribution?: string
}

/**
 * Exposición real a un emisor, ya sumando lo directo y lo que viene dentro de
 * los fondos.
 */
export interface LookThroughExposure {
  readonly symbol: string
  readonly name?: string
  /** Valor en divisa de presentación que viene de tenerlo directamente. */
  readonly directValue: number
  /** Valor que viene de estar dentro de uno o más fondos. */
  readonly indirectValue: number
  /** Suma de los dos. Es la exposición que el usuario tiene de verdad. */
  readonly totalValue: number
  /** Fracción sobre el total analizado. */
  readonly weight: number
  /** Fondos a través de los cuales lo tiene, para poder explicarlo. */
  readonly viaFunds: readonly string[]
}

export interface LookThroughResult {
  readonly exposures: readonly LookThroughExposure[]
  /**
   * Qué parte del valor analizado se ha podido mirar por dentro.
   *
   * Un fondo sin composición conocida no desaparece del análisis ni se reparte
   * a ojo: cuenta como no mirado, y este número lo dice.
   */
  readonly lookThroughCoverage: number
  /** Valor que sigue sin desglosar, por fondos sin composición o parcial. */
  readonly unresolvedValue: number
  /** Activos que son fondos y no traían composición. */
  readonly fundsWithoutComposition: readonly string[]
  readonly baseCurrency: Currency
  /** Fecha más antigua entre las composiciones usadas: la que manda. */
  readonly oldestAsOf: string | null
  /**
   * Tickers de dentro de un fondo que coinciden con **más de un instrumento**
   * de la cartera, así que no se han podido asignar a ninguno (LAB-402).
   *
   * Su valor engorda `unresolvedValue` en vez de ir al candidato más probable.
   * Aparece aquí para poder decirlo: si no, el usuario leería la ausencia de
   * esa exposición como «no la tengo» cuando significa «no se sabe cuál es».
   */
  readonly ambiguousHoldings: readonly string[]
}
