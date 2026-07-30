/**
 * Convierte un JSON validado en una propuesta reversible. Las capturas de
 * posiciones pueden crear una "posición de apertura" con coste desconocido:
 * permite ver unidades y valoración, pero bloquea P&L/XIRR hasta completar el
 * coste real.
 */
import type {
  Asset,
  BrokerAccount,
  Currency,
  Transaction,
} from '../domain'
import { uid } from '../domain'
import { dec } from '../finance/decimal'
import { aggregatePosition, type FinTransaction } from '../finance/position'
import type { ImportPayload } from './schema'

export interface IncompleteImportPosition {
  label: string
  reason: string
}

export interface ImportProposal {
  newAccounts: BrokerAccount[]
  newAssets: Asset[]
  assetUpdates: { id: string; patch: Partial<Asset> }[]
  transactions: Transaction[]
  incompletePositions: IncompleteImportPosition[]
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

type ImportAsset = ImportPayload['transactions'][number]['asset']

function normalized(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? ''
}

function assetMatches(existing: Asset, incoming: ImportAsset): boolean {
  if (incoming.isin !== null && existing.isin !== undefined) {
    return normalized(existing.isin) === normalized(incoming.isin)
  }
  // Identidad por símbolo O por nombre. Con solo el símbolo, una captura que
  // muestra «Bitcoin» sin ticker creaba un activo aparte del BTC existente, y
  // la misma posición acababa contada dos veces.
  const symbol = normalized(incoming.symbol)
  const name = normalized(incoming.name)
  const symbolMatches = symbol !== '' && normalized(existing.symbol) === symbol
  const nameMatches = name !== '' && normalized(existing.name) === name
  if (!symbolMatches && !nameMatches) return false
  if (
    incoming.exchange !== null &&
    existing.exchange !== undefined &&
    normalized(existing.exchange) !== normalized(incoming.exchange)
  ) {
    return false
  }
  // La divisa de cotización NO decide la identidad: el mismo Bitcoin se
  // muestra en EUR en una app y en USD en otra. Descartar por ese campo hacía
  // que una misma posición se contase dos veces.
  if (
    incoming.type !== null &&
    (TYPE_MAP[incoming.type] ?? 'manual') !== existing.assetType
  ) {
    return false
  }
  return true
}

export function buildImportProposal(
  payload: ImportPayload,
  existingAccounts: readonly BrokerAccount[],
  existingAssets: readonly Asset[],
  existingTransactions: readonly Transaction[] = [],
): ImportProposal {
  const notes: string[] = []
  const incompletePositions: IncompleteImportPosition[] = []
  const newAccounts: BrokerAccount[] = []
  const newAssets: Asset[] = []
  const assetUpdates: { id: string; patch: Partial<Asset> }[] = []
  const transactions: Transaction[] = []

  function accountByBroker(broker: string | null, itemLabel: string): BrokerAccount | null {
    if (broker === null || broker.trim() === '') {
      if (payload.accounts.length === 1) {
        return accountByBroker(payload.accounts[0]!.broker, itemLabel)
      }
      const candidates = [...existingAccounts, ...newAccounts]
      if (candidates.length === 1) return candidates[0]!
      notes.push(
        `${itemLabel}: no indica cuenta y hay ${candidates.length} posibles; se omite para no asignarla al bróker equivocado.`,
      )
      return null
    }

    const name = broker.trim()
    const matches = [...existingAccounts, ...newAccounts].filter(
      (account) => account.brokerName.toLowerCase() === name.toLowerCase(),
    )
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) {
      notes.push(
        `${itemLabel}: hay varias cuentas de ${name}; se omite porque el JSON no identifica cuál.`,
      )
      return null
    }
    const declared = payload.accounts.find(
      (account) => account.broker.toLowerCase() === name.toLowerCase(),
    )
    const account: BrokerAccount = {
      id: uid(),
      brokerName: name,
      accountLabel: declared?.label ?? 'Importada',
      defaultCurrency: (declared?.currency ?? 'EUR') as Currency,
    }
    newAccounts.push(account)
    return account
  }

  function assetFor(incoming: ImportAsset): Asset | null {
    const symbol = incoming.symbol?.toUpperCase() ?? null
    if (symbol === null && incoming.name === null) return null
    const candidates = [...existingAssets, ...newAssets].filter((asset) =>
      assetMatches(asset, incoming),
    )
    if (candidates.length > 1) {
      notes.push(
        `${symbol ?? incoming.name}: coincide con varios instrumentos. Añade ISIN o mercado para desambiguar.`,
      )
      return null
    }
    const match = candidates[0]
    if (match !== undefined) {
      const patch: Partial<Asset> = {}
      // Si el activo se guardó sin ticker (símbolo = nombre) y ahora otra
      // captura sí lo muestra, se completa. Así «Bitcoin» pasa a ser «BTC».
      if (
        symbol !== null &&
        normalized(match.symbol) === normalized(match.name) &&
        normalized(match.symbol) !== normalized(symbol)
      ) {
        patch.symbol = symbol
        notes.push(`${match.name}: se completa su ticker con «${symbol}» desde otra captura.`)
      }
      if (incoming.sector !== null && match.sector === undefined) patch.sector = incoming.sector
      if (incoming.country !== null && match.country === undefined) patch.country = incoming.country
      if (incoming.exchange !== null && match.exchange === undefined) patch.exchange = incoming.exchange
      if (incoming.holdings.length > 0 && match.holdings === undefined) {
        patch.holdings = incoming.holdings.map((holding) => ({
          symbol: holding.symbol.toUpperCase(),
          ...(holding.name !== null ? { name: holding.name } : {}),
          ...(holding.weight !== null ? { weight: holding.weight } : {}),
        }))
      }
      if (Object.keys(patch).length > 0) assetUpdates.push({ id: match.id, patch })
      return match
    }

    if (symbol === null && incoming.name !== null) {
      notes.push(
        `${incoming.name}: la captura no muestra su ticker, así que se guarda con el nombre. No se inventa un símbolo.`,
      )
    }
    const asset: Asset = {
      id: uid(),
      // Sin ticker visible se usa el NOMBRE, no un ticker fabricado. Antes se
      // recortaba el nombre a 12 letras en mayúsculas y salían identificadores
      // falsos como «NASDAQ CLEAN» o «VANGUARD EUR», que no son tickers de
      // nada y contradicen la regla que el propio prompt le impone a la IA.
      symbol: symbol ?? (incoming.name ?? 'Activo importado').slice(0, 40),
      name: incoming.name ?? symbol ?? 'Activo importado',
      assetType: TYPE_MAP[incoming.type ?? 'other'] ?? 'manual',
      quoteCurrency: incoming.quote_currency ?? 'EUR',
      ...(incoming.isin !== null ? { isin: incoming.isin } : {}),
      ...(incoming.exchange !== null ? { exchange: incoming.exchange } : {}),
      ...(incoming.sector !== null ? { sector: incoming.sector } : {}),
      ...(incoming.country !== null ? { country: incoming.country } : {}),
      ...(incoming.holdings.length > 0
        ? {
            holdings: incoming.holdings.map((holding) => ({
              symbol: holding.symbol.toUpperCase(),
              ...(holding.name !== null ? { name: holding.name } : {}),
              ...(holding.weight !== null ? { weight: holding.weight } : {}),
            })),
          }
        : {}),
    }
    newAssets.push(asset)
    return asset
  }

  payload.transactions.forEach((item, index) => {
    const asset = assetFor(item.asset)
    if (asset === null) {
      notes.push(`Operación ${index + 1}: descartada, el activo falta o es ambiguo.`)
      return
    }
    const account = accountByBroker(item.account_broker, `Operación ${index + 1}`)
    if (account === null) return

    let amount = item.invested_amount
    let quantity = item.quantity
    if (amount === null && quantity !== null && item.execution_price !== null) {
      amount = dec(quantity).times(dec(item.execution_price)).toString()
      notes.push(`Operación ${index + 1}: importe derivado de cantidad × precio.`)
    }
    if (quantity === null && amount !== null && item.execution_price !== null) {
      quantity = dec(amount).div(dec(item.execution_price)).toString()
      notes.push(`Operación ${index + 1}: cantidad derivada de importe ÷ precio.`)
    }
    if (amount === null || quantity === null) {
      notes.push(
        `Operación ${index + 1} (${asset.symbol}): descartada; faltan importe, cantidad o precio para completar la ecuación.`,
      )
      return
    }
    if (dec(amount).lte(0) || dec(quantity).lte(0)) {
      notes.push(`Operación ${index + 1} (${asset.symbol}): importe o cantidad no positivos.`)
      return
    }

    let datetime = item.datetime
    if (datetime === null || Number.isNaN(new Date(datetime).getTime())) {
      datetime = new Date().toISOString()
      notes.push(
        `Operación ${index + 1} (${asset.symbol}): fecha ausente o inválida; se usa hoy y queda marcada para revisión.`,
      )
    } else {
      datetime = new Date(datetime).toISOString()
    }
    const currency = item.invested_currency ?? asset.quoteCurrency
    transactions.push({
      id: uid(),
      accountId: account.id,
      assetId: asset.id,
      type: item.type,
      datetime,
      investedAmount: amount,
      investedCurrency: currency,
      quantity,
      executionPrice: item.execution_price,
      quoteCurrency: item.asset.quote_currency ?? currency,
      fee: item.fee,
      feeCurrency: item.fee === null ? null : item.fee_currency ?? currency,
      sourceType: 'json_import',
      confidence: item.confidence,
      estimationNotes: item.evidence ?? 'Importado por JSON',
      costKnown: true,
    })
  })

  payload.positions.forEach((position, index) => {
    const asset = assetFor(position.asset)
    if (asset === null) {
      notes.push(`Posición ${index + 1}: descartada, el activo falta o es ambiguo.`)
      return
    }
    const account = accountByBroker(position.account_broker, `Posición ${index + 1}`)
    if (account === null) return
    const currency = position.currency ?? asset.quoteCurrency

    /**
     * Las apps imprimen el precio unitario junto a la posición («0,0164 XAU ·
     * 3564,54 €»). Si hay valor y precio unitario, las unidades son una
     * división, no una suposición.
     */
    let quantity = position.quantity
    if (
      quantity === null &&
      position.current_value !== null &&
      position.current_unit_price !== null &&
      dec(position.current_unit_price).gt(0)
    ) {
      quantity = dec(position.current_value).div(dec(position.current_unit_price)).toString()
      notes.push(
        `Posición ${index + 1} (${asset.symbol}): unidades derivadas de valor ÷ precio unitario.`,
      )
    }

    /**
     * Algunas apps (Trade Republic, fondos) muestran el valor de la posición
     * pero nunca sus unidades. Si además hay rentabilidad impresa, se conoce
     * el valor y el coste, que es lo que necesita la cartera: se registra la
     * posición como UNA unidad indivisible cuyo precio es su valor.
     *
     * No es una estimación: ni el valor ni el coste se inventan. Lo único que
     * se pierde son las unidades, que la app de origen tampoco enseña.
     */
    const costeConocido =
      position.total_invested !== null ||
      position.average_buy_price !== null ||
      position.absolute_gain !== null ||
      position.return_pct !== null
    if (
      quantity === null &&
      position.current_value !== null &&
      dec(position.current_value).gt(0) &&
      costeConocido
    ) {
      quantity = '1'
      notes.push(
        `Posición ${index + 1} (${asset.symbol}): la app no muestra unidades, así que se registra como una posición indivisible. El valor y el coste sí son los reales.`,
      )
    }

    if (quantity === null || dec(quantity).lte(0)) {
      incompletePositions.push({
        label: asset.symbol,
        reason:
          position.current_value !== null
            ? 'Se ve el valor actual, pero ni las unidades ni la rentabilidad. Añade cantidad, o el porcentaje de rentabilidad que muestre tu app.'
            : 'No se reconoce una cantidad positiva.',
      })
      return
    }

    if (position.current_value !== null) {
      const manualPrice = {
        price: dec(position.current_value).div(dec(quantity)).toString(),
        currency,
        updatedAt: new Date().toISOString(),
      }
      const newAsset = newAssets.find((candidate) => candidate.id === asset.id)
      if (newAsset !== undefined) newAsset.manualPrice = manualPrice
      else assetUpdates.push({ id: asset.id, patch: { manualPrice } })
    }

    const explicitTxExists = [...existingTransactions, ...transactions].some(
      (transaction) =>
        transaction.assetId === asset.id && transaction.accountId === account.id,
    )
    if (explicitTxExists) {
      notes.push(
        `Posición ${index + 1} (${asset.symbol}): se usa para actualizar el precio; no se duplica porque ya existen operaciones en esa cuenta.`,
      )
      return
    }

    /**
     * Coste histórico, por orden de fiabilidad:
     *   1. `total_invested`, si la app lo imprime.
     *   2. precio medio × unidades.
     *   3. valor − ganancia absoluta («280,02 € ▲ 1,16 €»).
     *   4. valor ÷ (1 + rentabilidad) («35,92 € ▼ 23,50 %» → 46,95 €).
     *
     * Las dos últimas son aritmética sobre datos impresos, no estimaciones:
     * la rentabilidad estaba en pantalla y antes se descartaba, y por eso una
     * cartera entera acababa sin coste y sin poder calcular rentabilidad.
     */
    let inferredCost =
      position.total_invested ??
      (position.average_buy_price !== null
        ? dec(position.average_buy_price).times(dec(quantity)).toString()
        : null)

    if (inferredCost === null && position.current_value !== null) {
      if (position.absolute_gain !== null) {
        const cost = dec(position.current_value).minus(dec(position.absolute_gain))
        if (cost.gt(0)) {
          inferredCost = cost.toString()
          notes.push(
            `Posición ${index + 1} (${asset.symbol}): coste derivado de valor − ganancia impresa.`,
          )
        }
      } else if (position.return_pct !== null) {
        const factor = dec(position.return_pct).div(100).plus(1)
        if (factor.gt(0)) {
          inferredCost = dec(position.current_value).div(factor).toString()
          notes.push(
            `Posición ${index + 1} (${asset.symbol}): coste derivado de valor ÷ (1 + rentabilidad impresa).`,
          )
        }
      }
    }
    const placeholderAmount = inferredCost ?? position.current_value
    if (placeholderAmount === null || dec(placeholderAmount).lte(0)) {
      incompletePositions.push({
        label: asset.symbol,
        reason: 'Falta coste total, precio medio o valor actual para crear la posición de apertura.',
      })
      return
    }

    let datetime = position.acquisition_date
    if (datetime === null || Number.isNaN(new Date(datetime).getTime())) {
      datetime = new Date().toISOString()
    } else {
      datetime = new Date(datetime).toISOString()
    }
    const costKnown = inferredCost !== null
    transactions.push({
      id: uid(),
      accountId: account.id,
      assetId: asset.id,
      type: 'buy',
      datetime,
      investedAmount: placeholderAmount,
      investedCurrency: currency,
      quantity,
      executionPrice:
        position.average_buy_price ??
        (inferredCost !== null ? dec(inferredCost).div(dec(quantity)).toString() : null),
      quoteCurrency: asset.quoteCurrency,
      fee: null,
      feeCurrency: null,
      sourceType: 'position_snapshot',
      confidence: position.confidence,
      estimationNotes:
        position.evidence ??
        (costKnown
          ? 'Posición de apertura importada con coste indicado'
          : 'Posición de apertura sin coste histórico'),
      costKnown,
    })
    notes.push(
      costKnown
        ? `Posición ${index + 1} (${asset.symbol}): creada con coste histórico estimado; revisa la fecha.`
        : `Posición ${index + 1} (${asset.symbol}): unidades registradas sin inventar rentabilidad; completa el coste histórico cuando puedas.`,
    )
  })

  const byAssetAccount = new Map<string, { symbol: string; txs: FinTransaction[] }>()
  for (const transaction of [...existingTransactions, ...transactions]) {
    const asset =
      newAssets.find((candidate) => candidate.id === transaction.assetId) ??
      existingAssets.find((candidate) => candidate.id === transaction.assetId)
    const key = `${transaction.assetId}:${transaction.accountId}`
    const entry = byAssetAccount.get(key) ?? { symbol: asset?.symbol ?? '?', txs: [] }
    entry.txs.push({
      type: transaction.type,
      datetime: transaction.datetime,
      quantity: transaction.quantity,
      amount: transaction.investedAmount,
      fee: transaction.fee ?? 0,
    })
    byAssetAccount.set(key, entry)
  }
  for (const { symbol, txs } of byAssetAccount.values()) {
    try {
      aggregatePosition(txs)
    } catch (error) {
      notes.push(
        `⚠ ${symbol}: ${error instanceof Error ? error.message : 'operaciones incoherentes'}. La venta supera las compras conocidas en esa cuenta; revísala antes de confirmar.`,
      )
    }
  }

  return {
    newAccounts,
    newAssets,
    assetUpdates: deduplicateAssetUpdates(assetUpdates),
    transactions,
    incompletePositions,
    notes,
  }
}

function deduplicateAssetUpdates(
  updates: readonly { id: string; patch: Partial<Asset> }[],
): { id: string; patch: Partial<Asset> }[] {
  const grouped = new Map<string, Partial<Asset>>()
  for (const update of updates) {
    grouped.set(update.id, { ...(grouped.get(update.id) ?? {}), ...update.patch })
  }
  return [...grouped.entries()].map(([id, patch]) => ({ id, patch }))
}
