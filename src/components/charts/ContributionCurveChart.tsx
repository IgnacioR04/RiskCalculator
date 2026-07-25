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
import { formatMoney, formatPct } from '../../lib/format'

const SERIES_1 = 'var(--chart-portfolio)'
const INK_MUTED = 'var(--text-secondary)'
const GRID = 'var(--chart-grid)'

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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="growthPct"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatPct(v / 100, 0)}
            stroke={INK_MUTED}
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatMoney(v, props.currency)}
            stroke={INK_MUTED}
            fontSize={12}
            tickLine={false}
            width={80}
          />
          <Tooltip
            formatter={(value: unknown) => [
              formatMoney(Number(value), props.currency),
              'Aportación necesaria',
            ]}
            labelFormatter={(g: unknown) => `Si sube ${formatPct(Number(g) / 100, 1)}`}
            contentStyle={{ fontSize: 12, borderRadius: 6, background: 'var(--surface-raised)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
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
