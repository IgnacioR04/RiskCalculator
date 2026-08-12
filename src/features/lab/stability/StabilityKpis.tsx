/**
 * Las cuatro cifras de cabecera del análisis (LAB-307).
 *
 * El título de la primera cambia según la cobertura: llamar «volatilidad de
 * cartera» a la de media cartera sería mentir por omisión.
 */
import { formatPct } from '../../../lib/format'
import { Kpi } from '../../../components/ui'
import type { StabilityKpiData } from './contracts'

export function StabilityKpis(props: { readonly data: StabilityKpiData }) {
  const { data } = props
  return (
    <div className="kpi-row analytics-kpis">
      <Kpi
        label={data.complete ? 'Volatilidad de cartera' : 'Volatilidad del segmento'}
        hint="Cuánto oscila el conjunto en un año, teniendo en cuenta que los activos no se mueven a la vez."
      >
        {data.volatility === null ? 'Datos insuf.' : formatPct(data.volatility, 1)}
      </Kpi>
      <Kpi label="Cobertura analizada" hint="Parte del valor de tu cartera incluida en este análisis.">
        {formatPct(data.coverage, 0)}
      </Kpi>
      <Kpi label="TWR del periodo" hint="Rentabilidad ponderada por tiempo: aísla el efecto de cuándo aportaste.">
        {data.twr === null ? 'No disp.' : formatPct(data.twr, 1)}
      </Kpi>
      <Kpi label="Muestra común" hint="Días con precio en todos los activos analizados.">
        {data.commonDays} días
      </Kpi>
    </div>
  )
}
