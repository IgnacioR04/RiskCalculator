/**
 * Modelo de rentabilidad esperada (LAB-1101).
 *
 * Existe porque la frontera eficiente y la cartera de máximo Sharpe **no se
 * pueden calcular sin él**, y hasta ahora el Laboratorio no lo tenía. Todas sus
 * candidatas —mínima varianza, paridad de riesgo, contribuciones— evitaban
 * deliberadamente estimar rentabilidades, y eso era correcto: estimarlas mal es
 * la principal fuente de error de las carteras optimizadas.
 *
 * Así que este módulo no es una mejora del anterior, es la asunción de un riesgo
 * nuevo, y por eso está construido para que ese riesgo se vea:
 *
 * - **Nunca extrapola la media histórica a pelo.** Un activo que subió un 80 %
 *   el año pasado no tiene una esperanza del 80 %. La media muestral de un año
 *   de datos tiene un error típico enorme, y un optimizador de Sharpe se
 *   abalanza justo sobre el activo con la media más alta, que suele ser el que
 *   más ruido tiene.
 * - **Encoge hacia un prior por clase de activo**, con el peso del histórico
 *   por defecto en 0,35. Es la misma forma que usa el cuaderno de referencia.
 * - **Recorta los extremos**, porque un prior mal aplicado a un activo con dos
 *   meses de historia todavía puede dar un disparate.
 * - **Devuelve sus supuestos con el resultado**, para que la pantalla no pueda
 *   enseñar el número sin enseñar de dónde sale.
 *
 * ## Sobre los priors por defecto
 *
 * Son **configuración versionada, no verdad**. Se eligen por clase de activo y
 * nunca por instrumento concreto: un prior por ticker sería una tesis personal
 * disfrazada de modelo, y eso es justo lo que no puede acabar aquí. Quien no
 * esté de acuerdo con un prior debería poder cambiarlo y ver el efecto, que es
 * la razón de que entren por parámetro.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { AssetType } from '../../domain'
import type { CandidateAssumption } from './contracts'

export const EXPECTED_RETURNS_VERSION = 'expected-returns-v1'

/**
 * Peso de la media histórica frente al prior.
 *
 * 0,35 significa que dos tercios de la estimación los pone el prior. Suena
 * excesivo hasta que se mira el error típico: con 252 observaciones y una
 * volatilidad del 20 %, el error típico de la media anualizada es del orden del
 * 20 % anual. Es decir, la media histórica de un año no distingue un activo que
 * rinde 0 % de uno que rinde 20 %.
 */
export const PESO_HISTORICO_POR_DEFECTO = 0.35

/** Recorte duro. Ninguna estimación sale de aquí, venga de donde venga. */
export const RECORTE_POR_DEFECTO = { min: -0.1, max: 0.2 } as const

/**
 * Priors anuales por clase de activo.
 *
 * Órdenes de magnitud de largo plazo, no previsiones. Deliberadamente
 * conservadores y deliberadamente romos: la precisión falsa en un prior es peor
 * que la imprecisión declarada, porque invita a creerse el tercer decimal de
 * una cartera optimizada.
 */
export const PRIORS_POR_DEFECTO: Readonly<Record<AssetType, number>> = {
  cash: 0.02,
  stock: 0.065,
  etf: 0.065,
  index: 0.065,
  commodity: 0.03,
  crypto: 0.08,
  // Un activo introducido a mano no declara de qué clase es. Se le da el prior
  // más prudente del catálogo en vez de suponerle renta variable: suponer de
  // más aquí empuja al optimizador a darle peso por una clase que nadie afirmó.
  manual: 0.02,
}

export interface ExpectedReturnsInput {
  /** Clase de cada instrumento, en el orden del universo. */
  readonly assetTypes: readonly AssetType[]
  /**
   * Media anualizada observada, o `null` si no hay historia suficiente.
   *
   * `null` no es cero: un activo sin historia se queda con su prior a secas, que
   * es exactamente lo que significa no saber nada de él.
   */
  readonly historicalAnnual: readonly (number | null)[]
  readonly priors?: Readonly<Record<AssetType, number>>
  readonly historicalWeight?: number
  readonly clamp?: { readonly min: number; readonly max: number }
}

export type ExpectedReturnsResult =
  | {
      readonly ok: true
      readonly mu: readonly number[]
      readonly modelVersion: string
      /** Cuántos instrumentos se quedaron solo con el prior. */
      readonly withoutHistory: number
      readonly assumptions: readonly CandidateAssumption[]
    }
  | {
      readonly ok: false
      readonly reason: 'empty_universe' | 'length_mismatch' | 'invalid_weight'
    }

/**
 * Combina histórico y prior.
 *
 * `mu_i = clamp(peso · histórico_i + (1 − peso) · prior_i)`, y `mu_i = prior_i`
 * cuando no hay histórico.
 */
export function expectedReturns(input: ExpectedReturnsInput): ExpectedReturnsResult {
  const n = input.assetTypes.length
  if (n === 0) return { ok: false, reason: 'empty_universe' }
  if (input.historicalAnnual.length !== n) return { ok: false, reason: 'length_mismatch' }

  const peso = input.historicalWeight ?? PESO_HISTORICO_POR_DEFECTO
  if (!Number.isFinite(peso) || peso < 0 || peso > 1) return { ok: false, reason: 'invalid_weight' }

  const priors = input.priors ?? PRIORS_POR_DEFECTO
  const recorte = input.clamp ?? RECORTE_POR_DEFECTO

  let sinHistoria = 0
  const mu = input.assetTypes.map((tipo, i) => {
    const prior = priors[tipo] ?? PRIORS_POR_DEFECTO.manual
    const historico = input.historicalAnnual[i]

    if (historico === null || historico === undefined || !Number.isFinite(historico)) {
      sinHistoria += 1
      return Math.min(Math.max(prior, recorte.min), recorte.max)
    }

    const mezcla = peso * historico + (1 - peso) * prior
    return Math.min(Math.max(mezcla, recorte.min), recorte.max)
  })

  return {
    ok: true,
    mu,
    modelVersion: EXPECTED_RETURNS_VERSION,
    withoutHistory: sinHistoria,
    assumptions: supuestos(peso, recorte, sinHistoria, n),
  }
}

function supuestos(
  peso: number,
  recorte: { readonly min: number; readonly max: number },
  sinHistoria: number,
  total: number,
): readonly CandidateAssumption[] {
  const base: CandidateAssumption[] = [
    {
      label: 'La rentabilidad esperada es una hipótesis, no un dato',
      detail:
        'A diferencia de la volatilidad o las correlaciones, que se miden, esto se estima. Cualquier cartera que dependa de este número hereda su incertidumbre, y es bastante mayor de lo que parece.',
    },
    {
      label: `El histórico pesa un ${Math.round(peso * 100)} %`,
      detail:
        'El resto lo pone un prior por clase de activo. Con un año de datos, el error típico de una media anualizada es del orden de la propia volatilidad: no distingue un activo que rinde 0 % de uno que rinde 20 %. Apoyarse en el histórico sin encoger sería confundir ruido con señal.',
    },
    {
      label: `Ninguna estimación sale del ${Math.round(recorte.min * 100)} % — ${Math.round(recorte.max * 100)} %`,
      detail:
        'Un recorte duro. Sin él, un activo con dos meses de historia excepcional arrastra la cartera entera hacia sí, que es el modo clásico de fallar de una optimización por Sharpe.',
    },
    {
      label: 'Los priors son configuración, no verdad',
      detail:
        'Se fijan por clase de activo y nunca por instrumento concreto: un prior por ticker sería una tesis personal disfrazada de modelo. Están versionados y se pueden cambiar para ver el efecto.',
    },
  ]

  if (sinHistoria > 0) {
    base.push({
      label: `${sinHistoria} de ${total} instrumentos se quedan solo con su prior`,
      detail:
        'No tienen historia suficiente, así que su estimación no contiene ninguna información sobre ellos en particular: es la de su clase. Conviene desconfiar del peso que la optimización les asigne.',
    })
  }

  return base
}
