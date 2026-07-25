/**
 * Donut de distribución. Colores del orden fijo de series (tokens); la
 * identidad nunca depende solo del color: la lista de al lado repite etiqueta
 * y porcentaje, y el resumen textual describe el reparto completo.
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Currency } from '../../lib/format'
import { formatMoney, formatPct } from '../../lib/format'

const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
]

export interface DonutSlice {
  label: string
  value: number
  weight: number
}

export function AllocationDonut(props: { data: DonutSlice[]; currency: Currency; compact?: boolean }) {
  const total = props.data.reduce((a, s) => a + s.value, 0)
  const size = props.compact === true ? 104 : 240
  const inner = props.compact === true ? 30 : 62
  const outer = props.compact === true ? 46 : 100

  return (
    <div style={{ width: '100%', height: size }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={props.data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={inner}
            outerRadius={outer}
            paddingAngle={2}
            stroke="var(--surface-default)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {props.data.map((s, i) => (
              <Cell key={s.label} fill={SERIES[i % SERIES.length] ?? SERIES[0]!} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value)
              return [
                `${formatMoney(v, props.currency)} · ${formatPct(total > 0 ? v / total : 0, 1)}`,
                String(name),
              ]
            }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="sr-only">
        Reparto:{' '}
        {props.data
          .map((s) => `${s.label} ${formatPct(total > 0 ? s.value / total : 0, 1)}`)
          .join(', ')}
        .
      </p>
    </div>
  )
}
