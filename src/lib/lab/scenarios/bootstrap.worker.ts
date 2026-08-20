/// <reference lib="webworker" />
/**
 * Worker del bootstrap por bloques (LAB-1014).
 *
 * [`ADR-006`](../../../../docs/adr/ADR-006-scenario-persistence-and-execution.md)
 * dejó una condición de entrada: **el bootstrap no se expone en la interfaz
 * hasta que se ejecute en un Web Worker, con cancelación y progreso**. Este
 * archivo es esa condición. Medido en `npm run bench:scenarios`: 1.000
 * trayectorias son 378 ms de JavaScript bloqueante y 10.000 rondan los 3,8 s.
 * En el hilo principal eso no es «va lento», es que la pestaña deja de
 * responder: no se puede pulsar «cancelar» porque el clic no llega a
 * procesarse, y una barra de progreso no se repinta.
 *
 * El progreso se envía con `postMessage` desde dentro del bucle. No hace falta
 * trocear el cálculo ni ceder el turno: los mensajes que un worker publica se
 * encolan y llegan al hilo principal aunque el worker siga calculando.
 *
 * La cancelación es `terminate()` desde quien lo creó, no un mensaje. Un
 * mensaje de «para» tendría que leerlo este mismo hilo, que está ocupado en el
 * bucle; llegaría al terminar, que es justo cuando ya no sirve.
 */
import { bootstrapOutcome, type BootstrapOutcomeInput } from './bootstrapOutcome'
import type { BootstrapWorkerIn, BootstrapWorkerOut } from './bootstrapWorkerContract'

const publicar = (mensaje: BootstrapWorkerOut) => {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(mensaje)
}

self.onmessage = (evento: MessageEvent<BootstrapWorkerIn>) => {
  const mensaje = evento.data
  if (mensaje.type !== 'run') return

  try {
    const entrada: BootstrapOutcomeInput = mensaje.input
    const resultado = bootstrapOutcome(entrada, (done, total) => {
      publicar({ type: 'progress', done, total })
    })
    publicar({ type: 'done', result: resultado })
  } catch (error) {
    // Un fallo dentro del worker sin esto muere en silencio: el hilo principal
    // se quedaría esperando un «done» que no llega, con la barra a medias.
    publicar({ type: 'error', message: error instanceof Error ? error.message : 'error desconocido' })
  }
}
