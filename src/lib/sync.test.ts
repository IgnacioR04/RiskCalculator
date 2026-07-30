import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrokerAccount, RiskResult } from './domain'
import { GUEST_CACHE_NAME, useAppStore, userCacheName } from '../state/store'
import { activateUserCache, clearUserCache, pushToCloud } from './sync'

const supabaseMock = vi.hoisted(() => {
  const tableCalls: string[] = []
  const getUser = vi.fn()
  const signOut = vi.fn()
  const from = vi.fn((table: string) => {
    tableCalls.push(table)
    return {
      upsert: vi.fn(async () => ({ error: null })),
      insert: vi.fn(async () => ({ error: null })),
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: [], error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          error: null,
          in: vi.fn(async () => ({ error: null })),
        })),
      })),
    }
  })

  return {
    tableCalls,
    client: {
      auth: { getUser, signOut },
      from,
    },
    getUser,
    signOut,
    from,
  }
})

vi.mock('./supabase', () => ({
  getSupabase: () => supabaseMock.client,
}))

const storedAccount: BrokerAccount = {
  id: 'account-a',
  brokerName: 'Broker A',
  accountLabel: 'Cuenta A',
  defaultCurrency: 'EUR',
}

function resetStore() {
  useAppStore.persist.setOptions({ name: GUEST_CACHE_NAME })
  useAppStore.setState({
    settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
    accounts: [],
    assets: [],
    transactions: [],
    quotes: {},
    fxRates: [],
    scenarios: [],
    importBatches: [],
    riskProfile: null,
    riskResults: [],
    demoLoaded: false,
    cloudSync: {
      userId: null,
      email: null,
      status: 'local',
      message: 'Datos guardados en este dispositivo.',
      lastSyncedAt: null,
    },
  })
}

function persistedState(state: Partial<ReturnType<typeof useAppStore.getState>>) {
  return JSON.stringify({
    state: {
      settings: { displayCurrency: 'EUR', locale: 'es-ES', riskFreeRate: '0' },
      accounts: [],
      assets: [],
      transactions: [],
      quotes: {},
      fxRates: [],
      scenarios: [],
      importBatches: [],
      riskProfile: null,
      riskResults: [],
      demoLoaded: false,
      ...state,
    },
    version: 2,
  })
}

describe('Supabase sync cache safety', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStore()
    supabaseMock.tableCalls.length = 0
    vi.clearAllMocks()
    supabaseMock.getUser.mockResolvedValue({
      data: { user: { id: 'user-a', email: 'a@example.com' } },
      error: null,
    })
  })

  afterEach(() => {
    localStorage.clear()
    resetStore()
  })

  it('rehydrates only the authenticated user local cache namespace', async () => {
    localStorage.setItem(
      userCacheName('user-a'),
      persistedState({ accounts: [storedAccount] }),
    )
    localStorage.setItem(
      userCacheName('user-b'),
      persistedState({ accounts: [{ ...storedAccount, id: 'account-b' }] }),
    )

    await activateUserCache('user-a', 'a@example.com')

    const state = useAppStore.getState()
    expect(state.accounts).toEqual([storedAccount])
    expect(state.cloudSync).toMatchObject({
      userId: 'user-a',
      email: 'a@example.com',
      status: 'loading',
    })
    expect(localStorage.getItem(userCacheName('user-b'))).not.toBeNull()
  })

  it('clears the active user cache and memory on logout cleanup', async () => {
    localStorage.setItem(
      userCacheName('user-a'),
      persistedState({ accounts: [storedAccount] }),
    )
    await activateUserCache('user-a', 'a@example.com')

    await clearUserCache('user-a')

    const state = useAppStore.getState()
    expect(localStorage.getItem(userCacheName('user-a'))).toBeNull()
    expect(state.accounts).toEqual([])
    expect(state.cloudSync).toMatchObject({
      userId: null,
      status: 'local',
    })
  })

  it('does not mirror an empty local portfolio over remote rows by default', async () => {
    resetStore()

    const result = await pushToCloud()

    expect(result.ok).toBe(true)
    expect(result.message).toContain('No se subio un estado local vacio')
    expect(supabaseMock.tableCalls).toEqual(['profiles', 'preferences'])
    expect(useAppStore.getState().cloudSync.status).toBe('saved')
  })

  it('mirrors saved risk results for authenticated users', async () => {
    const riskResult: RiskResult = {
      id: '11111111-1111-4111-8111-111111111111',
      resultType: 'calculator',
      sourceId: '22222222-2222-4222-8222-222222222222',
      inputs: { mode: 'restore', currency: 'EUR', referenceValue: '100' },
      result: { contribution: '10.69' },
      calculatedAt: '2026-07-29T10:00:00.000Z',
      createdAt: '2026-07-29T10:00:00.000Z',
    }
    useAppStore.setState({ riskResults: [riskResult] })

    const result = await pushToCloud()

    expect(result.ok).toBe(true)
    expect(result.message).toContain('1 resultados')
    expect(supabaseMock.tableCalls).toContain('risk_results')
  })
})
