/**
 * LAB-1103. El defecto que estas pruebas fijan: el optimizador solo impone
 * cajas por activo, así que un tope de sector, una posición bloqueada, un plan
 * de solo aportaciones o un límite de rotación **no los vigila nadie mientras
 * resuelve**. Antes salían —cuando salían— como texto en una lista, y una lista
 * de textos no impide que una cartera se presente como factible.
 *
 * Las tres últimas ni siquiera aparecían: `violations` solo mira `bounds`, y
 * `lockedPosition`, `contributionsOnly` y `maxTurnover` no son bounds. Una
 * candidata que vendiera una posición bloqueada salía con cero incumplimientos.
 */
import { describe, expect, it } from 'vitest'
import { compileConstraints, type CompilerInstrument } from './constraintCompiler'
import { candidateEligibility, enforcementReport } from './eligibility'

function universo(pesos: readonly number[], sectores?: readonly (string | undefined)[]): CompilerInstrument[] {
  return pesos.map((w, i) => ({
    id: `a${i}`,
    symbol: `A${i}`,
    dimensions: sectores?.[i] === undefined ? {} : { sector: sectores[i]! },
    currentWeight: w,
  }))
}

describe('qué puede imponer el solver', () => {
  it('un límite de un solo activo es una caja: el solver lo respeta siempre', () => {
    const compiled = compileConstraints(
      [{ kind: 'assetWeight', instrumentId: 'a0', min: 0, max: 0.3 }],
      universo([0.5, 0.5]),
    )
    const informe = enforcementReport(compiled)
    expect(informe.items.find((i) => i.id === 'asset:a0')?.kind).toBe('box')
    expect(informe.hardCheckedAfter).toHaveLength(0)
  })

  it('un tope de grupo NO es una caja, y se declara como tal', () => {
    // Repartir el margen de un grupo entre sus miembros es parte del problema,
    // no de la proyección. Decir lo contrario sería prometer algo que no ocurre.
    const compiled = compileConstraints(
      [{ kind: 'groupWeight', dimension: 'sector', key: 'Tecnología', min: 0, max: 0.3 }],
      universo([0.4, 0.4, 0.2], ['Tecnología', 'Tecnología', 'Salud']),
    )
    const informe = enforcementReport(compiled)
    expect(informe.items.find((i) => i.id.startsWith('group:'))?.kind).toBe('checked_after')
    expect(informe.hardCheckedAfter).toHaveLength(1)
  })

  it('un grupo con techo cero sí es una caja', () => {
    // Equivale a poner a cero cada miembro, y eso sí cabe en la proyección.
    const compiled = compileConstraints(
      [{ kind: 'groupWeight', dimension: 'sector', key: 'Tabaco', min: 0, max: 0 }],
      universo([0.5, 0.5], ['Tabaco', 'Salud']),
    )
    expect(enforcementReport(compiled).hardCheckedAfter).toHaveLength(0)
  })

  it('bloqueos, solo aportaciones y rotación se comprueban después', () => {
    const compiled = compileConstraints(
      [
        { kind: 'lockedPosition', instrumentId: 'a0' },
        { kind: 'contributionsOnly', enabled: true },
        { kind: 'turnover', max: 0.1 },
      ],
      universo([0.5, 0.5]),
    )
    const ids = enforcementReport(compiled).hardCheckedAfter.map((i) => i.id)
    expect(ids).toContain('locked:0')
    expect(ids).toContain('contributionsOnly')
    expect(ids).toContain('turnover')
  })
})

describe('elegibilidad de una candidata', () => {
  it('un tope de sector incumplido la deja fuera, no solo con un texto', () => {
    const compiled = compileConstraints(
      [{ kind: 'groupWeight', dimension: 'sector', key: 'Tecnología', min: 0, max: 0.3 }],
      universo([0.4, 0.4, 0.2], ['Tecnología', 'Tecnología', 'Salud']),
    )
    const r = candidateEligibility(compiled, [0.45, 0.45, 0.1])
    expect(r.eligible).toBe(false)
    expect(r.breaches).toHaveLength(1)
    expect(r.breaches[0]!.detail).toMatch(/90,0 %/)
  })

  it('vender una posición bloqueada la deja fuera', () => {
    // Este caso salía antes con cero incumplimientos.
    const compiled = compileConstraints(
      [{ kind: 'lockedPosition', instrumentId: 'a0' }],
      universo([0.6, 0.4]),
    )
    const r = candidateEligibility(compiled, [0.2, 0.8])
    expect(r.eligible).toBe(false)
    expect(r.breaches.map((b) => b.id)).toContain('locked:0')
  })

  it('mantener o subir una posición bloqueada es correcto', () => {
    const compiled = compileConstraints(
      [{ kind: 'lockedPosition', instrumentId: 'a0' }],
      universo([0.6, 0.4]),
    )
    expect(candidateEligibility(compiled, [0.6, 0.4]).eligible).toBe(true)
    expect(candidateEligibility(compiled, [0.8, 0.2]).eligible).toBe(true)
  })

  it('un plan de solo aportaciones no admite que ninguna posición baje', () => {
    const compiled = compileConstraints(
      [{ kind: 'contributionsOnly', enabled: true }],
      universo([0.5, 0.5]),
    )
    const r = candidateEligibility(compiled, [0.7, 0.3])
    expect(r.eligible).toBe(false)
    expect(r.breaches[0]!.detail).toMatch(/A1/)
  })

  it('pasarse de rotación la deja fuera', () => {
    const compiled = compileConstraints([{ kind: 'turnover', max: 0.1 }], universo([0.5, 0.5]))
    // De 50/50 a 90/10 hay que mover el 40 %.
    const r = candidateEligibility(compiled, [0.9, 0.1])
    expect(r.eligible).toBe(false)
    expect(r.breaches.map((b) => b.id)).toContain('turnover')

    expect(candidateEligibility(compiled, [0.55, 0.45]).eligible).toBe(true)
  })

  it('un límite blando incumplido no la deja fuera, pero se dice', () => {
    // La liquidez se compila como blanda: es un colchón, no una prohibición.
    const compiled = compileConstraints(
      [{ kind: 'liquidity', minimumLiquidWeight: 0.2 }],
      [
        { id: 'a0', symbol: 'EFECTIVO', dimensions: { assetType: 'cash' }, currentWeight: 0.3 },
        { id: 'a1', symbol: 'A1', dimensions: { assetType: 'stock' }, currentWeight: 0.7 },
      ],
    )
    const r = candidateEligibility(compiled, [0.05, 0.95])
    expect(r.eligible).toBe(true)
    expect(r.breaches).toHaveLength(1)
    expect(r.breaches[0]!.severity).toBe('soft')
  })

  it('declara la limitación aunque esta vez se cumpla', () => {
    // Que saliera bien no significa que el motor lo estuviera vigilando, y esa
    // diferencia importa para saber cuánto fiarse del resultado siguiente.
    const compiled = compileConstraints(
      [{ kind: 'groupWeight', dimension: 'sector', key: 'Tecnología', min: 0, max: 0.5 }],
      // Dos miembros en el grupo: con uno solo el límite se convierte en una
      // caja y el solver sí lo impone, que es el caso contrario al que se prueba.
      universo([0.2, 0.2, 0.6], ['Tecnología', 'Tecnología', 'Salud']),
    )
    const r = candidateEligibility(compiled, [0.2, 0.2, 0.6])
    expect(r.eligible).toBe(true)
    expect(r.breaches).toHaveLength(0)
    expect(r.limitations).toHaveLength(1)
    expect(r.limitations[0]).toMatch(/no la impone el optimizador/)
  })

  it('sin pesos no es elegible: la ausencia de solución no es una solución', () => {
    const compiled = compileConstraints([], universo([0.5, 0.5]))
    const r = candidateEligibility(compiled, null)
    expect(r.eligible).toBe(false)
  })
})
