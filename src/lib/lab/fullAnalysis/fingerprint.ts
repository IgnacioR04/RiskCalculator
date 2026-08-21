/**
 * Identidad de un análisis (LAB-1202, rediseñado en LAB-1210).
 *
 * ## La contradicción que esto cierra
 *
 * La primera versión decía que las cotizaciones no entraban en la huella «para
 * no recalcular en cada tick», y era verdad a medias: la huella no las incluía,
 * pero el análisis **sí** se relanzaba al cambiar un precio, porque los pesos se
 * derivaban de `quotes`. El resultado era lo peor de los dos mundos: se
 * recalculaba igual, y el informe nuevo se guardaba con **el mismo `runId`** que
 * el anterior a pesar de tener pesos distintos.
 *
 * Una identidad que se reutiliza para dos respuestas diferentes no identifica
 * nada.
 *
 * ## Las tres piezas, y por qué son tres
 *
 * - **Estructural**: operaciones, activos, cuentas y política. Es *qué tienes*.
 *   Cambia cuando compras, vendes, editas o cambias las reglas.
 * - **Valoración**: la fecha y **el conjunto concreto de precios y tipos de
 *   cambio** con el que se calcularon los pesos. Es *cuánto valía en ese
 *   momento*.
 * - **Configuración de modelo**: benchmark, tasa sin riesgo y versiones de los
 *   modelos. Es *cómo se mide*.
 *
 * Separarlas permite decir las dos cosas a la vez que antes se contradecían:
 * un tick de precio **no dispara** un análisis nuevo —la política es congelar la
 * valoración del día—, y si por cualquier motivo se recalcula con otros
 * precios, el informe resultante **lleva otra identidad** y no pisa al anterior.
 *
 * ## Qué entra y qué no
 *
 * Entra todo lo que cambia el resultado. De cada operación entran importe,
 * precio, comisión, divisas y tipo, no solo la cantidad: el TWR, el XIRR y los
 * costes dependen de ellos, y dos carteras que solo se diferencien en una
 * comisión no son la misma pregunta.
 *
 * No entra nada que no cambie el resultado. Añadir campos «por si acaso» hace
 * que la huella cambie sin motivo y obliga a recalcular sin razón.
 *
 * Funciones puras: no tocan red, ni almacenamiento, ni reloj.
 */
import type { AnalysisScope } from './contracts'

export const FINGERPRINT_VERSION = 'fingerprint-v2'

/* ── Huella estructural ────────────────────────────────────────────────────── */

/** Lo que de una operación cambia el análisis. */
export interface FingerprintTransaction {
  readonly id: string
  readonly assetId: string
  readonly accountId: string
  readonly type: string
  readonly datetime: string
  readonly quantity: string
  readonly investedAmount: string
  readonly investedCurrency: string
  readonly executionPrice: string | null
  readonly quoteCurrency: string
  readonly fee: string | null
  readonly feeCurrency: string | null
}

/** Lo que de un activo cambia el análisis. El precio **no** está aquí. */
export interface FingerprintAsset {
  readonly id: string
  readonly symbol: string
  readonly assetType: string
  readonly quoteCurrency: string
  /** Clase económica declarada, si la hay: cambia la rentabilidad esperada. */
  readonly economicClass?: string
}

export interface StructuralFingerprintInput {
  readonly scope: AnalysisScope
  readonly transactions: readonly FingerprintTransaction[]
  readonly assets: readonly FingerprintAsset[]
  /** Cuentas existentes: borrar una cambia qué informes son compatibles. */
  readonly accountIds: readonly string[]
  /** Saldos de efectivo que formen parte de la cartera. */
  readonly cashBalances?: readonly { readonly accountId: string; readonly amount: string; readonly currency: string }[]
  readonly policyVersion?: string
  /** Objetivo financiero, si condiciona el informe. */
  readonly goalVersion?: string
}

export function structuralFingerprint(input: StructuralFingerprintInput): string {
  // El orden no puede depender de cómo llegue el array: dos carteras iguales con
  // las operaciones en otro orden son la misma cartera.
  const operaciones = input.transactions
    .map((t) =>
      [
        t.id,
        t.assetId,
        t.accountId,
        t.type,
        t.datetime,
        t.quantity,
        t.investedAmount,
        t.investedCurrency,
        t.executionPrice ?? '-',
        t.quoteCurrency,
        t.fee ?? '-',
        t.feeCurrency ?? '-',
      ].join('|'),
    )
    .sort()

  const activos = input.assets
    .map((a) => [a.id, a.symbol, a.assetType, a.quoteCurrency, a.economicClass ?? '-'].join('|'))
    .sort()

  const efectivo = (input.cashBalances ?? [])
    .map((c) => [c.accountId, c.amount, c.currency].join('|'))
    .sort()

  return fnv1a64(
    [
      FINGERPRINT_VERSION,
      'estructural',
      scopeTexto(input.scope),
      `cuentas:${[...input.accountIds].sort().join(',')}`,
      input.policyVersion ?? '-',
      input.goalVersion ?? '-',
      `t:${operaciones.length}`,
      ...operaciones,
      `a:${activos.length}`,
      ...activos,
      `e:${efectivo.length}`,
      ...efectivo,
    ].join('\n'),
  )
}

/* ── Instantánea de valoración ─────────────────────────────────────────────── */

export interface ValuationSnapshotInput {
  /** Fecha de valoración, `YYYY-MM-DD`. */
  readonly asOf: string
  readonly baseCurrency: string
  /** Los precios usados: activo, importe, divisa y momento del dato. */
  readonly prices: readonly {
    readonly assetId: string
    readonly price: string
    readonly currency: string
    readonly asOf: string
  }[]
  readonly fx: readonly { readonly pair: string; readonly rate: string }[]
}

/**
 * Versión de la valoración.
 *
 * Identifica **el conjunto de precios concreto** con el que se calcularon los
 * pesos, no el instante en que se calcularon. Dos ejecuciones con los mismos
 * precios comparten versión aunque ocurran con horas de diferencia; dos
 * ejecuciones con precios distintos no la comparten nunca, y por eso sus
 * informes no pueden pisarse.
 */
export function valuationVersion(input: ValuationSnapshotInput): string {
  const precios = input.prices
    .map((p) => [p.assetId, p.price, p.currency, p.asOf].join('|'))
    .sort()
  const cambios = input.fx.map((f) => [f.pair, f.rate].join('|')).sort()

  return fnv1a64(
    [
      FINGERPRINT_VERSION,
      'valoracion',
      input.asOf,
      input.baseCurrency,
      `p:${precios.length}`,
      ...precios,
      `fx:${cambios.length}`,
      ...cambios,
    ].join('\n'),
  )
}

/* ── Configuración del modelo ──────────────────────────────────────────────── */

export interface ModelConfigInput {
  readonly benchmarkId?: string
  readonly riskFreeRate?: number
  /** Versiones de todo lo que puede cambiar el número sin cambiar los datos. */
  readonly modelVersions: Readonly<Record<string, string>>
  readonly optimizationConfig?: string
  readonly simulationConfig?: string
}

export function modelConfigFingerprint(input: ModelConfigInput): string {
  const versiones = Object.entries(input.modelVersions)
    .map(([k, v]) => `${k}=${v}`)
    .sort()

  return fnv1a64(
    [
      FINGERPRINT_VERSION,
      'modelo',
      input.benchmarkId ?? '-',
      input.riskFreeRate === undefined ? '-' : input.riskFreeRate.toFixed(6),
      input.optimizationConfig ?? '-',
      input.simulationConfig ?? '-',
      ...versiones,
    ].join('\n'),
  )
}

/* ── Identidad completa ────────────────────────────────────────────────────── */

export interface AnalysisIdentity {
  readonly structural: string
  readonly valuation: string
  readonly modelConfig: string
  /** Identidad completa. Es la clave con la que se guarda un informe. */
  readonly full: string
}

/**
 * Compone la identidad.
 *
 * `full` incluye la valoración a propósito: es lo que garantiza que dos
 * informes con pesos distintos no puedan compartir clave, pase lo que pase
 * aguas arriba.
 */
export function analysisIdentity(
  structural: string,
  valuation: string,
  modelConfig: string,
): AnalysisIdentity {
  return {
    structural,
    valuation,
    modelConfig,
    full: `${structural}.${valuation}.${modelConfig}`,
  }
}

/**
 * Clave de caché de una serie de mercado.
 *
 * Instrumento, divisa, proveedor y rango. **No** lleva la identidad del
 * análisis: la serie diaria de un instrumento es la misma para la cartera
 * consolidada y para cada cuenta, y volver a pedirla por ámbito multiplicaría
 * las llamadas al proveedor sin traer un solo dato nuevo.
 */
export function marketDataCacheKey(
  assetId: string,
  currency: string,
  provider: string,
  days: number,
): string {
  return `${assetId}|${currency}|${provider}|${days}`
}

/* ── Utilidades ────────────────────────────────────────────────────────────── */

const scopeTexto = (scope: AnalysisScope) =>
  scope.kind === 'portfolio' ? 'portfolio' : `account:${scope.accountId}`

/**
 * FNV-1a de 64 bits en dos mitades de 32.
 *
 * No es criptográfico y no falta que lo sea: hace falta que sea estable, rápido
 * y sin dependencias. Una colisión significaría reutilizar el informe de otra
 * cartera, y con 64 bits y decenas de ejecuciones por usuario eso no va a pasar.
 */
function fnv1a64(texto: string): string {
  // Dos acumuladores porque JavaScript no tiene enteros de 64 bits en
  // operaciones bit a bit. `Math.imul` mantiene la multiplicación en 32 bits con
  // el mismo resultado en todas las plataformas.
  let alto = 0xcbf2_9ce4
  let bajo = 0x8422_2325

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i)
    bajo ^= c & 0xff
    alto ^= (c >>> 8) & 0xff

    const bajoNuevo = Math.imul(bajo, 0x0000_0193) >>> 0
    const altoNuevo = (Math.imul(alto, 0x0000_0193) + (bajo >>> 24)) >>> 0
    bajo = bajoNuevo
    alto = altoNuevo
  }

  return (alto >>> 0).toString(16).padStart(8, '0') + (bajo >>> 0).toString(16).padStart(8, '0')
}
