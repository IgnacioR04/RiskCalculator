import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentPolicy } from '../domain/investmentPolicy'
import { emptyPolicyDraft, parseInvestmentPolicy } from '../schemas/investmentPolicy'
import {
  TABLA_OBJETIVOS,
  TABLA_POLITICAS,
  TABLA_RESTRICCIONES,
  type InvestmentGoalRow,
  type InvestmentPolicyRow,
} from './investmentPolicyDb'
import { __soloParaPruebas } from './investmentPolicyRepository'

const { filaAPolitica, politicaAFila, restriccionAFila } = __soloParaPruebas

afterEach(() => {
  vi.restoreAllMocks()
})

const FILA: InvestmentPolicyRow = {
  id: 'ips-1',
  user_id: 'user-a',
  schema_version: 1,
  version: 2,
  status: 'active',
  effective_from: '2026-08-10',
  reviewed_at: null,
  next_review_at: '2027-08-10',
  base_currency: 'EUR',
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
  },
  effective_risk: 3,
  effective_risk_rule_version: 1,
  liquidity_reserve_months: null,
  contribution_plan: null,
  rebalance_policy: { kind: 'none' },
  assumptions: {},
  acknowledgements: [{ kind: 'perfil-confirmado', acknowledgedAt: '2026-08-10T00:00:00Z' }],
  created_at: '2026-08-10T00:00:00Z',
  updated_at: '2026-08-10T00:00:00Z',
}

const OBJETIVO: InvestmentGoalRow = {
  id: 'g1',
  policy_id: 'ips-1',
  user_id: 'user-a',
  name: 'Entrada casa',
  priority: 'esencial',
  currency: 'EUR',
  target_amount: '60000.0000',
  target_date: '2032-01-01',
  date_flexible: true,
  amount_flexible: false,
  monthly_contribution: null,
  notes: null,
}

describe('mapeo de fila a dominio', () => {
  it('produce una política que supera la validación', () => {
    const candidata = filaAPolitica(FILA, [OBJETIVO], [])
    const resultado = parseInvestmentPolicy(candidata)
    expect(resultado.success).toBe(true)
  })

  it('traduce snake_case a camelCase sin inventar campos', () => {
    const politica = parseInvestmentPolicy(filaAPolitica(FILA, [OBJETIVO], []))
    expect(politica.success).toBe(true)
    if (!politica.success) return
    const p = politica.data as InvestmentPolicy

    expect(p.effectiveFrom).toBe('2026-08-10')
    expect(p.nextReviewAt).toBe('2027-08-10')
    expect(p.effectiveRiskRuleVersion).toBe(1)
    expect(p.goals[0]?.targetDate).toBe('2032-01-01')
    expect(p.goals[0]?.dateFlexible).toBe(true)
  })

  it('omite los nulos en vez de convertirlos en undefined explícito', () => {
    const candidata = filaAPolitica(FILA, [OBJETIVO], []) as Record<string, unknown>
    // Con `exactOptionalPropertyTypes`, una clave presente con `undefined` no es
    // lo mismo que una clave ausente.
    expect('reviewedAt' in candidata).toBe(false)
    expect('liquidityReserveMonths' in candidata).toBe(false)
    expect('contributionPlan' in candidata).toBe(false)
  })

  it('conserva el importe como texto para no perder precisión', () => {
    const grande = { ...OBJETIVO, target_amount: '123456789012345.6789' }
    const candidata = filaAPolitica(FILA, [grande], []) as {
      goals: { targetAmount: unknown }[]
    }
    expect(candidata.goals[0]?.targetAmount).toBe('123456789012345.6789')
    expect(typeof candidata.goals[0]?.targetAmount).toBe('string')
  })

  it('recompone la restricción uniendo su tipo y su contenido', () => {
    const candidata = filaAPolitica(FILA, [], [
      { id: 'c1', policy_id: 'ips-1', user_id: 'user-a', kind: 'turnover', payload: { max: 0.2 } },
    ]) as { constraints: unknown[] }
    expect(candidata.constraints[0]).toEqual({ kind: 'turnover', max: 0.2 })
  })
})

describe('mapeo de dominio a fila', () => {
  const POLITICA: InvestmentPolicy = {
    ...emptyPolicyDraft('ips-2', '2026-08-10'),
    constraints: [{ kind: 'liquidity', minimumLiquidWeight: 0.1 }],
  }

  it('convierte los opcionales ausentes en null, que es lo que espera la columna', () => {
    const fila = politicaAFila(POLITICA, 'user-a')
    expect(fila.reviewed_at).toBeNull()
    expect(fila.next_review_at).toBeNull()
    expect(fila.effective_risk).toBeNull()
    expect(fila.contribution_plan).toBeNull()
  })

  it('escribe el user_id de la sesión y no el que traiga la política', () => {
    const conOtroDueno: InvestmentPolicy = { ...POLITICA, userId: 'user-suplantado' }
    expect(politicaAFila(conOtroDueno, 'user-a').user_id).toBe('user-a')
  })

  it('separa el discriminante de la restricción de su contenido', () => {
    const fila = restriccionAFila(
      { kind: 'assetWeight', instrumentId: 'a1', min: 0.1, max: 0.3 },
      'ips-2',
      'user-a',
    )
    expect(fila.kind).toBe('assetWeight')
    expect(fila.payload).toEqual({ instrumentId: 'a1', min: 0.1, max: 0.3 })
  })

  it('el viaje de ida y vuelta conserva la política', () => {
    const fila = politicaAFila(POLITICA, 'user-a') as unknown as InvestmentPolicyRow
    const vuelta = filaAPolitica(
      { ...fila, created_at: '', updated_at: '' },
      [],
      [{ id: 'c1', policy_id: 'ips-2', user_id: 'user-a', kind: 'liquidity', payload: { minimumLiquidWeight: 0.1 } }],
    )
    const validada = parseInvestmentPolicy(vuelta)
    expect(validada.success).toBe(true)
    if (validada.success) {
      const p = validada.data as InvestmentPolicy
      expect(p.id).toBe(POLITICA.id)
      expect(p.constraints).toEqual(POLITICA.constraints)
      expect(p.assessment).toEqual(POLITICA.assessment)
    }
  })
})

describe('ningún componente llama a las tablas directamente', () => {
  // Criterio de aceptación de LAB-206. Una convención sin guardián se rompe
  // sola, así que se comprueba recorriendo el árbol de fuentes.
  const RAIZ = join(process.cwd(), 'src')
  const PERMITIDOS = ['investmentPolicyRepository.ts', 'investmentPolicyDb.ts']

  function ficherosDeCodigo(dir: string): string[] {
    return readdirSync(dir).flatMap((entrada) => {
      const ruta = join(dir, entrada)
      if (statSync(ruta).isDirectory()) return ficherosDeCodigo(ruta)
      return /\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada) ? [ruta] : []
    })
  }

  it('solo el repositorio menciona las tablas de política', () => {
    const tablas = [TABLA_POLITICAS, TABLA_OBJETIVOS, TABLA_RESTRICCIONES]
    const infractores = ficherosDeCodigo(RAIZ).filter((ruta) => {
      if (PERMITIDOS.some((permitido) => ruta.endsWith(permitido))) return false
      const contenido = readFileSync(ruta, 'utf8')
      return tablas.some((tabla) => contenido.includes(`'${tabla}'`))
    })

    expect(infractores, `estos archivos hablan con las tablas sin pasar por el repositorio:\n${infractores.join('\n')}`).toEqual([])
  })

  it('el guardián sabe encontrar una infracción', () => {
    // Sin esto, la prueba anterior pasaría igual con un recorrido roto.
    const ficheros = ficherosDeCodigo(RAIZ)
    expect(ficheros.length).toBeGreaterThan(20)
    expect(ficheros.some((f) => f.endsWith('investmentPolicyRepository.ts'))).toBe(true)
  })
})
