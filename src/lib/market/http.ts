/**
 * Utilidades de red para los adaptadores: timeout, reintentos limitados,
 * deduplicación de solicitudes concurrentes y caché negativa.
 */
import { ProviderError } from './provider'

const inFlight = new Map<string, Promise<unknown>>()
const negativeCache = new Map<string, number>()
const NEGATIVE_TTL_MS = 10 * 60 * 1000

export async function fetchJson<T>(
  url: string,
  options: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 8000, retries = 1, headers } = options

  const negativeUntil = negativeCache.get(url)
  if (negativeUntil !== undefined && Date.now() < negativeUntil) {
    throw new ProviderError('Símbolo no encontrado (caché negativa)', 'not_found')
  }

  const existing = inFlight.get(url)
  if (existing !== undefined) return existing as Promise<T>

  const attempt = async (): Promise<T> => {
    let lastError: unknown = null
    for (let i = 0; i <= retries; i++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          ...(headers !== undefined ? { headers } : {}),
        })
        if (response.status === 404) {
          negativeCache.set(url, Date.now() + NEGATIVE_TTL_MS)
          throw new ProviderError('Recurso no encontrado', 'not_found')
        }
        if (response.status === 429) {
          throw new ProviderError('Límite de peticiones del proveedor alcanzado', 'rate_limited')
        }
        if (!response.ok) {
          throw new ProviderError(`Respuesta ${response.status} del proveedor`, 'network')
        }
        return (await response.json()) as T
      } catch (e) {
        lastError = e
        if (e instanceof ProviderError && (e.kind === 'not_found' || e.kind === 'rate_limited')) {
          throw e
        }
        // reintento con backoff corto
        if (i < retries) await new Promise((r) => setTimeout(r, 400 * (i + 1)))
      } finally {
        clearTimeout(timer)
      }
    }
    if (lastError instanceof ProviderError) throw lastError
    throw new ProviderError(
      lastError instanceof Error ? lastError.message : 'Error de red',
      'network',
    )
  }

  const promise = attempt().finally(() => inFlight.delete(url))
  inFlight.set(url, promise)
  return promise
}

/** Marca manualmente una consulta como «no encontrada» (caché negativa). */
export function markNotFound(url: string): void {
  negativeCache.set(url, Date.now() + NEGATIVE_TTL_MS)
}
