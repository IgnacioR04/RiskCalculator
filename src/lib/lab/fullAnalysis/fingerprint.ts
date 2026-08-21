/**
 * Huella de una cartera analizable (LAB-1202).
 *
 * Identifica **la pregunta**, no la respuesta: si dos estados de la aplicación
 * producen la misma huella, el informe de uno vale para el otro y no hay que
 * recalcular nada.
 *
 * ## Qué entra y qué no, y por qué importa tanto
 *
 * Entra todo lo que cambia el resultado: operaciones, activos, divisa de
 * presentación, ámbito, benchmark, tasa sin riesgo y política. Cambiar
 * cualquiera de esas cosas invalida el informe anterior.
 *
 * **No entra el precio de mercado.** Es la decisión con más consecuencias del
 * módulo. Los precios se refrescan solos cada hora y en cada vuelta a la
 * pestaña; si entraran en la huella, cada tick lanzaría un análisis completo
 * con sus descargas de historial, y el navegador se pasaría el día recalculando
 * para mover la tercera cifra decimal de una volatilidad.
 *
 * Lo que sí entra es la **fecha de valoración**: cuando el análisis pasa de día,
 * la pregunta es otra. Es la política explícita de actualización que pide el
 * encargo, y está aquí y no repartida por la aplicación.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { AnalysisScope } from './contracts'

export const FINGERPRINT_VERSION = 'fingerprint-v1'

export interface FingerprintInput {
  readonly scope: AnalysisScope
  /** Fecha de valoración, `YYYY-MM-DD`. Sí entra: otro día es otra pregunta. */
  readonly asOf: string
  readonly baseCurrency: string
  /** Operaciones que definen las posiciones. */
  readonly transactions: readonly {
    readonly id: string
    readonly assetId: string
    readonly accountId: string
    readonly kind: string
    readonly quantity: string
    readonly date: string
  }[]
  /** Lo que de un activo cambia el análisis. El precio **no** está aquí. */
  readonly assets: readonly {
    readonly id: string
    readonly symbol: string
    readonly assetType: string
    readonly quoteCurrency: string
  }[]
  readonly benchmarkId?: string
  readonly riskFreeRate?: number
  /** Versión de la política vigente, si hay. */
  readonly policyVersion?: string
  readonly modelVersion: string
}

/**
 * Huella hexadecimal de 16 caracteres.
 *
 * FNV-1a de 64 bits en dos mitades de 32. No es criptográfico y no falta que lo
 * sea: hace falta que sea **estable, rápido y sin dependencias**. Una colisión
 * aquí significaría reutilizar el informe de otra cartera, y con 64 bits y
 * decenas de ejecuciones por usuario eso no va a pasar.
 */
export function buildFingerprint(input: FingerprintInput): string {
  // El orden no puede depender de cómo llegue el array: dos carteras iguales
  // con las operaciones en otro orden son la misma cartera.
  const operaciones = input.transactions
    .map((t) => `${t.id}|${t.assetId}|${t.accountId}|${t.kind}|${t.quantity}|${t.date}`)
    .sort()

  const activos = input.assets
    .map((a) => `${a.id}|${a.symbol}|${a.assetType}|${a.quoteCurrency}`)
    .sort()

  const partes = [
    FINGERPRINT_VERSION,
    input.modelVersion,
    input.scope.kind === 'portfolio' ? 'portfolio' : `account:${input.scope.accountId}`,
    input.asOf,
    input.baseCurrency,
    input.benchmarkId ?? '-',
    input.riskFreeRate === undefined ? '-' : input.riskFreeRate.toFixed(6),
    input.policyVersion ?? '-',
    `t:${operaciones.length}`,
    ...operaciones,
    `a:${activos.length}`,
    ...activos,
  ]

  return fnv1a64(partes.join('\n'))
}

function fnv1a64(texto: string): string {
  // Se llevan dos acumuladores de 32 bits porque JavaScript no tiene enteros de
  // 64 bits en operaciones bit a bit. `Math.imul` mantiene la multiplicación en
  // 32 bits con el mismo resultado en todas las plataformas.
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
