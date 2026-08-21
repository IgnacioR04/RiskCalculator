/**
 * LAB-1101. Lo que se comprueba es el comportamiento que hace que este modelo
 * sea defendible: que **encoge**, que **recorta** y que **no rellena huecos con
 * ceros**. Un modelo de rentabilidad esperada que extrapola la media histórica
 * es el modo clásico de que una optimización por Sharpe salga concentrada en el
 * activo con más ruido.
 */
import { describe, expect, it } from 'vitest'
import {
  expectedReturns,
  PESO_HISTORICO_POR_DEFECTO,
  PRIORS_POR_DEFECTO,
  RECORTE_POR_DEFECTO,
} from './expectedReturns'

describe('expectedReturns', () => {
  it('encoge la media histórica hacia el prior de su clase', () => {
    const r = expectedReturns({ assetTypes: ['stock'], historicalAnnual: [0.5] })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const esperado =
      PESO_HISTORICO_POR_DEFECTO * 0.5 + (1 - PESO_HISTORICO_POR_DEFECTO) * PRIORS_POR_DEFECTO.stock
    // Y además el recorte lo baja todavía más, que es justo lo que debe pasar
    // con un activo que subió un 50 %: su esperanza no es el 50 %.
    expect(r.mu[0]!).toBe(Math.min(esperado, RECORTE_POR_DEFECTO.max))
    expect(r.mu[0]!).toBeLessThan(0.5)
  })

  it('un activo sin historia se queda con su prior, no con un cero', () => {
    // Un cero diría «no rinde nada», que es una afirmación. La ausencia de
    // historia no afirma nada sobre el activo, solo sobre lo que sabemos.
    const r = expectedReturns({ assetTypes: ['crypto'], historicalAnnual: [null] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mu[0]!).toBe(PRIORS_POR_DEFECTO.crypto)
    expect(r.withoutHistory).toBe(1)
  })

  it('recorta por arriba y por abajo', () => {
    const r = expectedReturns({
      assetTypes: ['crypto', 'crypto'],
      historicalAnnual: [10, -10],
      historicalWeight: 1,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mu[0]!).toBe(RECORTE_POR_DEFECTO.max)
    expect(r.mu[1]!).toBe(RECORTE_POR_DEFECTO.min)
  })

  it('con peso 0 el histórico no interviene', () => {
    const r = expectedReturns({
      assetTypes: ['stock', 'cash'],
      historicalAnnual: [0.9, 0.9],
      historicalWeight: 0,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mu).toEqual([PRIORS_POR_DEFECTO.stock, PRIORS_POR_DEFECTO.cash])
  })

  it('un activo manual recibe el prior más prudente, no el de renta variable', () => {
    // No declara clase. Suponerle acciones le regala rentabilidad esperada y el
    // optimizador le daría peso por una clase que nadie afirmó.
    const r = expectedReturns({ assetTypes: ['manual'], historicalAnnual: [null] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mu[0]!).toBe(PRIORS_POR_DEFECTO.manual)
    expect(r.mu[0]!).toBeLessThan(PRIORS_POR_DEFECTO.stock)
  })

  it('avisa cuando hay instrumentos que solo llevan prior', () => {
    const r = expectedReturns({
      assetTypes: ['stock', 'stock', 'crypto'],
      historicalAnnual: [0.05, null, null],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.withoutHistory).toBe(2)
    expect(r.assumptions.some((a) => a.label.includes('2 de 3'))).toBe(true)
  })

  it('siempre declara que esto es una hipótesis, no un dato', () => {
    const r = expectedReturns({ assetTypes: ['stock'], historicalAnnual: [0.05] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.assumptions[0]!.label).toMatch(/hipótesis, no un dato/)
  })

  it('rechaza entradas incoherentes en vez de completarlas', () => {
    expect(expectedReturns({ assetTypes: [], historicalAnnual: [] })).toEqual({
      ok: false,
      reason: 'empty_universe',
    })
    expect(expectedReturns({ assetTypes: ['stock'], historicalAnnual: [] })).toEqual({
      ok: false,
      reason: 'length_mismatch',
    })
    expect(
      expectedReturns({ assetTypes: ['stock'], historicalAnnual: [0.05], historicalWeight: 2 }),
    ).toEqual({ ok: false, reason: 'invalid_weight' })
  })

  it('es reproducible', () => {
    const entrada = { assetTypes: ['stock', 'crypto'] as const, historicalAnnual: [0.05, 0.3] }
    expect(expectedReturns(entrada)).toEqual(expectedReturns(entrada))
  })
})
