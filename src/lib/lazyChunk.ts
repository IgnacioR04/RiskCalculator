/**
 * Carga diferida resistente a despliegues.
 *
 * GitHub Pages sirve `index.html` con caché. Cuando se publica una versión
 * nueva cambian los hashes de los chunks, así que un navegador que conserve el
 * index.html anterior pide ficheros que ya no existen: el import dinámico
 * falla y la pantalla se queda en blanco.
 *
 * Aquí se detecta ese caso concreto y se recarga la página UNA sola vez para
 * traer el index.html nuevo. El flag va en sessionStorage para no entrar en
 * bucle si el fallo es real (sin conexión, chunk corrupto): en ese caso el
 * error se propaga al ErrorBoundary, que sí lo explica.
 */
import { lazy, type ComponentType } from 'react'

const RELOAD_FLAG = 'riskcalculator-chunk-reload'

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  )
}

/**
 * Igual que `React.lazy`, pero recupera la aplicación cuando el chunk pedido
 * pertenece a un despliegue anterior.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory()
      sessionStorage.removeItem(RELOAD_FLAG)
      return mod
    } catch (error) {
      if (isChunkLoadError(error) && sessionStorage.getItem(RELOAD_FLAG) === null) {
        sessionStorage.setItem(RELOAD_FLAG, '1')
        window.location.reload()
        // Devuelve una promesa que nunca resuelve: la página se está recargando.
        return new Promise<{ default: T }>(() => {})
      }
      throw error
    }
  })
}
