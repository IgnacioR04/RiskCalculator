/**
 * Vista de portfolio derivada del registro de transacciones (nunca de una
 * tabla de holdings editable). Valora en la divisa de presentación con
 * conversión FX explícita y propaga la calidad de cada dato.
 */
import type { Asset, BrokerAccount, Currency, DataQuality, Quote, Transaction } from './domain'
import { Decimal } from './finance/decimal'
import { concentration, simpleReturn } from './finance/metrics'
import { aggregatePosition, type AggregatedPosition, type FinTransaction } from './finance/position'
import type { FxRate } from './domain'
import { convertAmount } from './fx'
import { xirr, type XirrResult } from './finance/xirr'

export interface PositionView {
  asset: Asset
  accountIds: string[]
  quantity: Decimal
  /** Coste histórico en divisa de presentación (conversión por operación). */
  cost: Decimal
  /** Precio medio por unidad en divisa de presentación; null sin unidades. */
  averagePrice: Decimal | null
  /** Valor actual en divisa de presentación; null si no hay precio. */
  value: Decimal | null
  unrealizedPnl: Decimal | null
  unrealizedPnlPct: Decimal | null
  realizedPnl: Decimal
  /** Cotización empleada (en su divisa original). */
  quote: Quote | null
  /** Peor calidad de dato implicada en la valoración. */
  quality: DataQuality
  /** true si alguna operación es estimada o importada. */
  hasEstimatedTransactions: boolean
  /** Avisos de datos (sin precio, sin FX…). */
  warnings: string[]
  /** true si sus operaciones son incoherentes y no pudieron agregarse. */
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
  /** Posiciones valorables (con precio); las demás aparecen en warnings. */
  totalValue: Decimal
  totalCost: Decimal
  totalUnrealizedPnl: Decimal
  totalRealizedPnl: Decimal
  simpleReturnPct: Decimal | null
  moneyWeighted: XirrResult
  byType: AllocationSlice[]
  byAccount: AllocationSlice[]
  byCurrency: AllocationSlice[]
  concentration: ReturnType<typeof concentration>
  /** Peor calidad global de los datos usados. */
  quality: DataQuality
  warnings: string[]
  hasDemoData: boolean
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
    const assetTxs = transactions.filter((t) => t.assetId === asset.id)
    if (assetTxs.length === 0) continue

    const positionWarnings: string[] = []
    let quality: DataQuality = 'real'
    let costConverted = new Decimal(0)
    let hasEstimatedTransactions = false

    // Convierte cada operación a la divisa de presentación con el cambio de
    // su fecha (o el más cercano, marcado como estimación).
    const finTxs: FinTransaction[] = []
    for (const tx of assetTxs) {
      const conv = convertAmount(
        tx.investedAmount,
        tx.investedCurrency,
        displayCurrency,
        fxRates,
        tx.datetime.slice(0, 10),
      )
      if (conv === null) {
        positionWarnings.push(
          `Sin tipo de cambio ${tx.investedCurrency}→${displayCurrency} para una operación; se usa 1:1 y se marca como estimado.`,
        )
        quality = worstQuality(quality, 'estimated')
        finTxs.push({
          type: tx.type,
          datetime: tx.datetime,
          quantity: tx.quantity,
          amount: tx.investedAmount,
        })
      } else {
        quality = worstQuality(quality, conv.quality)
        finTxs.push({
          type: tx.type,
          datetime: tx.datetime,
          quantity: tx.quantity,
          amount: conv.amount,
        })
      }
      if (tx.sourceType !== 'exact') hasEstimatedTransactions = true
      if (tx.isDemo === true) quality = worstQuality(quality, 'demo')
    }

    // Una operación incoherente (p. ej. una venta de más unidades de las
    // disponibles, típico de una importación imperfecta) NO debe tumbar todo
    // el portfolio: se marca el activo con un aviso y se sigue con el resto.
    let agg: AggregatedPosition
    try {
      agg = aggregatePosition(finTxs)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      positionWarnings.push(
        `${asset.symbol}: operaciones incoherentes (${detail}). Revisa o elimina la operación problemática en la sección «Operaciones».`,
      )
      warnings.push(...positionWarnings)
      positions.push({
        asset,
        accountIds: [...new Set(assetTxs.map((t) => t.accountId))],
        quantity: new Decimal(0),
        cost: new Decimal(0),
        averagePrice: null,
        value: null,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
        realizedPnl: new Decimal(0),
        quote: null,
        quality: 'estimated',
        hasEstimatedTransactions,
        warnings: positionWarnings,
        inconsistent: true,
      })
      continue
    }
    costConverted = agg.cost

    // Cotización: proveedor → precio manual → nada.
    let quote: Quote | null = quotes[asset.id] ?? null
    if (quote === null && asset.manualPrice !== undefined) {
      quote = {
        assetId: asset.id,
        price: asset.manualPrice.price,
        currency: asset.manualPrice.currency,
        timestamp: asset.manualPrice.updatedAt,
        provider: 'manual',
        quality: 'manual',
        fetchedAt: asset.manualPrice.updatedAt,
      }
    }

    let value: Decimal | null = null
    if (quote !== null && agg.quantity.gt(0)) {
      const priceConv = convertAmount(quote.price, quote.currency, displayCurrency, fxRates)
      if (priceConv === null) {
        positionWarnings.push(
          `Sin tipo de cambio ${quote.currency}→${displayCurrency} para valorar ${asset.symbol}.`,
        )
      } else {
        value = agg.quantity.times(priceConv.amount)
        quality = worstQuality(quality, priceConv.quality)
        quality = worstQuality(quality, quote.quality)
      }
    } else if (quote === null && agg.quantity.gt(0)) {
      positionWarnings.push(
        `${asset.symbol} no tiene precio disponible: añade un precio manual para valorarla.`,
      )
    }

    const unrealized = value !== null ? value.minus(costConverted) : null

    positions.push({
      asset,
      accountIds: [...new Set(assetTxs.map((t) => t.accountId))],
      quantity: agg.quantity,
      cost: costConverted,
      averagePrice: agg.quantity.gt(0) ? costConverted.div(agg.quantity) : null,
      value,
      unrealizedPnl: unrealized,
      unrealizedPnlPct:
        unrealized !== null && costConverted.gt(0) ? unrealized.div(costConverted) : null,
      realizedPnl: agg.realizedPnl,
      quote,
      quality,
      hasEstimatedTransactions,
      warnings: positionWarnings,
    })
    warnings.push(...positionWarnings)
  }

  const valued = positions.filter((p) => p.value !== null)
  const totalValue = valued.reduce((a, p) => a.plus(p.value!), new Decimal(0))
  const totalCost = positions.reduce((a, p) => a.plus(p.cost), new Decimal(0))
  const totalUnrealizedPnl = valued.reduce((a, p) => a.plus(p.unrealizedPnl!), new Decimal(0))
  const totalRealizedPnl = positions.reduce((a, p) => a.plus(p.realizedPnl), new Decimal(0))

  // XIRR sobre flujos reales: aportaciones negativas, ventas positivas y el
  // valor actual como flujo final positivo.
  const flows = transactions
    .map((t) => {
      const conv = convertAmount(
        t.investedAmount,
        t.investedCurrency,
        displayCurrency,
        fxRates,
        t.datetime.slice(0, 10),
      )
      const amount = conv?.amount ?? new Decimal(t.investedAmount)
      return {
        date: new Date(t.datetime),
        amount: Number(t.type === 'buy' ? amount.neg().toString() : amount.toString()),
      }
    })
    .concat(
      totalValue.gt(0) ? [{ date: new Date(), amount: Number(totalValue.toString()) }] : [],
    )
  const moneyWeighted = xirr(flows)

  const byType = groupSlices(valued, (p) => [TYPE_LABEL[p.asset.assetType], p.asset.assetType])
  const byAccount = groupSlices(valued, (p) => {
    const first = p.accountIds[0]
    const account = accounts.find((a) => a.id === first)
    return [account !== undefined ? `${account.brokerName} · ${account.accountLabel}` : 'Sin cuenta', first ?? 'none']
  })
  const byCurrency = groupSlices(valued, (p) => [
    p.quote?.currency ?? p.asset.quoteCurrency,
    p.quote?.currency ?? p.asset.quoteCurrency,
  ])

  const overallQuality = positions.reduce<DataQuality>((q, p) => worstQuality(q, p.quality), 'real')

  return {
    positions,
    totalValue,
    totalCost,
    totalUnrealizedPnl,
    totalRealizedPnl,
    simpleReturnPct: simpleReturn(totalValue, totalCost),
    moneyWeighted,
    byType,
    byAccount,
    byCurrency,
    concentration: concentration(valued.map((p) => p.value!)),
    quality: overallQuality,
    warnings,
    hasDemoData: positions.some((p) => p.asset.isDemo === true),
  }
}

function groupSlices(
  positions: PositionView[],
  keyOf: (p: PositionView) => [label: string, key: string],
): AllocationSlice[] {
  const map = new Map<string, { label: string; value: Decimal }>()
  for (const p of positions) {
    const [label, key] = keyOf(p)
    const prev = map.get(key)
    map.set(key, { label, value: (prev?.value ?? new Decimal(0)).plus(p.value!) })
  }
  const total = [...map.values()].reduce((a, s) => a.plus(s.value), new Decimal(0))
  return [...map.entries()]
    .map(([key, s]) => ({
      key,
      label: s.label,
      value: s.value,
      weight: total.gt(0) ? s.value.div(total) : null,
    }))
    .sort((a, b) => b.value.comparedTo(a.value))
}
