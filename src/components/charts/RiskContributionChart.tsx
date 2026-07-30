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
import { AXIS, BAR_RADIUS_H, GRID, TOOLTIP_CURSOR_FILL, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './chartTheme'

export function RiskContributionChart(props: {
  data: { label: string; contribution: number }[]
}) {
  return (
    <div className="chart-frame" role="img" aria-label="Contribución de cada activo al riesgo">
      <ResponsiveContainer width="100%" height={Math.max(230, props.data.length * 42)}>
        <BarChart data={props.data} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 12 }}>
          <CartesianGrid stroke={GRID.stroke} vertical={false} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatPct(value, 0)}
            {...AXIS}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={64}
            {...AXIS}
          />
          <Tooltip
            formatter={(value) => [formatPct(Number(value), 1), 'Contribución']}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={TOOLTIP_CURSOR_FILL}
          />
          <Bar dataKey="contribution" radius={BAR_RADIUS_H}>
            {props.data.map((item) => (
              <Cell
                key={item.label}
                /* Polaridad, no identidad: signo positivo/negativo va con la pareja
                   divergente, no con dos colores del orden categorico. Reusar
                   series-1 y series-2 aqui hacia que el mismo azul significase
                   «categoria 2» en el donut y «contribuye al riesgo» aqui. */
                fill={item.contribution >= 0 ? 'var(--matrix-negative)' : 'var(--matrix-positive)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
