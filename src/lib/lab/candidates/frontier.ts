/**
 * Frontera eficiente de Markowitz y las dos candidatas que la acompañan
 * (LAB-1102).
 *
 * Es el hueco que quedaba del plan: el Laboratorio tenía mínima varianza y
 * paridad de riesgo, que **no necesitan estimar rentabilidades**, y por eso se
 * pudieron construir sin este módulo. La frontera y el máximo Sharpe sí lo
 * necesitan, y ahí es donde el error de estimación entra en el cálculo.
 *
 * ## Cómo se resuelve, y por qué así
 *
 * Sin librería de programación cuadrática, igual que el resto de optimizadores
 * ([`ADR-007`](../../../../docs/adr/ADR-007-optimization-engine.md)): gradiente
 * proyectado sobre `{w : min ≤ w ≤ max, Σw = 1}`, reutilizando el mismo
 * `projectToSimplex` que ya usaban las otras candidatas. Nada de esto introduce
 * una segunda forma de resolver el mismo problema.
 *
 * La restricción de rentabilidad objetivo de cada punto de la frontera no cabe
 * en la proyección, así que entra como penalización: se minimiza
 * `wᵀΣw + λ(μᵀw − objetivo)²` subiendo λ. Eso deja un residuo, y el residuo **se
 * mide y se publica**: un punto cuya rentabilidad se aleja del objetivo más de
 * la tolerancia no se devuelve. Una frontera con puntos que no cumplen su propia
 * restricción es una curva bonita que miente.
 *
 * ## La regla que gobierna todo el módulo
 *
 * Ninguna de estas carteras se llama «óptima» a secas. Cada una optimiza un
 * criterio distinto y ninguna domina a las demás; llamar «óptima» a la de
 * máximo Sharpe es esconder que depende del número más frágil de todo el
 * cálculo, la rentabilidad esperada.
 *
 * Funciones puras: no tocan red, ni almacenamiento, ni reloj.
 */
import { violations as comprobar } from './constraintCompiler'
import type { CandidateAssumption, PortfolioCandidate } from './contracts'
import {
  cajasDe,
  isUsableCovariance,
  MAX_ITER,
  projectToSimplex,
  shrinkCovariance,
  TOL,
  type Cajas,
  type OptimizerInput,
} from './optimizers'

export const MAX_SHARPE_VERSION = 'candidate-maxsharpe-v1'
export const MAX_DIVERSIFICATION_VERSION = 'candidate-maxdiv-v1'
export const FRONTIER_VERSION = 'frontier-v1'

/** Cuánto puede desviarse la rentabilidad de un punto de su objetivo. */
export const TOLERANCIA_OBJETIVO = 5e-4

export interface FrontierOptimizerInput extends OptimizerInput {
  /** Rentabilidad esperada anual por instrumento, en el orden del universo. */
  readonly mu: readonly number[]
  /** Tasa sin riesgo anual. Solo la usa el máximo Sharpe. */
  readonly riskFreeRate: number
}

/* ── Utilidades compartidas ────────────────────────────────────────────────── */

const producto = (m: readonly (readonly number[])[], w: readonly number[]): number[] =>
  m.map((fila) => fila.reduce((s, v, j) => s + v * w[j]!, 0))

const dot = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((s, v, i) => s + v * b[i]!, 0)

const varianza = (sigma: readonly (readonly number[])[], w: readonly number[]): number =>
  Math.max(dot(w, producto(sigma, w)), 0)

function fallo(
  method: PortfolioCandidate['method'],
  version: string,
  status: PortfolioCandidate['solver']['status'],
  motivo: string,
  supuestos: readonly CandidateAssumption[],
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
 * Preparación común: valida, aplica shrinkage y devuelve cajas y punto inicial.
 *
 * El punto de partida es la cartera de pesos iguales proyectada, no una esquina:
 * arrancar en un vértice hace que el gradiente proyectado se quede pegado a él.
 */
function preparar(
  input: FrontierOptimizerInput | OptimizerInput,
): { sigma: number[][]; cajas: Cajas; w0: number[] } | { error: 'empty' | 'covariance' | 'infeasible' } {
  const n = input.compiled.universe.length
  if (n === 0) return { error: 'empty' }
  if (!isUsableCovariance(input.covariance) || input.covariance.length !== n) {
    return { error: 'covariance' }
  }

  const sigma = shrinkCovariance(input.covariance, input.shrinkage)
  const cajas = cajasDe(input.compiled)
  const w0 = projectToSimplex(new Array<number>(n).fill(1 / n), cajas)
  if (w0 === null) return { error: 'infeasible' }
  return { sigma, cajas, w0 }
}

/**
 * Ascenso proyectado de un cociente `numerador(w) / σ(w)`.
 *
 * Sharpe y ratio de diversificación tienen la misma forma —lineal partido por
 * desviación típica—, así que comparten solucionador. El gradiente del cociente
 * es `a/σ − (aᵀw)·Σw/σ³`, con `a` el vector lineal de cada caso.
 */
function maximizarCociente(
  sigma: readonly (readonly number[])[],
  cajas: Cajas,
  w0: readonly number[],
  a: readonly number[],
  desplazamiento: number,
): { w: number[]; iteraciones: number; residual: number } {
  const objetivo = (w: readonly number[]) => {
    const s = Math.sqrt(Math.max(dot(w, producto(sigma, w)), 1e-18))
    return (dot(a, w) - desplazamiento) / s
  }

  let w = [...w0]
  let valor = objetivo(w)
  let paso = 1
  let iteraciones = 0
  let mejora = Number.POSITIVE_INFINITY

  // Búsqueda de línea con retroceso, no paso fijo. El gradiente de un cociente
  // no escala con la traza como el de una forma cuadrática, así que cualquier
  // paso fijo oscila con unas matrices y se arrastra con otras: la primera
  // versión de esto no convergía ni en el caso diagonal más sencillo.
  for (; iteraciones < MAX_ITER; iteraciones += 1) {
    const sw = producto(sigma, w)
    const sigmaW = Math.sqrt(Math.max(dot(w, sw), 1e-18))
    const num = dot(a, w) - desplazamiento
    const gradiente = a.map((ai, i) => ai / sigmaW - (num * sw[i]!) / sigmaW ** 3)
    const norma = Math.sqrt(dot(gradiente, gradiente))
    if (norma === 0) break

    let aceptado = false
    for (let intento = 0; intento < 40; intento += 1) {
      const candidato = projectToSimplex(
        w.map((x, i) => x + (paso / norma) * gradiente[i]!),
        cajas,
      )
      if (candidato !== null) {
        const nuevo = objetivo(candidato)
        if (nuevo > valor) {
          mejora = Math.abs(nuevo - valor) / Math.max(Math.abs(valor), 1e-12)
          w = candidato
          valor = nuevo
          aceptado = true
          break
        }
      }
      paso /= 2
    }

    // Ningún paso mejora: se está en el óptimo dentro de la región factible, o
    // en un borde del que el gradiente proyectado ya no saca.
    if (!aceptado) {
      mejora = 0
      break
    }
    if (mejora < 1e-12) break
    // Se agranda un poco tras un acierto, para no quedarse con un paso diminuto
    // heredado de un tramo difícil.
    paso *= 1.5
  }

  return { w, iteraciones, residual: mejora }
}

/* ── Máximo Sharpe ─────────────────────────────────────────────────────────── */

const SUPUESTOS_SHARPE: readonly CandidateAssumption[] = [
  {
    label: 'Depende del número más frágil del cálculo',
    detail:
      'Necesita rentabilidades esperadas. La volatilidad y las correlaciones se miden; la rentabilidad esperada se estima, y con un error mucho mayor. Esta cartera hereda ese error entero.',
  },
  {
    label: 'Sharpe premia la oscilación simétrica',
    detail:
      'Castiga igual las subidas bruscas que las caídas. Una cartera con Sharpe alto puede tener caídas máximas peores que otra con Sharpe menor.',
  },
  {
    label: 'No es «la óptima»',
    detail:
      'Es la óptima **para un criterio concreto** y para unas rentabilidades esperadas concretas. Cambia el modelo de rentabilidad y cambia esta cartera; no le pasa lo mismo a la de mínima varianza.',
  },
]

/**
 * Cartera de máximo Sharpe esperado.
 *
 * Requiere `mu`. Sin un modelo de rentabilidad esperada válido **no se calcula**:
 * inventarle rentabilidades para poder dibujar un punto sería la peor forma de
 * rellenar un hueco.
 */
export function candidateMaximumSharpe(input: FrontierOptimizerInput): PortfolioCandidate {
  const n = input.compiled.universe.length
  const prep = preparar(input)
  if ('error' in prep) {
    return fallo(
      'maximumSharpe',
      MAX_SHARPE_VERSION,
      prep.error === 'infeasible' ? 'infeasible' : 'invalid_input',
      motivoDe(prep.error),
      SUPUESTOS_SHARPE,
    )
  }
  if (input.mu.length !== n || input.mu.some((x) => !Number.isFinite(x))) {
    return fallo(
      'maximumSharpe',
      MAX_SHARPE_VERSION,
      'invalid_input',
      'No hay un modelo de rentabilidad esperada válido para todo el universo.',
      SUPUESTOS_SHARPE,
    )
  }

  const { sigma, cajas, w0 } = prep
  const r = maximizarCociente(sigma, cajas, w0, input.mu, input.riskFreeRate)

  if (r.residual > 1e-10) {
    return fallo(
      'maximumSharpe',
      MAX_SHARPE_VERSION,
      'max_iterations',
      'El optimizador no ha convergido. No se devuelven pesos a medio calcular.',
      SUPUESTOS_SHARPE,
      r.iteraciones,
      r.residual,
    )
  }

  return {
    method: 'maximumSharpe',
    modelVersion: MAX_SHARPE_VERSION,
    weights: r.w,
    solver: { status: 'converged', iterations: r.iteraciones, residual: r.residual, tolerance: TOL },
    violations: comprobar(input.compiled, r.w).map((v) => v.label),
    assumptions: [...SUPUESTOS_SHARPE],
    notCovered: [],
  }
}

/* ── Máxima diversificación ────────────────────────────────────────────────── */

const SUPUESTOS_MAXDIV: readonly CandidateAssumption[] = [
  {
    label: 'No estima rentabilidades',
    detail:
      'Maximiza el cociente entre la volatilidad media ponderada de los activos y la volatilidad de la cartera. Solo usa la covarianza, igual que mínima varianza y paridad de riesgo.',
  },
  {
    label: 'Diversificar no es repartir',
    detail:
      'Puede concentrar bastante dinero en pocos activos si son los que menos se mueven juntos. Diversificación aquí significa fuentes de riesgo distintas, no partes iguales.',
  },
  {
    label: 'Depende de correlaciones estimadas',
    detail:
      'Las correlaciones cambian, y suelen subir justo en las caídas. Una cartera muy diversificada según el pasado puede serlo menos cuando importa.',
  },
]

/** Cartera que maximiza el ratio de diversificación. No necesita `mu`. */
export function candidateMaximumDiversification(input: OptimizerInput): PortfolioCandidate {
  const prep = preparar(input)
  if ('error' in prep) {
    return fallo(
      'maximumDiversification',
      MAX_DIVERSIFICATION_VERSION,
      prep.error === 'infeasible' ? 'infeasible' : 'invalid_input',
      motivoDe(prep.error),
      SUPUESTOS_MAXDIV,
    )
  }

  const { sigma, cajas, w0 } = prep
  const volatilidades = sigma.map((fila, i) => Math.sqrt(Math.max(fila[i]!, 0)))
  const r = maximizarCociente(sigma, cajas, w0, volatilidades, 0)

  if (r.residual > 1e-10) {
    return fallo(
      'maximumDiversification',
      MAX_DIVERSIFICATION_VERSION,
      'max_iterations',
      'El optimizador no ha convergido. No se devuelven pesos a medio calcular.',
      SUPUESTOS_MAXDIV,
      r.iteraciones,
      r.residual,
    )
  }

  return {
    method: 'maximumDiversification',
    modelVersion: MAX_DIVERSIFICATION_VERSION,
    weights: r.w,
    solver: { status: 'converged', iterations: r.iteraciones, residual: r.residual, tolerance: TOL },
    violations: comprobar(input.compiled, r.w).map((v) => v.label),
    assumptions: [...SUPUESTOS_MAXDIV],
    notCovered: [],
  }
}

/* ── Frontera ──────────────────────────────────────────────────────────────── */

export interface FrontierPoint {
  /** Rentabilidad esperada anual de la cartera. */
  readonly expectedReturn: number
  readonly volatility: number
  readonly weights: readonly number[]
  /** Distancia entre la rentabilidad conseguida y el objetivo del punto. */
  readonly residual: number
}

export type FrontierResult =
  | {
      readonly ok: true
      readonly modelVersion: string
      readonly points: readonly FrontierPoint[]
      /** Puntos pedidos que no cumplieron su objetivo y quedaron fuera. */
      readonly discarded: number
      readonly assumptions: readonly CandidateAssumption[]
    }
  | {
      readonly ok: false
      readonly reason: 'empty_universe' | 'invalid_covariance' | 'infeasible' | 'invalid_returns' | 'degenerate_range'
    }

const SUPUESTOS_FRONTERA: readonly CandidateAssumption[] = [
  {
    label: 'La curva es tan buena como sus dos entradas',
    detail:
      'Rentabilidades esperadas y covarianza. La segunda se mide con ruido y la primera se estima; la frontera dibuja con precisión de dos decimales algo que no se conoce con esa precisión.',
  },
  {
    label: 'Cada punto cumple su restricción o no aparece',
    detail:
      'La rentabilidad objetivo se impone con una penalización, no de forma exacta. Los puntos cuya rentabilidad conseguida se aleja del objetivo más de la tolerancia se descartan en vez de dibujarse.',
  },
  {
    label: 'Es la frontera de este universo y estos límites',
    detail:
      'Se calcula solo con los activos que ya tienes y con las restricciones declaradas. No dice qué pasaría si añadieras otra cosa.',
  },
]

/**
 * Frontera eficiente entre la cartera de mínima varianza y la de máxima
 * rentabilidad alcanzable.
 *
 * El extremo superior no es «el activo de mayor `mu`»: con topes por activo, la
 * cartera de máxima rentabilidad es la que llena por orden de `mu` hasta agotar
 * el 100 %. Calcularlo así evita pedir objetivos imposibles y luego descartar
 * media curva.
 */
export function efficientFrontier(
  input: FrontierOptimizerInput,
  puntos = 24,
): FrontierResult {
  const n = input.compiled.universe.length
  const prep = preparar(input)
  if ('error' in prep) {
    return {
      ok: false,
      reason:
        prep.error === 'empty'
          ? 'empty_universe'
          : prep.error === 'covariance'
            ? 'invalid_covariance'
            : 'infeasible',
    }
  }
  if (input.mu.length !== n || input.mu.some((x) => !Number.isFinite(x))) {
    return { ok: false, reason: 'invalid_returns' }
  }

  const { sigma, cajas, w0 } = prep

  const minima = resolverPenalizado(sigma, cajas, w0, input.mu, null)
  const wMax = maximaRentabilidad(input.mu, cajas)
  if (wMax === null) return { ok: false, reason: 'infeasible' }

  const rMin = dot(input.mu, minima.w)
  const rMax = dot(input.mu, wMax)
  if (!(rMax - rMin > 1e-9)) {
    // Todos los activos tienen la misma rentabilidad esperada, o los límites
    // dejan un único reparto posible: no hay curva, hay un punto.
    return { ok: false, reason: 'degenerate_range' }
  }

  const salida: FrontierPoint[] = []
  let descartados = 0
  const total = Math.max(2, Math.min(puntos, 60))

  for (let k = 0; k < total; k += 1) {
    const objetivo = rMin + ((rMax - rMin) * k) / (total - 1)
    const r = resolverPenalizado(sigma, cajas, w0, input.mu, objetivo)
    const conseguido = dot(input.mu, r.w)
    const residual = Math.abs(conseguido - objetivo)

    if (residual > TOLERANCIA_OBJETIVO) {
      descartados += 1
      continue
    }
    salida.push({
      expectedReturn: conseguido,
      volatility: Math.sqrt(varianza(sigma, r.w)),
      weights: r.w,
      residual,
    })
  }

  if (salida.length < 2) return { ok: false, reason: 'degenerate_range' }

  return {
    ok: true,
    modelVersion: FRONTIER_VERSION,
    points: salida,
    discarded: descartados,
    assumptions: SUPUESTOS_FRONTERA,
  }
}

/**
 * Mínima varianza, opcionalmente sujeta a una rentabilidad objetivo.
 *
 * Con `objetivo === null` es la mínima varianza a secas. Con objetivo, la
 * restricción entra como penalización creciente: empezar con λ alta hace que el
 * primer paso salte fuera de la región factible y la proyección lo devuelva a
 * un vértice, del que ya no sale.
 */
function resolverPenalizado(
  sigma: readonly (readonly number[])[],
  cajas: Cajas,
  w0: readonly number[],
  mu: readonly number[],
  objetivo: number | null,
): { w: number[]; iteraciones: number } {
  const traza = sigma.reduce((s, fila, i) => s + fila[i]!, 0)
  const normaMu = dot(mu, mu)
  let w = [...w0]
  let iteraciones = 0

  const tramos = objetivo === null ? [0] : [10, 100, 1_000, 10_000, 100_000]
  for (const lambda of tramos) {
    // El paso tiene que mirar **las dos** curvaturas. La del término
    // penalizado es 2λ‖μ‖², que con λ grande domina por completo a la de Σ:
    // usar solo la traza daba pasos cien veces mayores de la cuenta, la
    // proyección los aplastaba contra un vértice y la curva salía vacía.
    const curvatura = 2 * traza + 2 * lambda * normaMu
    const paso = curvatura > 0 ? 1 / curvatura : 1

    for (let it = 0; it < MAX_ITER / tramos.length; it += 1) {
      iteraciones += 1
      const sw = producto(sigma, w)
      const desvio = objetivo === null ? 0 : dot(mu, w) - objetivo
      const gradiente = sw.map((v, i) => 2 * v + 2 * lambda * desvio * mu[i]!)

      const siguiente = projectToSimplex(
        w.map((x, i) => x - paso * gradiente[i]!),
        cajas,
      )
      if (siguiente === null) break

      const cambio = Math.max(...siguiente.map((x, i) => Math.abs(x - w[i]!)))
      w = siguiente
      if (cambio < TOL) break
    }
  }

  return { w, iteraciones }
}

/**
 * Cartera de máxima rentabilidad esperada dentro de las cajas.
 *
 * Se llena por orden de `mu` decreciente: primero el mínimo obligatorio de
 * todos, y el resto del presupuesto al activo con mayor `mu` que aún tenga
 * holgura. Es exacto para un objetivo lineal con restricciones de caja.
 */
function maximaRentabilidad(mu: readonly number[], cajas: Cajas): number[] | null {
  const n = mu.length
  const w = [...cajas.min]
  let restante = 1 - w.reduce((s, x) => s + x, 0)
  if (restante < -1e-9) return null

  const orden = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const d = mu[b]! - mu[a]!
    // Desempate por índice: dos activos con la misma rentabilidad esperada no
    // pueden dar un resultado distinto según cómo ordenara el motor de turno.
    return d !== 0 ? d : a - b
  })

  for (const i of orden) {
    if (restante <= 1e-12) break
    const holgura = cajas.max[i]! - w[i]!
    const asignar = Math.min(holgura, restante)
    w[i] = w[i]! + asignar
    restante -= asignar
  }

  return restante > 1e-9 ? null : w
}

function motivoDe(error: 'empty' | 'covariance' | 'infeasible'): string {
  if (error === 'empty') return 'No hay instrumentos.'
  if (error === 'covariance') {
    return 'La matriz de covarianza no es utilizable: tiene que ser cuadrada, simétrica y con varianzas positivas.'
  }
  return 'Los límites por activo no admiten ninguna cartera que sume el 100 %.'
}
