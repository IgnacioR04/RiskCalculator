/**
 * Gráfica precio–resultado neto. Un solo eje Y (resultado neto en la divisa
 * elegida); dos series como máximo: sin aportación (naranja) y con aportación
 * (azul). Las líneas de referencia (precio actual, medio, objetivo,
 * equilibrio) usan tinta neutra, nunca el color de las series.
 */
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Currency } from '../../lib/format'
import {
  AXIS,
  GRID as CHART_GRID,
  LEGEND_STYLE,
  TOOLTIP_CURSOR,
  TOOLTIP_STYLE,
} from './chartTheme'
import { formatMoney, formatNumber } from '../../lib/format'

export interface PricePoint {
  price: number
  sinAportacion: number
  conAportacion?: number
}

export interface PriceMarker {
  price: number
  label: string
}

const SERIES_1 = 'var(--brand-primary)' // con aportación
const SERIES_2 = 'var(--series-4)' // sin aportación

export function PriceOutcomeChart(props: {
  points: PricePoint[]
  markers: PriceMarker[]
  currency: Currency
  hasContribution: boolean
}) {
  const fmtAxis = (v: number) => formatNumber(v, 0)
  const fmtMoney = (v: number) => formatMoney(v, props.currency)
  return (
    <div style={{ width: '100%', height: 300 }} role="img" aria-label="Resultado neto según el precio del activo">
      <ResponsiveContainer>
        <LineChart data={props.points} margin={{ top: 16, right: 18, bottom: 4, left: 8 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            dataKey="price"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtAxis}
            {...AXIS}
          />
          <YAxis tickFormatter={fmtAxis} {...AXIS} width={70} />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [fmtMoney(Number(value)), String(name)]}
            labelFormatter={(price: unknown) => `Precio ${fmtMoney(Number(price))}`}
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
          />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <ReferenceLine y={0} stroke={AXIS.stroke} strokeWidth={1} />
          {props.markers.map((m) => (
            <ReferenceLine
              key={m.label}
              x={m.price}
              stroke={AXIS.stroke}
              strokeDasharray="4 4"
              label={{
                value: m.label,
                position: 'top',
                fill: AXIS.stroke,
                fontSize: 11,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="sinAportacion"
            name="Sin aportación"
            stroke={SERIES_2}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {props.hasContribution && (
            <Line
              type="monotone"
              dataKey="conAportacion"
              name="Con aportación"
              stroke={SERIES_1}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
