/**
 * Modelo de rentabilidad esperada (LAB-1101, endurecido en LAB-1105).
 *
 * Existe porque la frontera eficiente y la cartera de máximo Sharpe **no se
 * pueden calcular sin él**. Todas las demás candidatas —mínima varianza,
 * paridad de riesgo, máxima diversificación, contribuciones— evitan
 * deliberadamente estimar rentabilidades, y eso es correcto: estimarlas mal es
 * la principal fuente de error de las carteras optimizadas. Este módulo no es
 * una mejora sobre ellas, es la asunción de un riesgo nuevo, y está construido
 * para que ese riesgo se vea y para **negarse a estimar** cuando no debe.
 *
 * ## Qué cambió en el endurecimiento, y por qué
 *
 * La primera versión tenía tres defectos que no daban error, que es lo peor que
 * puede pasarle a un modelo:
 *
 * - **Usaba `assetType` como clase económica.** Un ETF recibía el prior de
 *   renta variable, así que a un fondo monetario se le regalaba un 6,5 % anual
 *   y el optimizador le daba peso por una razón falsa. Ahora entra una
 *   `EconomicClass` resuelta aparte, y un envoltorio sin clasificar **no se
 *   estima**.
 * - **El efectivo tenía un 2 % fijo.** Independiente de la tasa sin riesgo con
 *   la que se calcula el Sharpe en la misma pantalla: dos números que hablan de
 *   lo mismo y no coincidían. Ahora se deriva de la tasa configurada.
 * - **No había suelo de cobertura.** Con dos instrumentos clasificados de diez
 *   devolvía un vector completo y la optimización seguía adelante. Ahora hay un
 *   mínimo, medido **por peso** y no por número de posiciones: diez residuales
 *   sin clasificar importan menos que una que sea el 40 % de la cartera.
 *
 * ## Estado del modelo
 *
 * `experimental`. Mientras la sensibilidad y la validación fuera de muestra no
 * estén integradas, el máximo Sharpe no puede decidir por sí solo la cartera
 * compatible con el perfil. Se calcula, se enseña y se compara; no manda.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { CandidateAssumption } from './contracts'
import type { EconomicClass, EconomicClassification } from './economicClass'

export const EXPECTED_RETURNS_VERSION = 'expected-returns-v2'

/**
 * Madurez del modelo.
 *
 * No es un adorno: gobierna qué puede hacer aguas abajo. Un modelo
 * `experimental` produce una candidata que se compara pero no se elige.
 */
export const EXPECTED_RETURNS_MATURITY = 'experimental' as const

/* ── Gobierno de los priors ────────────────────────────────────────────────── */

export interface PriorSet {
  readonly version: string
  /** Desde cuándo rige este conjunto. Un prior sin fecha no se puede auditar. */
  readonly effectiveFrom: string
  readonly methodology: string
  readonly sources: readonly string[]
  /**
   * Prior anual por clase. El efectivo no está: se deriva de la tasa
   * configurada, porque un prior fijo para el efectivo contradiría la tasa sin
   * riesgo con la que se calcula el Sharpe en la misma pantalla.
   */
  readonly annual: Readonly<Record<Exclude<EconomicClass, 'cash'>, number>>
}

/**
 * Conjunto de priors vigente.
 *
 * Son **órdenes de magnitud de largo plazo**, no previsiones, y deliberadamente
 * romos: la precisión falsa en un prior invita a creerse el tercer decimal de
 * una cartera optimizada. La metodología está escrita aquí para que se pueda
 * discutir el número sin tener que adivinar de dónde salió.
 */
export const PRIOR_SET_V1: PriorSet = {
  version: 'priors-v1',
  effectiveFrom: '2026-08-21',
  methodology:
    'Primas de riesgo de largo plazo sobre la tasa sin riesgo, redondeadas al medio punto. Renta variable: prima histórica de mercados desarrollados, recortada hacia el extremo bajo del rango habitual de la literatura. Deuda: prima de plazo y crédito agregada, modesta. Materias primas: rentabilidad real cercana a cero más inflación esperada, sin prima de riesgo sistemática. Cripto: sin serie larga ni fundamento de flujo de caja; se fija un valor moderado y se documenta que es el prior menos fundamentado del conjunto.',
  sources: [
    'Rango de la prima de riesgo de renta variable en la literatura académica (3–6 % sobre el activo sin riesgo).',
    'Ausencia de prima sistemática documentada en materias primas al contado.',
    'Sin base empírica de largo plazo para criptoactivos: el prior es una convención declarada, no una estimación.',
  ],
  annual: {
    equity: 0.065,
    bond: 0.035,
    commodity: 0.03,
    crypto: 0.08,
  },
}

/* ── Entrada y salida ──────────────────────────────────────────────────────── */

export interface ExpectedReturnsInput {
  /** Clasificación económica de cada instrumento, en el orden del universo. */
  readonly classifications: readonly EconomicClassification[]
  /**
   * Media anualizada observada, o `null` si no hay historia suficiente.
   *
   * `null` no es cero: un activo sin historia se queda con su prior a secas,
   * que es exactamente lo que significa no saber nada de él en particular.
   */
  readonly historicalAnnual: readonly (number | null)[]
  /** Peso de cada instrumento en la cartera actual. Mide la cobertura. */
  readonly weights: readonly number[]
  /**
   * Tasa del efectivo, anual. De aquí sale el prior del efectivo y con ella se
   * calcula el Sharpe: tienen que ser la misma.
   */
  readonly cashRate: number
  readonly priors?: PriorSet
  readonly historicalWeight?: number
  readonly clamp?: { readonly min: number; readonly max: number }
  readonly minimumCoverage?: number
}

export type ExpectedReturnsResult =
  | {
      readonly ok: true
      readonly mu: readonly number[]
      readonly modelVersion: string
      readonly priorVersion: string
      readonly maturity: typeof EXPECTED_RETURNS_MATURITY
      /** Peso de la cartera con clase económica conocida, 0–1. */
      readonly classifiedCoverage: number
      /** Peso de la cartera con historia utilizable, 0–1. */
      readonly historyCoverage: number
      readonly withoutHistory: number
      readonly assumptions: readonly CandidateAssumption[]
    }
  | {
      readonly ok: false
      readonly reason:
        | 'empty_universe'
        | 'length_mismatch'
        | 'invalid_weight'
        | 'invalid_cash_rate'
        | 'insufficient_classification'
      /** Cobertura conseguida, para poder decir cuánto falta. */
      readonly classifiedCoverage?: number
    }

export const PESO_HISTORICO_POR_DEFECTO = 0.35
export const RECORTE_POR_DEFECTO = { min: -0.1, max: 0.2 } as const

/**
 * Cobertura mínima, **por peso**, para estimar rentabilidades.
 *
 * Por peso y no por número: diez posiciones residuales sin clasificar importan
 * mucho menos que una que sea el 40 % de la cartera. Por debajo de esto, el
 * vector `mu` describiría sobre todo lo que no se sabe.
 */
export const COBERTURA_MINIMA = 0.9

/**
 * Combina histórico y prior por clase económica.
 *
 * `mu_i = clamp(peso · histórico_i + (1 − peso) · prior_i)`, y `mu_i = prior_i`
 * cuando no hay histórico. El efectivo se queda en la tasa configurada, sin
 * mezclar: su rentabilidad no se estima, se conoce.
 */
export function expectedReturns(input: ExpectedReturnsInput): ExpectedReturnsResult {
  const n = input.classifications.length
  if (n === 0) return { ok: false, reason: 'empty_universe' }
  if (input.historicalAnnual.length !== n || input.weights.length !== n) {
    return { ok: false, reason: 'length_mismatch' }
  }

  const peso = input.historicalWeight ?? PESO_HISTORICO_POR_DEFECTO
  if (!Number.isFinite(peso) || peso < 0 || peso > 1) return { ok: false, reason: 'invalid_weight' }
  if (!Number.isFinite(input.cashRate) || input.cashRate < -0.1 || input.cashRate > 0.5) {
    return { ok: false, reason: 'invalid_cash_rate' }
  }

  const priors = input.priors ?? PRIOR_SET_V1
  const recorte = input.clamp ?? RECORTE_POR_DEFECTO
  const minimo = input.minimumCoverage ?? COBERTURA_MINIMA

  const pesoTotal = input.weights.reduce((s, w) => s + (Number.isFinite(w) ? w : 0), 0)
  const normalizar = (w: number) => (pesoTotal > 0 ? (Number.isFinite(w) ? w : 0) / pesoTotal : 0)

  const cobertura = input.classifications.reduce(
    (s, c, i) => s + (c.economicClass !== null ? normalizar(input.weights[i]!) : 0),
    0,
  )

  // Se rechaza el modelo entero, no los instrumentos sueltos. Estimar solo los
  // clasificados y dejar los demás fuera cambiaría el universo de la
  // optimización sin decirlo, que es peor que no calcular.
  if (cobertura < minimo - 1e-9) {
    return { ok: false, reason: 'insufficient_classification', classifiedCoverage: cobertura }
  }

  let sinHistoria = 0
  let coberturaHistoria = 0

  const mu = input.classifications.map((clasificacion, i) => {
    const clase = clasificacion.economicClass!
    const historico = input.historicalAnnual[i]
    const hayHistoria = historico !== null && historico !== undefined && Number.isFinite(historico)

    if (hayHistoria) coberturaHistoria += normalizar(input.weights[i]!)
    else sinHistoria += 1

    // El efectivo no se estima: rinde su tasa. Mezclarlo con su propio pasado
    // le añadiría ruido a un número que se conoce.
    if (clase === 'cash') return Math.min(Math.max(input.cashRate, recorte.min), recorte.max)

    const prior = priors.annual[clase]
    if (!hayHistoria) return Math.min(Math.max(prior, recorte.min), recorte.max)

    const mezcla = peso * historico! + (1 - peso) * prior
    return Math.min(Math.max(mezcla, recorte.min), recorte.max)
  })

  return {
    ok: true,
    mu,
    modelVersion: EXPECTED_RETURNS_VERSION,
    priorVersion: priors.version,
    maturity: EXPECTED_RETURNS_MATURITY,
    classifiedCoverage: cobertura,
    historyCoverage: coberturaHistoria,
    withoutHistory: sinHistoria,
    assumptions: supuestos(peso, recorte, sinHistoria, n, priors, input.cashRate, coberturaHistoria),
  }
}

function supuestos(
  peso: number,
  recorte: { readonly min: number; readonly max: number },
  sinHistoria: number,
  total: number,
  priors: PriorSet,
  cashRate: number,
  coberturaHistoria: number,
): readonly CandidateAssumption[] {
  const base: CandidateAssumption[] = [
    {
      label: 'La rentabilidad esperada es una hipótesis, no un dato',
      detail:
        'La volatilidad y las correlaciones se miden; esto se estima, y con un error mucho mayor. Cualquier cartera que dependa de este número lo hereda entero.',
    },
    {
      label: 'Modelo en fase experimental',
      detail:
        'Mientras la sensibilidad y la validación fuera de muestra no estén integradas, la cartera de máximo Sharpe se enseña y se compara, pero no decide por sí sola cuál es la compatible con tu perfil.',
    },
    {
      label: `El histórico pesa un ${Math.round(peso * 100)} %`,
      detail:
        'El resto lo pone el prior de su clase económica. Con un año de datos, el error típico de una media anualizada es del orden de la propia volatilidad: no distingue un activo que rinde 0 % de uno que rinde 20 %.',
    },
    {
      label: `Priors ${priors.version}, vigentes desde ${priors.effectiveFrom}`,
      detail: priors.methodology,
    },
    {
      label: `El efectivo rinde su tasa configurada (${(cashRate * 100).toFixed(2).replace('.', ',')} %)`,
      detail:
        'No se le aplica prior ni se mezcla con su pasado: su rentabilidad no se estima, se conoce. Es además la misma tasa con la que se calcula el Sharpe, para que no haya dos números distintos hablando de lo mismo.',
    },
    {
      label: `Ninguna estimación sale del ${Math.round(recorte.min * 100)} % — ${Math.round(recorte.max * 100)} %`,
      detail:
        'Un recorte duro. Sin él, un activo con dos meses de historia excepcional arrastra la cartera entera hacia sí, que es el modo clásico de fallar de una optimización por Sharpe.',
    },
    {
      label: 'La clase es económica, no el tipo de producto',
      detail:
        'Un ETF no es una clase de activo: puede ser renta variable, deuda, oro o efectivo. Se clasifica por lo que declara o por su composición, y si no se puede determinar, el modelo no se calcula.',
    },
  ]

  if (sinHistoria > 0) {
    base.push({
      label: `${sinHistoria} de ${total} instrumentos se quedan solo con su prior`,
      detail: `Su estimación no contiene información sobre ellos en particular, sino sobre su clase. Con historia se cubre el ${Math.round(coberturaHistoria * 100)} % de la cartera.`,
    })
  }

  return base
}
