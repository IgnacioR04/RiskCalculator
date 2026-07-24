/**
 * Motor de recuperación de posiciones.
 *
 * Distingue SIEMPRE dos objetivos que no deben mezclarse:
 *
 * 1. «Restaurar el valor inicial de referencia»: cuánto aportar hoy para que,
 *    tras una subida g, la POSICIÓN vuelva a valer C_ref. No implica
 *    recuperar todo el capital aportado.
 * 2. «Punto de equilibrio económico real»: cuánto aportar para que en el
 *    precio objetivo el valor iguale TODO el capital aportado (incluida la
 *    aportación nueva).
 *
 * Fórmulas y análisis de dominio: docs/CALCULATIONS.md.
 */
import { Decimal, dec, type DecimalValue } from './decimal'

/** Subida implícita entre el precio actual y el objetivo: g = P_obj/P_act − 1 */
export function growthFromPrices(currentPrice: DecimalValue, targetPrice: DecimalValue): Decimal {
  const p = dec(currentPrice)
  const t = dec(targetPrice)
  if (p.lte(0)) throw new RangeError('El precio actual debe ser mayor que 0')
  if (t.lte(0)) throw new RangeError('El precio objetivo debe ser mayor que 0')
  return t.div(p).minus(1)
}

export interface RestoreValueInput {
  /** Valor inicial de referencia que se quiere volver a ver en la posición. */
  referenceValue: DecimalValue
  /** Valor actual de la posición, antes de la nueva aportación. */
  currentValue: DecimalValue
  /** Subida esperada desde el precio actual hasta el objetivo (0,05 = +5 %). */
  expectedGrowth: DecimalValue
  /**
   * Capital histórico aportado hasta hoy (sin la nueva aportación).
   * Si se omite se asume igual a referenceValue (caso típico: «invertí 100»).
   */
  historicCapital?: DecimalValue
}

export interface RestoreValueResult {
  /** Aportación necesaria hoy (≥ 0). */
  contribution: Decimal
  /** true si la posición ya alcanza C_ref en el objetivo sin aportar nada. */
  alreadyRestored: boolean
  /** Valor de la posición en el objetivo tras aportar `contribution`. */
  valueAtTarget: Decimal
  /** Capital histórico total tras la aportación (histórico + nueva). */
  totalCapital: Decimal
  /**
   * Resultado económico NETO en el objetivo: valueAtTarget − totalCapital.
   * Negativo aunque la posición «vuelva a valer» C_ref: se añadió capital
   * nuevo. La UI debe explicarlo siempre.
   */
  netResultAtTarget: Decimal
}

/** A = max(0, C_ref / (1 + g) − V_actual) */
export function restoreValueContribution(input: RestoreValueInput): RestoreValueResult {
  const cRef = dec(input.referenceValue)
  const vNow = dec(input.currentValue)
  const g = dec(input.expectedGrowth)
  if (cRef.lt(0)) throw new RangeError('El valor de referencia no puede ser negativo')
  if (vNow.lt(0)) throw new RangeError('El valor actual no puede ser negativo')
  if (g.lte(-1)) throw new RangeError('La subida esperada debe ser mayor que −100 %')

  const historic = input.historicCapital !== undefined ? dec(input.historicCapital) : cRef
  if (historic.lt(0)) throw new RangeError('El capital histórico no puede ser negativo')

  const needed = cRef.div(g.plus(1)).minus(vNow)
  const contribution = Decimal.max(0, needed)
  const alreadyRestored = needed.lte(0)
  const valueAtTarget = vNow.plus(contribution).times(g.plus(1))
  const totalCapital = historic.plus(contribution)

  return {
    contribution,
    alreadyRestored,
    valueAtTarget,
    totalCapital,
    netResultAtTarget: valueAtTarget.minus(totalCapital),
  }
}

/**
 * Subida necesaria para restaurar C_ref cuando el presupuesto es fijo:
 * (V + A)·(1 + g) = C_ref ⇒ g = C_ref/(V + A) − 1.
 * null si no hay valor tras la aportación (V + A = 0) y C_ref > 0.
 */
export function requiredGrowthToRestore(
  referenceValue: DecimalValue,
  currentValue: DecimalValue,
  budget: DecimalValue,
): Decimal | null {
  const cRef = dec(referenceValue)
  const base = dec(currentValue).plus(dec(budget))
  if (cRef.lt(0)) throw new RangeError('El valor de referencia no puede ser negativo')
  if (base.lt(0)) throw new RangeError('El valor tras la aportación no puede ser negativo')
  if (base.lte(0)) return cRef.lte(0) ? new Decimal(0) : null
  return cRef.div(base).minus(1)
}

export interface PositionInput {
  /** Unidades actuales de la posición (q ≥ 0). */
  quantity: DecimalValue
  /** Coste histórico total de la posición (C ≥ 0). */
  cost: DecimalValue
  /** Precio actual del activo (P_actual > 0). */
  currentPrice: DecimalValue
}

export type BreakevenStatus = 'achievable' | 'already_achieved' | 'unreachable'

export interface BreakevenResult {
  status: BreakevenStatus
  /** Aportación necesaria (> 0) solo cuando status = 'achievable'. */
  contribution: Decimal | null
  /** Resultado neto en el objetivo sin aportar nada: q·P_obj − C. */
  netWithoutContribution: Decimal
  /** Explicación en lenguaje claro del estado, lista para la UI. */
  explanation: string
}

/**
 * Punto de equilibrio económico real: (q + A/P_act)·P_obj = C + A
 * ⇒ A = (C − q·P_obj) / (P_obj/P_act − 1), con análisis de dominio.
 * Nunca devuelve aportaciones negativas.
 */
export function breakevenContribution(
  input: PositionInput & { targetPrice: DecimalValue },
): BreakevenResult {
  const q = dec(input.quantity)
  const c = dec(input.cost)
  const p = dec(input.currentPrice)
  const t = dec(input.targetPrice)
  if (q.lt(0)) throw new RangeError('La cantidad no puede ser negativa')
  if (c.lt(0)) throw new RangeError('El coste no puede ser negativo')
  if (p.lte(0)) throw new RangeError('El precio actual debe ser mayor que 0')
  if (t.lte(0)) throw new RangeError('El precio objetivo debe ser mayor que 0')

  const netAtZero = q.times(t).minus(c)

  if (netAtZero.gte(0)) {
    return {
      status: 'already_achieved',
      contribution: null,
      netWithoutContribution: netAtZero,
      explanation:
        'En ese precio objetivo la posición ya iguala o supera todo el capital aportado; no necesitas aportar nada para estar en equilibrio.',
    }
  }

  if (t.gt(p)) {
    // Denominador positivo y C > q·P_obj ⇒ A > 0 garantizado.
    const contribution = c.minus(q.times(t)).div(t.div(p).minus(1))
    return {
      status: 'achievable',
      contribution,
      netWithoutContribution: netAtZero,
      explanation:
        'Aportando esta cantidad al precio actual, en el precio objetivo el valor de la posición igualaría todo el capital aportado, incluida la aportación nueva.',
    }
  }

  const explanation = t.eq(p)
    ? 'Con el precio objetivo igual al precio actual, el capital nuevo ni gana ni pierde, así que ninguna aportación puede compensar la pérdida existente.'
    : 'Con un precio objetivo por debajo del precio actual, cada euro nuevo también perdería valor, así que ninguna aportación permite alcanzar el equilibrio en ese precio.'

  return {
    status: 'unreachable',
    contribution: null,
    netWithoutContribution: netAtZero,
    explanation,
  }
}

export interface TargetPriceResult {
  /** Precio de equilibrio: (C + A) / (q + A/P_actual). */
  breakevenPrice: Decimal
  /** Coincide con el nuevo precio medio de la posición. */
  newAveragePrice: Decimal
  /** Variación necesaria desde el precio actual hasta el equilibrio. */
  requiredGrowth: Decimal
}

/** Precio que necesita el activo para el equilibrio real, dado un presupuesto A. */
export function targetPriceWithBudget(
  input: PositionInput & { contribution: DecimalValue },
): TargetPriceResult {
  const q = dec(input.quantity)
  const c = dec(input.cost)
  const p = dec(input.currentPrice)
  const a = dec(input.contribution)
  if (q.lt(0)) throw new RangeError('La cantidad no puede ser negativa')
  if (c.lt(0)) throw new RangeError('El coste no puede ser negativo')
  if (p.lte(0)) throw new RangeError('El precio actual debe ser mayor que 0')
  if (a.lt(0)) throw new RangeError('La aportación no puede ser negativa')

  const newQty = q.plus(a.div(p))
  if (newQty.lte(0)) {
    throw new RangeError('Sin unidades en la posición no existe precio de equilibrio')
  }
  const breakevenPrice = c.plus(a).div(newQty)
  return {
    breakevenPrice,
    newAveragePrice: breakevenPrice,
    requiredGrowth: breakevenPrice.div(p).minus(1),
  }
}

export interface OutcomeResult {
  newQuantity: Decimal
  /** Valor futuro de la posición en P_2. */
  futureValue: Decimal
  /** Capital histórico total: C + A. */
  totalCapital: Decimal
  /** Beneficio o pérdida neta: futureValue − totalCapital. */
  netResult: Decimal
  /** Rentabilidad neta sobre el capital total; null si el capital es 0. */
  netReturnPct: Decimal | null
  /** Nuevo precio medio; null si no hay unidades. */
  newAveragePrice: Decimal | null
  /** Parte del resultado atribuible a la posición previa: q·P_2 − C. */
  previousPositionPnl: Decimal
  /** Parte atribuible a la aportación nueva: (A/P_act)·P_2 − A. */
  newContributionPnl: Decimal
}

/** Resultado completo en un precio objetivo P_2 dada una aportación A. */
export function outcomeAtPrice(
  input: PositionInput & { contribution: DecimalValue; evaluationPrice: DecimalValue },
): OutcomeResult {
  const q = dec(input.quantity)
  const c = dec(input.cost)
  const p = dec(input.currentPrice)
  const a = dec(input.contribution)
  const p2 = dec(input.evaluationPrice)
  if (q.lt(0)) throw new RangeError('La cantidad no puede ser negativa')
  if (c.lt(0)) throw new RangeError('El coste no puede ser negativo')
  if (p.lte(0)) throw new RangeError('El precio actual debe ser mayor que 0')
  if (a.lt(0)) throw new RangeError('La aportación no puede ser negativa')
  if (p2.lte(0)) throw new RangeError('El precio de evaluación debe ser mayor que 0')

  const addedQty = a.div(p)
  const newQuantity = q.plus(addedQty)
  const futureValue = newQuantity.times(p2)
  const totalCapital = c.plus(a)
  const netResult = futureValue.minus(totalCapital)

  return {
    newQuantity,
    futureValue,
    totalCapital,
    netResult,
    netReturnPct: totalCapital.gt(0) ? netResult.div(totalCapital) : null,
    newAveragePrice: newQuantity.gt(0) ? totalCapital.div(newQuantity) : null,
    previousPositionPnl: q.times(p2).minus(c),
    newContributionPnl: addedQty.times(p2).minus(a),
  }
}
