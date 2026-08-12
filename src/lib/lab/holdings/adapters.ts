/**
 * Adaptadores de composición (LAB-404, LAB-406).
 *
 * Traducen lo que cada fuente publica al contrato único de `FundComposition`.
 * El motor de look-through no sabe de dónde vino nada: solo mira `source` para
 * poder decirlo en pantalla.
 *
 * Hoy hay una fuente implementada —la que el usuario escribe— y dos declaradas
 * pero no construidas. Se documentan aquí porque el hueco es la información:
 * quien retome esto no tiene que volver a investigar qué se puede y qué no.
 *
 * ## Fuentes estudiadas
 *
 * | Fuente | Estado | Por qué |
 * |---|---|---|
 * | Manual | **Implementada** | Los datos son del usuario. Ninguna licencia que respetar |
 * | SEC EDGAR (N-PORT) | Pendiente | Dominio público y sin clave, pero **solo fondos domiciliados en EE. UU.**: los UCITS europeos no presentan N-PORT |
 * | Webs de emisores | **Descartada** | iShares y Vanguard prohíben expresamente redistribuir sus posiciones. Guardarlas en un repositorio público sería redistribuir |
 * | APIs comerciales | Pendiente | Twelve Data, FMP y Finnhub tienen el dato, pero ninguna en su plan gratuito |
 */
import type { Asset } from '../../domain'
import type { FundComposition, FundHolding } from './contracts'

/**
 * Composición escrita por el usuario, a partir del campo `holdings` que el
 * modelo de activos ya tenía.
 *
 * `null` cuando no hay nada útil: sin posiciones, o con todas sin peso. Una
 * lista de nombres sin pesos no permite repartir nada, y repartir a partes
 * iguales sería inventarse la cartera del fondo.
 */
export function compositionFromAsset(asset: Asset, asOf: string): FundComposition | null {
  const declaradas = asset.holdings ?? []
  if (declaradas.length === 0) return null

  const holdings: FundHolding[] = []
  for (const item of declaradas) {
    const peso = Number(item.weight)
    // Sin peso no se puede repartir. Se descarta la posición en vez de
    // asignarle uno: un peso inventado contamina todo lo que venga después.
    if (!Number.isFinite(peso) || peso <= 0 || peso > 1) continue
    holdings.push({
      symbol: item.symbol.trim().toUpperCase(),
      ...(item.name === undefined ? {} : { name: item.name }),
      weight: peso,
    })
  }

  if (holdings.length === 0) return null

  // La cobertura es lo que suman los pesos declarados: si el usuario ha metido
  // las diez mayores de un índice mundial y suman 0,23, se conoce el 23 % del
  // fondo y así se dice.
  const cobertura = Math.min(1, holdings.reduce((suma, h) => suma + h.weight, 0))

  return {
    assetId: asset.id,
    source: asset.isDemo === true ? 'demo' : 'manual',
    asOf,
    holdings,
    coverage: cobertura,
    attribution: asset.isDemo === true ? 'Datos de demostración' : 'Introducido a mano',
  }
}

/** Composiciones de todos los activos que declaran alguna, por `assetId`. */
export function compositionsFromAssets(
  assets: readonly Asset[],
  asOf: string,
): Readonly<Record<string, FundComposition>> {
  const salida: Record<string, FundComposition> = {}
  for (const asset of assets) {
    const composicion = compositionFromAsset(asset, asOf)
    if (composicion !== null) salida[asset.id] = composicion
  }
  return salida
}

/** Tipos de activo que envuelven a otros y por tanto tienen algo que mirar. */
const ENVOLTORIOS: ReadonlySet<Asset['assetType']> = new Set(['etf', 'index'])

export function isWrapper(asset: Asset): boolean {
  return ENVOLTORIOS.has(asset.assetType)
}
