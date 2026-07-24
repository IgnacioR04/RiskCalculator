/**
 * Convierte un payload de importación validado en entidades del dominio,
 * reutilizando cuentas/activos existentes cuando coinciden. NO persiste nada:
 * devuelve una propuesta que la UI muestra y el usuario confirma.
 */
import type { Asset, BrokerAccount, Currency, Transaction } from '../domain'
import { uid } from '../domain'
import { dec } from '../finance/decimal'
import type { ImportPayload } from './schema'

export interface ImportProposal {
  newAccounts: BrokerAccount[]
  newAssets: Asset[]
  transactions: Transaction[]
  /** Notas por elemento: inferencias, descartes y datos dudosos. */
  notes: string[]
}

const TYPE_MAP: Record<string, Asset['assetType']> = {
  stock: 'stock',
  etf: 'etf',
  crypto: 'crypto',
  commodity: 'commodity',
  index: 'index',
  cash: 'cash',
  other: 'manual',
}

export function buildImportProposal(
  payload: ImportPayload,
  existingAccounts: readonly BrokerAccount[],
  existingAssets: readonly Asset[],
): ImportProposal {
  const notes: string[] = []
  const newAccounts: BrokerAccount[] = []
  const newAssets: Asset[] = []
  const transactions: Transaction[] = []

  const accountByBroker = (broker: string | null): BrokerAccount => {
    const name = (broker ?? 'Importado').trim()
    const existing =
      existingAccounts.find((a) => a.brokerName.toLowerCase() === name.toLowerCase()) ??
      newAccounts.find((a) => a.brokerName.toLowerCase() === name.toLowerCase())
    if (existing !== undefined) return existing
    const declared = payload.accounts.find((a) => a.broker.toLowerCase() === name.toLowerCase())
    const account: BrokerAccount = {
      id: uid(),
      brokerName: name,
      accountLabel: declared?.label ?? 'Importada',
      defaultCurrency: (declared?.currency ?? 'EUR') as Currency,
    }
    newAccounts.push(account)
    return account
  }

  const assetFor = (a: {
    symbol: string | null
    name: string | null
    type: string | null
    quote_currency: Currency | null
    isin: string | null
  }): Asset | null => {
    const symbol = a.symbol?.toUpperCase() ?? null
    if (symbol === null && a.name === null) return null
    const match =
      existingAssets.find(
        (x) =>
          (symbol !== null && x.symbol.toUpperCase() === symbol) ||
          (a.isin !== null && x.isin === a.isin),
      ) ??
      newAssets.find((x) => symbol !== null && x.symbol.toUpperCase() === symbol)
    if (match !== undefined) return match
    const asset: Asset = {
      id: uid(),
      symbol: symbol ?? (a.name ?? 'ACTIVO').slice(0, 12).toUpperCase(),
      name: a.name ?? symbol ?? 'Activo importado',
      assetType: TYPE_MAP[a.type ?? 'other'] ?? 'manual',
      quoteCurrency: a.quote_currency ?? 'EUR',
      ...(a.isin !== null ? { isin: a.isin } : {}),
    }
    newAssets.push(asset)
    return asset
  }

  payload.transactions.forEach((t, i) => {
    const asset = assetFor(t.asset)
    if (asset === null) {
      notes.push(`Operación ${i + 1}: descartada, no identifica el activo.`)
      return
    }
    const account = accountByBroker(t.account_broker)

    let amount = t.invested_amount
    let quantity = t.quantity
    if (amount === null && quantity !== null && t.execution_price !== null) {
      amount = dec(quantity).times(dec(t.execution_price)).toString()
      notes.push(`Operación ${i + 1}: importe derivado de cantidad × precio.`)
    }
    if (quantity === null && amount !== null && t.execution_price !== null) {
      quantity = dec(amount).div(dec(t.execution_price)).toString()
      notes.push(`Operación ${i + 1}: cantidad derivada de importe ÷ precio.`)
    }
    if (amount === null || quantity === null) {
      notes.push(
        `Operación ${i + 1} (${asset.symbol}): descartada, faltan datos para derivar importe y cantidad.`,
      )
      return
    }
    if (dec(amount).lte(0) || dec(quantity).lte(0)) {
      notes.push(`Operación ${i + 1} (${asset.symbol}): descartada, importe o cantidad no positivos.`)
      return
    }

    let datetime = t.datetime
    if (datetime === null) {
      datetime = new Date().toISOString()
      notes.push(`Operación ${i + 1} (${asset.symbol}): sin fecha visible; se usa hoy (revísala).`)
    } else {
      const parsed = new Date(datetime)
      if (Number.isNaN(parsed.getTime())) {
        notes.push(`Operación ${i + 1} (${asset.symbol}): fecha «${datetime}» no interpretable; se usa hoy.`)
        datetime = new Date().toISOString()
      } else {
        datetime = parsed.toISOString()
      }
    }

    const currency = t.invested_currency ?? asset.quoteCurrency
    if (t.invested_currency === null) {
      notes.push(`Operación ${i + 1} (${asset.symbol}): divisa no visible; se asume ${currency}.`)
    }

    transactions.push({
      id: uid(),
      accountId: account.id,
      assetId: asset.id,
      type: t.type,
      datetime,
      investedAmount: amount,
      investedCurrency: currency,
      quantity,
      executionPrice: t.execution_price,
      quoteCurrency: currency,
      fee: null,
      feeCurrency: null,
      sourceType: 'json_import',
      confidence: t.confidence,
      estimationNotes: t.evidence ?? 'Importado por JSON',
    })
  })

  payload.positions.forEach((p, i) => {
    const asset = assetFor(p.asset)
    if (asset === null) {
      notes.push(`Posición ${i + 1}: descartada, no identifica el activo.`)
      return
    }
    const account = accountByBroker(p.account_broker)
    const currency = p.currency ?? asset.quoteCurrency

    if (p.current_value !== null && p.quantity !== null && dec(p.quantity).gt(0)) {
      const price = dec(p.current_value).div(dec(p.quantity))
      const target = newAssets.find((x) => x.id === asset.id)
      if (target !== undefined) {
        target.manualPrice = {
          price: price.toString(),
          currency,
          updatedAt: new Date().toISOString(),
        }
      }
      transactions.push(
        positionAsEstimatedBuy(asset, account, p.current_value, p.quantity, currency, p.evidence),
      )
      notes.push(
        `Posición ${i + 1} (${asset.symbol}): registrada como compra estimada por su valor actual; corrige fecha y coste real cuando los conozcas.`,
      )
    } else if (p.current_value !== null) {
      // Solo se conoce el valor: se registra 1:1 (cantidad = valor, precio 1)
      // como marcador de posición manual, claramente estimado.
      const target = newAssets.find((x) => x.id === asset.id)
      if (target !== undefined && target.manualPrice === undefined) {
        target.manualPrice = { price: '1', currency, updatedAt: new Date().toISOString() }
      }
      transactions.push(
        positionAsEstimatedBuy(asset, account, p.current_value, p.current_value, currency, p.evidence),
      )
      notes.push(
        `Posición ${i + 1} (${asset.symbol}): solo se ve el valor (${p.current_value} ${currency}); se registra como marcador estimado con precio 1. Ajusta cantidad y precio reales.`,
      )
    } else {
      notes.push(`Posición ${i + 1} (${asset.symbol}): descartada, sin valor ni cantidad utilizables.`)
    }
  })

  return { newAccounts, newAssets, transactions, notes }
}

function positionAsEstimatedBuy(
  asset: Asset,
  account: BrokerAccount,
  amount: string,
  quantity: string,
  currency: Currency,
  evidence: string | null,
): Transaction {
  return {
    id: uid(),
    accountId: account.id,
    assetId: asset.id,
    type: 'buy',
    datetime: new Date().toISOString(),
    investedAmount: amount,
    investedCurrency: currency,
    quantity,
    executionPrice: null,
    quoteCurrency: currency,
    fee: null,
    feeCurrency: null,
    sourceType: 'json_import',
    confidence: 'low',
    estimationNotes: evidence ?? 'Posición importada sin historial de compras',
  }
}
