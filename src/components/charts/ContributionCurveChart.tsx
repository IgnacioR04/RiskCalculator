/**
 * Curva aportación necesaria según la subida esperada (modo «restaurar el
 * valor inicial»). Una sola serie: el título la nombra, sin caja de leyenda.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Currency } from '../../lib/format'
import { AXIS, GRID as CHART_GRID, TOOLTIP_CURSOR, TOOLTIP_STYLE } from './chartTheme'
import { formatMoney, formatPct } from '../../lib/format'

const SERIES_1 = 'var(--chart-portfolio)'

export interface CurvePoint {
  growthPct: number // en puntos porcentuales (5 = +5 %)
  contribution: number
}

export function ContributionCurveChart(props: {
  points: CurvePoint[]
  selected?: CurvePoint | undefined
  currency: Currency
}) {
  return (
    <div
      style={{ width: '100%', height: 260 }}
      role="img"
      aria-label="Aportación necesaria según la subida esperada"
    >
      <ResponsiveContainer>
        <LineChart data={props.points} margin={{ top: 12, right: 18, bottom: 4, left: 8 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            dataKey="growthPct"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatPct(v / 100, 0)}
            {...AXIS}
          />
          <YAxis
            tickFormatter={(v: number) => formatMoney(v, props.currency)}
            {...AXIS}
            width={80}
          />
          <Tooltip
            formatter={(value: unknown) => [
              formatMoney(Number(value), props.currency),
              'Aportación necesaria',
            ]}
            labelFormatter={(g: unknown) => `Si sube ${formatPct(Number(g) / 100, 1)}`}
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
          />
          <Line
            type="monotone"
            dataKey="contribution"
            name="Aportación necesaria"
            stroke={SERIES_1}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {props.selected !== undefined && (
            <ReferenceDot
              x={props.selected.growthPct}
              y={props.selected.contribution}
              r={5}
              fill={SERIES_1}
              stroke="var(--surface-default)"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
