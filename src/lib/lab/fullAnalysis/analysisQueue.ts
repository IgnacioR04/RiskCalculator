/**
 * Cola de análisis con concurrencia limitada y cancelación (LAB-1203).
 *
 * ## Por qué no basta con lanzarlo todo
 *
 * Una importación con cinco cuentas produce seis análisis: el consolidado y uno
 * por cuenta. Lanzados a la vez, cada uno pide el historial de sus posiciones al
 * mismo proveedor y en el mismo segundo. Con el plan gratuito de Twelve Data
 * —ocho peticiones por minuto— eso no es «lento», es que la mayoría vuelven con
 * error de cupo y el usuario ve seis informes rotos.
 *
 * Por eso la cola es **secuencial por defecto** y comparte caché entre ámbitos:
 * la mayoría de las series que necesita una cuenta ya las descargó el
 * consolidado.
 *
 * ## Prioridades
 *
 * 1. La cartera consolidada, que es la que se abre por defecto.
 * 2. La cuenta que se esté mirando, si hay alguna.
 * 3. El resto, en orden estable.
 *
 * ## Cancelación
 *
 * La cola no cancela tareas a mitad: cancela **la publicación**. Cada tarea
 * lleva el testigo de la generación en la que se encoló, y al terminar comprueba
 * que siga siendo la vigente. Es más barato que abortar de verdad y consigue lo
 * único que importa: que un resultado viejo nunca pise a uno nuevo.
 */
import type { AnalysisScope } from './contracts'
import { scopeKey } from './contracts'

export const QUEUE_VERSION = 'analysis-queue-v1'

export interface QueuedTask {
  readonly scope: AnalysisScope
  /** Menor va antes. */
  readonly priority: number
}

/**
 * Ordena los ámbitos que hay que analizar.
 *
 * `visibleAccountId` es la cuenta que el usuario tiene delante. Analizarla la
 * segunda, y no la última, es la diferencia entre ver un resultado enseguida y
 * esperar a que terminen otras cuatro que no está mirando.
 */
export function planScopes(
  accountIds: readonly string[],
  visibleAccountId?: string,
): readonly QueuedTask[] {
  const tareas: QueuedTask[] = [{ scope: { kind: 'portfolio' }, priority: 0 }]

  // Orden estable: dos ejecuciones con las mismas cuentas tienen que producir
  // la misma cola, o el historial de ejecuciones deja de ser comparable.
  const ordenadas = [...new Set(accountIds)].sort()

  for (const id of ordenadas) {
    tareas.push({
      scope: { kind: 'account', accountId: id },
      priority: id === visibleAccountId ? 1 : 2,
    })
  }

  return tareas.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return scopeKey(a.scope).localeCompare(scopeKey(b.scope))
  })
}

export interface RunnerOptions {
  /** Cuántas tareas a la vez. 1 por defecto, y por buenas razones. */
  readonly concurrency?: number
}

/**
 * Ejecuta las tareas respetando el orden y el tope de concurrencia.
 *
 * `sigueVigente` se consulta **antes de empezar cada tarea y antes de publicar
 * su resultado**. Entre esas dos comprobaciones puede pasar un segundo entero
 * de descargas, y en ese segundo el usuario puede haber cambiado la cartera.
 */
export async function runQueue<T>(
  tareas: readonly QueuedTask[],
  ejecutar: (scope: AnalysisScope) => Promise<T>,
  publicar: (scope: AnalysisScope, resultado: T) => void,
  sigueVigente: () => boolean,
  opciones: RunnerOptions = {},
): Promise<{ completadas: number; canceladas: number }> {
  const concurrencia = Math.max(1, opciones.concurrency ?? 1)
  let completadas = 0
  let canceladas = 0
  let siguiente = 0

  async function trabajador(): Promise<void> {
    for (;;) {
      const indice = siguiente
      siguiente += 1
      if (indice >= tareas.length) return

      if (!sigueVigente()) {
        canceladas += 1
        continue
      }

      const tarea = tareas[indice]!
      const resultado = await ejecutar(tarea.scope)

      // Segunda comprobación: la primera decía que valía la pena empezar, esta
      // dice si la respuesta todavía corresponde a la pregunta actual.
      if (!sigueVigente()) {
        canceladas += 1
        continue
      }

      publicar(tarea.scope, resultado)
      completadas += 1
    }
  }

  await Promise.all(Array.from({ length: concurrencia }, () => trabajador()))
  return { completadas, canceladas }
}
