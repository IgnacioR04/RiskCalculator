/**
 * Ejecución del bootstrap fuera del hilo principal (LAB-1014).
 *
 * Encapsula el ciclo de vida del worker para que la pantalla no sepa que existe:
 * pide `run`, mira `state`, y si quiere para con `cancel`.
 *
 * La cancelación es `terminate()`, no un mensaje de cortesía. El worker está
 * dentro de un bucle cerrado y no leería su cola hasta acabar, que es cuando ya
 * no sirve de nada. Terminar corta de verdad, y el coste —crear otro worker la
 * próxima vez— es de milisegundos.
 *
 * El worker se crea **por ejecución** y no una vez para siempre. Un worker vivo
 * de fondo mantiene su heap reservado, y aquí el heap es la parte cara.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BootstrapOutcome,
  BootstrapOutcomeInput,
} from '../../../lib/lab/scenarios/bootstrapOutcome'
import type {
  BootstrapWorkerIn,
  BootstrapWorkerOut,
} from '../../../lib/lab/scenarios/bootstrapWorkerContract'
import { describeReason } from '../../../lib/lab/evidence/reasonCodes'

export type BootstrapState =
  | { readonly estado: 'inactivo' }
  | { readonly estado: 'calculando'; readonly hechas: number; readonly total: number }
  | { readonly estado: 'listo'; readonly resultado: BootstrapOutcome }
  | { readonly estado: 'cancelado' }
  | { readonly estado: 'error'; readonly motivo: string }

export interface BootstrapRun {
  readonly state: BootstrapState
  readonly run: (input: BootstrapOutcomeInput) => void
  readonly cancel: () => void
}

/** Mínimo que necesita el hook. Permite inyectar un doble en las pruebas. */
export interface WorkerLike {
  postMessage(mensaje: BootstrapWorkerIn): void
  terminate(): void
  onmessage: ((evento: MessageEvent<BootstrapWorkerOut>) => void) | null
}

function crearWorkerReal(): WorkerLike {
  // `new URL(..., import.meta.url)` es la forma que Vite reconoce para sacar el
  // worker a su propio chunk. Con una ruta en cadena acabaría en el bundle
  // principal, que es justo lo que este cambio evita.
  return new Worker(new URL('../../../lib/lab/scenarios/bootstrap.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

export function useBootstrapRun(crearWorker: () => WorkerLike = crearWorkerReal): BootstrapRun {
  const [state, setState] = useState<BootstrapState>({ estado: 'inactivo' })
  const workerRef = useRef<WorkerLike | null>(null)

  const parar = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  // Salir de la pantalla mientras calcula no puede dejar el worker girando.
  useEffect(() => parar, [parar])

  const run = useCallback(
    (input: BootstrapOutcomeInput) => {
      parar()
      setState({ estado: 'calculando', hechas: 0, total: input.paths })

      let worker: WorkerLike
      try {
        worker = crearWorker()
      } catch {
        // Sin worker no se calcula en el hilo principal como consuelo: eso es
        // exactamente lo que ADR-006 prohíbe, y congelaría la pestaña 3,8 s.
        setState({
          estado: 'error',
          motivo: 'Este navegador no permite calcularlo en segundo plano.',
        })
        return
      }

      workerRef.current = worker
      worker.onmessage = (evento) => {
        // Un mensaje de un worker ya terminado no puede publicar nada: sería
        // el resultado de una pregunta que el usuario ya retiró.
        if (workerRef.current !== worker) return
        const mensaje = evento.data

        if (mensaje.type === 'progress') {
          setState({ estado: 'calculando', hechas: mensaje.done, total: mensaje.total })
          return
        }
        if (mensaje.type === 'error') {
          parar()
          setState({ estado: 'error', motivo: mensaje.message })
          return
        }
        parar()
        setState(
          mensaje.result.ok
            ? { estado: 'listo', resultado: mensaje.result }
            : // El catálogo de LAB-902 es la única fuente del texto. Un mapa
              // propio aquí sería una segunda verdad que se desincroniza en
              // silencio, y `describeReason` nunca devuelve nulo.
              { estado: 'error', motivo: describeReason(mensaje.result.reason).text },
        )
      }
      worker.postMessage({ type: 'run', input })
    },
    [crearWorker, parar],
  )

  const cancel = useCallback(() => {
    if (workerRef.current === null) return
    parar()
    setState({ estado: 'cancelado' })
  }, [parar])

  return { state, run, cancel }
}
