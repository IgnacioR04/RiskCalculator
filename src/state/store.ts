/**
 * Estado local de la aplicación (modo invitado/piloto) con persistencia en
 * localStorage. Al integrar Supabase (Fase 5), este store pasa a ser la capa
 * de caché del modo autenticado y el modo invitado sigue funcionando igual.
 *
 * Las posiciones NO se guardan: se derivan siempre de `transactions`.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Asset,
  BrokerAccount,
  Currency,
  FxRate,
  Quote,
  RiskProfile,
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

interface AppState {
  settings: Settings
  accounts: BrokerAccount[]
  assets: Asset[]
  transactions: Transaction[]
  quotes: Record<string, Quote>
  fxRates: FxRate[]
  scenarios: SavedScenario[]
  riskProfile: RiskProfile | null
  demoLoaded: boolean

  setDisplayCurrency: (currency: Currency) => void
  setRiskFreeRate: (rate: string) => void

  addAccount: (account: BrokerAccount) => void
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

  setRiskProfile: (profile: RiskProfile) => void

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
      riskProfile: null,
      demoLoaded: false,

      setDisplayCurrency: (currency) =>
        set((s) => ({ settings: { ...s.settings, displayCurrency: currency } })),
      setRiskFreeRate: (rate) => set((s) => ({ settings: { ...s.settings, riskFreeRate: rate } })),

      addAccount: (account) => set((s) => ({ accounts: [...s.accounts, account] })),
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

      setRiskProfile: (profile) => set({ riskProfile: profile }),

      loadDemoData: () =>
        set((s) => {
          if (s.demoLoaded) return s
          const quotes = { ...s.quotes }
          for (const q of DEMO_QUOTES) quotes[q.assetId] = q
          return {
            demoLoaded: true,
            accounts: [...s.accounts, ...DEMO_ACCOUNTS],
            assets: [...s.assets, ...DEMO_ASSETS],
            transactions: [...s.transactions, ...DEMO_TRANSACTIONS],
            quotes,
            fxRates: [...s.fxRates, DEMO_FX_EURUSD],
          }
        }),

      removeDemoData: () =>
        set((s) => ({
          demoLoaded: false,
          accounts: s.accounts.filter((a) => !a.id.startsWith('demo-')),
          assets: s.assets.filter((a) => !a.isDemo),
          transactions: s.transactions.filter((t) => !t.isDemo),
          quotes: Object.fromEntries(
            Object.entries(s.quotes).filter(([, q]) => q.quality !== 'demo'),
          ),
          fxRates: s.fxRates.filter((r) => r.quality !== 'demo'),
        })),

      clearAll: () =>
        set({
          settings: initialSettings,
          accounts: [],
          assets: [],
          transactions: [],
          quotes: {},
          fxRates: [],
          scenarios: [],
          riskProfile: null,
          demoLoaded: false,
        }),
    }),
    { name: 'riskcalculator-v1' },
  ),
)
