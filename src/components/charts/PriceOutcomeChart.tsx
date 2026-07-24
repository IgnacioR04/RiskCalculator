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

const SERIES_1 = '#2554c7' // con aportación
const SERIES_2 = '#b45d0e' // sin aportación
const INK_MUTED = '#5a6478'
const GRID = '#e4e7ec'

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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="price"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtAxis}
            stroke={INK_MUTED}
            fontSize={12}
            tickLine={false}
          />
          <YAxis tickFormatter={fmtAxis} stroke={INK_MUTED} fontSize={12} tickLine={false} width={70} />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [fmtMoney(Number(value)), String(name)]}
            labelFormatter={(price: unknown) => `Precio ${fmtMoney(Number(price))}`}
            contentStyle={{ fontSize: 13, borderRadius: 8, borderColor: GRID }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <ReferenceLine y={0} stroke={INK_MUTED} strokeWidth={1.5} />
          {props.markers.map((m) => (
            <ReferenceLine
              key={m.label}
              x={m.price}
              stroke={INK_MUTED}
              strokeDasharray="4 4"
              label={{
                value: m.label,
                position: 'top',
                fill: INK_MUTED,
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
