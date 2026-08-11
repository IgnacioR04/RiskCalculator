/**
 * Pruebas de activación y versionado (LAB-209).
 *
 * Aquí vive el criterio de aceptación de la tarea: **la política activa es
 * inmutable, y editarla produce un borrador con la versión siguiente**.
 */
import { describe, expect, it } from 'vitest'
import type { InvestmentGoal, InvestmentPolicy } from '../domain/investmentPolicy'
import { emptyPolicyDraft, parseInvestmentPolicy } from '../schemas/investmentPolicy'
import { withDerivedBands } from './policyDerivation'
import { TOLERANCE_QUESTIONS } from './toleranceBand'
import {
  REVIEW_PERIOD_MONTHS,
  activatePolicy,
  activationBlockers,
  addMonths,
  canActivatePolicy,
  nextDraftFrom,
  nextReviewFrom,
  supersedePolicy,
} from './policyActivation'

const HOY = '2026-08-10'
const AHORA = `${HOY}T09:00:00Z`

const OBJETIVO: InvestmentGoal = {
  id: 'goal-1',
  name: 'Entrada de una casa',
  priority: 'esencial',
  currency: 'EUR',
  targetAmount: '40000',
  targetDate: '2032-06-01',
  dateFlexible: false,
  amountFlexible: false,
}

const CAPACIDAD_COMPLETA = {
  horizonYears: 20,
  emergencyFundMonths: 6,
  incomeStability: 'estable' as const,
  dependents: 0,
  shareOfNetWorth: 0.2,
}

function respuestasTolerancia(): Record<string, string> {
  const answers: Record<string, string> = {}
  for (const pregunta of TOLERANCE_QUESTIONS) {
    answers[pregunta.id] = pregunta.options.find((o) => o.band === 3)!.value
  }
  return answers
}

/** Borrador que cumple todo lo que ADR-002 §6 exige para activar. */
function borradorCompleto(cambio: Partial<InvestmentPolicy> = {}): InvestmentPolicy {
  const base = withDerivedBands(
    {
      ...emptyPolicyDraft('ips-1', HOY),
      goals: [OBJETIVO],
      assessment: {
        tolerance: { answers: respuestasTolerancia() },
        capacity: { ...CAPACIDAD_COMPLETA },
      },
      acknowledgements: [{ kind: 'perfil-confirmado', acknowledgedAt: AHORA }],
    },
    AHORA,
  )
  return { ...base, ...cambio }
}

const SIN_LEGADO = { derivedFromLegacy: false }

describe('qué impide activar', () => {
  it('un borrador completo no tiene ningún bloqueo', () => {
    expect(activationBlockers(borradorCompleto(), SIN_LEGADO)).toEqual([])
    expect(canActivatePolicy(borradorCompleto(), SIN_LEGADO)).toBe(true)
  })

  it('un borrador recién creado los tiene casi todos', () => {
    const bloqueos = activationBlockers(emptyPolicyDraft('ips-vacia', HOY), SIN_LEGADO)
    expect(bloqueos).toEqual([
      'no_goals',
      'tolerance_not_assessed',
      'capacity_incomplete',
      'no_effective_risk',
      'not_acknowledged',
    ])
  })

  it('no se corta en el primero: se dicen todos de una vez', () => {
    expect(activationBlockers(emptyPolicyDraft('ips-vacia', HOY), SIN_LEGADO).length).toBe(5)
  })

  it('sin objetivos no se activa, aunque el perfil esté completo', () => {
    expect(activationBlockers(borradorCompleto({ goals: [] }), SIN_LEGADO)).toEqual(['no_goals'])
  })

  it('sin confirmación explícita tampoco', () => {
    expect(activationBlockers(borradorCompleto({ acknowledgements: [] }), SIN_LEGADO)).toEqual([
      'not_acknowledged',
    ])
  })

  it('con restricciones contradictorias tampoco', () => {
    const conLio = borradorCompleto({
      constraints: [{ kind: 'assetWeight', instrumentId: 'a', min: 0.9, max: 0.1 }],
    })
    expect(activationBlockers(conLio, SIN_LEGADO)).toEqual(['constraints_contradictory'])
  })

  it('un aviso de restricción no bloquea', () => {
    const conAviso = borradorCompleto({
      constraints: [{ kind: 'groupWeight', dimension: 'sector', key: 'tabaco', max: 0 }],
    })
    expect(activationBlockers(conAviso, SIN_LEGADO)).toEqual([])
  })

  it('un borrador venido del perfil antiguo y sin confirmar no se activa', () => {
    expect(activationBlockers(borradorCompleto(), { derivedFromLegacy: true })).toEqual([
      'derived_from_legacy_unconfirmed',
    ])
  })

  it('una política ya vigente no se vuelve a activar', () => {
    const activa = activatePolicy(borradorCompleto(), HOY)
    expect(activationBlockers(activa, SIN_LEGADO)).toContain('already_active')
  })
})

describe('sumar meses sin desbordar el mes', () => {
  it.each([
    ['2026-08-10', 12, '2027-08-10'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-31', 12, '2027-01-31'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-12-15', 12, '2027-12-15'],
    ['2024-02-29', 12, '2025-02-28'],
  ])('%s más %i meses es %s', (desde, meses, esperado) => {
    expect(addMonths(desde, meses)).toBe(esperado)
  })

  it('la revisión cae doce meses después', () => {
    expect(nextReviewFrom('2026-08-10')).toBe('2027-08-10')
    expect(REVIEW_PERIOD_MONTHS).toBe(12)
  })

  it('una fecha imposible se rechaza en vez de dar un resultado raro', () => {
    expect(() => addMonths('no-es-una-fecha', 1)).toThrow()
  })
})

describe('activar', () => {
  it('sella la vigencia el día de la activación, no el de creación', () => {
    const borrador = borradorCompleto({ effectiveFrom: '2026-01-01' })
    const activa = activatePolicy(borrador, HOY)

    expect(activa.status).toBe('active')
    expect(activa.effectiveFrom).toBe(HOY)
    expect(activa.reviewedAt).toBe(HOY)
    expect(activa.nextReviewAt).toBe('2027-08-10')
  })

  it('el resultado cumple el contrato de una política activa', () => {
    expect(parseInvestmentPolicy(activatePolicy(borradorCompleto(), HOY)).success).toBe(true)
  })

  it('no toca ni los objetivos ni la evaluación', () => {
    const borrador = borradorCompleto()
    const activa = activatePolicy(borrador, HOY)
    expect(activa.goals).toEqual(borrador.goals)
    expect(activa.assessment).toEqual(borrador.assessment)
    expect(activa.effectiveRisk).toBe(borrador.effectiveRisk)
  })
})

describe('la activa es inmutable: editar crea una versión nueva', () => {
  const activa = activatePolicy(borradorCompleto(), HOY)

  it('el borrador siguiente sube de versión y vuelve a draft', () => {
    const siguiente = nextDraftFrom(activa, 'ips-2', '2026-09-01')
    expect(siguiente.version).toBe(activa.version + 1)
    expect(siguiente.status).toBe('draft')
    expect(siguiente.id).not.toBe(activa.id)
  })

  it('pierde la vigencia y las confirmaciones de la anterior', () => {
    const siguiente = nextDraftFrom(activa, 'ips-2', '2026-09-01')
    expect(siguiente.acknowledgements).toEqual([])
    expect(siguiente.nextReviewAt).toBeUndefined()
    expect(siguiente.reviewedAt).toBeUndefined()
    expect(siguiente.effectiveFrom).toBe('2026-09-01')
  })

  it('se lleva el contenido: objetivos, evaluación y restricciones', () => {
    const conRestricciones = activatePolicy(
      borradorCompleto({ constraints: [{ kind: 'turnover', max: 0.2 }] }),
      HOY,
    )
    const siguiente = nextDraftFrom(conRestricciones, 'ips-2', '2026-09-01')
    expect(siguiente.goals).toEqual(conRestricciones.goals)
    expect(siguiente.assessment).toEqual(conRestricciones.assessment)
    expect(siguiente.constraints).toEqual(conRestricciones.constraints)
  })

  it('no modifica la política vigente: sigue activa y con su versión', () => {
    const antes = JSON.stringify(activa)
    nextDraftFrom(activa, 'ips-2', '2026-09-01')
    expect(JSON.stringify(activa)).toBe(antes)
    expect(activa.status).toBe('active')
  })

  it('el nuevo borrador vuelve a exigir confirmación antes de activarse', () => {
    const siguiente = nextDraftFrom(activa, 'ips-2', '2026-09-01')
    expect(activationBlockers(siguiente, SIN_LEGADO)).toEqual(['not_acknowledged'])
  })
})

describe('retirar una versión', () => {
  it('pasa a superseded sin perder nada más', () => {
    const activa = activatePolicy(borradorCompleto(), HOY)
    const retirada = supersedePolicy(activa)
    expect(retirada.status).toBe('superseded')
    expect({ ...retirada, status: activa.status }).toEqual(activa)
  })

  it('la retirada sigue siendo una política válida: se conserva tal cual', () => {
    const retirada = supersedePolicy(activatePolicy(borradorCompleto(), HOY))
    expect(parseInvestmentPolicy(retirada).success).toBe(true)
  })
})
