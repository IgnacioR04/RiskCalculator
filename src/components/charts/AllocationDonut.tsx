/**
 * Donut de distribución del portfolio. Una porción por categoría; leyenda
 * siempre presente (identidad nunca solo por color). Paleta categórica
 * validada para fondo oscuro.
 */
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Currency } from '../../lib/format'
import { formatMoney, formatPct } from '../../lib/format'

const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9']

export interface DonutSlice {
  label: string
  value: number
  weight: number // 0–1
}

export function AllocationDonut(props: { data: DonutSlice[]; currency: Currency }) {
  const total = props.data.reduce((a, s) => a + s.value, 0)
  return (
    <div
      style={{ width: '100%', height: 280 }}
      role="img"
      aria-label="Distribución del portfolio por categoría"
    >
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={props.data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={100}
            paddingAngle={2}
            stroke="var(--color-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {props.data.map((s, i) => (
              <Cell key={s.label} fill={SERIES[i % SERIES.length] ?? '#3987e5'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value)
              return [`${formatMoney(v, props.currency)} · ${formatPct(total > 0 ? v / total : 0, 1)}`, String(name)]
            }}
            contentStyle={{
              fontSize: 13,
              borderRadius: 8,
              background: '#1e2530',
              border: '1px solid #2c3543',
              color: '#eef2f8',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}
            formatter={(value: string) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
