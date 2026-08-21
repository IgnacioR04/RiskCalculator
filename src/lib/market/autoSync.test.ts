/**
 * El caso real que motiva esto: once posiciones guardadas, ninguna enlazada con
 * un proveedor, precios de hace tres semanas y todas las métricas históricas
 * bloqueadas por «0 observaciones». Lo que se comprueba aquí es que el enlace
 * ocurre solo, que no pisa lo que alguien eligió a mano y que la demostración
 * se queda como está.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Asset } from '../domain'
import { useAppStore } from '../../state/store'
import { enlazarActivosSinProveedor } from './autoSync'

function activo(cambio: Partial<Asset>): Asset {
  return {
    id: cambio.symbol ?? 'x',
    symbol: 'XXX',
    name: 'Activo',
    assetType: 'stock',
    quoteCurrency: 'EUR',
    ...cambio,
  }
}

beforeEach(() => {
  useAppStore.setState({ assets: [] })
})

describe('enlazarActivosSinProveedor', () => {
  it('enlaza una cripto con CoinGecko, que no pide clave ni cuenta', () => {
    // Es el único proveedor que funciona sin sesión, así que es también el
    // único que arregla algo sin tocar nada más.
    useAppStore.setState({
      assets: [activo({ id: 'btc', symbol: 'BTC', assetType: 'crypto', quoteCurrency: 'EUR' })],
    })

    expect(enlazarActivosSinProveedor()).toEqual(['BTC'])
    expect(useAppStore.getState().assets[0]!.providerIds).toEqual({ coingecko: 'bitcoin' })
  })

  it('enlaza metales y acciones con Twelve Data', () => {
    useAppStore.setState({
      assets: [
        activo({ id: 'xau', symbol: 'XAU', assetType: 'commodity' }),
        activo({ id: 'msft', symbol: 'MSFT', assetType: 'stock' }),
      ],
    })

    expect(enlazarActivosSinProveedor()).toEqual(['XAU', 'MSFT'])
    const [oro, micro] = useAppStore.getState().assets
    expect(oro!.providerIds).toEqual({ twelvedata: 'XAU/USD' })
    expect(micro!.providerIds).toEqual({ twelvedata: 'MSFT' })
  })

  it('no pisa un enlace ya elegido', () => {
    // Alguien que resolvió a mano en qué mercado cotiza su acción no puede
    // encontrarse con que la aplicación se lo cambia por el ticker pelado.
    useAppStore.setState({
      assets: [activo({ id: 'a', symbol: 'IAG', providerIds: { twelvedata: 'IAG:LSE' } })],
    })

    expect(enlazarActivosSinProveedor()).toEqual([])
    expect(useAppStore.getState().assets[0]!.providerIds).toEqual({ twelvedata: 'IAG:LSE' })
  })

  it('deja en paz los datos de demostración', () => {
    // Sus precios son inventados a propósito. Descargarlos los convertiría en
    // datos reales dentro de una cartera que no lo es.
    useAppStore.setState({
      assets: [activo({ id: 'd', symbol: 'BTC', assetType: 'crypto', isDemo: true })],
    })

    expect(enlazarActivosSinProveedor()).toEqual([])
    expect(useAppStore.getState().assets[0]!.providerIds).toBeUndefined()
  })

  it('lo que el resolutor no sabe identificar se queda sin enlazar', () => {
    // Enlazar mal es peor que no enlazar: metería en tu cartera el precio de
    // otro instrumento y nada avisaría.
    useAppStore.setState({
      assets: [activo({ id: 'e', symbol: 'EFECTIVO', assetType: 'cash' })],
    })

    expect(enlazarActivosSinProveedor()).toEqual([])
    expect(useAppStore.getState().assets[0]!.providerIds).toBeUndefined()
  })
})
