/**
 * Modelo de vista único de la cabecera de contexto (LAB-213).
 *
 * Reúne en un solo sitio lo que la cabecera necesita —cartera, valoración,
 * moneda, riesgo efectivo, estado de la IPS y calidad de datos— **sin volver a
 * calcular nada**: recibe lo que otras capas ya han producido y lo traduce a
 * etiquetas.
 *
 * El criterio de aceptación de la tarea es que **no se mezclen datos de dos
 * carteras al cambiar rápido**. Por eso el modelo lleva `portfolioKey`: una
 * huella de la cartera de la que salió. Quien pinte la cabecera compara esa
 * huella con la cartera actual y descarta lo que no corresponda, en vez de
 * confiar en que los renders lleguen en orden.
 */
import type { Currency } from '../../../lib/domain'
import type { DataQualityStatus } from '../../../lib/lab/domain/dataQuality'
import { RISK_BAND_INFO, type InvestmentPolicy } from '../../../lib/lab/domain/investmentPolicy'
import type { PortfolioQualityReport } from '../../../lib/lab/data/portfolioQuality'
import type { DataQuality, IpsStatus, LabContextData } from '../components/LabContextHeader'

export interface LabContextInput {
  /** Identificadores de los activos con posición, en el orden de la cartera. */
  readonly assetIds: readonly string[]
  readonly currency: Currency
  readonly policy: InvestmentPolicy | null
  readonly quality: PortfolioQualityReport | null
  /** Hoy, como argumento: la caducidad de la IPS depende de la fecha. */
  readonly today: string
}

export interface LabContextViewModel extends LabContextData {
  /**
   * Huella de la cartera que produjo este contexto. Dos carteras distintas dan
   * huellas distintas, y eso es lo que permite descartar un resultado que
   * llegue tarde.
   */
  readonly portfolioKey: string
}

/** Huella estable: mismos activos y misma moneda, misma clave. */
export function portfolioKeyOf(assetIds: readonly string[], currency: Currency): string {
  return `${currency}:${[...assetIds].sort().join(',')}`
}

/** Los cinco estados de calidad se agrupan en los tres que la cabecera muestra. */
const CALIDAD_POR_ESTADO: Readonly<Record<DataQualityStatus, DataQuality>> = {
  good: 'suficiente',
  partial: 'parcial',
  stale: 'parcial',
  insufficient: 'insuficiente',
  invalid: 'insuficiente',
}

/**
 * Estado de la política tal como lo entiende la cabecera.
 *
 * `caducada` manda sobre `completa`: una política vencida sigue estando
 * completa, y decir solo eso escondería lo único que importa de ella.
 */
function estadoIps(policy: InvestmentPolicy | null, today: string): IpsStatus | undefined {
  if (policy === null) return undefined
  if (policy.status !== 'active') return 'incompleta'
  if (policy.nextReviewAt !== undefined && policy.nextReviewAt < today) return 'caducada'
  return 'completa'
}

/**
 * El peor estado de los cálculos evaluados. La cabecera resume, y resumir hacia
 * el optimismo sería justo lo contrario de lo que hace falta.
 */
function peorCalidad(report: PortfolioQualityReport | null): DataQuality | undefined {
  if (report === null || report.calculations.length === 0) return undefined
  const orden: readonly DataQuality[] = ['suficiente', 'parcial', 'insuficiente']
  return report.calculations.reduce<DataQuality>((peor, evaluacion) => {
    const actual = CALIDAD_POR_ESTADO[evaluacion.status]
    return orden.indexOf(actual) > orden.indexOf(peor) ? actual : peor
  }, 'suficiente')
}

/**
 * Construye el contexto. Todo lo que no tiene fuente se **omite**, para que la
 * cabecera lo pinte como «No disponible» en vez de rellenarlo.
 */
export function buildLabContext(input: LabContextInput): LabContextViewModel {
  const efectivo = input.policy?.effectiveRisk
  const calidad = peorCalidad(input.quality)
  const ips = estadoIps(input.policy, input.today)

  return {
    portfolioKey: portfolioKeyOf(input.assetIds, input.currency),
    ...(input.assetIds.length === 0
      ? {}
      : {
          portfolioName: `${input.assetIds.length} ${
            input.assetIds.length === 1 ? 'posición' : 'posiciones'
          }`,
        }),
    ...(input.quality === null ? {} : { asOf: input.quality.asOf.slice(0, 10) }),
    currency: input.currency,
    ...(efectivo === undefined ? {} : { riskProfile: RISK_BAND_INFO[efectivo].nombre }),
    ...(ips === undefined ? {} : { ipsStatus: ips }),
    ...(calidad === undefined ? {} : { dataQuality: calidad }),
  }
}
