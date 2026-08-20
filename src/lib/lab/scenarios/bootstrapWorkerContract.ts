/**
 * Mensajes entre la pantalla y el worker del bootstrap (LAB-1014).
 *
 * Vive aparte del worker a propósito: importar el módulo del worker solo para
 * leer sus tipos arrastraría el worker al bundle principal, que es exactamente
 * lo que se quiere evitar.
 */
import type { BootstrapOutcomeInput, BootstrapOutcomeResult } from './bootstrapOutcome'

export type BootstrapWorkerIn = { readonly type: 'run'; readonly input: BootstrapOutcomeInput }

export type BootstrapWorkerOut =
  | { readonly type: 'progress'; readonly done: number; readonly total: number }
  | { readonly type: 'done'; readonly result: BootstrapOutcomeResult }
  | { readonly type: 'error'; readonly message: string }
