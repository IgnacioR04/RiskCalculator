import { describe, expect, it } from 'vitest'
import { BUILD_INFO, buildSignature } from './buildInfo'

describe('metadatos del build (LAB-005)', () => {
  it('nunca deja un campo vacío: sin dato dice «desconocido»', () => {
    expect(BUILD_INFO.commit).not.toBe('')
    expect(BUILD_INFO.builtAt).not.toBe('')
  })

  it('la firma cabe en una línea y trae las tres piezas', () => {
    const firma = buildSignature({ commit: 'abc1234', builtAt: '2026-08-11T10:00:00Z', mode: 'production' })
    expect(firma).toContain('abc1234')
    expect(firma).toContain('2026-08-11')
    expect(firma).toContain('production')
    expect(firma.split('\n')).toHaveLength(1)
  })

  it('en desarrollo no finge un commit', () => {
    expect(buildSignature({ commit: 'desconocido', builtAt: 'desconocido', mode: 'development' })).toContain(
      'desconocido',
    )
  })
})
