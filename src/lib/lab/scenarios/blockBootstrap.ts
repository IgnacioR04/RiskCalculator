/**
 * Bootstrap por bloques (LAB-505).
 *
 * Genera muchos futuros posibles **remuestreando el pasado**, sin suponer que
 * los rendimientos siguen una campana de Gauss. Esa suposición es cómoda y es
 * falsa: los mercados tienen colas mucho más gordas de lo que predice una
 * normal, y un simulador gaussiano dice que marzo de 2020 era imposible.
 *
 * ## Por qué bloques y no días sueltos
 *
 * Remuestrear días sueltos destruye dos cosas que sí existen en los datos:
 *
 * - la **dependencia temporal** (las rachas: la volatilidad se agrupa);
 * - implícitamente, cualquier estructura que dure más de un día.
 *
 * Con bloques de, digamos, 20 días, cada trozo conserva su propia historia
 * interna. Se pierde la dependencia *entre* bloques, y eso queda declarado.
 *
 * ## Bloques comunes: la decisión que hace esto correcto
 *
 * **Todos los activos se muestrean con el mismo bloque de fechas.** Si cada uno
 * eligiera sus propios días, se destruiría la correlación entre ellos y saldría
 * una cartera artificialmente diversificada: justo la mentira que el Laboratorio
 * existe para desmontar. Es el criterio de aceptación de LAB-505.
 *
 * Función pura y **reproducible**: con la misma semilla, el mismo resultado.
 */

/**
 * Generador congruencial lineal, con los parámetros de `Numerical Recipes`.
 *
 * No es criptográficamente seguro y no falta que lo sea: hace falta que sea
 * **reproducible y portable**. `Math.random()` no admite semilla, así que un
 * resultado calculado con él no se puede volver a producir, y sin eso «me sale
 * otra cosa» es indistinguible de un error.
 */
export function createRng(seed: number): () => number {
  // >>> 0 mantiene el estado en 32 bits sin signo en todas las plataformas.
  let estado = (Math.trunc(seed) >>> 0) || 1
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0
    return estado / 4294967296
  }
}

export interface BootstrapInput {
  /**
   * Rendimientos históricos alineados: `history[dia][activo]`.
   *
   * Alineados de verdad: la fila `d` tiene que ser el mismo día para todos los
   * activos, porque es lo que conserva la correlación al muestrear.
   */
  readonly history: readonly (readonly number[])[]
  /** Longitud del bloque en días. */
  readonly blockDays: number
  /** Cuántos días dura cada trayectoria simulada. */
  readonly horizonDays: number
  /** Cuántas trayectorias generar. */
  readonly paths: number
  readonly seed: number
}

export type BootstrapError =
  | 'empty_history'
  | 'block_longer_than_history'
  | 'invalid_block'
  | 'invalid_horizon'
  | 'too_many_paths'

/**
 * Tope de trayectorias del contrato.
 *
 * **No es un tope de interfaz.** Medido en `npm run bench:scenarios`: con 20
 * activos, 1.000 trayectorias cuestan 378 ms y 10.000 rondan los 3,8 s de
 * JavaScript bloqueante. Por eso [`ADR-006`](../../../../docs/adr/ADR-006-scenario-persistence-and-execution.md)
 * establece que **el bootstrap no se expone en pantalla hasta que se ejecute en
 * un Web Worker**, con cancelación y progreso. El motor está listo; lo que falta
 * es dónde corre.
 */
export const MAX_PATHS = 10_000

export type BootstrapResult =
  | {
      readonly ok: true
      /** `paths[i][dia][activo]`. */
      readonly paths: readonly (readonly (readonly number[])[])[]
      readonly seed: number
      readonly blocksPerPath: number
    }
  | { readonly ok: false; readonly reason: BootstrapError }

/**
 * Genera las trayectorias.
 *
 * Devuelve un resultado explícito en vez de lanzar: quedarse sin muestra
 * suficiente es una situación normal —una cartera nueva no tiene historia— y
 * tratarla como excepción obligaría a envolver cada llamada en un `try`.
 */
export function blockBootstrap(input: BootstrapInput): BootstrapResult {
  const { history, blockDays, horizonDays, paths, seed } = input

  if (history.length === 0) return { ok: false, reason: 'empty_history' }
  if (!Number.isInteger(blockDays) || blockDays < 2) return { ok: false, reason: 'invalid_block' }
  if (!Number.isInteger(horizonDays) || horizonDays < 1) {
    return { ok: false, reason: 'invalid_horizon' }
  }
  if (blockDays > history.length) return { ok: false, reason: 'block_longer_than_history' }
  if (!Number.isInteger(paths) || paths < 1 || paths > MAX_PATHS) {
    return { ok: false, reason: 'too_many_paths' }
  }

  const rng = createRng(seed)
  const activos = history[0]?.length ?? 0
  // Se necesitan bloques completos: el sobrante del último se recorta al final.
  const blocksPerPath = Math.ceil(horizonDays / blockDays)
  const inicioMaximo = history.length - blockDays

  const salida: number[][][] = []
  for (let p = 0; p < paths; p += 1) {
    const trayectoria: number[][] = []
    for (let b = 0; b < blocksPerPath; b += 1) {
      // **Un solo sorteo por bloque, para todos los activos.** Aquí es donde se
      // conserva la correlación transversal: el bloque es de fechas, no de
      // activos.
      const inicio = Math.floor(rng() * (inicioMaximo + 1))
      for (let d = 0; d < blockDays; d += 1) {
        const fila = history[inicio + d] ?? []
        trayectoria.push(Array.from({ length: activos }, (_, i) => fila[i] ?? 0))
      }
    }
    salida.push(trayectoria.slice(0, horizonDays))
  }

  return { ok: true, paths: salida, seed, blocksPerPath }
}

/* ── Resumen de resultados ─────────────────────────────────────────────────── */

export interface Percentiles {
  readonly p05: number
  readonly p25: number
  readonly p50: number
  readonly p75: number
  readonly p95: number
}

/**
 * Percentiles de una muestra, por interpolación lineal.
 *
 * Se interpola en vez de tomar el elemento más cercano porque con 1.000
 * trayectorias el p05 caería siempre en el mismo índice y daría una falsa
 * sensación de estabilidad entre ejecuciones con semillas distintas.
 */
export function percentiles(valores: readonly number[]): Percentiles | null {
  if (valores.length === 0) return null
  const orden = [...valores].sort((a, b) => a - b)

  const en = (q: number): number => {
    const pos = (orden.length - 1) * q
    const bajo = Math.floor(pos)
    const alto = Math.ceil(pos)
    if (bajo === alto) return orden[bajo]!
    return orden[bajo]! + (orden[alto]! - orden[bajo]!) * (pos - bajo)
  }

  return { p05: en(0.05), p25: en(0.25), p50: en(0.5), p75: en(0.75), p95: en(0.95) }
}

/** Fracción de valores que alcanzan o superan un objetivo. */
export function successRate(valores: readonly number[], objetivo: number): number | null {
  if (valores.length === 0) return null
  return valores.filter((v) => v >= objetivo).length / valores.length
}
