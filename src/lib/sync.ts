/**
 * Mirror sync with Supabase.
 *
 * Remote state is loaded before the authenticated app is shown. From that
 * point on, local edits are debounced and pushed to Supabase. The browser
 * cache is namespaced by Supabase user id and removed on logout.
 */
import type {
  Asset,
  BrokerAccount,
  ImportBatch,
  RiskProfile,
  SavedScenario,
  Settings,
  Transaction,
} from './domain'
import { getSupabase } from './supabase'
import { GUEST_CACHE_NAME, useAppStore, userCacheName } from '../state/store'

export interface SyncResult {
  ok: boolean
  message: string
}

type SupabaseError = { message: string } | null
type SyncState = ReturnType<typeof useAppStore.getState>
type Timer = ReturnType<typeof setTimeout>

const AUTO_SYNC_DELAY_MS = 1200

let autoSyncUnsubscribe: (() => void) | null = null
let autoSyncTimer: Timer | null = null
let autoSyncUserId: string | null = null
let autoSyncInFlight = false
let autoSyncPending = false
let applyingCloudSnapshot = false
let lastCloudSignature = ''

function nowIso(): string {
  return new Date().toISOString()
}

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

function isNetworkError(error: unknown): boolean {
  if (!isBrowserOnline()) return true
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|network|fetch/i.test(message)
}

function setCloudStatus(
  patch: Partial<SyncState['cloudSync']> & Pick<SyncState['cloudSync'], 'status' | 'message'>,
): void {
  useAppStore.getState().setCloudSync(patch)
}

function nonDemoAccounts(state: SyncState): BrokerAccount[] {
  return state.accounts.filter((account) => !account.id.startsWith('demo-'))
}

function nonDemoAssets(state: SyncState): Asset[] {
  return state.assets.filter((asset) => asset.isDemo !== true)
}

function nonDemoTransactions(state: SyncState): Transaction[] {
  return state.transactions.filter((transaction) => transaction.isDemo !== true)
}

function cloudSignature(state: SyncState = useAppStore.getState()): string {
  return JSON.stringify({
    settings: state.settings,
    accounts: nonDemoAccounts(state),
    assets: nonDemoAssets(state),
    transactions: nonDemoTransactions(state),
    scenarios: state.scenarios,
    importBatches: state.importBatches,
    riskProfile: state.riskProfile,
  })
}

function hasCloudRows(state: SyncState = useAppStore.getState()): boolean {
  return (
    nonDemoAccounts(state).length > 0 ||
    nonDemoAssets(state).length > 0 ||
    nonDemoTransactions(state).length > 0 ||
    state.scenarios.length > 0 ||
    state.importBatches.length > 0 ||
    state.riskProfile !== null
  )
}

async function rehydrateStore(): Promise<void> {
  const result = useAppStore.persist.rehydrate()
  if (result instanceof Promise) await result
}

export async function activateGuestCache(): Promise<void> {
  stopAutoSync()
  useAppStore.persist.setOptions({ name: GUEST_CACHE_NAME })
  await rehydrateStore()
  setCloudStatus({
    userId: null,
    email: null,
    status: 'local',
    message: 'Datos guardados en este dispositivo.',
    lastSyncedAt: null,
  })
}

export async function activateUserCache(userId: string, email: string | null): Promise<void> {
  stopAutoSync()
  useAppStore.getState().clearAll()
  useAppStore.persist.setOptions({ name: userCacheName(userId) })
  await rehydrateStore()
  setCloudStatus({
    userId,
    email,
    status: 'loading',
    message: 'Cargando tus datos de Supabase...',
    lastSyncedAt: null,
  })
}

export async function clearUserCache(userId: string): Promise<void> {
  useAppStore.persist.setOptions({ name: userCacheName(userId) })
  useAppStore.getState().clearAll()
  useAppStore.persist.clearStorage()
  useAppStore.persist.setOptions({ name: GUEST_CACHE_NAME })
  await rehydrateStore()
  setCloudStatus({
    userId: null,
    email: null,
    status: 'local',
    message: 'Sesion cerrada. Datos locales del usuario anterior eliminados.',
    lastSyncedAt: null,
  })
}

export async function signOutAndClearCloudSession(): Promise<void> {
  const supabase = getSupabase()
  const userId = useAppStore.getState().cloudSync.userId
  stopAutoSync()
  if (supabase !== null) {
    await supabase.auth.signOut()
  }
  if (userId !== null) {
    await clearUserCache(userId)
  } else {
    useAppStore.getState().clearAll()
    useAppStore.persist.setOptions({ name: GUEST_CACHE_NAME })
    await rehydrateStore()
  }
}

async function mirrorTable(
  table: string,
  rows: { id: string; user_id: string }[],
  userId: string,
): Promise<SupabaseError> {
  const supabase = getSupabase()
  if (supabase === null) return { message: 'Supabase no esta configurado.' }

  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
    if (error !== null) return error
  }
  const { data, error: readError } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
  if (readError !== null) return readError

  const localIds = new Set(rows.map((row) => row.id))
  const staleIds = (data ?? [])
    .map((row) => String(row.id))
    .filter((id) => !localIds.has(id))
  if (staleIds.length === 0) return null
  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq('user_id', userId)
    .in('id', staleIds)
  return deleteError
}

async function upsertPreferences(userId: string, settings: Settings): Promise<SupabaseError> {
  const supabase = getSupabase()
  if (supabase === null) return { message: 'Supabase no esta configurado.' }

  const profileRow = {
    id: userId,
    display_currency: settings.displayCurrency,
    locale: settings.locale,
    risk_free_rate: settings.riskFreeRate,
  }
  const preferenceRow = {
    user_id: userId,
    display_currency: settings.displayCurrency,
    locale: settings.locale,
    risk_free_rate: settings.riskFreeRate,
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profileRow, { onConflict: 'id' })
  if (profileError !== null) return profileError

  const { error: preferenceError } = await supabase
    .from('preferences')
    .upsert(preferenceRow, { onConflict: 'user_id' })
  return preferenceError
}

export async function pushToCloud(options: { allowEmpty?: boolean } = {}): Promise<SyncResult> {
  const supabase = getSupabase()
  if (supabase === null) return { ok: false, message: 'Supabase no esta configurado.' }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError !== null || userData.user === null) {
    return { ok: false, message: 'Inicia sesion antes de sincronizar.' }
  }
  const userId = userData.user.id
  const state = useAppStore.getState()

  try {
    setCloudStatus({
      userId,
      email: userData.user.email ?? state.cloudSync.email,
      status: 'saving',
      message: 'Guardando cambios en Supabase...',
    })

    const preferenceError = await upsertPreferences(userId, state.settings)
    if (preferenceError !== null) {
      return { ok: false, message: `Error subiendo preferencias: ${preferenceError.message}` }
    }

    if (!hasCloudRows(state) && options.allowEmpty !== true) {
      lastCloudSignature = cloudSignature()
      setCloudStatus({
        status: 'saved',
        message: 'Preferencias guardadas. La cartera remota no se vacio porque el estado local no tiene datos.',
        lastSyncedAt: nowIso(),
      })
      return {
        ok: true,
        message: 'Preferencias guardadas. No se subio un estado local vacio sobre la cartera remota.',
      }
    }

    const accounts = nonDemoAccounts(state)
    const assets = nonDemoAssets(state)
    const transactions = nonDemoTransactions(state)

    const accountRows = accounts.map((account: BrokerAccount) => ({
      id: account.id,
      user_id: userId,
      broker_name: account.brokerName,
      account_label: account.accountLabel,
      country: account.country ?? null,
      default_currency: account.defaultCurrency,
      fee_policy: account.feePolicy ?? null,
    }))
    const assetRows = assets.map((asset: Asset) => ({
      id: asset.id,
      user_id: userId,
      symbol: asset.symbol,
      name: asset.name,
      asset_type: asset.assetType,
      quote_currency: asset.quoteCurrency,
      isin: asset.isin ?? null,
      exchange: asset.exchange ?? null,
      sector: asset.sector ?? null,
      country: asset.country ?? null,
      holdings: asset.holdings ?? [],
      provider_ids: asset.providerIds ?? {},
      manual_price: asset.manualPrice ?? null,
    }))
    const transactionRows = transactions.map((transaction: Transaction) => ({
      id: transaction.id,
      user_id: userId,
      account_id: transaction.accountId,
      asset_id: transaction.assetId,
      type: transaction.type,
      datetime: transaction.datetime,
      invested_amount: transaction.investedAmount,
      invested_currency: transaction.investedCurrency,
      quantity: transaction.quantity,
      execution_price: transaction.executionPrice,
      quote_currency: transaction.quoteCurrency,
      fee: transaction.fee,
      fee_currency: transaction.feeCurrency,
      source_type: transaction.sourceType,
      confidence: transaction.confidence,
      estimation_notes: transaction.estimationNotes ?? null,
      cost_known: transaction.costKnown !== false,
    }))
    const scenarioRows = state.scenarios.map((scenario: SavedScenario) => ({
      id: scenario.id,
      user_id: userId,
      name: scenario.name,
      mode: scenario.mode,
      currency: scenario.currency,
      inputs: scenario.inputs,
      created_at: scenario.createdAt,
    }))
    const importRows = state.importBatches.map((batch: ImportBatch) => ({
      id: batch.id,
      user_id: userId,
      raw_json: batch.rawJson,
      validation_status: batch.validationStatus,
      warnings: batch.warnings,
      confirmed_at: batch.confirmedAt,
      created_at: batch.createdAt,
    }))

    if (accountRows.length > 0) {
      const { error } = await supabase.from('broker_accounts').upsert(accountRows, { onConflict: 'id' })
      if (error !== null) {
        return { ok: false, message: `Error subiendo broker_accounts: ${error.message}` }
      }
    }
    if (assetRows.length > 0) {
      const { error } = await supabase.from('assets').upsert(assetRows, { onConflict: 'id' })
      if (error !== null) {
        return { ok: false, message: `Error subiendo assets: ${error.message}` }
      }
    }

    for (const [table, rows] of [
      ['transactions', transactionRows],
      ['scenarios', scenarioRows],
      ['import_batches', importRows],
    ] as const) {
      const error = await mirrorTable(table, [...rows], userId)
      if (error !== null) return { ok: false, message: `Error sincronizando ${table}: ${error.message}` }
    }
    const accountMirrorError = await mirrorTable('broker_accounts', accountRows, userId)
    if (accountMirrorError !== null) {
      return { ok: false, message: `Error sincronizando broker_accounts: ${accountMirrorError.message}` }
    }
    const assetMirrorError = await mirrorTable('assets', assetRows, userId)
    if (assetMirrorError !== null) {
      return { ok: false, message: `Error sincronizando assets: ${assetMirrorError.message}` }
    }

    const { error: deleteRiskError } = await supabase
      .from('risk_profiles')
      .delete()
      .eq('user_id', userId)
    if (deleteRiskError !== null) {
      return { ok: false, message: `Error actualizando el perfil de riesgo: ${deleteRiskError.message}` }
    }
    if (state.riskProfile !== null) {
      const { error } = await supabase.from('risk_profiles').insert({
        user_id: userId,
        version: state.riskProfile.version,
        answers: state.riskProfile.answers,
        score: state.riskProfile.score,
        category: state.riskProfile.category,
        completed_at: state.riskProfile.completedAt,
      })
      if (error !== null) {
        return { ok: false, message: `Error subiendo el perfil de riesgo: ${error.message}` }
      }
    }

    lastCloudSignature = cloudSignature()
    setCloudStatus({
      status: 'saved',
      message: `Guardado: ${accountRows.length} cuentas, ${assetRows.length} activos, ${transactionRows.length} operaciones, ${scenarioRows.length} escenarios e ${importRows.length} importaciones.`,
      lastSyncedAt: nowIso(),
    })

    return {
      ok: true,
      message: `Nube sincronizada: ${accountRows.length} cuentas, ${assetRows.length} activos, ${transactionRows.length} operaciones, ${scenarioRows.length} escenarios e ${importRows.length} importaciones.`,
    }
  } catch (error) {
    const offline = isNetworkError(error)
    const message = offline
      ? 'Sin conexion: los cambios quedan en la cache local de este usuario.'
      : `Error sincronizando: ${error instanceof Error ? error.message : String(error)}`
    setCloudStatus({ status: offline ? 'offline' : 'error', message })
    return { ok: false, message }
  }
}

export async function pullFromCloud(): Promise<SyncResult> {
  const supabase = getSupabase()
  if (supabase === null) return { ok: false, message: 'Supabase no esta configurado.' }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError !== null || userData.user === null) {
    return { ok: false, message: 'Inicia sesion antes de sincronizar.' }
  }
  const userId = userData.user.id

  setCloudStatus({
    userId,
    email: userData.user.email ?? null,
    status: 'loading',
    message: 'Cargando datos de Supabase...',
  })

  try {
    const [accounts, assets, transactions, scenarios, imports, profile, preferences, riskProfile] =
      await Promise.all([
        supabase.from('broker_accounts').select('*').eq('user_id', userId),
        supabase.from('assets').select('*').eq('user_id', userId),
        supabase.from('transactions').select('*').eq('user_id', userId),
        supabase.from('scenarios').select('*').eq('user_id', userId),
        supabase.from('import_batches').select('*').eq('user_id', userId).order('created_at', {
          ascending: false,
        }),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('preferences').select('*').eq('user_id', userId).maybeSingle(),
        supabase
          .from('risk_profiles')
          .select('*')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    for (const [name, result] of [
      ['broker_accounts', accounts],
      ['assets', assets],
      ['transactions', transactions],
      ['scenarios', scenarios],
      ['import_batches', imports],
      ['profiles', profile],
      ['preferences', preferences],
      ['risk_profiles', riskProfile],
    ] as const) {
      if (result.error !== null) {
        return { ok: false, message: `Error leyendo ${name}: ${result.error.message}` }
      }
    }

    const current = useAppStore.getState()
    const settingsSource = preferences.data ?? profile.data
    const settings: Settings =
      settingsSource === null
        ? current.settings
        : {
            displayCurrency: settingsSource.display_currency,
            locale: settingsSource.locale,
            riskFreeRate: String(settingsSource.risk_free_rate),
          }
    const downloadedAccounts: BrokerAccount[] = (accounts.data ?? []).map((row) => ({
      id: row.id,
      brokerName: row.broker_name,
      accountLabel: row.account_label,
      defaultCurrency: row.default_currency,
      ...(row.country !== null ? { country: row.country } : {}),
      ...(row.fee_policy !== null ? { feePolicy: row.fee_policy } : {}),
    }))
    const downloadedAssets: Asset[] = (assets.data ?? []).map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      assetType: row.asset_type,
      quoteCurrency: row.quote_currency,
      ...(row.isin !== null ? { isin: row.isin } : {}),
      ...(row.exchange !== null ? { exchange: row.exchange } : {}),
      ...(row.sector !== null ? { sector: row.sector } : {}),
      ...(row.country !== null ? { country: row.country } : {}),
      ...(Array.isArray(row.holdings) && row.holdings.length > 0 ? { holdings: row.holdings } : {}),
      ...(row.provider_ids !== null ? { providerIds: row.provider_ids } : {}),
      ...(row.manual_price !== null ? { manualPrice: row.manual_price } : {}),
    }))
    const downloadedTransactions: Transaction[] = (transactions.data ?? []).map((row) => ({
      id: row.id,
      accountId: row.account_id,
      assetId: row.asset_id,
      type: row.type,
      datetime: row.datetime,
      investedAmount: String(row.invested_amount),
      investedCurrency: row.invested_currency,
      quantity: String(row.quantity),
      executionPrice: row.execution_price !== null ? String(row.execution_price) : null,
      quoteCurrency: row.quote_currency,
      fee: row.fee !== null ? String(row.fee) : null,
      feeCurrency: row.fee_currency,
      sourceType: row.source_type,
      confidence: row.confidence,
      ...(row.estimation_notes !== null ? { estimationNotes: row.estimation_notes } : {}),
      ...(row.cost_known === false ? { costKnown: false } : {}),
    }))
    const downloadedScenarios: SavedScenario[] = (scenarios.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      mode: row.mode,
      currency: row.currency,
      inputs: row.inputs,
      createdAt: row.created_at,
    }))
    const downloadedImports: ImportBatch[] = (imports.data ?? []).map((row) => ({
      id: row.id,
      rawJson: row.raw_json,
      validationStatus: row.validation_status,
      warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
    }))
    const downloadedRiskProfile: RiskProfile | null =
      riskProfile.data === null
        ? null
        : {
            version: riskProfile.data.version,
            answers: riskProfile.data.answers,
            score: riskProfile.data.score,
            category: riskProfile.data.category,
            completedAt: riskProfile.data.completed_at,
          }

    applyingCloudSnapshot = true
    current.replaceFromCloud({
      settings,
      accounts: downloadedAccounts,
      assets: downloadedAssets,
      transactions: downloadedTransactions,
      scenarios: downloadedScenarios,
      importBatches: downloadedImports,
      riskProfile: downloadedRiskProfile,
    })
    applyingCloudSnapshot = false
    lastCloudSignature = cloudSignature()
    setCloudStatus({
      status: 'saved',
      message: `Datos cargados: ${downloadedAccounts.length} cuentas, ${downloadedAssets.length} activos, ${downloadedTransactions.length} operaciones, ${downloadedScenarios.length} escenarios e ${downloadedImports.length} importaciones.`,
      lastSyncedAt: nowIso(),
    })

    return {
      ok: true,
      message: `Descargados ${downloadedAccounts.length} cuentas, ${downloadedAssets.length} activos, ${downloadedTransactions.length} operaciones, ${downloadedScenarios.length} escenarios e ${downloadedImports.length} importaciones, incluidas tus preferencias.`,
    }
  } catch (error) {
    applyingCloudSnapshot = false
    const offline = isNetworkError(error)
    const message = offline
      ? 'Sin conexion: se conserva la cache local separada de este usuario.'
      : `Error cargando datos: ${error instanceof Error ? error.message : String(error)}`
    setCloudStatus({ status: offline ? 'offline' : 'error', message })
    return { ok: false, message }
  }
}

function scheduleAutoSync(): void {
  if (autoSyncUserId === null) return
  if (autoSyncTimer !== null) clearTimeout(autoSyncTimer)
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null
    void runAutoSync()
  }, AUTO_SYNC_DELAY_MS)
}

async function runAutoSync(): Promise<void> {
  if (autoSyncUserId === null) return
  const nextSignature = cloudSignature()
  if (nextSignature === lastCloudSignature) return

  if (autoSyncInFlight) {
    autoSyncPending = true
    return
  }

  autoSyncInFlight = true
  const result = await pushToCloud()
  autoSyncInFlight = false

  if (result.ok) {
    lastCloudSignature = cloudSignature()
  }
  if (autoSyncPending) {
    autoSyncPending = false
    scheduleAutoSync()
  }
}

export function startAutoSync(userId: string): void {
  stopAutoSync()
  autoSyncUserId = userId
  lastCloudSignature = cloudSignature()
  autoSyncUnsubscribe = useAppStore.subscribe((state) => {
    if (applyingCloudSnapshot || autoSyncUserId === null) return
    const nextSignature = cloudSignature(state)
    if (nextSignature === lastCloudSignature) return
    scheduleAutoSync()
  })
}

export function stopAutoSync(): void {
  if (autoSyncTimer !== null) {
    clearTimeout(autoSyncTimer)
    autoSyncTimer = null
  }
  if (autoSyncUnsubscribe !== null) {
    autoSyncUnsubscribe()
    autoSyncUnsubscribe = null
  }
  autoSyncUserId = null
  autoSyncInFlight = false
  autoSyncPending = false
}
