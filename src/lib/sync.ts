/**
 * Sincronización espejo con Supabase.
 *
 * `push` deja la nube igual que el estado local no-demo: crea/actualiza y
 * elimina filas que ya no existen. `pull` sustituye el bloque persistente de
 * forma atómica y también recupera ajustes y el último perfil de riesgo.
 */
import type {
  Asset,
  BrokerAccount,
  RiskProfile,
  SavedScenario,
  Settings,
  Transaction,
} from './domain'
import { getSupabase } from './supabase'
import { useAppStore } from '../state/store'

export interface SyncResult {
  ok: boolean
  message: string
}

type SupabaseError = { message: string } | null

async function mirrorTable(
  table: string,
  rows: { id: string; user_id: string }[],
  userId: string,
): Promise<SupabaseError> {
  const supabase = getSupabase()
  if (supabase === null) return { message: 'Supabase no está configurado.' }

  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows)
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
  const { error: deleteError } = await supabase.from(table).delete().in('id', staleIds)
  return deleteError
}

export async function pushToCloud(): Promise<SyncResult> {
  const supabase = getSupabase()
  if (supabase === null) return { ok: false, message: 'Supabase no está configurado.' }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError !== null || userData.user === null) {
    return { ok: false, message: 'Inicia sesión antes de sincronizar.' }
  }
  const userId = userData.user.id
  const state = useAppStore.getState()

  const accounts = state.accounts.filter((account) => !account.id.startsWith('demo-'))
  const assets = state.assets.filter((asset) => asset.isDemo !== true)
  const transactions = state.transactions.filter((transaction) => transaction.isDemo !== true)

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

  // Primero crea padres, luego hijos; elimina hijos obsoletos antes de padres.
  if (accountRows.length > 0) {
    const { error } = await supabase.from('broker_accounts').upsert(accountRows)
    if (error !== null) {
      return { ok: false, message: `Error subiendo broker_accounts: ${error.message}` }
    }
  }
  if (assetRows.length > 0) {
    const { error } = await supabase.from('assets').upsert(assetRows)
    if (error !== null) {
      return { ok: false, message: `Error subiendo assets: ${error.message}` }
    }
  }
  for (const [table, rows] of [
    ['transactions', transactionRows],
    ['scenarios', scenarioRows],
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

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    display_currency: state.settings.displayCurrency,
    locale: state.settings.locale,
    risk_free_rate: state.settings.riskFreeRate,
  })
  if (profileError !== null) {
    return { ok: false, message: `Error subiendo ajustes: ${profileError.message}` }
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

  return {
    ok: true,
    message: `Nube sincronizada: ${accountRows.length} cuentas, ${assetRows.length} activos, ${transactionRows.length} operaciones y ${scenarioRows.length} escenarios.`,
  }
}

export async function pullFromCloud(): Promise<SyncResult> {
  const supabase = getSupabase()
  if (supabase === null) return { ok: false, message: 'Supabase no está configurado.' }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError !== null || userData.user === null) {
    return { ok: false, message: 'Inicia sesión antes de sincronizar.' }
  }
  const userId = userData.user.id

  const [accounts, assets, transactions, scenarios, profile, riskProfile] = await Promise.all([
    supabase.from('broker_accounts').select('*'),
    supabase.from('assets').select('*'),
    supabase.from('transactions').select('*'),
    supabase.from('scenarios').select('*'),
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
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
    ['profiles', profile],
    ['risk_profiles', riskProfile],
  ] as const) {
    if (result.error !== null) {
      return { ok: false, message: `Error leyendo ${name}: ${result.error.message}` }
    }
  }

  const current = useAppStore.getState()
  const settings: Settings =
    profile.data === null
      ? current.settings
      : {
          displayCurrency: profile.data.display_currency,
          locale: profile.data.locale,
          riskFreeRate: String(profile.data.risk_free_rate),
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

  current.replaceFromCloud({
    settings,
    accounts: downloadedAccounts,
    assets: downloadedAssets,
    transactions: downloadedTransactions,
    scenarios: downloadedScenarios,
    riskProfile: downloadedRiskProfile,
  })
  return {
    ok: true,
    message: `Descargados ${downloadedAccounts.length} cuentas, ${downloadedAssets.length} activos, ${downloadedTransactions.length} operaciones y ${downloadedScenarios.length} escenarios, incluidos tus ajustes.`,
  }
}
