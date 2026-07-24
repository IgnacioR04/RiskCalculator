import type { BrokerAccount, BrokerFeePolicy, Currency } from './domain'
import { Decimal, dec, type DecimalValue } from './finance/decimal'

/**
 * Catálogo pequeño y deliberadamente explícito. No intenta reproducir todas
 * las tarifas, niveles VIP, impuestos regulatorios ni promociones. La UI
 * obliga a revisar/editar la sugerencia antes de utilizarla.
 */
export interface BrokerFeePreset {
  id: string
  matches: string[]
  brokerLabel: string
  policy: BrokerFeePolicy
  note: string
}

export const BROKER_FEE_PRESETS: readonly BrokerFeePreset[] = [
  {
    id: 'revolut-standard-es',
    matches: ['revolut'],
    brokerLabel: 'Revolut · Standard/Plus/Premium/Metal (fuera del cupo)',
    policy: {
      mode: 'catalog',
      catalogId: 'revolut-standard-es',
      label: '0,25 % · mínimo 1 €',
      rate: '0.0025',
      fixed: '0',
      minimum: '1',
      currency: 'EUR',
      freeTradesRemaining: 0,
      asOf: '2026-07-24',
      sourceUrl:
        'https://help.revolut.com/en-ES/help/wealth/stocks/trading-stocks/trading-fees/what-fees-will-i-be-charged-for-my-trading/',
    },
    note: 'El plan puede incluir de 1 a 10 órdenes gratuitas al mes. Indica las que te quedan.',
  },
  {
    id: 'revolut-pro-es',
    matches: ['revolut'],
    brokerLabel: 'Revolut · Ultra/Trading Pro',
    policy: {
      mode: 'catalog',
      catalogId: 'revolut-pro-es',
      label: '0,12 % · revisa mínimo según plan',
      rate: '0.0012',
      fixed: '0',
      minimum: '0',
      currency: 'EUR',
      freeTradesRemaining: 0,
      asOf: '2026-07-24',
      sourceUrl: 'https://help.revolut.com/es-ES/help/wealth/trading-pro/what-is-trading-pro/',
    },
    note: 'Revisa en tu plan si existe mínimo por operación y posibles cargos regulatorios.',
  },
  {
    id: 'bitget-spot-standard',
    matches: ['bitget'],
    brokerLabel: 'Bitget · Spot no VIP',
    policy: {
      mode: 'catalog',
      catalogId: 'bitget-spot-standard',
      label: '0,10 % estimado',
      rate: '0.001',
      fixed: '0',
      minimum: '0',
      currency: 'USD',
      asOf: '2026-07-24',
      sourceUrl: 'https://www.bitget.com/support/articles/12560603795929',
    },
    note: 'Promociones, niveles VIP y pago con BGB pueden reducir la tarifa.',
  },
  {
    id: 'ibkr-globaltrader-eu',
    matches: ['interactive brokers', 'ibkr'],
    brokerLabel: 'Interactive Brokers · acciones/ETF Europa',
    policy: {
      mode: 'catalog',
      catalogId: 'ibkr-globaltrader-eu',
      label: '3 € o 0,05 % en órdenes > 6.000 €',
      rate: '0.0005',
      fixed: '0',
      minimum: '3',
      currency: 'EUR',
      asOf: '2026-07-24',
      sourceUrl: 'https://www.interactivebrokers.eu/en/pricing.php',
    },
    note: 'Modelo simplificado para GlobalTrader; otros planes y mercados pueden diferir.',
  },
] as const

export function presetsForBroker(name: string): BrokerFeePreset[] {
  const normalized = name.trim().toLowerCase()
  return BROKER_FEE_PRESETS.filter((preset) =>
    preset.matches.some((match) => normalized.includes(match)),
  )
}

export function suggestedFeePolicy(name: string): BrokerFeePolicy | null {
  const first = presetsForBroker(name)[0]
  return first === undefined ? null : { ...first.policy }
}

export interface FeeEstimate {
  amount: Decimal
  currency: Currency
  explanation: string
  consumesFreeTrade: boolean
}

/**
 * Estima la comisión de una orden. Si la regla está expresada en otra divisa,
 * no compara un porcentaje con un mínimo incompatible: el formulario pide
 * entonces una comisión manual.
 */
export function estimateBrokerFee(
  account: BrokerAccount | undefined,
  orderAmount: DecimalValue,
  orderCurrency: Currency,
): FeeEstimate | null {
  const policy = account?.feePolicy
  if (policy === undefined || policy.mode === 'none') {
    return {
      amount: new Decimal(0),
      currency: orderCurrency,
      explanation: 'Sin comisión configurada',
      consumesFreeTrade: false,
    }
  }
  if ((policy.freeTradesRemaining ?? 0) > 0) {
    return {
      amount: new Decimal(0),
      currency: orderCurrency,
      explanation: 'Orden incluida en el cupo gratuito indicado',
      consumesFreeTrade: true,
    }
  }
  if (policy.currency !== orderCurrency) return null
  const variable = dec(orderAmount).times(dec(policy.rate))
  const amount = Decimal.max(variable.plus(dec(policy.fixed)), dec(policy.minimum))
  return {
    amount,
    currency: policy.currency,
    explanation: `${policy.label}${policy.mode === 'catalog' ? ' · estimación de catálogo' : ' · regla personalizada'}`,
    consumesFreeTrade: false,
  }
}
