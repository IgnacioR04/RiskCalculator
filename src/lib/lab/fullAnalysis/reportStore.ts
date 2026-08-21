/**
 * Persistencia de informes (LAB-1206).
 *
 * Recargar la página no puede costar una ronda entera de descargas. Si la huella
 * de la cartera no ha cambiado, el informe anterior sigue respondiendo a la
 * misma pregunta y se puede enseñar mientras se decide si hace falta recalcular.
 *
 * ## Por qué la huella es la clave y no la fecha
 *
 * Un informe guardado hace dos horas vale si la cartera es la misma; uno de hace
 * cinco minutos no vale si se ha editado una operación. La antigüedad no dice
 * nada por sí sola, la huella sí.
 *
 * Se guarda en `localStorage` y no en la nube a propósito: el modo local sin
 * cuenta es el modo por defecto, y un informe de cartera es exactamente el tipo
 * de dato que no tiene por qué salir del dispositivo.
 */
import type { PortfolioHealthReport } from './contracts'
import { scopeKey } from './contracts'

export const REPORT_STORE_VERSION = 'report-store-v1'
const CLAVE = 'riskcalculator.lab.reports.v1'

/**
 * Tope de informes guardados.
 *
 * Cada uno son unos pocos kilobytes, pero `localStorage` tiene un límite duro y
 * quedarse sin espacio rompe **otras** funciones de la aplicación, no esta. Se
 * tiran los más antiguos.
 */
export const MAX_REPORTS = 50

interface Guardado {
  readonly version: string
  readonly savedAt: string
  readonly report: PortfolioHealthReport
}

function leerTodo(): Record<string, Guardado> {
  try {
    const bruto = globalThis.localStorage?.getItem(CLAVE)
    if (bruto === null || bruto === undefined) return {}
    const datos: unknown = JSON.parse(bruto)
    return typeof datos === 'object' && datos !== null ? (datos as Record<string, Guardado>) : {}
  } catch {
    // Un almacenamiento corrupto o no disponible no puede tumbar el análisis:
    // se pierde la caché, que es exactamente lo que una caché puede perder.
    return {}
  }
}

const clave = (informe: PortfolioHealthReport) =>
  `${informe.fingerprint}:${scopeKey(informe.scope)}`

/** Guarda un informe terminado. Los parciales no se guardan: no responden aún. */
export function saveReport(informe: PortfolioHealthReport): void {
  if (informe.status !== 'ready') return

  try {
    const todo = leerTodo()
    todo[clave(informe)] = {
      version: REPORT_STORE_VERSION,
      savedAt: new Date().toISOString(),
      report: informe,
    }

    const entradas = Object.entries(todo).sort((a, b) =>
      b[1].savedAt.localeCompare(a[1].savedAt),
    )
    const recortado = Object.fromEntries(entradas.slice(0, MAX_REPORTS))
    globalThis.localStorage?.setItem(CLAVE, JSON.stringify(recortado))
  } catch {
    // Cuota llena o modo privado. No se propaga.
  }
}

/**
 * Recupera el informe de esa huella y ámbito, si existe.
 *
 * Devuelve `null` cuando no hay ninguno **compatible**, que no es lo mismo que
 * cuando no hay ninguno: un informe de otra huella existe y no sirve.
 */
export function loadReport(fingerprint: string, scope: PortfolioHealthReport['scope']): PortfolioHealthReport | null {
  const guardado = leerTodo()[`${fingerprint}:${scopeKey(scope)}`]
  if (guardado === undefined) return null
  if (guardado.version !== REPORT_STORE_VERSION) return null
  return guardado.report
}

/** Cuántos hay guardados. Para diagnóstico y pruebas. */
export function countReports(): number {
  return Object.keys(leerTodo()).length
}

export function clearReports(): void {
  try {
    globalThis.localStorage?.removeItem(CLAVE)
  } catch {
    // Nada que hacer, y nada que romper.
  }
}
