/**
 * Prueba de cierre de la Fase 2 (LAB-213, LAB-214).
 *
 * Un solo archivo que contesta, criterio a criterio, si la Fase 2 hace lo que
 * dice. Cada `it` lleva el nombre del criterio de la puerta G2 o de la ficha,
 * así que la salida de `npm run verify` **se lee como un informe**: si algo
 * falla, el nombre de la prueba ya dice qué parte del plan no se cumple.
 *
 * No sustituye a las pruebas de cada tarea, que cubren los detalles. Esta cubre
 * las costuras, que es donde las tareas por separado no miran.
 */
import { describe, expect, it } from 'vitest'
import type { InvestmentPolicy } from '../../../lib/lab/domain/investmentPolicy'
import { emptyPolicyDraft } from '../../../lib/lab/schemas/investmentPolicy'
import { activatePolicy } from '../../../lib/lab/analytics/policyActivation'
import { withDerivedBands } from '../../../lib/lab/analytics/policyDerivation'
import { TOLERANCE_QUESTIONS } from '../../../lib/lab/analytics/toleranceBand'
import { weightedCoverage } from '../../../lib/lab/data/quality'
import { assessPortfolioQuality } from '../../../lib/lab/data/portfolioQuality'
import { resolveIpsSync, SYNC_MESSAGE, needsUserDecision } from '../../../lib/lab/services/ipsSync'
import { initialLabProfileState } from '../../../state/slices/labProfileSlice'
import { useAppStore } from '../../../state/store'
import { buildLabContext, portfolioKeyOf } from './labContext'

const HOY = '2026-08-11'
const AHORA = `${HOY}T09:00:00Z`

/** Política completa y vigente, montada por el mismo camino que el asistente. */
function politicaVigente(): InvestmentPolicy {
  const answers: Record<string, string> = {}
  for (const pregunta of TOLERANCE_QUESTIONS) {
    answers[pregunta.id] = pregunta.options.find((o) => o.band === 3)!.value
  }
  const borrador = withDerivedBands(
    {
      ...emptyPolicyDraft('ips-1', HOY),
      goals: [
        {
          id: 'g1',
          name: 'Jubilación',
          priority: 'esencial',
          currency: 'EUR',
          targetAmount: '100000',
          targetDate: '2045-01-01',
          dateFlexible: true,
          amountFlexible: true,
        },
      ],
      assessment: {
        tolerance: { answers },
        capacity: {
          horizonYears: 20,
          emergencyFundMonths: 12,
          incomeStability: 'estable',
          dependents: 0,
          shareOfNetWorth: 0.2,
        },
      },
      acknowledgements: [{ kind: 'perfil-confirmado', acknowledgedAt: AHORA }],
    },
    AHORA,
  )
  return activatePolicy(borrador, HOY)
}

/* ── G2: IPS versionada ───────────────────────────────────────────────────── */

describe('G2 · la IPS está versionada y la vigente es inmutable', () => {
  it('una política activa lleva versión, vigencia y fecha de revisión', () => {
    const activa = politicaVigente()
    expect(activa.version).toBe(1)
    expect(activa.status).toBe('active')
    expect(activa.effectiveFrom).toBe(HOY)
    expect(activa.nextReviewAt).toBe('2027-08-11')
  })

  it('el riesgo efectivo es el menor entre tolerancia y capacidad', () => {
    const activa = politicaVigente()
    expect(activa.assessment.tolerance.band).toBe(3)
    // Cuatro de los cinco hechos están en su mejor caso; el peso en el
    // patrimonio (20 %) es el que pone el techo en 4.
    expect(activa.assessment.capacity.band).toBe(4)
    expect(activa.effectiveRisk).toBe(3)
  })
})

/* ── G2: ninguna banda se inventa ─────────────────────────────────────────── */

describe('G2 · ningún hueco se rellena con un valor medio', () => {
  it('sin los cinco hechos no hay capacidad, y sin capacidad no hay riesgo efectivo', () => {
    const aMedias = withDerivedBands(
      {
        ...politicaVigente(),
        assessment: {
          ...politicaVigente().assessment,
          capacity: { horizonYears: 20, emergencyFundMonths: 12 },
        },
      },
      AHORA,
    )
    expect(aMedias.assessment.capacity.band).toBeUndefined()
    expect(aMedias.effectiveRisk).toBeUndefined()
  })

  it('una tolerancia declarada no produce capacidad por sí sola', () => {
    const sinCapacidad = withDerivedBands(
      { ...emptyPolicyDraft('x', HOY), assessment: { tolerance: politicaVigente().assessment.tolerance, capacity: {} } },
      AHORA,
    )
    expect(sinCapacidad.assessment.tolerance.band).toBe(3)
    expect(sinCapacidad.assessment.capacity.band).toBeUndefined()
  })
})

/* ── G2: calidad visible, ausente ≠ cero ──────────────────────────────────── */

describe('G2 · la calidad de los datos es visible y un ausente no es un cero', () => {
  it('una posición sin valor conocido no entra en la cobertura como cero', () => {
    const cobertura = weightedCoverage([
      { entityId: 'a', value: 1000, valid: true },
      { entityId: 'b', value: null, valid: false },
    ])
    expect(cobertura.covered).toBe(1)
    expect(cobertura.unknownValueEntities).toEqual(['b'])
  })

  it('sin capital conocido la cobertura es «no se puede», no cero', () => {
    expect(weightedCoverage([]).covered).toBeNull()
  })

  it('el informe de una cartera vacía no inventa cálculos utilizables', () => {
    const informe = assessPortfolioQuality(
      { positions: [], quotes: {}, fxRates: [], displayCurrency: 'EUR' },
      AHORA,
    )
    expect(informe.calculations.every((c) => c.usable)).toBe(false)
  })
})

/* ── LAB-213: cabecera de contexto ────────────────────────────────────────── */

describe('LAB-213 · la cabecera dice sobre qué datos se está mirando', () => {
  it('con política vigente muestra riesgo efectivo y estado completo', () => {
    const contexto = buildLabContext({
      assetIds: ['a', 'b'],
      currency: 'EUR',
      policy: politicaVigente(),
      quality: null,
      today: HOY,
    })
    expect(contexto.riskProfile).toBe('Media')
    expect(contexto.ipsStatus).toBe('completa')
    expect(contexto.portfolioName).toBe('2 posiciones')
  })

  it('una política caducada se dice caducada, no completa', () => {
    const contexto = buildLabContext({
      assetIds: ['a'],
      currency: 'EUR',
      policy: politicaVigente(),
      quality: null,
      today: '2028-01-01',
    })
    expect(contexto.ipsStatus).toBe('caducada')
  })

  it('lo que no tiene fuente se omite, para que se pinte «No disponible»', () => {
    const contexto = buildLabContext({
      assetIds: [],
      currency: 'EUR',
      policy: null,
      quality: null,
      today: HOY,
    })
    expect(contexto.riskProfile).toBeUndefined()
    expect(contexto.ipsStatus).toBeUndefined()
    expect(contexto.dataQuality).toBeUndefined()
    expect(contexto.portfolioName).toBeUndefined()
  })

  it('ACEPTACIÓN · no se pueden mezclar dos carteras: cada contexto lleva su huella', () => {
    const uno = buildLabContext({ assetIds: ['a', 'b'], currency: 'EUR', policy: null, quality: null, today: HOY })
    const otro = buildLabContext({ assetIds: ['c'], currency: 'EUR', policy: null, quality: null, today: HOY })

    expect(uno.portfolioKey).not.toBe(otro.portfolioKey)
    // Y la huella no depende del orden en que lleguen los activos.
    expect(portfolioKeyOf(['b', 'a'], 'EUR')).toBe(portfolioKeyOf(['a', 'b'], 'EUR'))
    // Cambiar de moneda también es cambiar de contexto.
    expect(portfolioKeyOf(['a'], 'USD')).not.toBe(portfolioKeyOf(['a'], 'EUR'))
  })
})

/* ── LAB-214: sincronización sin pérdidas ─────────────────────────────────── */

describe('LAB-214 · la nube es opcional y nunca pierde trabajo en silencio', () => {
  const local = politicaVigente()

  it('sin sesión no se sube nada y lo local se queda intacto', () => {
    const decision = resolveIpsSync(local, null, null)
    expect(decision.action).toBe('noop')
  })

  it('offline: sin copia remota, la local manda y se sube al reconectar', () => {
    expect(resolveIpsSync(local, null, 'u1')).toMatchObject({ action: 'push', reason: 'remote_absent' })
  })

  it('un dispositivo nuevo se descarga la política de la nube', () => {
    expect(resolveIpsSync(null, { ...local, userId: 'u1' }, 'u1')).toMatchObject({
      action: 'pull',
      reason: 'local_absent',
    })
  })

  it('gana la versión más alta, en el sentido que toque', () => {
    const remotoViejo = { ...local, userId: 'u1', version: 1 }
    const localNuevo = { ...local, version: 2 }
    expect(resolveIpsSync(localNuevo, remotoViejo, 'u1').action).toBe('push')
    expect(resolveIpsSync(remotoViejo, { ...local, userId: 'u1', version: 3 }, 'u1').action).toBe('pull')
  })

  it('ACEPTACIÓN · misma versión editada en dos sitios: conflicto, nunca sobrescritura', () => {
    const otro = { ...local, userId: 'u1', goals: [] }
    const decision = resolveIpsSync(local, otro, 'u1')

    expect(decision.action).toBe('conflict')
    expect(decision.reason).toBe('diverged')
    expect(needsUserDecision(decision)).toBe(true)
    expect(SYNC_MESSAGE.diverged).toContain('elige cuál conservar')
  })

  it('copias idénticas no hacen nada', () => {
    expect(resolveIpsSync(local, { ...local, userId: 'u1' }, 'u1').action).toBe('noop')
  })

  it('la política de otra cuenta no se descarga jamás, aunque venga más nueva', () => {
    const ajena = { ...local, userId: 'otro', version: 99 }
    const decision = resolveIpsSync(local, ajena, 'u1')
    expect(decision.action).toBe('conflict')
    expect(decision.reason).toBe('foreign_owner')
  })

  it('cerrar sesión borra la política del dispositivo, incluido el historial', () => {
    useAppStore.setState({
      labPolicyActive: local,
      labPolicyDraft: local,
      labPolicySuperseded: [local],
    })
    useAppStore.getState().clearAll()

    const estado = useAppStore.getState()
    expect(estado.labPolicyActive).toBeNull()
    expect(estado.labPolicyDraft).toBeNull()
    expect(estado.labPolicySuperseded).toEqual(initialLabProfileState.labPolicySuperseded)
  })
})
