import { beforeEach, describe, expect, it } from 'vitest'
import type { RiskProfile } from '../../lib/domain'
import { parseInvestmentPolicy } from '../../lib/lab/schemas/investmentPolicy'
import { migratePersistedState, useAppStore } from '../store'
import {
  canActivate,
  deriveLabPolicyFromLegacy,
  initialLabProfileState,
  migrateLabProfile,
} from './labProfileSlice'

const PERFIL_LEGACY: RiskProfile = {
  version: 1,
  answers: { q1: '2', q2: '3' },
  score: 5,
  category: 'moderado',
  completedAt: '2026-03-15T10:30:00.000Z',
}

/** Estado tal y como lo dejaba la versión 2 del store. */
function estadoV2() {
  return {
    settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
    accounts: [{ id: 'a1', brokerName: 'Broker', accountLabel: 'Principal' }],
    assets: [{ id: 'x1', symbol: 'BTC' }],
    transactions: [{ id: 't1', accountId: 'a1' }],
    quotes: {},
    fxRates: [],
    scenarios: [{ id: 's1' }],
    importBatches: [{ id: 'b1' }],
    riskProfile: PERFIL_LEGACY,
    riskResults: [{ id: 'r1' }],
    demoLoaded: false,
  }
}

describe('derivación desde el perfil antiguo', () => {
  it('traduce la categoría al centro del rango, nunca a los extremos', () => {
    for (const [categoria, banda] of [
      ['conservador', 2],
      ['moderado', 3],
      ['dinamico', 4],
    ] as const) {
      const derivado = deriveLabPolicyFromLegacy({ ...PERFIL_LEGACY, category: categoria })
      expect(derivado?.assessment.tolerance.band).toBe(banda)
    }
  })

  it('no inventa capacidad, objetivos ni restricciones', () => {
    const derivado = deriveLabPolicyFromLegacy(PERFIL_LEGACY)
    expect(derivado?.assessment.capacity).toEqual({})
    expect(derivado?.assessment.need).toBeUndefined()
    expect(derivado?.effectiveRisk).toBeUndefined()
    expect(derivado?.goals).toEqual([])
    expect(derivado?.constraints).toEqual([])
    expect(derivado?.acknowledgements).toEqual([])
  })

  it('nace como borrador, nunca activa', () => {
    expect(deriveLabPolicyFromLegacy(PERFIL_LEGACY)?.status).toBe('draft')
  })

  it('usa la fecha real del perfil y no el reloj', () => {
    const derivado = deriveLabPolicyFromLegacy(PERFIL_LEGACY)
    expect(derivado?.effectiveFrom).toBe('2026-03-15')
    expect(derivado?.assessment.tolerance.assessedAt).toBe(PERFIL_LEGACY.completedAt)
  })

  it('conserva las respuestas originales', () => {
    expect(deriveLabPolicyFromLegacy(PERFIL_LEGACY)?.assessment.tolerance.answers).toEqual(
      PERFIL_LEGACY.answers,
    )
  })

  it('el borrador derivado es una política válida', () => {
    const derivado = deriveLabPolicyFromLegacy(PERFIL_LEGACY)
    expect(parseInvestmentPolicy(derivado).success).toBe(true)
  })

  it('sin perfil no hay borrador', () => {
    expect(deriveLabPolicyFromLegacy(null)).toBeNull()
  })

  it('una categoría desconocida no produce un borrador a medias', () => {
    const raro = { ...PERFIL_LEGACY, category: 'agresivísimo' as never }
    expect(deriveLabPolicyFromLegacy(raro)).toBeNull()
  })
})

describe('migración del estado persistido de v2 a v3', () => {
  it('abre un estado v2 sin perder nada', () => {
    const v2 = estadoV2()
    const migrado = migratePersistedState(v2, 2) as Record<string, unknown>

    // Todo lo que había sigue estando, con el mismo contenido.
    for (const clave of Object.keys(v2)) {
      expect(migrado[clave], `se perdió ${clave}`).toEqual(v2[clave as keyof typeof v2])
    }
  })

  it('el perfil antiguo sigue visible tras migrar', () => {
    const migrado = migratePersistedState(estadoV2(), 2) as Record<string, unknown>
    expect(migrado.riskProfile).toEqual(PERFIL_LEGACY)
  })

  it('deja un borrador derivado y lo marca como no confirmado', () => {
    const migrado = migratePersistedState(estadoV2(), 2) as Record<string, unknown>
    expect(migrado.labPolicyDerivedFromLegacy).toBe(true)
    expect(migrado.labPolicyActive).toBeNull()
    expect((migrado.labPolicyDraft as { status: string }).status).toBe('draft')
  })

  it('sin perfil antiguo no fabrica ninguna política', () => {
    const sinPerfil = { ...estadoV2(), riskProfile: null }
    const migrado = migratePersistedState(sinPerfil, 2) as Record<string, unknown>
    expect(migrado.labPolicyDraft).toBeNull()
    expect(migrado.labPolicyDerivedFromLegacy).toBe(false)
  })

  it('no pisa una política que ya exista', () => {
    const yaMigrado = {
      ...estadoV2(),
      labPolicyDraft: { id: 'mia' },
      labPolicyDerivedFromLegacy: false,
    }
    const resultado = migrateLabProfile(yaMigrado as never) as Record<string, unknown>
    expect((resultado.labPolicyDraft as { id: string }).id).toBe('mia')
    expect(resultado.labPolicyDerivedFromLegacy).toBe(false)
  })

  it('migrar dos veces da el mismo resultado', () => {
    const una = migratePersistedState(estadoV2(), 2)
    const dos = migratePersistedState(una, 2)
    expect(dos).toEqual(una)
  })

  it('un estado de una versión futura se devuelve intacto', () => {
    const futuro = { ...estadoV2(), algoNuevo: true }
    expect(migratePersistedState(futuro, 99)).toEqual(futuro)
  })
})

describe('activación de la política', () => {
  const COMPLETA = {
    ...initialLabProfileState,
    labPolicyDraft: {
      ...deriveLabPolicyFromLegacy(PERFIL_LEGACY)!,
      assessment: {
        tolerance: { answers: {}, band: 3 as const, assessedAt: '2026-03-15T10:30:00.000Z' },
        capacity: {
          horizonYears: 10,
          emergencyFundMonths: 6,
          incomeStability: 'estable' as const,
          dependents: 0,
          shareOfNetWorth: 0.3,
          band: 3 as const,
          assessedAt: '2026-03-15T10:30:00.000Z',
        },
      },
      effectiveRisk: 3 as const,
      goals: [
        {
          id: 'g1',
          name: 'Jubilación',
          priority: 'importante' as const,
          currency: 'EUR' as const,
          targetAmount: '100000',
          targetDate: '2040-01-01',
          dateFlexible: true,
          amountFlexible: true,
        },
      ],
      acknowledgements: [
        { kind: 'perfil-confirmado' as const, acknowledgedAt: '2026-03-15T10:30:00.000Z' },
      ],
    },
  }

  it('un borrador derivado sin confirmar no puede activarse', () => {
    expect(canActivate({ ...COMPLETA, labPolicyDerivedFromLegacy: true })).toBe(false)
  })

  it('confirmado y completo, sí puede', () => {
    expect(canActivate(COMPLETA)).toBe(true)
  })

  it('sin capacidad medida no puede activarse', () => {
    const sinCapacidad = {
      ...COMPLETA,
      labPolicyDraft: {
        ...COMPLETA.labPolicyDraft,
        assessment: { ...COMPLETA.labPolicyDraft.assessment, capacity: {} },
      },
    }
    expect(canActivate(sinCapacidad)).toBe(false)
  })

  it('sin objetivos ni confirmación tampoco', () => {
    expect(canActivate({ ...COMPLETA, labPolicyDraft: { ...COMPLETA.labPolicyDraft, goals: [] } })).toBe(
      false,
    )
    expect(
      canActivate({
        ...COMPLETA,
        labPolicyDraft: { ...COMPLETA.labPolicyDraft, acknowledgements: [] },
      }),
    ).toBe(false)
  })
})

describe('acciones del store', () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialLabProfileState, riskProfile: null })
  })

  it('parte sin política', () => {
    const estado = useAppStore.getState()
    expect(estado.labPolicyDraft).toBeNull()
    expect(estado.labPolicyActive).toBeNull()
  })

  it('guardar un borrador propio lo desmarca como derivado', () => {
    useAppStore.setState({ labPolicyDerivedFromLegacy: true })
    useAppStore.getState().setLabPolicyDraft(deriveLabPolicyFromLegacy(PERFIL_LEGACY))
    expect(useAppStore.getState().labPolicyDerivedFromLegacy).toBe(false)
  })

  it('activar no hace nada si el borrador no está listo', () => {
    useAppStore.getState().setLabPolicyDraft(deriveLabPolicyFromLegacy(PERFIL_LEGACY))
    useAppStore.getState().activateLabPolicy()
    expect(useAppStore.getState().labPolicyActive).toBeNull()
    // Y el borrador no se pierde por intentarlo.
    expect(useAppStore.getState().labPolicyDraft).not.toBeNull()
  })

  it('confirmar levanta el bloqueo del perfil derivado', () => {
    useAppStore.setState({ labPolicyDerivedFromLegacy: true })
    useAppStore.getState().confirmDerivedLabPolicy()
    expect(useAppStore.getState().labPolicyDerivedFromLegacy).toBe(false)
  })

  it('limpiar devuelve el estado inicial', () => {
    useAppStore.getState().setLabPolicyDraft(deriveLabPolicyFromLegacy(PERFIL_LEGACY))
    useAppStore.getState().clearLabProfile()
    expect(useAppStore.getState().labPolicyDraft).toBeNull()
  })
})

describe('exportar y restaurar', () => {
  it('el estado sobrevive a una vuelta por JSON', () => {
    const migrado = migratePersistedState(estadoV2(), 2)
    const exportado = JSON.stringify(migrado)
    const restaurado = JSON.parse(exportado) as unknown

    expect(restaurado).toEqual(migrado)
    // Y lo restaurado sigue siendo una política válida.
    const politica = (restaurado as { labPolicyDraft: unknown }).labPolicyDraft
    expect(parseInvestmentPolicy(politica).success).toBe(true)
  })
})
