import Decimal from 'decimal.js'

// Configuración única para toda la lógica financiera: 28 dígitos
// significativos, redondeo half-even solo en presentación (nunca aquí).
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN })

export { Decimal }
export type DecimalValue = Decimal.Value

/** Convierte y valida que el valor sea un número finito. */
export function dec(value: DecimalValue): Decimal {
  const d = new Decimal(value)
  if (!d.isFinite()) {
    throw new RangeError(`Valor no finito: ${String(value)}`)
  }
  return d
}
