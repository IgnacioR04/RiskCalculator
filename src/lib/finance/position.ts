/**
 * Agregación de posiciones a partir del registro de transacciones.
 * Las posiciones SIEMPRE se derivan de las operaciones; no hay tabla de
 * holdings editable como fuente de verdad. Método de coste medio
 * (ver docs/DECISIONS.md).
 */
import { Decimal, dec, type DecimalValue } from './decimal'

export interface FinTransaction {
  type: 'buy' | 'sell'
  /** ISO 8601; solo se usa para ordenar. */
  datetime: string
  /** Unidades compradas o vendidas (> 0). */
  quantity: DecimalValue
  /**
   * Dinero movido en la divisa de la operación: invertido en compras,
   * obtenido en ventas (> 0). Las comisiones se ignoran en el MVP.
   */
  amount: DecimalValue
}

export interface AggregatedPosition {
  /** Unidades actuales. */
  quantity: Decimal
  /** Coste histórico de las unidades actuales (base coste medio). */
  cost: Decimal
  /** Coste medio por unidad; null si no hay unidades. */
  averagePrice: Decimal | null
  /** P&L realizado acumulado por ventas. */
  realizedPnl: Decimal
  /** Total bruto invertido en compras (para rentabilidad sobre aportado). */
  totalInvested: Decimal
  /** Total bruto obtenido en ventas. */
  totalProceeds: Decimal
}

export class PositionError extends Error {
  constructor(
    message: string,
    readonly transactionIndex: number,
  ) {
    super(message)
    this.name = 'PositionError'
  }
}

/**
 * Reproduce la posición transacción a transacción en orden temporal.
 * Rechaza ventas que superen las unidades disponibles con error explícito.
 */
export function aggregatePosition(transactions: readonly FinTransaction[]): AggregatedPosition {
  const sorted = transactions
    .map((tx, originalIndex) => ({ tx, originalIndex }))
    .sort((a, b) => a.tx.datetime.localeCompare(b.tx.datetime))

  let quantity = new Decimal(0)
  let cost = new Decimal(0)
  let realizedPnl = new Decimal(0)
  let totalInvested = new Decimal(0)
  let totalProceeds = new Decimal(0)

  for (const { tx, originalIndex } of sorted) {
    const q = dec(tx.quantity)
    const amount = dec(tx.amount)
    if (q.lte(0)) {
      throw new PositionError(
        `La transacción ${originalIndex + 1} tiene una cantidad no positiva`,
        originalIndex,
      )
    }
    if (amount.lt(0)) {
      throw new PositionError(
        `La transacción ${originalIndex + 1} tiene un importe negativo`,
        originalIndex,
      )
    }

    if (tx.type === 'buy') {
      quantity = quantity.plus(q)
      cost = cost.plus(amount)
      totalInvested = totalInvested.plus(amount)
    } else {
      if (q.gt(quantity)) {
        throw new PositionError(
          `La transacción ${originalIndex + 1} vende ${q.toString()} unidades pero solo hay ${quantity.toString()} disponibles`,
          originalIndex,
        )
      }
      const avgCost = cost.div(quantity) // quantity > 0 garantizado por q ≤ quantity y q > 0
      const costOfSold = q.times(avgCost)
      realizedPnl = realizedPnl.plus(amount.minus(costOfSold))
      cost = cost.minus(costOfSold)
      quantity = quantity.minus(q)
      totalProceeds = totalProceeds.plus(amount)
      if (quantity.isZero()) cost = new Decimal(0) // evita residuos de redondeo
    }
  }

  return {
    quantity,
    cost,
    averagePrice: quantity.gt(0) ? cost.div(quantity) : null,
    realizedPnl,
    totalInvested,
    totalProceeds,
  }
}

/** P&L no realizado de una posición agregada a un precio dado. */
export function unrealizedPnl(position: AggregatedPosition, currentPrice: DecimalValue): Decimal {
  return position.quantity.times(dec(currentPrice)).minus(position.cost)
}
