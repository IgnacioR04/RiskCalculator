/**
 * Rentabilidad ponderada por tiempo de la cartera (LAB-305).
 *
 * Extraído **sin tocar una línea de lógica** del monolito
 * `HistoricalRiskSection`, por el mismo motivo que la conversión de divisa:
 * mover y comparar primero, mejorar después.
 *
 * TWR mide cómo se ha comportado la cartera **descontando** el efecto de cuándo
 * entró y salió el dinero. Es la métrica que compara con un índice; la que mide
 * lo que ha ganado el inversor de verdad es la TIR, y está en `finance/xirr.ts`.
 */
import type { Asset, Currency, FxRate, Transaction } from '../../domain'
import type { SeriesPoint } from '../../finance/historical'
import { convertAmount } from '../../fx'
import { dec } from '../../finance/decimal'
import { alignManyReturns, timeWeightedReturn, type TwrPeriod } from '../../finance/portfolioRisk'
import { rateAt } from './fx'

/** Serie de un activo ya convertida, tal como la arma la pantalla. */
export interface AssetSeries {
  asset: Asset
  series: SeriesPoint[]
  returns: { date: string; value: number }[]
  provider: string
}

export function transactionCashFlow(
  transaction: Transaction,
  displayCurrency: Currency,
  fxRates: readonly FxRate[],
  downloadedFx: readonly { date: string; rate: number }[],
): { contribution: number; withdrawal: number } | null {
  const date = transaction.datetime.slice(0, 10)
  let amount = convertAmount(
    transaction.investedAmount,
    transaction.investedCurrency,
    displayCurrency,
    fxRates,
    date,
  )?.amount
  if (amount === undefined && transaction.investedCurrency !== displayCurrency) {
    const rate = rateAt(downloadedFx, date)
    if (rate !== null) amount = dec(transaction.investedAmount).times(rate)
  }
  if (amount === undefined) return null

  let fee = dec(0)
  if (transaction.fee !== null) {
    const feeCurrency = transaction.feeCurrency ?? transaction.investedCurrency
    const convertedFee = convertAmount(
      transaction.fee,
      feeCurrency,
      displayCurrency,
      fxRates,
      date,
    )?.amount
    if (convertedFee !== undefined) fee = convertedFee
    else if (feeCurrency !== displayCurrency) {
      const rate = rateAt(downloadedFx, date)
      if (rate === null) return null
      fee = dec(transaction.fee).times(rate)
    } else fee = dec(transaction.fee)
  }

  if (transaction.type === 'buy') {
    return { contribution: Number(amount.plus(fee).toString()), withdrawal: 0 }
  }
  const net = dec(amount).minus(fee)
  return {
    contribution: 0,
    withdrawal: Number((net.gt(0) ? net : dec(0)).toString()),
  }
}

export function quantityOn(
  transactions: readonly Transaction[],
  assetId: string,
  date: string,
): number {
  return transactions
    .filter(
      (transaction) =>
        transaction.assetId === assetId && transaction.datetime.slice(0, 10) <= date,
    )
    .reduce(
      (quantity, transaction) =>
        quantity +
        Number(transaction.quantity) * (transaction.type === 'buy' ? 1 : -1),
      0,
    )
}

export function calculatePortfolioTwr(input: {
  loaded: readonly AssetSeries[]
  transactions: Transaction[]
  displayCurrency: Currency
  fxRates: FxRate[]
  downloadedFx: readonly { date: string; rate: number }[]
  requiredAssetIds: Set<string>
}): number | null {
  const relevantLoaded = input.loaded.filter((item) =>
    input.requiredAssetIds.has(item.asset.id),
  )
  const relevantTransactions = input.transactions.filter((transaction) =>
    input.requiredAssetIds.has(transaction.assetId),
  )
  if (
    relevantLoaded.length === 0 ||
    relevantLoaded.length !== input.requiredAssetIds.size ||
    relevantTransactions.some((transaction) => transaction.costKnown === false)
  ) {
    return null
  }
  const aligned = alignManyReturns(
    relevantLoaded.map((item) =>
      item.series.map((point) => ({ date: point.date, value: point.close })),
    ),
  )
  if (aligned.dates.length < 2) return null
  const priceMaps = new Map(
    relevantLoaded.map((item) => [
      item.asset.id,
      new Map(item.series.map((point) => [point.date, point.close])),
    ]),
  )
  const periods: TwrPeriod[] = []
  for (let index = 1; index < aligned.dates.length; index++) {
    const previousDate = aligned.dates[index - 1]!
    const date = aligned.dates[index]!
    let openingValue = 0
    let closingValue = 0
    for (const item of relevantLoaded) {
      const prices = priceMaps.get(item.asset.id)!
      openingValue += quantityOn(relevantTransactions, item.asset.id, previousDate) * prices.get(previousDate)!
      closingValue += quantityOn(relevantTransactions, item.asset.id, date) * prices.get(date)!
    }
    let contributions = 0
    let withdrawals = 0
    for (const transaction of relevantTransactions.filter(
      (item) => item.datetime.slice(0, 10) === date,
    )) {
      const flow = transactionCashFlow(
        transaction,
        input.displayCurrency,
        input.fxRates,
        input.downloadedFx,
      )
      if (flow === null) return null
      contributions += flow.contribution
      withdrawals += flow.withdrawal
    }
    periods.push({ openingValue, closingValue, contributions, withdrawals })
  }
  return timeWeightedReturn(periods)
}
