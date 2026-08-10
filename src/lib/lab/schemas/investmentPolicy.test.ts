import { describe, expect, it } from 'vitest'
import type { InvestmentPolicy } from '../domain/investmentPolicy'
import {
  emptyPolicyDraft,
  investmentPolicySchema,
  parseInvestmentPolicy,
  portfolioConstraintSchema,
} from './investmentPolicy'

const BORRADOR = emptyPolicyDraft('ips-1', '2026-08-10')

/** Política completa y coherente: capacidad medida, objetivo y confirmación. */
const ACTIVA: InvestmentPolicy = {
  ...BORRADOR,
  status: 'active',
  nextReviewAt: '2027-08-10',
  assessment: {
    tolerance: { answers: { q1: 'b' }, band: 4, assessedAt: '2026-08-10T00:00:00Z' },
    capacity: {
      horizonYears: 12,
      emergencyFundMonths: 6,
      incomeStability: 'estable',
      dependents: 0,
      shareOfNetWorth: 0.4,
      band: 3,
      assessedAt: '2026-08-10T00:00:00Z',
    },
    need: { band: 5, derivedFrom: 'goals', assessedAt: '2026-08-10T00:00:00Z' },
  },
  effectiveRisk: 3,
  goals: [
    {
      id: 'g1',
      name: 'Entrada de una casa',
      priority: 'esencial',
      currency: 'EUR',
      targetAmount: '60000',
      targetDate: '2032-01-01',
      dateFlexible: true,
      amountFlexible: false,
    },
  ],
  acknowledgements: [{ kind: 'perfil-confirmado', acknowledgedAt: '2026-08-10T00:00:00Z' }],
}

/** Copia con un campo cambiado, sin mutar el original. */
function con<T extends object>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch }
}

/**
 * Copia sin una clave. Con `exactOptionalPropertyTypes` activo, poner
 * `undefined` no equivale a omitir: hay que quitarla de verdad.
 */
function sin<T extends object, K extends keyof T>(base: T, clave: K): Omit<T, K> {
  const { [clave]: _descartado, ...resto } = base
  return resto
}

describe('políticas válidas', () => {
  it('acepta un borrador recién creado', () => {
    expect(parseInvestmentPolicy(BORRADOR).success).toBe(true)
  })

  it('un borrador nace sin capacidad ni riesgo efectivo', () => {
    expect(BORRADOR.status).toBe('draft')
    expect(BORRADOR.assessment.capacity.band).toBeUndefined()
    expect(BORRADOR.effectiveRisk).toBeUndefined()
  })

  it('acepta una política activa completa', () => {
    const resultado = parseInvestmentPolicy(ACTIVA)
    expect(resultado.success).toBe(true)
  })

  it('sobrevive a una vuelta por JSON sin perder nada', () => {
    const ida = JSON.parse(JSON.stringify(ACTIVA)) as unknown
    const resultado = investmentPolicySchema.safeParse(ida)
    expect(resultado.success).toBe(true)
    if (resultado.success) expect(resultado.data).toEqual(ACTIVA)
  })
})

describe('ningún número no finito entra', () => {
  // `z.number()` rechaza NaN por sí solo, pero acepta Infinity: de ahí `.finite()`.
  const noFinitos = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

  it('los rechaza en la banda de tolerancia', () => {
    for (const valor of noFinitos) {
      const rota = con(ACTIVA, {
        assessment: {
          ...ACTIVA.assessment,
          tolerance: { ...ACTIVA.assessment.tolerance, band: valor as never },
        },
      })
      expect(parseInvestmentPolicy(rota).success).toBe(false)
    }
  })

  it('los rechaza en los hechos de capacidad', () => {
    for (const valor of noFinitos) {
      const rota = con(ACTIVA, {
        assessment: {
          ...ACTIVA.assessment,
          capacity: { ...ACTIVA.assessment.capacity, horizonYears: valor },
        },
      })
      expect(parseInvestmentPolicy(rota).success).toBe(false)
    }
  })

  it('los rechaza en supuestos y en la versión de esquema', () => {
    for (const valor of noFinitos) {
      expect(parseInvestmentPolicy(con(ACTIVA, { assumptions: { inflation: valor } })).success).toBe(
        false,
      )
      expect(parseInvestmentPolicy(con(ACTIVA, { version: valor })).success).toBe(false)
    }
  })

  it('los rechaza dentro de una restricción', () => {
    for (const valor of noFinitos) {
      expect(
        portfolioConstraintSchema.safeParse({ kind: 'turnover', max: valor }).success,
      ).toBe(false)
    }
  })

  it('un importe con texto no numérico no cuela', () => {
    for (const importe of ['', 'Infinity', 'NaN', '1e400', '12,5', 'abc']) {
      const rota = con(ACTIVA, {
        goals: [{ ...ACTIVA.goals[0]!, targetAmount: importe }],
      })
      expect(parseInvestmentPolicy(rota).success).toBe(false)
    }
  })
})

describe('los pesos viven en 0–1', () => {
  it('rechaza pesos fuera de rango, incluido el clásico 50 por 0,5', () => {
    for (const valor of [-0.01, 1.01, 50, 100, -1]) {
      expect(
        portfolioConstraintSchema.safeParse({ kind: 'liquidity', minimumLiquidWeight: valor })
          .success,
      ).toBe(false)
    }
  })

  it('acepta los extremos exactos', () => {
    for (const valor of [0, 1]) {
      expect(
        portfolioConstraintSchema.safeParse({ kind: 'liquidity', minimumLiquidWeight: valor })
          .success,
      ).toBe(true)
    }
  })

  it('rechaza un mínimo mayor que su máximo', () => {
    expect(
      portfolioConstraintSchema.safeParse({
        kind: 'assetWeight',
        instrumentId: 'a1',
        min: 0.6,
        max: 0.4,
      }).success,
    ).toBe(false)
    expect(
      portfolioConstraintSchema.safeParse({
        kind: 'assetWeight',
        instrumentId: 'a1',
        min: 0.4,
        max: 0.6,
      }).success,
    ).toBe(true)
  })

  it('rechaza un tipo de restricción desconocido', () => {
    expect(portfolioConstraintSchema.safeParse({ kind: 'inventada', max: 0.5 }).success).toBe(false)
  })
})

describe('fechas', () => {
  it('rechaza formatos que no son YYYY-MM-DD', () => {
    for (const fecha of ['10-08-2026', '2026/08/10', '2026-8-10', 'ayer', '']) {
      expect(parseInvestmentPolicy(con(ACTIVA, { effectiveFrom: fecha })).success).toBe(false)
    }
  })

  it('rechaza una fecha con forma correcta que no existe', () => {
    for (const fecha of ['2026-02-30', '2026-13-01', '2026-00-10']) {
      expect(parseInvestmentPolicy(con(ACTIVA, { effectiveFrom: fecha })).success).toBe(false)
    }
  })

  it('rechaza una revisión anterior a la entrada en vigor', () => {
    expect(parseInvestmentPolicy(con(ACTIVA, { nextReviewAt: '2026-08-09' })).success).toBe(false)
    expect(parseInvestmentPolicy(con(ACTIVA, { nextReviewAt: '2026-08-10' })).success).toBe(true)
  })
})

describe('la capacidad no se deduce de la tolerancia', () => {
  it('no hay riesgo efectivo sin capacidad medida', () => {
    const rota = con(ACTIVA, {
      assessment: { ...ACTIVA.assessment, capacity: {} },
      effectiveRisk: 4,
    })
    const resultado = parseInvestmentPolicy(rota)
    expect(resultado.success).toBe(false)
    if (!resultado.success) {
      expect(JSON.stringify(resultado.error.issues)).toMatch(/no se deduce de la tolerancia/)
    }
  })

  it('la capacidad no puede tener banda sin todos sus hechos objetivos', () => {
    const rota = sin(
      con(ACTIVA, {
        assessment: { ...ACTIVA.assessment, capacity: { horizonYears: 10, band: 4 } },
      }),
      'effectiveRisk',
    )
    expect(parseInvestmentPolicy(rota).success).toBe(false)
  })

  it('una tolerancia alta con capacidad ausente sigue siendo un borrador válido', () => {
    const borrador = con(BORRADOR, {
      assessment: {
        tolerance: { answers: { q1: 'e' }, band: 5, assessedAt: '2026-08-10T00:00:00Z' },
        capacity: {},
      },
    })
    expect(parseInvestmentPolicy(borrador).success).toBe(true)
    expect(borrador.effectiveRisk).toBeUndefined()
  })
})

describe('una política activa exige estar completa', () => {
  it('no se activa sin objetivos', () => {
    expect(parseInvestmentPolicy(con(ACTIVA, { goals: [] })).success).toBe(false)
  })

  it('no se activa sin confirmación explícita', () => {
    expect(parseInvestmentPolicy(con(ACTIVA, { acknowledgements: [] })).success).toBe(false)
  })

  it('no se activa sin riesgo efectivo', () => {
    expect(parseInvestmentPolicy(sin(ACTIVA, 'effectiveRisk')).success).toBe(false)
  })

  it('rechaza dos objetivos con el mismo identificador', () => {
    const rota = con(ACTIVA, {
      goals: [ACTIVA.goals[0]!, { ...ACTIVA.goals[0]!, name: 'Otro' }],
    })
    expect(parseInvestmentPolicy(rota).success).toBe(false)
  })
})

describe('bandas de riesgo', () => {
  it('solo admite enteros de 1 a 5', () => {
    for (const banda of [0, 6, 2.5, -1, 3.0001]) {
      const rota = con(ACTIVA, {
        assessment: {
          ...ACTIVA.assessment,
          tolerance: { ...ACTIVA.assessment.tolerance, band: banda as never },
        },
      })
      expect(parseInvestmentPolicy(rota).success).toBe(false)
    }
  })

  it('admite las cinco bandas', () => {
    for (const banda of [1, 2, 3, 4, 5] as const) {
      const valida = con(ACTIVA, {
        assessment: {
          ...ACTIVA.assessment,
          tolerance: { ...ACTIVA.assessment.tolerance, band: banda },
        },
      })
      expect(parseInvestmentPolicy(valida).success).toBe(true)
    }
  })
})
