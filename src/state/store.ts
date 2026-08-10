/**
 * Estado local de la aplicación (modo invitado/piloto) con persistencia en
 * localStorage. Al integrar Supabase (Fase 5), este store pasa a ser la capa
 * de caché del modo autenticado y el modo invitado sigue funcionando igual.
 *
 * Las posiciones NO se guardan: se derivan siempre de `transactions`.
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  Asset,
  BrokerAccount,
  Currency,
  FxRate,
  ImportBatch,
  Quote,
  RiskProfile,
  RiskResult,
  SavedScenario,
  Settings,
  Transaction,
} from '../lib/domain'
import {
  DEMO_ACCOUNTS,
  DEMO_ASSETS,
  DEMO_FX_EURUSD,
  DEMO_QUOTES,
  DEMO_TRANSACTIONS,
} from './demoData'
import {
  createLabProfileActions,
  initialLabProfileState,
  migrateLabProfile,
  type LabProfileActions,
  type LabProfileState,
} from './slices/labProfileSlice'

/**
 * v3 (LAB-204): aparece la política de inversión del Laboratorio. El perfil
 * antiguo se conserva intacto y de él se deriva un borrador; nada se pierde.
 */
const STORE_VERSION = 3
export const GUEST_CACHE_NAME = 'riskcalculator-v1:guest'

export function userCacheName(userId: string): string {
  return `riskcalculator-v1:user:${userId}`
}

export type CloudSyncStatus = 'local' | 'loading' | 'saving' | 'saved' | 'offline' | 'error'

export interface CloudSyncState {
  userId: string | null
  email: string | null
  status: CloudSyncStatus
  message: string
  lastSyncedAt: string | null
}

interface AppState extends LabProfileState, LabProfileActions {
  settings: Settings
  accounts: BrokerAccount[]
  assets: Asset[]
  transactions: Transaction[]
  quotes: Record<string, Quote>
  fxRates: FxRate[]
  scenarios: SavedScenario[]
  importBatches: ImportBatch[]
  riskProfile: RiskProfile | null
  riskResults: RiskResult[]
  demoLoaded: boolean
  cloudSync: CloudSyncState

  setDisplayCurrency: (currency: Currency) => void
  setRiskFreeRate: (rate: string) => void

  addAccount: (account: BrokerAccount) => void
  updateAccount: (id: string, patch: Partial<BrokerAccount>) => void
  removeAccount: (id: string) => void

  addAsset: (asset: Asset) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void

  addTransaction: (tx: Transaction) => void
  addTransactions: (txs: Transaction[]) => void
  removeTransaction: (id: string) => void

  setQuote: (quote: Quote) => void
  setFxRate: (rate: FxRate) => void

  addScenario: (scenario: SavedScenario) => void
  removeScenario: (id: string) => void

  addImportBatch: (batch: ImportBatch) => void

  setRiskProfile: (profile: RiskProfile) => void
  addRiskResult: (result: RiskResult) => void
  removeRiskResult: (id: string) => void
  setCloudSync: (patch: Partial<CloudSyncState>) => void
  replaceFromCloud: (snapshot: {
    settings: Settings
    accounts: BrokerAccount[]
    assets: Asset[]
    transactions: Transaction[]
    scenarios: SavedScenario[]
    importBatches: ImportBatch[]
    riskProfile: RiskProfile | null
    riskResults: RiskResult[]
  }) => void

  loadDemoData: () => void
  removeDemoData: () => void
  /** Borra TODOS los datos del usuario (criterio: exportación y eliminación). */
  clearAll: () => void
}

const initialSettings: Settings = {
  displayCurrency: 'EUR',
  locale: 'es-ES',
  riskFreeRate: '0',
}

const initialCloudSync: CloudSyncState = {
  userId: null,
  email: null,
  status: 'local',
  message: 'Datos guardados en este dispositivo.',
  lastSyncedAt: null,
}

type DemoCollections = Pick<
  AppState,
  'accounts' | 'assets' | 'transactions' | 'quotes' | 'fxRates' | 'demoLoaded'
>

type PersistedAppState = Partial<AppState>

function demoQuotesByAssetId(): Record<string, Quote> {
  return Object.fromEntries(DEMO_QUOTES.map((quote) => [quote.assetId, quote]))
}

function withoutDemoCollections<T extends Partial<DemoCollections>>(state: T): T {
  return {
    ...state,
    accounts: state.accounts?.filter((account) => !account.id.startsWith('demo-')),
    assets: state.assets?.filter((asset) => asset.isDemo !== true),
    transactions: state.transactions?.filter((transaction) => transaction.isDemo !== true),
    quotes:
      state.quotes === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(state.quotes).filter(([, quote]) => quote.quality !== 'demo'),
          ),
    fxRates: state.fxRates?.filter((rate) => rate.quality !== 'demo'),
  }
}

function withFreshDemoCollections<T extends Partial<DemoCollections>>(state: T): T {
  const clean = withoutDemoCollections(state)
  return {
    ...clean,
    accounts: [...(clean.accounts ?? []), ...DEMO_ACCOUNTS],
    assets: [...(clean.assets ?? []), ...DEMO_ASSETS],
    transactions: [...(clean.transactions ?? []), ...DEMO_TRANSACTIONS],
    quotes: { ...(clean.quotes ?? {}), ...demoQuotesByAssetId() },
    fxRates: [...(clean.fxRates ?? []), DEMO_FX_EURUSD],
    demoLoaded: true,
  }
}

export function migratePersistedState(persistedState: unknown, version: number): unknown {
  if (
    version > STORE_VERSION ||
    persistedState === null ||
    typeof persistedState !== 'object'
  ) {
    return persistedState
  }

  const normalizado = normalizePersistedState(persistedState) as PersistedAppState

  // v2 → v3: se deriva el borrador de política del perfil antiguo. El perfil
  // sigue donde estaba: la migración añade, no sustituye.
  return version < 3 ? migrateLabProfile(normalizado) : normalizado
}

function normalizePersistedState(persistedState: unknown): unknown {
  if (persistedState === null || typeof persistedState !== 'object') return persistedState
  const state = persistedState as PersistedAppState
  if (state.demoLoaded !== true) return state
  return withFreshDemoCollections(state)
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: initialSettings,
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
      cloudSync: initialCloudSync,
      ...initialLabProfileState,
      ...createLabProfileActions(set),

      setDisplayCurrency: (currency) =>
        set((s) => ({ settings: { ...s.settings, displayCurrency: currency } })),
      setRiskFreeRate: (rate) => set((s) => ({ settings: { ...s.settings, riskFreeRate: rate } })),

      addAccount: (account) => set((s) => ({ accounts: [...s.accounts, account] })),
      updateAccount: (id, patch) =>
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      removeAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          transactions: s.transactions.filter((t) => t.accountId !== id),
        })),

      addAsset: (asset) => set((s) => ({ assets: [...s.assets, asset] })),
      updateAsset: (id, patch) =>
        set((s) => ({
          assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      addTransaction: (tx) => set((s) => ({ transactions: [...s.transactions, tx] })),
      addTransactions: (txs) => set((s) => ({ transactions: [...s.transactions, ...txs] })),
      removeTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

      setQuote: (quote) => set((s) => ({ quotes: { ...s.quotes, [quote.assetId]: quote } })),
      setFxRate: (rate) =>
        set((s) => ({
          fxRates: [
            ...s.fxRates.filter(
              (r) => !(r.base === rate.base && r.quote === rate.quote && r.date === rate.date),
            ),
            rate,
          ],
        })),

      addScenario: (scenario) => set((s) => ({ scenarios: [...s.scenarios, scenario] })),
      removeScenario: (id) => set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) })),

      addImportBatch: (batch) => set((s) => ({ importBatches: [batch, ...s.importBatches] })),

      setRiskProfile: (profile) => set({ riskProfile: profile }),
      addRiskResult: (result) => set((s) => ({ riskResults: [result, ...s.riskResults] })),
      removeRiskResult: (id) =>
        set((s) => ({ riskResults: s.riskResults.filter((result) => result.id !== id) })),
      setCloudSync: (patch) => set((s) => ({ cloudSync: { ...s.cloudSync, ...patch } })),
      replaceFromCloud: (snapshot) =>
        set((s) => ({
          ...snapshot,
          // Las cotizaciones y FX son cachés locales. Se conservan solo si
          // todavía apuntan a activos descargados.
          quotes: Object.fromEntries(
            Object.entries(s.quotes).filter(([assetId]) =>
              snapshot.assets.some((asset) => asset.id === assetId),
            ),
          ),
          fxRates: s.fxRates,
          demoLoaded: false,
          cloudSync: s.cloudSync,
        })),

      loadDemoData: () =>
        set((s) => {
          if (s.demoLoaded) return withFreshDemoCollections(s)
          return withFreshDemoCollections(s)
        }),

      removeDemoData: () =>
        set((s) => ({ ...withoutDemoCollections(s), demoLoaded: false })),

      clearAll: () =>
        set({
          settings: initialSettings,
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
          ...initialLabProfileState,
        }),
    }),
    {
      name: GUEST_CACHE_NAME,
      storage: createJSONStorage(() => localStorage),
      version: STORE_VERSION,
      skipHydration: true,
      partialize: (state) => ({
        settings: state.settings,
        accounts: state.accounts,
        assets: state.assets,
        transactions: state.transactions,
        quotes: state.quotes,
        fxRates: state.fxRates,
        scenarios: state.scenarios,
        importBatches: state.importBatches,
        riskProfile: state.riskProfile,
        riskResults: state.riskResults,
        demoLoaded: state.demoLoaded,
        labPolicyDraft: state.labPolicyDraft,
        labPolicyActive: state.labPolicyActive,
        labPolicyDerivedFromLegacy: state.labPolicyDerivedFromLegacy,
      }),
      migrate: migratePersistedState,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(normalizePersistedState(persistedState) as Partial<AppState>),
        cloudSync: currentState.cloudSync,
      }),
    },
  ),
)
