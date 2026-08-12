/**
 * Pruebas de identidad canónica (LAB-402).
 *
 * El criterio de aceptación es uno: **un ticker sin mercado ambiguo no se
 * autoasigna**. Todo lo demás sostiene eso.
 */
import { describe, expect, it } from 'vitest'
import {
  ambiguousSymbols,
  buildIdentityIndex,
  displayLabel,
  identify,
  resolveSymbol,
  type Identifiable,
} from './instrumentIdentity'

const activo = (cambio: Partial<Identifiable> & { symbol: string }): Identifiable => ({
  quoteCurrency: 'EUR',
  ...cambio,
})

describe('la mejor evidencia manda', () => {
  it('con ISIN, la identidad es el ISIN', () => {
    const id = identify(activo({ symbol: 'SAN', isin: 'ES0113900J37', exchange: 'BME' }))
    expect(id.strength).toBe('isin')
  })

  it('sin ISIN pero con mercado, identifica la línea de cotización', () => {
    expect(identify(activo({ symbol: 'SAN', exchange: 'BME' })).strength).toBe('ticker_market')
  })

  it('solo con el ticker, se declara débil en vez de fingir certeza', () => {
    expect(identify(activo({ symbol: 'SAN' })).strength).toBe('ticker_only')
  })

  it('el mismo valor en dos mercados comparte clave si comparte ISIN', () => {
    const madrid = identify(activo({ symbol: 'SAN', isin: 'ES0113900J37', exchange: 'BME' }))
    const milan = identify(activo({ symbol: 'SANT', isin: 'ES0113900J37', exchange: 'MIL' }))
    // Es la misma empresa escrita de dos maneras: debe sumarse, no separarse.
    expect(madrid.key).toBe(milan.key)
  })

  it('dos empresas distintas con el mismo ticker no comparten clave', () => {
    const santander = identify(activo({ symbol: 'SAN', exchange: 'BME' }))
    const sandstorm = identify(activo({ symbol: 'SAN', exchange: 'TSX' }))
    expect(santander.key).not.toBe(sandstorm.key)
  })

  it('mayúsculas y espacios no crean instrumentos distintos', () => {
    expect(identify(activo({ symbol: ' aapl ' })).key).toBe(identify(activo({ symbol: 'AAPL' })).key)
  })

  it('un ISIN vacío no cuenta como ISIN', () => {
    expect(identify(activo({ symbol: 'AAPL', isin: '  ' })).strength).toBe('ticker_only')
  })
})

describe('un ticker ambiguo no se autoasigna', () => {
  // Dos empresas distintas que comparten el ticker SAN.
  const cartera = [
    activo({ symbol: 'SAN', exchange: 'BME' }),
    activo({ symbol: 'SAN', exchange: 'TSX' }),
    activo({ symbol: 'AAPL', exchange: 'XNAS' }),
  ]
  const indice = buildIdentityIndex(cartera)

  it('con un solo candidato, se resuelve', () => {
    const r = resolveSymbol(indice, 'AAPL')
    expect(r.status).toBe('resolved')
  })

  it('con dos candidatos, se declara ambiguo y no se elige ninguno', () => {
    const r = resolveSymbol(indice, 'SAN')
    expect(r.status).toBe('ambiguous')
    if (r.status !== 'ambiguous') throw new Error('debería ser ambiguo')
    expect(r.candidates).toHaveLength(2)
    // Lo importante: no hay ninguna clave elegida en la respuesta.
    expect(r).not.toHaveProperty('key')
  })

  it('un ticker que nadie usa se declara desconocido, no ambiguo', () => {
    expect(resolveSymbol(indice, 'ZZZZ').status).toBe('unknown')
  })

  it('la ambigüedad se puede enseñar en pantalla', () => {
    const ambiguos = ambiguousSymbols(indice)
    expect(ambiguos.map((a) => a.symbol)).toEqual(['SAN'])
    // Con etiquetas que distinguen a los homónimos.
    expect(ambiguos[0]!.candidates.map(displayLabel)).toEqual(['SAN · BME', 'SAN · TSX'])
  })

  it('sin homónimos no se inventa ninguna advertencia', () => {
    expect(ambiguousSymbols(buildIdentityIndex([activo({ symbol: 'AAPL' })]))).toEqual([])
  })
})

describe('determinismo', () => {
  it('el orden de entrada no cambia las claves ni la lista de ambiguos', () => {
    const items = [
      activo({ symbol: 'SAN', exchange: 'BME' }),
      activo({ symbol: 'AAPL', isin: 'US0378331005' }),
      activo({ symbol: 'SAN', exchange: 'TSX' }),
    ]
    const directo = buildIdentityIndex(items)
    const inverso = buildIdentityIndex([...items].reverse())

    expect([...directo.byKey.keys()].sort()).toEqual([...inverso.byKey.keys()].sort())
    expect(ambiguousSymbols(directo).map((a) => a.symbol)).toEqual(
      ambiguousSymbols(inverso).map((a) => a.symbol),
    )
  })
})
