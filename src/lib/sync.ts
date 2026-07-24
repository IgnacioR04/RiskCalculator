/**
 * Sincronización simple entre el estado local y Supabase para el piloto:
 * - push: sube cuentas, activos, transacciones, escenarios y perfil de riesgo
 *   del usuario autenticado (upsert por id).
 * - pull: descarga todo lo del usuario y REEMPLAZA el estado local
 *   (previa confirmación en la UI).
 *
 * El user_id lo pone el servidor a partir de la sesión; el cliente nunca lo
 * envía en el payload de datos, y las políticas RLS lo exigen igualmente.
 */
import type { Asset, BrokerAccount, SavedScenario, Transaction } from './domain'
import { getSupabase } from './supabase'
import { useAppStore } from '../state/store'

export interface SyncResult {
  ok: boolean
  message: string
}

export async function pushToCloud(): Promise<SyncResult> {
  const supabase = getSupabase()
  if (supabase === null) return { ok: false, message: 'Supabase no está configurado.' }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError !== null || userData.user === null) {
    return { ok: false, message: 'Inicia sesión antes de sincronizar.' }
  }
  const userId = userData.user.id
  const s = useAppStore.getState()

  // Los datos demo no se suben a la nube.
  const accounts = s.accounts.filter((a) => !a.id.startsWith('demo-'))
  const assets = s.assets.filter((a) => a.isDemo !== true)
  const transactions = s.transactions.filter((t) => t.isDemo !== true)

  const accountRows = accounts.map((a: BrokerAccount) => ({
    id: a.id,
    user_id: userId,
    broker_name: a.brokerName,
    account_label: a.accountLabel,
    country: a.country ?? null,
    default_currency: a.defaultCurrency,
  }))
  const assetRows = assets.map((a: Asset) => ({
    id: a.id,
    user_id: userId,
    symbol: a.symbol,
    name: a.name,
    asset_type: a.assetType,
    quote_currency: a.quoteCurrency,
    isin: a.isin ?? null,
    exchange: a.exchange ?? null,
    sector: a.sector ?? null,
    country: a.country ?? null,
    provider_ids: a.providerIds ?? {},
    manual_price: a.manualPrice ?? null,
  }))
  const txRows = transactions.map((t: Transaction) => ({
    id: t.id,
    user_id: userId,
    account_id: t.accountId,
    asset_id: t.assetId,
    type: t.type,
    datetime: t.datetime,
    invested_amount: t.investedAmount,
    invested_currency: t.investedCurrency,
    quantity: t.quantity,
    execution_price: t.executionPrice,
    quote_currency: t.quoteCurrency,
    fee: t.fee,
    fee_currency: t.feeCurrency,
    source_type: t.sourceType,
    confidence: t.confidence,
    estimation_notes: t.estimationNotes ?? null,
  }))
  const scenarioRows = s.scenarios.map((sc: SavedScenario) => ({
    id: sc.id,
    user_id: userId,
    name: sc.name,
    mode: sc.mode,
    currency: sc.currency,
    inputs: sc.inputs,
    created_at: sc.createdAt,
  }))

  const steps: { table: string; run: () => PromiseLike<{ error: { message: string } | null }> }[] = [
    { table: 'broker_accounts', run: () => supabase.from('broker_accounts').upsert(accountRows) },
    { table: 'assets', run: () => supabase.from('assets').upsert(assetRows) },
    { table: 'transactions', run: () => supabase.from('transactions').upsert(txRows) },
    { table: 'scenarios', run: () => supabase.from('scenarios').upsert(scenarioRows) },
  ]
  for (const step of steps) {
    const { error } = await step.run()
    if (error !== null) {
      return { ok: false, message: `Error subiendo ${step.table}: ${error.message}` }
    }
  }

  if (s.riskProfile !== null) {
    const { error } = await supabase.from('risk_profiles').insert({
      user_id: userId,
      version: s.riskProfile.version,
      answers: s.riskProfile.answers,
      score: s.riskProfile.score,
      category: s.riskProfile.category,
      completed_at: s.riskProfile.completedAt,
    })
    if (error !== null && !error.message.includes('duplicate')) {
      return { ok: false, message: `Error subiendo el perfil de riesgo: ${error.message}` }
    }
  }

  return {
    ok: true,
    message: `Subidos ${accountRows.length} cuentas, ${assetRows.length} activos, ${txRows.length} operaciones y ${scenarioRows.length} escenarios.`,
  }
}

export async function pullFromCloud(): Promise<SyncResult> {
  const supabase = getSupabase()
  if (supabase === null) return { ok: false, message: 'Supabase no está configurado.' }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError !== null || userData.user === null) {
    return { ok: false, message: 'Inicia sesión antes de sincronizar.' }
  }

  const [accounts, assets, transactions, scenarios] = await Promise.all([
    supabase.from('broker_accounts').select('*'),
    supabase.from('assets').select('*'),
    supabase.from('transactions').select('*'),
    supabase.from('scenarios').select('*'),
  ])
  for (const [name, r] of [
    ['broker_accounts', accounts],
    ['assets', assets],
    ['transactions', transactions],
    ['scenarios', scenarios],
  ] as const) {
    if (r.error !== null) return { ok: false, message: `Error leyendo ${name}: ${r.error.message}` }
  }

  const store = useAppStore.getState()
  store.clearAll()
  const state = useAppStore.getState()

  for (const row of accounts.data ?? []) {
    state.addAccount({
      id: row.id,
      brokerName: row.broker_name,
      accountLabel: row.account_label,
      defaultCurrency: row.default_currency,
      ...(row.country !== null ? { country: row.country } : {}),
    })
  }
  for (const row of assets.data ?? []) {
    state.addAsset({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      assetType: row.asset_type,
      quoteCurrency: row.quote_currency,
      ...(row.isin !== null ? { isin: row.isin } : {}),
      ...(row.exchange !== null ? { exchange: row.exchange } : {}),
      ...(row.sector !== null ? { sector: row.sector } : {}),
      ...(row.country !== null ? { country: row.country } : {}),
      ...(row.provider_ids !== null ? { providerIds: row.provider_ids } : {}),
      ...(row.manual_price !== null ? { manualPrice: row.manual_price } : {}),
    })
  }
  state.addTransactions(
    (transactions.data ?? []).map((row) => ({
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
    })),
  )
  for (const row of scenarios.data ?? []) {
    state.addScenario({
      id: row.id,
      name: row.name,
      mode: row.mode,
      currency: row.currency,
      inputs: row.inputs,
      createdAt: row.created_at,
    })
  }

  return {
    ok: true,
    message: `Descargados ${(accounts.data ?? []).length} cuentas, ${(assets.data ?? []).length} activos, ${(transactions.data ?? []).length} operaciones y ${(scenarios.data ?? []).length} escenarios.`,
  }
}
