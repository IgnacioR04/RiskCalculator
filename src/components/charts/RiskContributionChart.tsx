import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPct } from '../../lib/format'

export function RiskContributionChart(props: {
  data: { label: string; contribution: number }[]
}) {
  return (
    <div className="chart-frame" role="img" aria-label="Contribución de cada activo al riesgo">
      <ResponsiveContainer width="100%" height={Math.max(230, props.data.length * 42)}>
        <BarChart data={props.data} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 12 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatPct(value, 0)}
            tick={{ fill: 'var(--chart-ink)', fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={64}
            tick={{ fill: 'var(--chart-ink)', fontSize: 12 }}
          />
          <Tooltip
            formatter={(value) => [formatPct(Number(value), 1), 'Contribución']}
            contentStyle={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
            }}
          />
          <Bar dataKey="contribution" radius={[0, 6, 6, 0]}>
            {props.data.map((item) => (
              <Cell
                key={item.label}
                fill={item.contribution >= 0 ? 'var(--series-2)' : 'var(--series-1)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
