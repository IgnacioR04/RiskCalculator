/**
 * Pruebas de la aritmética de divisa extraída del monolito (LAB-304).
 *
 * Estas funciones estaban dentro de un componente de 919 líneas que tocaba red:
 * probarlas exigía mocks de proveedor. Separadas, se prueban con números.
 */
import { describe, expect, it } from 'vitest'
import { convertPriceSeries, rateAt } from './fx'

const CAMBIOS = [
  { date: '2026-01-01', rate: 1.1 },
  { date: '2026-01-03', rate: 1.2 },
]

describe('rateAt', () => {
  it('usa el tipo del día cuando existe', () => {
    expect(rateAt(CAMBIOS, '2026-01-03')).toBe(1.2)
  })

  it('ACEPTACIÓN · un día sin tipo usa el último conocido, no cero', () => {
    // El 2 de enero no hay dato: se arrastra el del 1, que es lo último cierto.
    expect(rateAt(CAMBIOS, '2026-01-02')).toBe(1.1)
    expect(rateAt(CAMBIOS, '2026-01-02')).not.toBe(0)
  })

  it('antes del primer tipo conocido no se inventa ninguno', () => {
    expect(rateAt(CAMBIOS, '2025-12-31')).toBeNull()
  })

  it('sin ningún tipo tampoco', () => {
    expect(rateAt([], '2026-01-01')).toBeNull()
  })
})

describe('convertPriceSeries', () => {
  const serie = [
    { date: '2026-01-01', close: 100 },
    { date: '2026-01-02', close: 200 },
  ]

  it('multiplica cada cierre por el tipo de su día', () => {
    const salida = convertPriceSeries(serie, CAMBIOS)
    // `toBeCloseTo` y no `toEqual`: 100 × 1,1 da 110,00000000000001 en binario,
    // y exigir igualdad exacta probaría la coma flotante, no la conversión.
    expect(salida[0]?.close).toBeCloseTo(110, 9)
    expect(salida[1]?.close).toBeCloseTo(220, 9)
  })

  it('ACEPTACIÓN · un punto sin tipo se descarta, no se cuela como cero', () => {
    const salida = convertPriceSeries(serie, [{ date: '2026-01-02', rate: 2 }])
    // El día 1 queda fuera porque no hay cambio anterior: un cierre a 0
    // fabricaría una caída del 100 % que nunca ocurrió.
    expect(salida).toHaveLength(1)
    expect(salida[0]?.date).toBe('2026-01-02')
    expect(salida[0]?.close).toBeCloseTo(400, 9)
  })

  it('sin ningún tipo la serie queda vacía, no a cero', () => {
    expect(convertPriceSeries(serie, [])).toEqual([])
  })
})
