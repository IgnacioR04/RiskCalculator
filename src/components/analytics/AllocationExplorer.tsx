import { useState } from 'react'
import type { Currency } from '../../lib/domain'
import type { AllocationSlice, PortfolioView } from '../../lib/portfolio'
import { formatMoney, formatPct } from '../../lib/format'
import { AllocationDonut } from '../charts/AllocationDonut'
import { Segmented } from '../ui'

type Dimension = 'type' | 'account' | 'sector' | 'country' | 'currency'

const LABELS: Record<Dimension, string> = {
  type: 'Clase',
  account: 'Cuenta',
  sector: 'Sector',
  country: 'País',
  currency: 'Divisa',
}

export function AllocationExplorer(props: { view: PortfolioView; currency: Currency }) {
  const [dimension, setDimension] = useState<Dimension>('type')
  const data: Record<Dimension, AllocationSlice[]> = {
    type: props.view.byType,
    account: props.view.byAccount,
    sector: props.view.bySector,
    country: props.view.byCountry,
    currency: props.view.byCurrency,
  }
  const slices = data[dimension]

  return (
    <div>
      <Segmented<Dimension>
        label="Ver distribución por"
        value={dimension}
        onChange={setDimension}
        options={[
          { value: 'type', label: 'Clase' },
          { value: 'account', label: 'Cuenta' },
          { value: 'sector', label: 'Sector' },
          { value: 'country', label: 'País' },
          { value: 'currency', label: 'Divisa' },
        ]}
      />
      <div className="allocation-layout">
        <AllocationDonut
          currency={props.currency}
          data={slices.map((slice) => ({
            label: slice.label,
            value: Number(slice.value.toString()),
            weight: Number(slice.weight?.toString() ?? 0),
          }))}
        />
        <div className="allocation-list">
          {slices.map((slice, index) => (
            <div className="allocation-row" key={slice.key}>
              <span className={`legend-dot series-${(index % 6) + 1}`} />
              <span className="allocation-name">{slice.label}</span>
              <strong>{slice.weight === null ? '—' : formatPct(slice.weight, 1)}</strong>
              <span className="muted">{formatMoney(slice.value, props.currency)}</span>
            </div>
          ))}
        </div>
      </div>
      {slices.some((slice) => slice.key === 'unclassified') && (
        <p className="muted tiny mb-0">
          Completa sector y país en “Clasificación de activos” para ver una distribución precisa.
        </p>
      )}
      <span className="sr-only">Distribución actual por {LABELS[dimension]}</span>
    </div>
  )
}
