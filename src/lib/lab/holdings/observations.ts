/**
 * Composiciones con vigencia (LAB-406).
 *
 * Un fondo no lleva siempre lo mismo dentro. Si en marzo anotaste que IWDA
 * tenía un 5 % de Apple y en agosto lo actualizas a un 7 %, **el 5 % no era
 * falso: era verdad en marzo**. Sobrescribirlo destruye la única forma de
 * reproducir el análisis que hiciste en marzo, y un resultado que no se puede
 * reproducir no se puede explicar ni defender.
 *
 * De ahí el modelo: no hay «la composición de un fondo», hay **observaciones**
 * fechadas, y se consulta la que estaba vigente en una fecha dada. Es el mismo
 * principio que ya gobierna los cálculos guardados (`LAB-311`): sin `asOf` y
 * `modelVersion` un resultado no sobrevive a su propio contexto.
 *
 * ## Alcance declarado
 *
 * `LAB-406` contemplaba además una migración de Supabase y un adaptador de
 * ingesta desde proveedor. Las dos quedan **pospuestas** por
 * [`ADR-004`](../../../../docs/adr/ADR-004-classification-holdings-provider.md):
 * no hay proveedor con licencia del que ingerir, y una tabla para un dato que
 * solo existe en el dispositivo del usuario no aporta nada todavía. Lo que sí
 * hace falta hoy —que actualizar una composición no borre la anterior— es lo
 * que hay aquí.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { FundComposition } from './contracts'

/**
 * Una composición observada, con la fecha desde la que rige.
 *
 * `asOf` de `FundComposition` ya dice a qué fecha se refiere el dato. Aquí se
 * usa como inicio de vigencia: una observación rige desde su `asOf` hasta que
 * aparece otra posterior.
 */
export type CompositionHistory = Readonly<Record<string, readonly FundComposition[]>>

/** Error de un intento de alta que no se puede aceptar en silencio. */
export type AppendResult =
  | { readonly ok: true; readonly history: CompositionHistory }
  | { readonly ok: false; readonly reason: 'duplicate_asOf' | 'invalid_asOf' }

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Añade una observación **sin borrar las anteriores**.
 *
 * Una fecha repetida se rechaza en vez de reemplazar: si de verdad se quiere
 * corregir una observación, hay que quitarla explícitamente. Dejar que la
 * última escritura gane convertiría una corrección silenciosa en pérdida de
 * historial, que es justo lo que este módulo existe para impedir.
 */
export function appendObservation(
  history: CompositionHistory,
  composition: FundComposition,
): AppendResult {
  if (!ES_FECHA.test(composition.asOf)) return { ok: false, reason: 'invalid_asOf' }

  const previas = history[composition.assetId] ?? []
  if (previas.some((c) => c.asOf === composition.asOf)) {
    return { ok: false, reason: 'duplicate_asOf' }
  }

  return {
    ok: true,
    history: {
      ...history,
      // Ordenadas de más antigua a más reciente: la consulta «a fecha» recorre
      // hacia atrás y el orden es parte del contrato, no del azar de inserción.
      [composition.assetId]: [...previas, composition].sort((a, b) => a.asOf.localeCompare(b.asOf)),
    },
  }
}

/**
 * La composición que regía en una fecha.
 *
 * Devuelve la observación más reciente **que no sea posterior** a `fecha`. Si
 * todas son posteriores devuelve `null`: en aquel momento no se sabía nada, y
 * usar un dato del futuro para explicar el pasado es la forma más común de
 * mentirse con un backtest.
 */
export function compositionAsOf(
  history: CompositionHistory,
  assetId: string,
  fecha: string,
): FundComposition | null {
  const observaciones = history[assetId]
  if (observaciones === undefined || observaciones.length === 0) return null

  let vigente: FundComposition | null = null
  for (const observacion of observaciones) {
    if (observacion.asOf > fecha) break
    vigente = observacion
  }
  return vigente
}

/** La composición más reciente conocida, sin condición de fecha. */
export function latestComposition(
  history: CompositionHistory,
  assetId: string,
): FundComposition | null {
  const observaciones = history[assetId]
  return observaciones === undefined || observaciones.length === 0
    ? null
    : observaciones[observaciones.length - 1]!
}

/**
 * Quita una observación concreta. Es la única forma de perder historial, y es
 * explícita a propósito.
 */
export function removeObservation(
  history: CompositionHistory,
  assetId: string,
  asOf: string,
): CompositionHistory {
  const observaciones = history[assetId]
  if (observaciones === undefined) return history
  return { ...history, [assetId]: observaciones.filter((c) => c.asOf !== asOf) }
}

/**
 * Todas las composiciones vigentes a una fecha, listas para `lookThrough`.
 *
 * Es el puente entre el historial y el motor: el motor no sabe que existen
 * versiones, recibe un mapa de composiciones y calcula.
 */
export function compositionsAsOf(
  history: CompositionHistory,
  fecha: string,
): Readonly<Record<string, FundComposition>> {
  const salida: Record<string, FundComposition> = {}
  for (const assetId of Object.keys(history)) {
    const vigente = compositionAsOf(history, assetId, fecha)
    if (vigente !== null) salida[assetId] = vigente
  }
  return salida
}
