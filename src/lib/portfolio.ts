/**
 * Vista de portfolio derivada del registro de operaciones.
 *
 * Principios:
 * - Nunca se inventa un FX 1:1. Si falta un cambio, las métricas monetarias
 *   dependientes de ese flujo quedan no disponibles.
 * - Las posiciones se agregan por activo para la vista principal, pero la
 *   distribución por cuenta se calcula transacción a transacción.
 * - Compras, ventas y comisiones forman parte de la rentabilidad total.
 */
import type {
  Asset,
  BrokerAccount,
  Currency,
  DataQuality,
  FxRate,
  Quote,
  Transaction,
} from './domain'
import { Decimal } from './finance/decimal'
import { concentration } from './finance/metrics'
import { aggregatePosition, type AggregatedPosition, type FinTransaction } from './finance/position'
import { convertAmount } from './fx'
import { xirr, type XirrResult } from './finance/xirr'

export interface AccountPositionBreakdown {
  accountId: string
  quantity: Decimal
  value: Decimal | null
}

export interface PositionView {
  asset: Asset
  accountIds: string[]
  accountBreakdown: AccountPositionBreakdown[]
  quantity: Decimal
  /** Base de coste pendiente; null cuando falta algún cambio histórico. */
  cost: Decimal | null
  averagePrice: Decimal | null
  value: Decimal | null
  unrealizedPnl: Decimal | null
  unrealizedPnlPct: Decimal | null
  realizedPnl: Decimal | null
  totalInvested: Decimal | null
  totalProceeds: Decimal | null
  totalFees: Decimal | null
  quote: Quote | null
  quality: DataQuality
  hasEstimatedTransactions: boolean
  warnings: string[]
  inconsistent?: boolean
}

export interface AllocationSlice {
  key: string
  label: string
  value: Decimal
  weight: Decimal | null
}

export interface PortfolioView {
  positions: PositionView[]
  totalValue: Decimal
  /** Base de coste de las posiciones abiertas. No equivale a aportaciones. */
  totalCostBasis: Decimal | null
  /** Compras + comisiones de compra acumuladas. */
  totalInvested: Decimal | null
  /** Ventas netas de comisiones acumuladas. */
  totalProceeds: Decimal | null
  /** Compras menos ventas netas. */
  netContributed: Decimal | null
  totalFees: Decimal | null
  totalUnrealizedPnl: Decimal | null
  totalRealizedPnl: Decimal | null
  /** Valor actual + ventas netas − compras y comisiones. */
  totalPnl: Decimal | null
  /** P&L total / capital histórico invertido. */
  totalReturnPct: Decimal | null
  moneyWeighted: XirrResult
  byType: AllocationSlice[]
  byAccount: AllocationSlice[]
  byCurrency: AllocationSlice[]
  bySector: AllocationSlice[]
  byCountry: AllocationSlice[]
  concentration: ReturnType<typeof concentration>
  quality: DataQuality
  warnings: string[]
  hasDemoData: boolean
  valuationComplete: boolean
  financialsComplete: boolean
}

const QUALITY_ORDER: DataQuality[] = ['real', 'delayed', 'estimated', 'manual', 'demo']

function worstQuality(a: DataQuality, b: DataQuality): DataQuality {
  return QUALITY_ORDER.indexOf(a) >= QUALITY_ORDER.indexOf(b) ? a : b
}

const TYPE_LABEL: Record<Asset['assetType'], string> = {
  stock: 'Acciones',
  etf: 'ETF',
  crypto: 'Cripto',
  commodity: 'Materias primas',
  index: 'Índices',
  cash: 'Efectivo',
  manual: 'Manual',
}

interface ConvertedTransactions {
  complete: boolean
  transactions: FinTransaction[]
}

function convertTransactions(
  transactions: readonly Transaction[],
  displayCurrency: Currency,
  fxRates: readonly FxRate[],
  warnings: string[],
): ConvertedTransactions {
  let complete = true
  const converted: FinTransaction[] = []

  for (const tx of transactions) {
    const date = tx.datetime.slice(0, 10)
    if (tx.costKnown === false) {
      complete = false
      warnings.push(
        `La posición importada del ${date} no incluye coste histórico. Se muestran sus unidades y valor, pero no su rentabilidad.`,
      )
    }
    const amount = convertAmount(
      tx.investedAmount,
      tx.investedCurrency,
      displayCurrency,
      fxRates,
      date,
    )
    let fee = new Decimal(0)
    if (tx.fee !== null && new Decimal(tx.fee).gt(0)) {
      const feeCurrency = tx.feeCurrency ?? tx.investedCurrency
      const convertedFee = convertAmount(tx.fee, feeCurrency, displayCurrency, fxRates, date)
      if (convertedFee === null) {
        complete = false
        warnings.push(
          `Sin cambio ${feeCurrency}→${displayCurrency} para la comisión del ${date}.`,
        )
      } else {
        fee = convertedFee.amount
      }
    }

    if (amount === null) {
      complete = false
      warnings.push(
        `Sin cambio ${tx.investedCurrency}→${displayCurrency} para la operación del ${date}. Los costes y rentabilidades quedan sin calcular.`,
      )
    }
    converted.push({
      type: tx.type,
      datetime: tx.datetime,
      quantity: tx.quantity,
      // Cero permite validar cantidades/ventas sin inventar un contravalor.
      amount: amount?.amount ?? 0,
      fee,
    })
  }
  return { complete, transactions: converted }
}

function resolveQuote(asset: Asset, quotes: Record<string, Quote>): Quote | null {
  const quote = quotes[asset.id]
  if (quote !== undefined) return quote
  if (asset.manualPrice === undefined) return null
  return {
    assetId: asset.id,
    price: asset.manualPrice.price,
    currency: asset.manualPrice.currency,
    timestamp: asset.manualPrice.updatedAt,
    provider: 'manual',
    quality: 'manual',
    fetchedAt: asset.manualPrice.updatedAt,
  }
}

export function buildPortfolioView(input: {
  assets: Asset[]
  accounts: BrokerAccount[]
  transactions: Transaction[]
  quotes: Record<string, Quote>
  fxRates: FxRate[]
  displayCurrency: Currency
}): PortfolioView {
  const { assets, accounts, transactions, quotes, fxRates, displayCurrency } = input
  const warnings: string[] = []
  const positions: PositionView[] = []

  for (const asset of assets) {
    const assetTxs = transactions.filter((tx) => tx.assetId === asset.id)
    if (assetTxs.length === 0) continue

    const positionWarnings: string[] = []
    let quality: DataQuality = 'real'
    const converted = convertTransactions(
      assetTxs,
      displayCurrency,
      fxRates,
      positionWarnings,
    )
    const hasEstimatedTransactions = assetTxs.some((tx) => tx.sourceType !== 'exact')
    for (const tx of assetTxs) {
      if (tx.sourceType !== 'exact') quality = worstQuality(quality, 'estimated')
      if (tx.isDemo === true) quality = worstQuality(quality, 'demo')
    }

    let aggregated: AggregatedPosition
    try {
      aggregated = aggregatePosition(converted.transactions)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      positionWarnings.push(
        `${asset.symbol}: operaciones incoherentes (${detail}). Revisa la operación problemática.`,
      )
      warnings.push(...positionWarnings)
      positions.push({
        asset,
        accountIds: [...new Set(assetTxs.map((tx) => tx.accountId))],
        accountBreakdown: [],
        quantity: new Decimal(0),
        cost: null,
        averagePrice: null,
        value: null,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
        realizedPnl: null,
        totalInvested: null,
        totalProceeds: null,
        totalFees: null,
        quote: null,
        quality: 'estimated',
        hasEstimatedTransactions,
        warnings: positionWarnings,
        inconsistent: true,
      })
      continue
    }

    const quote = resolveQuote(asset, quotes)
    let displayPrice: Decimal | null = null
    if (aggregated.quantity.isZero()) {
      displayPrice = new Decimal(0)
    } else if (quote === null) {
      positionWarnings.push(
        `${asset.symbol} no tiene precio disponible: añade uno manual o actualiza mercados.`,
      )
    } else {
      const convertedPrice = convertAmount(quote.price, quote.currency, displayCurrency, fxRates)
      if (convertedPrice === null) {
        positionWarnings.push(
          `Sin cambio ${quote.currency}→${displayCurrency} para valorar ${asset.symbol}.`,
        )
      } else {
        displayPrice = convertedPrice.amount
        quality = worstQuality(quality, convertedPrice.quality)
        quality = worstQuality(quality, quote.quality)
      }
    }

    const value =
      displayPrice === null ? null : aggregated.quantity.times(displayPrice)
    const cost = converted.complete ? aggregated.cost : null
    const realizedPnl = converted.complete ? aggregated.realizedPnl : null
    const unrealizedPnl =
      value !== null && cost !== null ? value.minus(cost) : null

    const accountBreakdown: AccountPositionBreakdown[] = []
    for (const accountId of new Set(assetTxs.map((tx) => tx.accountId))) {
      try {
        const accountAgg = aggregatePosition(
          converted.transactions.filter(
            (_tx, index) => assetTxs[index]?.accountId === accountId,
          ),
        )
        accountBreakdown.push({
          accountId,
          quantity: accountAgg.quantity,
          value:
            displayPrice === null ? null : accountAgg.quantity.times(displayPrice),
        })
      } catch {
        // La incoherencia global ya está explicada en el activo.
      }
    }

    positions.push({
      asset,
      accountIds: [...new Set(assetTxs.map((tx) => tx.accountId))],
      accountBreakdown,
      quantity: aggregated.quantity,
      cost,
      averagePrice:
        cost !== null && aggregated.quantity.gt(0)
          ? cost.div(aggregated.quantity)
          : null,
      value,
      unrealizedPnl,
      unrealizedPnlPct:
        unrealizedPnl !== null && cost !== null && cost.gt(0)
          ? unrealizedPnl.div(cost)
          : null,
      realizedPnl,
      totalInvested: converted.complete ? aggregated.totalInvested : null,
      totalProceeds: converted.complete ? aggregated.totalProceeds : null,
      totalFees: converted.complete ? aggregated.totalFees : null,
      quote,
      quality,
      hasEstimatedTransactions,
      warnings: positionWarnings,
    })
    warnings.push(...positionWarnings)
  }

  const coherent = positions.filter((position) => position.inconsistent !== true)
  const openPositions = coherent.filter((position) => position.quantity.gt(0))
  const valued = coherent.filter((position) => position.value !== null)
  const totalValue = valued.reduce(
    (sum, position) => sum.plus(position.value!),
    new Decimal(0),
  )
  const valuationComplete = openPositions.every((position) => position.value !== null)
  const financialsComplete = coherent.every(
    (position) =>
      position.cost !== null &&
      position.realizedPnl !== null &&
      position.totalInvested !== null &&
      position.totalProceeds !== null &&
      position.totalFees !== null,
  )

  const totalCostBasis = financialsComplete
    ? coherent.reduce((sum, position) => sum.plus(position.cost!), new Decimal(0))
    : null
  const totalInvested = financialsComplete
    ? coherent.reduce((sum, position) => sum.plus(position.totalInvested!), new Decimal(0))
    : null
  const totalProceeds = financialsComplete
    ? coherent.reduce((sum, position) => sum.plus(position.totalProceeds!), new Decimal(0))
    : null
  const totalFees = financialsComplete
    ? coherent.reduce((sum, position) => sum.plus(position.totalFees!), new Decimal(0))
    : null
  const totalUnrealizedPnl =
    valuationComplete && financialsComplete
      ? coherent.reduce((sum, position) => sum.plus(position.unrealizedPnl ?? 0), new Decimal(0))
      : null
  const totalRealizedPnl = financialsComplete
    ? coherent.reduce((sum, position) => sum.plus(position.realizedPnl!), new Decimal(0))
    : null
  const netContributed =
    totalInvested !== null && totalProceeds !== null
      ? totalInvested.minus(totalProceeds)
      : null
  const totalPnl =
    valuationComplete && totalInvested !== null && totalProceeds !== null
      ? totalValue.plus(totalProceeds).minus(totalInvested)
      : null
  const totalReturnPct =
    totalPnl !== null && totalInvested !== null && totalInvested.gt(0)
      ? totalPnl.div(totalInvested)
      : null

  const flows: { date: Date; amount: number }[] = []
  let flowsComplete = true
  for (const tx of transactions) {
    if (tx.costKnown === false) {
      flowsComplete = false
      break
    }
    const date = tx.datetime.slice(0, 10)
    const amount = convertAmount(
      tx.investedAmount,
      tx.investedCurrency,
      displayCurrency,
      fxRates,
      date,
    )
    const fee =
      tx.fee === null
        ? { amount: new Decimal(0) }
        : convertAmount(
            tx.fee,
            tx.feeCurrency ?? tx.investedCurrency,
            displayCurrency,
            fxRates,
            date,
          )
    if (amount === null || fee === null) {
      flowsComplete = false
      break
    }
    const flow =
      tx.type === 'buy'
        ? amount.amount.plus(fee.amount).neg()
        : Decimal.max(amount.amount.minus(fee.amount), 0)
    flows.push({ date: new Date(tx.datetime), amount: Number(flow.toString()) })
  }
  if (valuationComplete && totalValue.gt(0)) {
    flows.push({ date: new Date(), amount: Number(totalValue.toString()) })
  }
  const moneyWeighted: XirrResult =
    flowsComplete && valuationComplete ? xirr(flows) : { ok: false, reason: 'missing_data' }

  const byType = groupPositions(valued, (position) => [
    TYPE_LABEL[position.asset.assetType],
    position.asset.assetType,
  ])
  const byCurrency = groupPositions(valued, (position) => {
    const currency = position.quote?.currency ?? position.asset.quoteCurrency
    return [currency, currency]
  })
  const bySector = groupPositions(valued, (position) => [
    position.asset.sector?.trim() || 'Sin clasificar',
    position.asset.sector?.trim().toLowerCase() || 'unclassified',
  ])
  const byCountry = groupPositions(valued, (position) => [
    position.asset.country?.trim() || 'Sin clasificar',
    position.asset.country?.trim().toLowerCase() || 'unclassified',
  ])

  const accountEntries = coherent.flatMap((position) =>
    position.accountBreakdown.flatMap((part) =>
      part.value === null
        ? []
        : [
            {
              key: part.accountId,
              label:
                accounts.find((account) => account.id === part.accountId) !== undefined
                  ? `${accounts.find((account) => account.id === part.accountId)!.brokerName} · ${accounts.find((account) => account.id === part.accountId)!.accountLabel}`
                  : 'Sin cuenta',
              value: part.value,
            },
          ],
    ),
  )
  const byAccount = groupEntries(accountEntries)
  const overallQuality = positions.reduce<DataQuality>(
    (current, position) => worstQuality(current, position.quality),
    'real',
  )

  return {
    positions,
    totalValue,
    totalCostBasis,
    totalInvested,
    totalProceeds,
    netContributed,
    totalFees,
    totalUnrealizedPnl,
    totalRealizedPnl,
    totalPnl,
    totalReturnPct,
    moneyWeighted,
    byType,
    byAccount,
    byCurrency,
    bySector,
    byCountry,
    concentration: concentration(valued.map((position) => position.value!)),
    quality:
      valuationComplete && financialsComplete
        ? overallQuality
        : worstQuality(overallQuality, 'estimated'),
    warnings: [...new Set(warnings)],
    hasDemoData: positions.some((position) => position.asset.isDemo === true),
    valuationComplete,
    financialsComplete,
  }
}

function groupPositions(
  positions: PositionView[],
  keyOf: (position: PositionView) => [label: string, key: string],
): AllocationSlice[] {
  return groupEntries(
    positions.map((position) => {
      const [label, key] = keyOf(position)
      return { key, label, value: position.value! }
    }),
  )
}

function groupEntries(
  entries: readonly { key: string; label: string; value: Decimal }[],
): AllocationSlice[] {
  const grouped = new Map<string, { label: string; value: Decimal }>()
  for (const entry of entries) {
    const previous = grouped.get(entry.key)
    grouped.set(entry.key, {
      label: entry.label,
      value: (previous?.value ?? new Decimal(0)).plus(entry.value),
    })
  }
  const total = [...grouped.values()].reduce(
    (sum, entry) => sum.plus(entry.value),
    new Decimal(0),
  )
  return [...grouped.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      value: entry.value,
      weight: total.gt(0) ? entry.value.div(total) : null,
    }))
    .sort((a, b) => b.value.comparedTo(a.value))
}
