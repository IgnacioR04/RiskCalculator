/**
 * Pruebas de las contradicciones entre restricciones (LAB-209).
 *
 * La ficha de la tarea pide «límites incompatibles», y eso es exactamente lo que
 * se comprueba: pares de restricciones que por separado son válidas y juntas no
 * dejan ninguna cartera posible.
 */
import { describe, expect, it } from 'vitest'
import type { PortfolioConstraint } from '../domain/investmentPolicy'
import { findConstraintIssues, hasBlockingConstraintIssues } from './constraintConsistency'

function codigos(constraints: readonly PortfolioConstraint[]) {
  return findConstraintIssues(constraints).map((issue) => issue.code)
}

describe('sin restricciones no hay contradicción', () => {
  it('una lista vacía no produce nada', () => {
    expect(findConstraintIssues([])).toEqual([])
    expect(hasBlockingConstraintIssues([])).toBe(false)
  })

  it('un conjunto coherente pasa limpio', () => {
    const coherentes: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'sector', key: 'tecnología', max: 0.3 },
      { kind: 'groupWeight', dimension: 'sector', key: 'energía', min: 0.05, max: 0.2 },
      { kind: 'liquidity', minimumLiquidWeight: 0.1 },
      { kind: 'turnover', max: 0.25 },
    ]
    expect(findConstraintIssues(coherentes)).toEqual([])
  })
})

describe('un mínimo por encima de su máximo', () => {
  it('se detecta y bloquea', () => {
    const rota: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'region', key: 'europa', min: 0.6, max: 0.3 },
    ]
    const issues = findConstraintIssues(rota)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('min_over_max')
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.indices).toEqual([0])
    expect(issues[0]?.message).toContain('60 %')
    expect(issues[0]?.message).toContain('30 %')
  })

  it('un mínimo igual al máximo es un peso fijo, no una contradicción', () => {
    expect(
      codigos([{ kind: 'assetWeight', instrumentId: 'a', min: 0.25, max: 0.25 }]),
    ).toEqual([])
  })
})

describe('restricciones repetidas', () => {
  it('solo puede haber una de liquidez, rotación, universo o «solo aportaciones»', () => {
    const dobles: PortfolioConstraint[] = [
      { kind: 'liquidity', minimumLiquidWeight: 0.1 },
      { kind: 'liquidity', minimumLiquidWeight: 0.3 },
    ]
    const issues = findConstraintIssues(dobles)
    expect(issues.map((i) => i.code)).toEqual(['duplicate_singleton'])
    expect(issues[0]?.indices).toEqual([0, 1])
  })

  it('dos reglas sobre el mismo grupo se señalan aunque sean compatibles', () => {
    const dobles: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'sector', key: 'banca', max: 0.3 },
      { kind: 'groupWeight', dimension: 'sector', key: 'banca', max: 0.2 },
    ]
    expect(codigos(dobles)).toEqual(['duplicate_target'])
  })

  it('el mismo nombre en dimensiones distintas no es el mismo objetivo', () => {
    const distintas: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'sector', key: 'EUR', max: 0.3 },
      { kind: 'groupWeight', dimension: 'currency', key: 'EUR', max: 0.5 },
    ]
    expect(codigos(distintas)).toEqual([])
  })

  it('dos activos distintos no se estorban', () => {
    const distintos: PortfolioConstraint[] = [
      { kind: 'assetWeight', instrumentId: 'a', max: 0.2 },
      { kind: 'assetWeight', instrumentId: 'b', max: 0.2 },
    ]
    expect(codigos(distintos)).toEqual([])
  })
})

describe('mínimos que no caben en la cartera', () => {
  it('los mínimos de una misma dimensión no pueden pasar del 100 %', () => {
    const imposible: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'region', key: 'europa', min: 0.6 },
      { kind: 'groupWeight', dimension: 'region', key: 'américa', min: 0.5 },
    ]
    const issues = findConstraintIssues(imposible)
    expect(issues.map((i) => i.code)).toEqual(['minimums_exceed_whole'])
    expect(issues[0]?.message).toContain('110 %')
  })

  it('sumar justo el 100 % es posible y no se marca', () => {
    const justo: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'region', key: 'europa', min: 0.5 },
      { kind: 'groupWeight', dimension: 'region', key: 'américa', min: 0.5 },
    ]
    expect(codigos(justo)).toEqual([])
  })

  it('tres décimas en coma flotante no inventan una contradicción', () => {
    // 0,1 + 0,2 + 0,7 da 1,0000000000000002 en binario. Sin margen, esto
    // sería un falso positivo.
    const justo: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'sector', key: 'a', min: 0.1 },
      { kind: 'groupWeight', dimension: 'sector', key: 'b', min: 0.2 },
      { kind: 'groupWeight', dimension: 'sector', key: 'c', min: 0.7 },
    ]
    expect(codigos(justo)).toEqual([])
  })

  it('dimensiones distintas no se suman entre sí: un activo tiene las dos a la vez', () => {
    const solapadas: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'sector', key: 'tecnología', min: 0.8 },
      { kind: 'groupWeight', dimension: 'currency', key: 'USD', min: 0.8 },
    ]
    expect(codigos(solapadas)).toEqual([])
  })

  it('los mínimos por activo también se suman', () => {
    const imposible: PortfolioConstraint[] = [
      { kind: 'assetWeight', instrumentId: 'a', min: 0.7 },
      { kind: 'assetWeight', instrumentId: 'b', min: 0.4 },
    ]
    expect(codigos(imposible)).toEqual(['minimums_exceed_whole'])
  })
})

describe('bloqueado y liquidez', () => {
  it('lo bloqueado más la liquidez mínima no puede pasar del 100 %', () => {
    const imposible: PortfolioConstraint[] = [
      { kind: 'lockedPosition', instrumentId: 'a', weight: 0.6 },
      { kind: 'lockedPosition', instrumentId: 'b', weight: 0.3 },
      { kind: 'liquidity', minimumLiquidWeight: 0.2 },
    ]
    const issues = findConstraintIssues(imposible)
    expect(issues.map((i) => i.code)).toEqual(['locked_and_liquidity_exceed_whole'])
    expect(issues[0]?.indices).toEqual([0, 1, 2])
    expect(issues[0]?.message).toContain('110 %')
  })

  it('sin liquidez mínima, lo bloqueado solo se compara consigo mismo', () => {
    const imposible: PortfolioConstraint[] = [
      { kind: 'lockedPosition', instrumentId: 'a', weight: 0.7 },
      { kind: 'lockedPosition', instrumentId: 'b', weight: 0.5 },
    ]
    expect(codigos(imposible)).toEqual(['locked_and_liquidity_exceed_whole'])
  })

  it('una posición bloqueada sin peso declarado no suma nada', () => {
    const sinPeso: PortfolioConstraint[] = [
      { kind: 'lockedPosition', instrumentId: 'a' },
      { kind: 'liquidity', minimumLiquidWeight: 0.9 },
    ]
    expect(codigos(sinPeso)).toEqual([])
  })
})

describe('universo elegible', () => {
  it('limitar un activo que el universo deja fuera no tiene efecto', () => {
    const contradictorias: PortfolioConstraint[] = [
      { kind: 'eligibleUniverse', instrumentIds: ['a', 'b'] },
      { kind: 'assetWeight', instrumentId: 'c', max: 0.2 },
    ]
    const issues = findConstraintIssues(contradictorias)
    expect(issues.map((i) => i.code)).toEqual(['target_outside_universe'])
    expect(issues[0]?.indices).toEqual([1])
    expect(issues[0]?.message).toContain('«c»')
  })

  it('lo mismo con una posición bloqueada', () => {
    const contradictorias: PortfolioConstraint[] = [
      { kind: 'eligibleUniverse', instrumentIds: ['a'] },
      { kind: 'lockedPosition', instrumentId: 'z', weight: 0.1 },
    ]
    expect(codigos(contradictorias)).toEqual(['target_outside_universe'])
  })

  it('sin universo declarado no se limita a nadie', () => {
    expect(codigos([{ kind: 'assetWeight', instrumentId: 'c', max: 0.2 }])).toEqual([])
  })

  it('dentro del universo no hay nada que decir', () => {
    const coherentes: PortfolioConstraint[] = [
      { kind: 'eligibleUniverse', instrumentIds: ['a', 'b'] },
      { kind: 'assetWeight', instrumentId: 'a', max: 0.2 },
    ]
    expect(codigos(coherentes)).toEqual([])
  })
})

describe('un máximo del 0 % es una exclusión', () => {
  it('se avisa, pero no bloquea: puede ser justo lo que se quería', () => {
    const excluyente: PortfolioConstraint[] = [
      { kind: 'groupWeight', dimension: 'sector', key: 'tabaco', max: 0 },
    ]
    const issues = findConstraintIssues(excluyente)
    expect(issues.map((i) => i.code)).toEqual(['max_zero_is_exclusion'])
    expect(issues[0]?.severity).toBe('warning')
    expect(hasBlockingConstraintIssues(excluyente)).toBe(false)
  })
})

describe('bloqueo de la activación', () => {
  it('un error bloquea', () => {
    expect(
      hasBlockingConstraintIssues([
        { kind: 'assetWeight', instrumentId: 'a', min: 0.9, max: 0.1 },
      ]),
    ).toBe(true)
  })

  it('el resultado es estable entre ejecuciones', () => {
    const lio: PortfolioConstraint[] = [
      { kind: 'assetWeight', instrumentId: 'a', min: 0.9, max: 0.1 },
      { kind: 'liquidity', minimumLiquidWeight: 0.5 },
      { kind: 'liquidity', minimumLiquidWeight: 0.6 },
      { kind: 'lockedPosition', instrumentId: 'b', weight: 0.9 },
    ]
    expect(findConstraintIssues(lio)).toEqual(findConstraintIssues(lio))
    expect(codigos(lio)).toEqual([
      'min_over_max',
      'duplicate_singleton',
      'locked_and_liquidity_exceed_whole',
    ])
  })
})
