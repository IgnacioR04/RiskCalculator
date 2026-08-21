/**
 * LAB-1104. La distinción que sostiene todo lo demás: `assetType` describe el
 * envoltorio, no la exposición. Darle a un ETF el prior de renta variable le
 * regala un 6,5 % anual a un fondo monetario, y el optimizador le da peso por
 * una razón falsa sin que nada falle.
 */
import { describe, expect, it } from 'vitest'
import { classifyEconomically, COBERTURA_MINIMA_TRANSPARENCIA } from './economicClass'

describe('classifyEconomically', () => {
  it('un ETF no se clasifica solo por ser un ETF', () => {
    const r = classifyEconomically({ assetType: 'etf' })
    expect(r.economicClass).toBeNull()
    expect(r.source).toBe('unknown')
    expect(r.detail).toMatch(/envoltorio/)
  })

  it('un índice tampoco, y un activo manual menos', () => {
    expect(classifyEconomically({ assetType: 'index' }).economicClass).toBeNull()
    expect(classifyEconomically({ assetType: 'manual' }).economicClass).toBeNull()
  })

  it('la clase declarada manda sobre todo lo demás', () => {
    const r = classifyEconomically({ assetType: 'etf', declared: 'bond' })
    expect(r.economicClass).toBe('bond')
    expect(r.source).toBe('declared')
  })

  it('los tipos que sí determinan la exposición se resuelven solos', () => {
    expect(classifyEconomically({ assetType: 'cash' }).economicClass).toBe('cash')
    expect(classifyEconomically({ assetType: 'crypto' }).economicClass).toBe('crypto')
    expect(classifyEconomically({ assetType: 'commodity' }).economicClass).toBe('commodity')
    expect(classifyEconomically({ assetType: 'stock' }).economicClass).toBe('equity')
  })
})

describe('classifyEconomically · transparencia', () => {
  it('deduce la clase de un fondo cuando toda su composición conocida coincide', () => {
    const r = classifyEconomically({
      assetType: 'etf',
      holdings: [
        { economicClass: 'equity', weight: 0.5 },
        { economicClass: 'equity', weight: 0.45 },
        { economicClass: null, weight: 0.05 },
      ],
    })
    expect(r.economicClass).toBe('equity')
    expect(r.source).toBe('lookThrough')
  })

  it('un fondo mixto no «es» la clase mayoritaria', () => {
    // Con el 60 % en acciones, darle el prior de renta variable exageraría su
    // rentabilidad esperada y ocultaría que la mezcla es lo que lo define.
    const r = classifyEconomically({
      assetType: 'etf',
      holdings: [
        { economicClass: 'equity', weight: 0.6 },
        { economicClass: 'bond', weight: 0.4 },
      ],
    })
    expect(r.economicClass).toBeNull()
  })

  it('con poca composición conocida no deduce nada', () => {
    // Lo que no se ve puede ser de otra clase y cambiar la respuesta.
    const r = classifyEconomically({
      assetType: 'etf',
      holdings: [
        { economicClass: 'equity', weight: COBERTURA_MINIMA_TRANSPARENCIA - 0.1 },
        { economicClass: null, weight: 1 - (COBERTURA_MINIMA_TRANSPARENCIA - 0.1) },
      ],
    })
    expect(r.economicClass).toBeNull()
    expect(r.source).toBe('unknown')
  })

  it('un fondo monetario declarado no recibe el prior de las acciones', () => {
    // El caso concreto que motiva el módulo.
    const monetario = classifyEconomically({
      assetType: 'etf',
      holdings: [{ economicClass: 'cash', weight: 1 }],
    })
    expect(monetario.economicClass).toBe('cash')
  })

  it('una composición vacía o sin pesos no inventa una clase', () => {
    expect(classifyEconomically({ assetType: 'etf', holdings: [] }).economicClass).toBeNull()
    expect(
      classifyEconomically({ assetType: 'etf', holdings: [{ economicClass: 'equity', weight: 0 }] })
        .economicClass,
    ).toBeNull()
  })
})
