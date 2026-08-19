/**
 * Optimizadores de cartera (LAB-606, LAB-607).
 *
 * Dos candidatas que sí miran el riesgo, resueltas con los algoritmos que
 * [`ADR-007`](../../../../docs/adr/ADR-007-optimization-engine.md) eligió: sin
 * librería de programación cuadrática, en el navegador, y **sin devolver pesos
 * si no convergen**.
 *
 * ## La regla que las gobierna
 *
 * Un vector de pesos sin estado de convergencia es indistinguible de uno
 * correcto. Si el algoritmo agota sus iteraciones, se devuelve el informe del
 * solver y `weights: null`. Devolver la última iteración sería presentar un
 * resultado a medio cocer como si fuera la solución.
 *
 * ## Por qué hay shrinkage
 *
 * Una covarianza estimada con 252 observaciones y 20 activos está mal
 * condicionada: tiene direcciones con varianza casi nula que son **ruido**, y un
 * minimizador de varianza se agarra justo a esas, produciendo carteras
 * concentradísimas que fuera de muestra se comportan fatal.
 *
 * El shrinkage hacia la diagonal introduce sesgo a propósito para reducir la
 * varianza del estimador. Es la decisión estándar (Ledoit–Wolf), y aquí se
 * declara en los supuestos en vez de esconderse.
 *
 * Funciones puras: no tocan red, ni almacenamiento, ni reloj.
 */
import type { CompiledConstraints } from './constraintCompiler'
import { violations as comprobar } from './constraintCompiler'
import type { PortfolioCandidate, SolverReport } from './contracts'

export const MIN_VARIANCE_VERSION = 'candidate-minvar-v1'
export const ERC_VERSION = 'candidate-erc-v1'

const EPS = 1e-12
const MAX_ITER = 5_000
const TOL = 1e-9

/* ── Covarianza ────────────────────────────────────────────────────────────── */

/**
 * Acerca la covarianza a su diagonal.
 *
 * `intensity` de 0 la deja intacta y de 1 la reduce a la diagonal. El valor por
 * defecto, 0,1, es conservador: corrige el condicionamiento sin borrar las
 * correlaciones, que son justo lo que el optimizador tiene que ver.
 */
export function shrinkCovariance(
  covariance: readonly (readonly number[])[],
  intensity = 0.1,
): number[][] {
  const k = Math.min(1, Math.max(0, intensity))
  return covariance.map((fila, i) =>
    fila.map((valor, j) => (i === j ? valor : valor * (1 - k))),
  )
}

/** `true` si la matriz es cuadrada, simétrica y con diagonal positiva. */
export function isUsableCovariance(m: readonly (readonly number[])[]): boolean {
  const n = m.length
  if (n === 0) return false
  if (m.some((fila) => fila.length !== n)) return false
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(m[i]![i]!) || m[i]![i]! <= 0) return false
    for (let j = i + 1; j < n; j += 1) {
      if (!Number.isFinite(m[i]![j]!)) return false
      if (Math.abs(m[i]![j]! - m[j]![i]!) > 1e-9) return false
    }
  }
  return true
}

/** Varianza de una cartera: wᵀ Σ w. */
export function portfolioVariance(
  weights: readonly number[],
  covariance: readonly (readonly number[])[],
): number {
  let total = 0
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      total += weights[i]! * weights[j]! * (covariance[i]?.[j] ?? 0)
    }
  }
  return total
}

/* ── Cajas y proyección ────────────────────────────────────────────────────── */

interface Cajas {
  readonly min: number[]
  readonly max: number[]
}

/** Extrae los límites por activo. Los de grupo se comprueban al final. */
function cajasDe(compiled: CompiledConstraints): Cajas {
  const n = compiled.universe.length
  const min = new Array<number>(n).fill(0)
  const max = new Array<number>(n).fill(1)

  for (const b of compiled.bounds) {
    if (b.severity !== 'hard') continue
    if (b.members.length === 1) {
      const i = b.members[0]!
      min[i] = Math.max(min[i]!, b.min)
      max[i] = Math.min(max[i]!, b.max)
    } else if (b.max <= 1e-9) {
      // Grupo con techo cero: cada miembro a cero, exacto.
      for (const i of b.members) max[i] = 0
    }
  }
  return { min, max }
}

/**
 * Proyecta un vector sobre `{w : min ≤ w ≤ max, Σw = 1}`.
 *
 * Es una bisección sobre el multiplicador de la restricción de suma: para cada
 * desplazamiento `θ` se recorta a las cajas y se mira cuánto suma. La suma es
 * monótona decreciente en `θ`, así que la bisección converge siempre.
 */
export function projectToSimplex(v: readonly number[], cajas: Cajas): number[] | null {
  const n = v.length
  const sumaMin = cajas.min.reduce((s, x) => s + x, 0)
  const sumaMax = cajas.max.reduce((s, x) => s + x, 0)
  if (sumaMin > 1 + 1e-9 || sumaMax < 1 - 1e-9) return null

  const recortar = (theta: number) =>
    v.map((x, i) => Math.min(cajas.max[i]!, Math.max(cajas.min[i]!, x - theta)))

  let bajo = Math.min(...v) - 1
  let alto = Math.max(...v) + 1

  for (let it = 0; it < 200; it += 1) {
    const medio = (bajo + alto) / 2
    const suma = recortar(medio).reduce((s, x) => s + x, 0)
    if (Math.abs(suma - 1) < 1e-12) return recortar(medio)
    if (suma > 1) bajo = medio
    else alto = medio
  }

  const salida = recortar((bajo + alto) / 2)
  // Reparto del residuo entre quienes tienen holgura, para que sume exactamente.
  const resto = 1 - salida.reduce((s, x) => s + x, 0)
  if (Math.abs(resto) > 1e-9) {
    const holgura = salida.flatMap((w, i) =>
      resto > 0 ? (cajas.max[i]! - w > 1e-12 ? [i] : []) : (w - cajas.min[i]! > 1e-12 ? [i] : []),
    )
    if (holgura.length === 0) return null
    for (const i of holgura) salida[i] = salida[i]! + resto / holgura.length
  }
  for (let i = 0; i < n; i += 1) {
    salida[i] = Math.min(cajas.max[i]!, Math.max(cajas.min[i]!, salida[i]!))
  }
  return salida
}

/* ── LAB-606: mínima varianza ──────────────────────────────────────────────── */

const SUPUESTOS_MINVAR = [
  {
    label: 'Solo mira el riesgo pasado',
    detail:
      'Minimiza la varianza estimada con el historial disponible. No estima rentabilidades futuras, porque estimarlas mal es la principal fuente de error de las carteras optimizadas.',
  },
  {
    label: 'La covarianza se regulariza a propósito',
    detail:
      'Se acerca la matriz a su diagonal (shrinkage). Sin eso, el optimizador se agarra al ruido de las direcciones con varianza casi nula y produce carteras concentradísimas que se comportan mal fuera de muestra.',
  },
  {
    label: 'Menos varianza no es menos riesgo',
    detail:
      'La varianza mide oscilación, no probabilidad de ruina ni caída máxima. Una cartera de mínima varianza puede estar muy concentrada en un solo tipo de activo.',
  },
] as const

export interface OptimizerInput {
  readonly compiled: CompiledConstraints
  readonly covariance: readonly (readonly number[])[]
  /** Intensidad del shrinkage, 0–1. */
  readonly shrinkage?: number
}

function fallo(
  method: PortfolioCandidate['method'],
  version: string,
  status: SolverReport['status'],
  motivo: string,
  supuestos: readonly { label: string; detail: string }[],
  iterations = 0,
  residual = 0,
): PortfolioCandidate {
  return {
    method,
    modelVersion: version,
    weights: null,
    solver: { status, iterations, residual, tolerance: TOL },
    violations: [],
    assumptions: [...supuestos],
    notCovered: [motivo],
  }
}

/**
 * Mínima varianza con restricciones, por gradiente proyectado.
 *
 * El gradiente de wᵀΣw es 2Σw. Se avanza en su contra y se proyecta al conjunto
 * factible en cada paso; el tamaño del paso se deriva de la traza para que
 * escale con la magnitud de la matriz.
 */
export function candidateMinimumVariance(input: OptimizerInput): PortfolioCandidate {
  const { compiled } = input
  const n = compiled.universe.length

  if (n === 0) {
    return fallo('minimumVariance', MIN_VARIANCE_VERSION, 'invalid_input', 'No hay instrumentos.', SUPUESTOS_MINVAR)
  }
  if (!isUsableCovariance(input.covariance) || input.covariance.length !== n) {
    return fallo(
      'minimumVariance',
      MIN_VARIANCE_VERSION,
      'invalid_input',
      'La matriz de covarianza no es utilizable: tiene que ser cuadrada, simétrica y con varianzas positivas.',
      SUPUESTOS_MINVAR,
    )
  }

  const sigma = shrinkCovariance(input.covariance, input.shrinkage ?? 0.1)
  const cajas = cajasDe(compiled)

  let w = projectToSimplex(new Array<number>(n).fill(1 / n), cajas)
  if (w === null) {
    return fallo(
      'minimumVariance',
      MIN_VARIANCE_VERSION,
      'infeasible',
      'Los límites por activo no admiten ninguna cartera que sume el 100 %.',
      SUPUESTOS_MINVAR,
    )
  }

  // Paso derivado de la traza: escala con la magnitud de la matriz, así que
  // funciona igual con varianzas diarias que anualizadas.
  const traza = sigma.reduce((s, fila, i) => s + fila[i]!, 0)
  const paso = traza > 0 ? 1 / (2 * traza) : 1
  let iteraciones = 0
  let residual = Number.POSITIVE_INFINITY

  for (; iteraciones < MAX_ITER; iteraciones += 1) {
    const gradiente = sigma.map((fila) => 2 * fila.reduce((s, v, j) => s + v * w![j]!, 0))
    const siguiente = projectToSimplex(
      w.map((x, i) => x - paso * gradiente[i]!),
      cajas,
    )
    if (siguiente === null) break

    residual = Math.max(...siguiente.map((x, i) => Math.abs(x - w![i]!)))
    w = siguiente
    if (residual < TOL) break
  }

  if (residual >= TOL) {
    return fallo(
      'minimumVariance',
      MIN_VARIANCE_VERSION,
      'max_iterations',
      'El optimizador no ha convergido. No se devuelven pesos a medio calcular.',
      SUPUESTOS_MINVAR,
      iteraciones,
      residual,
    )
  }

  return {
    method: 'minimumVariance',
    modelVersion: MIN_VARIANCE_VERSION,
    weights: w,
    solver: { status: 'converged', iterations: iteraciones, residual, tolerance: TOL },
    violations: comprobar(compiled, w).map((v) => v.label),
    assumptions: [...SUPUESTOS_MINVAR],
    notCovered: [],
  }
}

/* ── LAB-607: contribuciones iguales al riesgo ─────────────────────────────── */

const SUPUESTOS_ERC = [
  {
    label: 'Reparte el riesgo, no el dinero',
    detail:
      'Busca que cada posición aporte lo mismo al riesgo total. Un activo volátil pesará menos en euros que uno tranquilo, y eso es deliberado.',
  },
  {
    label: 'No estima rentabilidades',
    detail: 'Como la mínima varianza, solo usa la covarianza. No supone que nada vaya a subir más que otra cosa.',
  },
  {
    label: 'Riesgo aquí significa varianza',
    detail:
      'Igualar contribuciones a la varianza no iguala contribuciones a una caída fuerte: en un desplome las correlaciones cambian y el reparto deja de cumplirse.',
  },
] as const

export interface ErcCandidate extends PortfolioCandidate {
  /** Diferencia máxima entre contribuciones al riesgo. Cuanto menor, mejor. */
  readonly parityError: number
}

/** Contribución de cada activo al riesgo total, en fracción. */
export function riskContributions(
  weights: readonly number[],
  covariance: readonly (readonly number[])[],
): readonly number[] {
  const varianza = portfolioVariance(weights, covariance)
  if (varianza <= EPS) return weights.map(() => 0)
  return weights.map((w, i) => {
    const marginal = covariance[i]!.reduce((s, v, j) => s + v * weights[j]!, 0)
    return (w * marginal) / varianza
  })
}

/**
 * Contribuciones iguales al riesgo, por punto fijo.
 *
 * En cada paso el peso se actualiza en proporción inversa a su contribución
 * marginal. Para matrices definidas positivas la iteración converge de forma
 * monótona; cuando no lo hace, se agota el tope y **no se devuelven pesos**.
 */
export function candidateEqualRiskContribution(input: OptimizerInput): ErcCandidate {
  const { compiled } = input
  const n = compiled.universe.length

  const conError = (base: PortfolioCandidate): ErcCandidate => ({ ...base, parityError: Number.NaN })

  if (n === 0) {
    return conError(fallo('equalRiskContribution', ERC_VERSION, 'invalid_input', 'No hay instrumentos.', SUPUESTOS_ERC))
  }
  if (!isUsableCovariance(input.covariance) || input.covariance.length !== n) {
    return conError(
      fallo(
        'equalRiskContribution',
        ERC_VERSION,
        'invalid_input',
        'La matriz de covarianza no es utilizable.',
        SUPUESTOS_ERC,
      ),
    )
  }

  const sigma = shrinkCovariance(input.covariance, input.shrinkage ?? 0.1)
  const cajas = cajasDe(compiled)
  const objetivo = 1 / n

  let w = projectToSimplex(new Array<number>(n).fill(1 / n), cajas)
  if (w === null) {
    return conError(
      fallo(
        'equalRiskContribution',
        ERC_VERSION,
        'infeasible',
        'Los límites por activo no admiten ninguna cartera que sume el 100 %.',
        SUPUESTOS_ERC,
      ),
    )
  }

  let iteraciones = 0
  let error = Number.POSITIVE_INFINITY

  for (; iteraciones < MAX_ITER; iteraciones += 1) {
    const contribuciones = riskContributions(w, sigma)
    error = Math.max(...contribuciones.map((c) => Math.abs(c - objetivo)))
    if (error < 1e-8) break

    // Quien aporta de más baja, quien aporta de menos sube. La raíz suaviza el
    // paso: sin ella la iteración oscila y no converge.
    const siguiente = w.map((peso, i) => {
      const c = contribuciones[i]!
      const factor = c > EPS ? Math.sqrt(objetivo / c) : 2
      return Math.max(EPS, peso * factor)
    })

    const suma = siguiente.reduce((s, x) => s + x, 0)
    const proyectado = projectToSimplex(
      siguiente.map((x) => x / suma),
      cajas,
    )
    if (proyectado === null) break
    w = proyectado
  }

  if (error >= 1e-8) {
    return conError(
      fallo(
        'equalRiskContribution',
        ERC_VERSION,
        'max_iterations',
        'No se ha alcanzado la paridad de riesgo. No se devuelven pesos a medio calcular.',
        SUPUESTOS_ERC,
        iteraciones,
        error,
      ),
    )
  }

  return {
    method: 'equalRiskContribution',
    modelVersion: ERC_VERSION,
    weights: w,
    solver: { status: 'converged', iterations: iteraciones, residual: error, tolerance: 1e-8 },
    violations: comprobar(compiled, w).map((v) => v.label),
    assumptions: [...SUPUESTOS_ERC],
    notCovered: [],
    parityError: error,
  }
}
