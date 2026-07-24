/**
 * Escenarios de estrés deterministas. NO son predicciones: aplican shocks
 * configurables sobre la valoración actual y recalculan totales y pesos.
 */
import type { AssetType, Currency } from '../domain'
import { Decimal, dec, type DecimalValue } from './decimal'
import { concentration } from './metrics'

export interface StressPosition {
  assetId: string
  symbol: string
  assetType: AssetType
  /** Divisa de cotización del activo (para el shock de divisa). */
  quoteCurrency: Currency
  /** Valor actual en divisa de presentación. */
  value: DecimalValue
}

export interface StressShocks {
  /** Caída/subida general aplicada a todo (fracción, −0,2 = −20 %). */
  general?: DecimalValue
  /** Shocks por clase de activo (fracción). */
  byType?: Partial<Record<AssetType, DecimalValue>>
  /** Shocks por activo concreto (assetId → fracción). */
  byAsset?: Record<string, DecimalValue>
  /**
   * Movimiento de la divisa extranjera frente a la de presentación
   * (fracción): 0,1 ⇒ los activos cotizados en otra divisa valen +10 % al
   * convertirlos. El efectivo en la divisa de presentación no se toca.
   */
  fxForeign?: DecimalValue
  /** Divisa de presentación (para decidir qué posiciones sufren el shock FX). */
  displayCurrency: Currency
}

export interface StressedPosition extends StressPosition {
  stressedValue: Decimal
  changePct: Decimal | null
}

export interface StressResult {
  positions: StressedPosition[]
  totalBefore: Decimal
  totalAfter: Decimal
  totalChange: Decimal
  totalChangePct: Decimal | null
  concentrationBefore: ReturnType<typeof concentration>
  concentrationAfter: ReturnType<typeof concentration>
}

/** Aplica los shocks de forma multiplicativa: (1+general)·(1+clase)·(1+activo)·(1+fx). */
export function applyStress(
  positions: readonly StressPosition[],
  shocks: StressShocks,
): StressResult {
  const general = dec(shocks.general ?? 0)
  const fx = dec(shocks.fxForeign ?? 0)

  const stressed: StressedPosition[] = positions.map((p) => {
    const value = dec(p.value)
    let factor = general.plus(1)

    const typeShock = shocks.byType?.[p.assetType]
    if (typeShock !== undefined) factor = factor.times(dec(typeShock).plus(1))

    const assetShock = shocks.byAsset?.[p.assetId]
    if (assetShock !== undefined) factor = factor.times(dec(assetShock).plus(1))

    // El shock FX solo afecta a lo cotizado en divisa distinta a la de
    // presentación (aproximación declarada: exposición por divisa de cotización).
    if (p.quoteCurrency !== shocks.displayCurrency && !fx.isZero()) {
      factor = factor.times(fx.plus(1))
    }

    const stressedValue = value.times(factor)
    return {
      ...p,
      stressedValue,
      changePct: value.gt(0) ? stressedValue.div(value).minus(1) : null,
    }
  })

  const totalBefore = positions.reduce((a, p) => a.plus(dec(p.value)), new Decimal(0))
  const totalAfter = stressed.reduce((a, p) => a.plus(p.stressedValue), new Decimal(0))
  const totalChange = totalAfter.minus(totalBefore)

  return {
    positions: stressed,
    totalBefore,
    totalAfter,
    totalChange,
    totalChangePct: totalBefore.gt(0) ? totalChange.div(totalBefore) : null,
    concentrationBefore: concentration(positions.map((p) => dec(p.value))),
    concentrationAfter: concentration(stressed.map((p) => p.stressedValue)),
  }
}

/**
 * Simulador antes/después de una aportación hipotética a un activo:
 * devuelve pesos y concentración antes y después. No ejecuta ninguna compra.
 */
export function contributionImpact(
  positions: readonly StressPosition[],
  targetAssetId: string,
  contribution: DecimalValue,
): {
  before: { weight: Decimal | null; concentration: ReturnType<typeof concentration> }
  after: { weight: Decimal | null; concentration: ReturnType<typeof concentration> }
} {
  const amount = dec(contribution)
  const totalBefore = positions.reduce((a, p) => a.plus(dec(p.value)), new Decimal(0))
  const target = positions.find((p) => p.assetId === targetAssetId)
  const targetBefore = target !== undefined ? dec(target.value) : new Decimal(0)

  const totalAfter = totalBefore.plus(amount)
  const targetAfter = targetBefore.plus(amount)

  const afterValues = positions.map((p) =>
    p.assetId === targetAssetId ? targetAfter : dec(p.value),
  )
  if (target === undefined) afterValues.push(targetAfter)

  return {
    before: {
      weight: totalBefore.gt(0) ? targetBefore.div(totalBefore) : null,
      concentration: concentration(positions.map((p) => dec(p.value))),
    },
    after: {
      weight: totalAfter.gt(0) ? targetAfter.div(totalAfter) : null,
      concentration: concentration(afterValues),
    },
  }
}
