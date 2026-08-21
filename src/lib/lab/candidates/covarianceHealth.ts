/**
 * Salud numérica de una matriz de covarianza (LAB-1106).
 *
 * ## Qué no bastaba
 *
 * `isUsableCovariance` comprueba que la matriz sea cuadrada, simétrica y con
 * diagonal positiva. Las tres son necesarias y ninguna es suficiente: una
 * matriz puede cumplirlas y **no ser semidefinida positiva**, es decir, asignar
 * varianza negativa a alguna cartera. Es fácil que ocurra sin que nada falle:
 *
 * - correlaciones estimadas sobre pares con solapamientos distintos, de modo
 *   que la matriz no procede de una única muestra común;
 * - una correlación pegada a ±1 entre dos activos casi idénticos;
 * - más activos que observaciones, que da una matriz singular por construcción.
 *
 * Con una matriz así, un minimizador de varianza encuentra direcciones de
 * «riesgo negativo» y se abalanza sobre ellas: devuelve pesos, no falla, y la
 * cartera es basura con aspecto de solución.
 *
 * ## Qué hace este módulo
 *
 * Intenta una factorización de Cholesky. Si falla, añade un múltiplo pequeño de
 * la identidad —la regularización estándar— y lo intenta otra vez, subiendo el
 * término hasta un tope. Si con el tope sigue fallando, **no devuelve matriz**:
 * la alternativa sería seguir subiendo el ruido hasta que la matriz sea casi
 * diagonal, y eso no es la covarianza de nada.
 *
 * El término aplicado sale en el resultado. Regularizar en silencio es cambiar
 * el problema sin decirlo.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export const COVARIANCE_HEALTH_VERSION = 'covariance-health-v1'

/** Múltiplos de la traza media que se prueban como término de regularización. */
const SALTOS = [0, 1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 1e-3] as const

export type CovarianceHealth =
  | {
      readonly ok: true
      /** La matriz utilizable: la original, o la regularizada. */
      readonly matrix: readonly (readonly number[])[]
      /**
       * Término añadido a la diagonal, en unidades de varianza. `0` si la
       * original ya era factorizable.
       */
      readonly jitter: number
      readonly version: string
    }
  | {
      readonly ok: false
      readonly reason: 'not_square' | 'not_symmetric' | 'nonpositive_variance' | 'not_positive_semidefinite'
      readonly detail: string
    }

/**
 * Comprueba y, si hace falta, regulariza.
 *
 * El orden importa: primero la forma, después la definición positiva. Un fallo
 * de forma tiene arreglo distinto —normalmente un error de construcción de la
 * matriz— que uno de condicionamiento, que se arregla con más datos.
 */
export function covarianceHealth(m: readonly (readonly number[])[]): CovarianceHealth {
  const n = m.length
  if (n === 0) return { ok: false, reason: 'not_square', detail: 'La matriz está vacía.' }
  if (m.some((fila) => fila.length !== n)) {
    return { ok: false, reason: 'not_square', detail: 'Hay filas de longitud distinta.' }
  }

  for (let i = 0; i < n; i += 1) {
    const vii = m[i]![i]!
    if (!Number.isFinite(vii) || vii <= 0) {
      return {
        ok: false,
        reason: 'nonpositive_variance',
        detail: `La varianza de la posición ${i} es ${vii}. Una serie constante o sin observaciones no aporta varianza y no puede entrar en la optimización.`,
      }
    }
    for (let j = i + 1; j < n; j += 1) {
      const a = m[i]![j]!
      const b = m[j]![i]!
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return { ok: false, reason: 'not_symmetric', detail: `La celda (${i},${j}) no es finita.` }
      }
      // Tolerancia relativa: dos caminos de cálculo distintos pueden diferir en
      // el último bit sin que la matriz sea asimétrica de verdad.
      const escala = Math.max(Math.abs(a), Math.abs(b), 1e-12)
      if (Math.abs(a - b) / escala > 1e-9) {
        return {
          ok: false,
          reason: 'not_symmetric',
          detail: `(${i},${j}) vale ${a} y (${j},${i}) vale ${b}. La covarianza es simétrica por definición: si no lo es, las dos mitades se calcularon por caminos distintos.`,
        }
      }
    }
  }

  const trazaMedia = m.reduce((s, fila, i) => s + fila[i]!, 0) / n

  for (const salto of SALTOS) {
    const jitter = salto * trazaMedia
    const candidata =
      jitter === 0 ? m : m.map((fila, i) => fila.map((v, j) => (i === j ? v + jitter : v)))
    if (cholesky(candidata, trazaMedia)) {
      return { ok: true, matrix: candidata, jitter, version: COVARIANCE_HEALTH_VERSION }
    }
  }

  return {
    ok: false,
    reason: 'not_positive_semidefinite',
    detail:
      'La matriz asigna varianza negativa a alguna combinación de pesos, y no se arregla con una regularización razonable. Suele significar más activos que observaciones, o correlaciones estimadas sobre periodos distintos entre sí.',
  }
}

/**
 * Pivote mínimo, **relativo a la escala de la matriz**.
 *
 * Comparar contra cero no basta. Dos activos con correlación exactamente 1 dan
 * una matriz singular cuyo último pivote sale en 7·10⁻¹⁸ por puro redondeo:
 * mayor que cero, así que una comprobación ingenua la da por buena, y a partir
 * de ahí el optimizador divide por casi nada. No es un caso rebuscado — son dos
 * clases del mismo índice en la misma cartera.
 */
const PIVOTE_MINIMO_RELATIVO = 1e-12

/**
 * Factorización de Cholesky. Devuelve `false` si la matriz no es definida
 * positiva; no interesa el factor, solo si existe.
 */
function cholesky(m: readonly (readonly number[])[], escala: number): boolean {
  const n = m.length
  const l: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let suma = m[i]![j]!
      for (let k = 0; k < j; k += 1) suma -= l[i]![k]! * l[j]![k]!

      if (i === j) {
        if (!(suma > PIVOTE_MINIMO_RELATIVO * escala)) return false
        l[i]![j] = Math.sqrt(suma)
      } else {
        const div = l[j]![j]!
        if (div === 0) return false
        l[i]![j] = suma / div
      }
    }
  }
  return true
}
