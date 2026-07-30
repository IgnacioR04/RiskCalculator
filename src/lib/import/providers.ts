/**
 * Enlace de un activo importado con su proveedor de datos.
 *
 * Sin `providerIds` un activo no tiene histórico, y sin histórico no hay
 * volatilidad, ni covarianzas, ni frontera eficiente: la sección de riesgo
 * queda vacía. La importación por capturas creaba activos sueltos, así que
 * toda la analítica se apagaba aunque la cartera estuviese completa.
 *
 * Aquí solo se resuelve lo que es inequívoco a partir del ticker. Lo dudoso
 * —un nombre sin ticker, un ticker que existe en varios mercados— se deja sin
 * enlazar para que lo elija la persona en el buscador. Enlazar mal es peor que
 * no enlazar: mete precios de otro instrumento en tu cartera.
 */
import type { AssetType } from '../domain'

/**
 * Criptos por capitalización con su identificador de CoinGecko. Solo las que
 * un ticker identifica sin ambigüedad; nada de tokens homónimos.
 */
const CRIPTO: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
  TON: 'the-open-network',
  LINK: 'chainlink',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  ETC: 'ethereum-classic',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  FIL: 'filecoin',
  ICP: 'internet-computer',
  HBAR: 'hedera-hashgraph',
  VET: 'vechain',
  ALGO: 'algorand',
}

/** Metales al contado en Twelve Data: el par lo forma el propio símbolo. */
const METALES: Record<string, string> = {
  XAU: 'XAU/USD',
  XAG: 'XAG/USD',
  XPT: 'XPT/USD',
  XPD: 'XPD/USD',
}

export interface ResolucionProveedor {
  providerIds: Record<string, string>
  /** Explicación para la lista de decisiones de la importación. */
  nota: string | null
}

/**
 * Devuelve los `providerIds` deducibles del ticker, o vacío si no hay ninguno
 * seguro. Nunca adivina a partir del nombre.
 */
export function resolverProveedor(
  symbol: string | null,
  assetType: AssetType,
): ResolucionProveedor {
  const ticker = symbol?.trim().toUpperCase() ?? ''
  if (ticker === '') return { providerIds: {}, nota: null }

  // Un «ticker» con espacios o muy largo es en realidad un nombre: no se enlaza.
  if (ticker.includes(' ') || ticker.length > 6) return { providerIds: {}, nota: null }

  if (assetType === 'crypto') {
    const id = CRIPTO[ticker]
    if (id === undefined) return { providerIds: {}, nota: null }
    return {
      providerIds: { coingecko: id },
      nota: `${ticker}: enlazado con CoinGecko (${id}) para poder descargar histórico.`,
    }
  }

  if (assetType === 'commodity') {
    const par = METALES[ticker]
    if (par === undefined) return { providerIds: {}, nota: null }
    return {
      providerIds: { twelvedata: par },
      nota: `${ticker}: enlazado con Twelve Data (${par}) para poder descargar histórico.`,
    }
  }

  if (assetType === 'stock' || assetType === 'etf') {
    // Twelve Data acepta el ticker directamente. No se resuelve el mercado:
    // si el mismo ticker cotiza en varias plazas, que lo elija la persona.
    return {
      providerIds: { twelvedata: ticker },
      nota: `${ticker}: enlazado con Twelve Data para poder descargar histórico. Revísalo si cotiza en varios mercados.`,
    }
  }

  return { providerIds: {}, nota: null }
}
