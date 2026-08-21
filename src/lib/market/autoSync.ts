/**
 * Datos de mercado al día sin que nadie pulse nada.
 *
 * Hasta aquí la aplicación solo actualizaba precios cuando alguien encontraba
 * el botón «Actualizar todo» de Cartera. El resultado real, visto en una
 * cartera de verdad: once posiciones con precios del 30 de julio, Bitcoin un
 * 20 % desactualizado, y **todas** las métricas históricas —volatilidad,
 * covarianzas, correlaciones, CVaR— bloqueadas por falta de observaciones.
 *
 * Dos causas encadenadas, y las dos se arreglan aquí:
 *
 * 1. **Nadie refrescaba.** Ni al abrir, ni al volver a la pestaña, ni cada X.
 * 2. **Los activos no estaban enlazados con ningún proveedor.** Sin
 *    `providerIds` no hay a quién pedirle el precio, así que aunque se pulsara
 *    el botón, cada posición caía al respaldo manual. El resolutor existía
 *    desde la importación por capturas, pero solo corría al importar: lo que
 *    ya estaba guardado se quedaba huérfano para siempre.
 */
import { useEffect, useRef } from 'react'
import { useAppStore } from '../../state/store'
import { resolverProveedor } from '../import/providers'
import { refreshAllQuotes, refreshFx } from './service'

/** Cada cuánto se refresca con la pestaña a la vista. */
export const INTERVALO_REFRESCO_MS = 60 * 60 * 1000

/**
 * Se considera que un dato «ya cansa» a partir de aquí, y se refresca al volver
 * a la pestaña. Más corto que el intervalo: volver tras un rato largo debe
 * traer datos nuevos sin esperar a que toque la hora.
 */
export const ANTIGUEDAD_AL_VOLVER_MS = 15 * 60 * 1000

/**
 * Enlaza con su proveedor los activos guardados que no lo tienen.
 *
 * Usa el mismo resolutor que la importación, sin excepciones propias: enlazar
 * con criterios distintos según por dónde entró el activo sería una segunda
 * verdad. Solo toca lo que está vacío, así que un enlace elegido a mano nunca
 * se pisa, y devuelve los símbolos tocados para poder decirlo en pantalla.
 *
 * Los datos de demostración se quedan fuera: sus precios son inventados a
 * propósito y descargarlos los convertiría en otra cosa.
 */
export function enlazarActivosSinProveedor(): readonly string[] {
  const { assets, updateAsset } = useAppStore.getState()
  const enlazados: string[] = []

  for (const asset of assets) {
    if (asset.isDemo === true) continue
    if (asset.providerIds !== undefined && Object.keys(asset.providerIds).length > 0) continue

    const { providerIds } = resolverProveedor(asset.symbol, asset.assetType)
    if (Object.keys(providerIds).length === 0) continue

    updateAsset(asset.id, { providerIds })
    enlazados.push(asset.symbol)
  }

  return enlazados
}

/** Momento del dato más reciente que hay guardado, o `null` si no hay ninguno. */
function ultimoDato(): number | null {
  const { quotes } = useAppStore.getState()
  const fechas = Object.values(quotes)
    .map((q) => new Date(q.fetchedAt).getTime())
    .filter((t) => Number.isFinite(t))
  return fechas.length === 0 ? null : Math.max(...fechas)
}

/**
 * Mantiene precios y tipo de cambio al día mientras la aplicación esté abierta.
 *
 * Se monta una sola vez, en la shell. Tres disparadores:
 *
 * - **Al abrir**, porque el caso más común es volver días después.
 * - **Al volver a la pestaña**, si el dato pasa de `ANTIGUEDAD_AL_VOLVER_MS`.
 * - **Cada hora**, y solo con la pestaña visible: un temporizador corriendo en
 *   una pestaña de fondo gasta cuota de los proveedores para nadie.
 *
 * No fuerza: `refreshQuote` respeta su propia caché de cinco minutos, así que
 * volver a la pestaña varias veces seguidas no dispara varias descargas.
 */
export function useMarketAutoSync(): void {
  // Evita que el modo estricto de React, que monta dos veces en desarrollo,
  // lance dos rondas de descargas al arrancar.
  const arrancado = useRef(false)

  useEffect(() => {
    let vivo = true

    async function sincronizar(motivo: 'arranque' | 'vuelta' | 'periodico') {
      if (!vivo) return
      const { setMarketSync } = useAppStore.getState()

      if (motivo === 'arranque') {
        enlazarActivosSinProveedor()
        // Se anuncia **antes** de empezar. El análisis se apoya en esta señal
        // para no congelar una valoración tomada a mitad de la descarga, y si
        // la fase llegara tarde la carrera seguiría abierta.
        setMarketSync({ phase: 'loading', completedAt: null, failures: {} })
      }

      // El tipo de cambio y los precios son independientes: que falle uno no
      // puede dejar al otro sin actualizar.
      const [, precios] = await Promise.allSettled([refreshFx(), refreshAllQuotes(false)])

      if (motivo !== 'arranque') return

      // `settled` significa **terminada**, no «terminada bien». Un instrumento
      // con el ticker mal enlazado no puede dejar el diagnóstico esperando para
      // siempre a un éxito que no va a llegar.
      const fallos: Record<string, string> = {}
      if (precios.status === 'fulfilled') {
        for (const r of precios.value) {
          if (!r.ok) fallos[r.assetId] = r.message ?? 'No se pudo actualizar el precio.'
        }
      }
      if (!vivo) return
      setMarketSync({
        phase: 'settled',
        completedAt: new Date().toISOString(),
        failures: fallos,
      })
    }

    if (!arrancado.current) {
      arrancado.current = true
      void sincronizar('arranque')
    }

    function alVolver() {
      if (document.visibilityState !== 'visible') return
      const ultimo = ultimoDato()
      if (ultimo !== null && Date.now() - ultimo < ANTIGUEDAD_AL_VOLVER_MS) return
      void sincronizar('vuelta')
    }

    const temporizador = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void sincronizar('periodico')
    }, INTERVALO_REFRESCO_MS)

    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(temporizador)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])
}
