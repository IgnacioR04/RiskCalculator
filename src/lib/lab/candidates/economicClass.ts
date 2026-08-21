/**
 * Clasificación económica de un instrumento (LAB-1104).
 *
 * ## Por qué esto no es `assetType`
 *
 * `assetType` describe **el envoltorio**, no lo que hay dentro. «ETF» no es una
 * clase económica: un ETF puede ser renta variable global, deuda pública a
 * corto, oro físico, materias primas o una cuenta remunerada disfrazada. Darle
 * a todos los ETF el prior de renta variable —que es lo que hacía la primera
 * versión del modelo de rentabilidad esperada— le regala un 6,5 % anual a un
 * fondo monetario y hace que el optimizador le dé peso por una razón falsa.
 *
 * Lo mismo vale para `index` y para un activo introducido a mano: ninguno
 * declara su exposición.
 *
 * ## Cómo se resuelve, por orden de fiabilidad
 *
 * 1. **Declarada.** Alguien la escribió. Manda sobre todo lo demás.
 * 2. **Por transparencia.** Si se conoce la composición del fondo y las clases
 *    de sus componentes cubren una parte suficiente de su peso **y coinciden**,
 *    esa es la clase. Si el fondo mezcla clases, no hay una sola respuesta y no
 *    se inventa.
 * 3. **Por tipo de producto**, y solo cuando el tipo sí determina la exposición:
 *    efectivo, cripto, materia prima y acción directa.
 * 4. **Desconocida.** Es un resultado legítimo, no un fallo. Aguas abajo obliga
 *    a declarar el máximo Sharpe como no disponible en vez de estimarlo mal.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { AssetType } from '../../domain'

export const ECONOMIC_CLASS_VERSION = 'economic-class-v1'

/**
 * Exposición económica, no producto.
 *
 * Deliberadamente corta: cada clase adicional es un prior más que mantener y
 * defender, y las distinciones finas (value/growth, duración) no cambian el
 * orden de magnitud de una rentabilidad esperada a largo plazo.
 */
export type EconomicClass = 'cash' | 'bond' | 'equity' | 'commodity' | 'crypto'

export type ClassificationSource = 'declared' | 'lookThrough' | 'productType' | 'unknown'

export interface EconomicClassification {
  /** `null` cuando no se puede determinar. Nunca se rellena por defecto. */
  readonly economicClass: EconomicClass | null
  readonly source: ClassificationSource
  readonly detail: string
}

/** Componente de un fondo, con su clase ya resuelta y su peso dentro del fondo. */
export interface ResolvedHolding {
  readonly economicClass: EconomicClass | null
  /** Peso dentro del fondo, fracción 0–1. */
  readonly weight: number
}

export interface ClassifyInput {
  readonly assetType: AssetType
  /** Clase escrita por una persona. Si está, manda. */
  readonly declared?: EconomicClass
  /** Composición conocida del fondo, si la hay. */
  readonly holdings?: readonly ResolvedHolding[]
}

/**
 * Cuánto del fondo hay que conocer para deducir su clase por transparencia.
 *
 * Con menos, la parte no vista puede ser de otra clase y cambiar la respuesta.
 * 0,8 es exigente a propósito: equivocarse aquí no da un error visible, da un
 * prior plausible aplicado al instrumento equivocado.
 */
export const COBERTURA_MINIMA_TRANSPARENCIA = 0.8

/** Tipos de producto que sí determinan la exposición económica por sí solos. */
const POR_TIPO: Partial<Record<AssetType, EconomicClass>> = {
  cash: 'cash',
  crypto: 'crypto',
  commodity: 'commodity',
  stock: 'equity',
}

export function classifyEconomically(input: ClassifyInput): EconomicClassification {
  if (input.declared !== undefined) {
    return {
      economicClass: input.declared,
      source: 'declared',
      detail: 'Clase declarada en el activo.',
    }
  }

  const porTransparencia = deducirPorTransparencia(input.holdings)
  if (porTransparencia !== null) return porTransparencia

  const porTipo = POR_TIPO[input.assetType]
  if (porTipo !== undefined) {
    return {
      economicClass: porTipo,
      source: 'productType',
      detail: `El tipo «${input.assetType}» determina la exposición sin ambigüedad.`,
    }
  }

  return {
    economicClass: null,
    source: 'unknown',
    detail:
      input.assetType === 'etf' || input.assetType === 'index'
        ? 'Es un envoltorio: puede contener renta variable, deuda, oro o efectivo. Declara su clase o añade su composición.'
        : 'El activo no declara qué exposición representa.',
  }
}

function deducirPorTransparencia(
  holdings: readonly ResolvedHolding[] | undefined,
): EconomicClassification | null {
  if (holdings === undefined || holdings.length === 0) return null

  const total = holdings.reduce((s, h) => s + (Number.isFinite(h.weight) ? h.weight : 0), 0)
  if (total <= 0) return null

  const porClase = new Map<EconomicClass, number>()
  let conocido = 0
  for (const h of holdings) {
    if (h.economicClass === null) continue
    const peso = Number.isFinite(h.weight) ? h.weight : 0
    porClase.set(h.economicClass, (porClase.get(h.economicClass) ?? 0) + peso)
    conocido += peso
  }

  const cobertura = conocido / total
  if (cobertura < COBERTURA_MINIMA_TRANSPARENCIA) return null

  // Unanimidad, no mayoría. Un fondo mixto no «es» renta variable porque el
  // 60 % lo sea: darle el prior de acciones exageraría su rentabilidad esperada
  // y ocultaría que la mezcla es precisamente lo que lo define.
  if (porClase.size !== 1) return null

  const [clase] = [...porClase.keys()]
  return {
    economicClass: clase!,
    source: 'lookThrough',
    detail: `Toda su composición conocida (${Math.round(cobertura * 100)} % del fondo) es de la misma clase.`,
  }
}
