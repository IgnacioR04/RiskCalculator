import { describe, expect, it } from 'vitest'
import { RISK_BANDS, type InvestmentPolicy, type RiskBand } from '../domain/investmentPolicy'
import { emptyPolicyDraft } from '../schemas/investmentPolicy'
import {
  CONFLICT_OPTIONS,
  assessPolicy,
  computeEffectiveRisk,
  missingCapacityFacts,
} from './policyAssessment'

const HOY = '2026-08-10'

/** Capacidad con todos sus hechos objetivos presentes. */
function capacidadResuelta(band: RiskBand) {
  return {
    horizonYears: 10,
    emergencyFundMonths: 6,
    incomeStability: 'estable' as const,
    dependents: 0,
    shareOfNetWorth: 0.5,
    band,
    assessedAt: `${HOY}T00:00:00Z`,
  }
}

function politica(opciones: {
  tolerancia: RiskBand
  capacidad?: RiskBand
  necesidad?: RiskBand
  nextReviewAt?: string
  status?: InvestmentPolicy['status']
}): InvestmentPolicy {
  const base = emptyPolicyDraft('ips-1', HOY)
  return {
    ...base,
    status: opciones.status ?? 'active',
    ...(opciones.nextReviewAt !== undefined ? { nextReviewAt: opciones.nextReviewAt } : {}),
    assessment: {
      tolerance: { answers: {}, band: opciones.tolerancia, assessedAt: `${HOY}T00:00:00Z` },
      capacity: opciones.capacidad === undefined ? {} : capacidadResuelta(opciones.capacidad),
      ...(opciones.necesidad === undefined
        ? {}
        : {
            need: {
              band: opciones.necesidad,
              derivedFrom: 'goals' as const,
              assessedAt: `${HOY}T00:00:00Z`,
            },
          }),
    },
  }
}

describe('riesgo efectivo: el mínimo entre tolerancia y capacidad', () => {
  // Tabla completa: las 25 combinaciones posibles.
  it('es exactamente el mínimo en las 25 combinaciones', () => {
    for (const tolerancia of RISK_BANDS) {
      for (const capacidad of RISK_BANDS) {
        const resultado = computeEffectiveRisk(
          politica({ tolerancia, capacidad }).assessment,
        )
        expect(resultado, `t=${tolerancia} c=${capacidad}`).toBe(Math.min(tolerancia, capacidad))
      }
    }
  })

  it('la capacidad manda cuando es la más baja', () => {
    const r = assessPolicy(politica({ tolerancia: 5, capacidad: 2 }), HOY)
    expect(r.effectiveRisk).toBe(2)
    expect(r.reasonCodes).toContain('capacity_limits_tolerance')
  })

  it('la tolerancia manda cuando es la más baja', () => {
    const r = assessPolicy(politica({ tolerancia: 2, capacidad: 5 }), HOY)
    expect(r.effectiveRisk).toBe(2)
    expect(r.reasonCodes).toContain('tolerance_limits_capacity')
  })

  it('distingue el empate', () => {
    const r = assessPolicy(politica({ tolerancia: 3, capacidad: 3 }), HOY)
    expect(r.reasonCodes).toContain('tolerance_matches_capacity')
  })
})

describe('sin capacidad medida no hay riesgo efectivo', () => {
  it('devuelve null aunque la tolerancia sea máxima', () => {
    expect(computeEffectiveRisk(politica({ tolerancia: 5 }).assessment)).toBeNull()
  })

  it('nunca sustituye la capacidad por la tolerancia', () => {
    for (const tolerancia of RISK_BANDS) {
      const r = assessPolicy(politica({ tolerancia }), HOY)
      expect(r.effectiveRisk).toBeNull()
      expect(r.reasonCodes).toContain('capacity_missing')
      expect(r.personalizationAllowed).toBe(false)
    }
  })

  it('tampoco sustituye la tolerancia por la capacidad (LAB-208)', () => {
    for (const capacidad of RISK_BANDS) {
      const conCapacidad = politica({ tolerancia: 3, capacidad })
      const sinTolerancia: InvestmentPolicy = {
        ...conCapacidad,
        assessment: { ...conCapacidad.assessment, tolerance: { answers: {} } },
      }
      const r = assessPolicy(sinTolerancia, HOY)
      expect(computeEffectiveRisk(sinTolerancia.assessment)).toBeNull()
      expect(r.reasonCodes).toContain('tolerance_missing')
      expect(r.reasonCodes).not.toContain('capacity_missing')
      expect(r.personalizationAllowed).toBe(false)
    }
  })

  it('cuando faltan las dos, lo dice de las dos', () => {
    const vacia = emptyPolicyDraft('ips-vacia', HOY)
    const r = assessPolicy(vacia, HOY)
    expect(r.reasonCodes).toContain('capacity_missing')
    expect(r.reasonCodes).toContain('tolerance_missing')
  })

  it('una banda de capacidad sin sus hechos tampoco cuenta', () => {
    const rota = politica({ tolerancia: 4 })
    const conBandaSuelta: InvestmentPolicy = {
      ...rota,
      assessment: { ...rota.assessment, capacity: { band: 4 } },
    }
    expect(computeEffectiveRisk(conBandaSuelta.assessment)).toBeNull()
  })

  it('enumera qué hechos faltan, para poder pedirlos', () => {
    expect(missingCapacityFacts({})).toEqual([
      'horizonYears',
      'emergencyFundMonths',
      'incomeStability',
      'dependents',
      'shareOfNetWorth',
    ])
    expect(missingCapacityFacts({ horizonYears: 5, dependents: 1 })).toEqual([
      'emergencyFundMonths',
      'incomeStability',
      'shareOfNetWorth',
    ])
  })
})

describe('conflicto: la necesidad supera lo efectivo', () => {
  it('lo declara sin tocar el riesgo efectivo', () => {
    const r = assessPolicy(politica({ tolerancia: 3, capacidad: 3, necesidad: 5 }), HOY)
    expect(r.hasConflict).toBe(true)
    expect(r.effectiveRisk).toBe(3)
    expect(r.reasonCodes).toContain('need_exceeds_effective')
  })

  it('ofrece las cinco salidas del plan y ninguna sube el riesgo', () => {
    const r = assessPolicy(politica({ tolerancia: 3, capacidad: 3, necesidad: 5 }), HOY)
    expect(r.conflictOptions).toEqual(CONFLICT_OPTIONS)
    expect(r.conflictOptions).toHaveLength(5)
    expect(JSON.stringify(r.conflictOptions)).not.toMatch(/increase_risk|raise|aumentar_riesgo/)
  })

  it('no hay conflicto si la necesidad cabe dentro de lo efectivo', () => {
    for (const necesidad of [1, 2, 3] as const) {
      const r = assessPolicy(politica({ tolerancia: 4, capacidad: 3, necesidad }), HOY)
      expect(r.hasConflict).toBe(false)
      expect(r.conflictOptions).toEqual([])
    }
  })

  it('sin necesidad declarada no puede haber conflicto', () => {
    const r = assessPolicy(politica({ tolerancia: 3, capacidad: 3 }), HOY)
    expect(r.hasConflict).toBe(false)
    expect(r.reasonCodes).toContain('need_not_assessed')
  })

  it('el conflicto es una situación, no un error: la política sigue usable', () => {
    const r = assessPolicy(politica({ tolerancia: 4, capacidad: 4, necesidad: 5 }), HOY)
    expect(r.hasConflict).toBe(true)
    expect(r.personalizationAllowed).toBe(true)
  })
})

describe('vigencia', () => {
  it('está vigente lejos de la revisión', () => {
    const r = assessPolicy(
      politica({ tolerancia: 3, capacidad: 3, nextReviewAt: '2027-08-10' }),
      HOY,
    )
    expect(r.validity).toBe('vigente')
    expect(r.personalizationAllowed).toBe(true)
  })

  it('avisa dos meses antes', () => {
    const r = assessPolicy(
      politica({ tolerancia: 3, capacidad: 3, nextReviewAt: '2026-09-15' }),
      HOY,
    )
    expect(r.validity).toBe('por-revisar')
    expect(r.reasonCodes).toContain('review_due_soon')
    // Avisar no bloquea.
    expect(r.personalizationAllowed).toBe(true)
  })

  it('caducar suspende la personalización, no el análisis', () => {
    const r = assessPolicy(
      politica({ tolerancia: 3, capacidad: 3, nextReviewAt: '2026-08-09' }),
      HOY,
    )
    expect(r.validity).toBe('caducada')
    expect(r.reasonCodes).toContain('policy_expired')
    expect(r.personalizationAllowed).toBe(false)
    // El riesgo efectivo se sigue conociendo: lo que se suspende es su uso.
    expect(r.effectiveRisk).toBe(3)
  })

  it('un borrador no personaliza aunque todo lo demás esté', () => {
    const r = assessPolicy(
      politica({ tolerancia: 3, capacidad: 3, nextReviewAt: '2027-08-10', status: 'draft' }),
      HOY,
    )
    expect(r.personalizationAllowed).toBe(false)
  })
})

describe('determinismo', () => {
  it('mismos datos producen exactamente los mismos códigos', () => {
    const p = politica({ tolerancia: 4, capacidad: 2, necesidad: 5, nextReviewAt: '2026-09-01' })
    const primera = assessPolicy(p, HOY)
    for (let i = 0; i < 5; i++) {
      expect(assessPolicy(p, HOY)).toEqual(primera)
    }
  })

  it('los códigos salen ordenados de forma estable', () => {
    const r = assessPolicy(
      politica({ tolerancia: 4, capacidad: 2, necesidad: 5, nextReviewAt: '2026-09-01' }),
      HOY,
    )
    expect([...r.reasonCodes].sort()).toEqual(r.reasonCodes)
  })

  it('declara la versión de la regla bajo la que calculó', () => {
    expect(assessPolicy(politica({ tolerancia: 3, capacidad: 3 }), HOY).ruleVersion).toBe(1)
  })

  it('no depende del reloj: la fecha entra como argumento', () => {
    const p = politica({ tolerancia: 3, capacidad: 3, nextReviewAt: '2026-09-01' })
    expect(assessPolicy(p, '2026-06-01').validity).toBe('vigente')
    expect(assessPolicy(p, '2026-08-15').validity).toBe('por-revisar')
    expect(assessPolicy(p, '2026-10-01').validity).toBe('caducada')
  })
})
