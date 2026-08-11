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

/** Borrador que cumple todo lo que ADR-002 §6 exige para activar. */
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

describe('activación de la política', () => {
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
    useAppStore.getState().activateLabPolicy('2026-08-10')
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

/* ── Ciclo de vida completo: activar, versionar y conservar (LAB-209) ─────── */

describe('activación y versionado', () => {
  const HOY = '2026-08-10'

  /** Abre la versión siguiente, la confirma y la activa en la fecha dada. */
  function versionarYActivar(id: string, fecha: string) {
    useAppStore.getState().startNewLabPolicyVersion(id, fecha)
    useAppStore
      .getState()
      .acknowledgeLabPolicy({ kind: 'perfil-confirmado', acknowledgedAt: `${fecha}T00:00:00Z` })
    useAppStore.getState().activateLabPolicy(fecha)
  }

  beforeEach(() => {
    useAppStore.setState({ ...initialLabProfileState, riskProfile: null })
    useAppStore.getState().setLabPolicyDraft(COMPLETA.labPolicyDraft)
  })

  it('activar sella la vigencia y vacía el borrador', () => {
    useAppStore.getState().activateLabPolicy(HOY)
    const estado = useAppStore.getState()

    expect(estado.labPolicyActive?.status).toBe('active')
    expect(estado.labPolicyActive?.effectiveFrom).toBe(HOY)
    expect(estado.labPolicyActive?.nextReviewAt).toBe('2027-08-10')
    expect(estado.labPolicyDraft).toBeNull()
    expect(estado.labPolicySuperseded).toEqual([])
  })

  it('editar la vigente abre una versión nueva y no la toca', () => {
    useAppStore.getState().activateLabPolicy(HOY)
    const vigente = useAppStore.getState().labPolicyActive!

    useAppStore.getState().startNewLabPolicyVersion('ips-v2', '2026-09-01')
    const estado = useAppStore.getState()

    // La vigente sigue exactamente como estaba: es el criterio de aceptación.
    expect(estado.labPolicyActive).toEqual(vigente)
    expect(estado.labPolicyDraft?.status).toBe('draft')
    expect(estado.labPolicyDraft?.version).toBe(vigente.version + 1)
    expect(estado.labPolicyDraft?.id).not.toBe(vigente.id)
    expect(estado.labPolicyDraft?.acknowledgements).toEqual([])
  })

  it('no abre una versión nueva si ya hay un borrador a medias', () => {
    useAppStore.getState().activateLabPolicy(HOY)
    useAppStore.getState().startNewLabPolicyVersion('ips-v2', '2026-09-01')
    const primero = useAppStore.getState().labPolicyDraft

    useAppStore.getState().startNewLabPolicyVersion('ips-v3', '2026-09-02')
    expect(useAppStore.getState().labPolicyDraft).toEqual(primero)
  })

  it('no abre versión nueva si no hay ninguna vigente', () => {
    useAppStore.setState({ ...initialLabProfileState })
    useAppStore.getState().startNewLabPolicyVersion('ips-v2', HOY)
    expect(useAppStore.getState().labPolicyDraft).toBeNull()
  })

  it('activar la nueva conserva la anterior, retirada y sin corregir', () => {
    useAppStore.getState().activateLabPolicy(HOY)
    const primera = useAppStore.getState().labPolicyActive!

    versionarYActivar('ips-v2', '2026-09-01')

    const estado = useAppStore.getState()
    expect(estado.labPolicyActive?.version).toBe(2)
    expect(estado.labPolicySuperseded).toHaveLength(1)
    expect(estado.labPolicySuperseded[0]?.id).toBe(primera.id)
    expect(estado.labPolicySuperseded[0]?.status).toBe('superseded')
    // Lo único que cambia es el estado: el contenido se conserva tal cual.
    expect({ ...estado.labPolicySuperseded[0]!, status: 'active' as const }).toEqual(primera)
  })

  it('la más reciente queda la primera del historial', () => {
    useAppStore.getState().activateLabPolicy(HOY)
    versionarYActivar('ips-v2', '2026-09-01')
    versionarYActivar('ips-v3', '2026-10-01')

    expect(useAppStore.getState().labPolicySuperseded.map((p) => p.version)).toEqual([2, 1])
    expect(useAppStore.getState().labPolicyActive?.version).toBe(3)
  })

  it('descartar el borrador no toca la vigente', () => {
    useAppStore.getState().activateLabPolicy(HOY)
    const vigente = useAppStore.getState().labPolicyActive!

    useAppStore.getState().startNewLabPolicyVersion('ips-v2', '2026-09-01')
    useAppStore.getState().discardLabPolicyDraft()

    expect(useAppStore.getState().labPolicyDraft).toBeNull()
    expect(useAppStore.getState().labPolicyActive).toEqual(vigente)
  })

  it('confirmar dos veces el mismo tipo no acumula confirmaciones', () => {
    const acciones = useAppStore.getState()
    acciones.acknowledgeLabPolicy({
      kind: 'perfil-confirmado',
      acknowledgedAt: '2026-08-10T00:00:00Z',
    })
    acciones.acknowledgeLabPolicy({
      kind: 'perfil-confirmado',
      acknowledgedAt: '2026-08-11T00:00:00Z',
    })

    const confirmaciones = useAppStore.getState().labPolicyDraft!.acknowledgements
    expect(confirmaciones).toHaveLength(1)
    expect(confirmaciones[0]?.acknowledgedAt).toBe('2026-08-11T00:00:00Z')
  })

  it('todo lo que queda guardado sigue cumpliendo el contrato', () => {
    useAppStore.getState().activateLabPolicy(HOY)
    versionarYActivar('ips-v2', '2026-09-01')

    const estado = useAppStore.getState()
    for (const politica of [estado.labPolicyActive, ...estado.labPolicySuperseded]) {
      expect(parseInvestmentPolicy(politica).success).toBe(true)
    }
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
