/**
 * Evolución del capital aportado con los puntos de cada aportación y el valor
 * actual al cierre.
 *
 * IMPORTANTE: la línea es el **capital aportado acumulado** (dato real,
 * derivado de tus operaciones), no el valor de mercado histórico. Reconstruir
 * el valor de mercado día a día exige series históricas de precios de todos
 * los activos, que este piloto no descarga; por eso no se dibuja una curva
 * inventada. El valor de hoy sí se marca como punto final.
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
import { formatDate, formatMoney, formatNumber } from '../../lib/format'

export interface EvolutionPoint {
  /** ISO date. */
  date: string
  /** Capital aportado acumulado hasta esa fecha. */
  aportado: number
  /** Etiqueta legible del eje. */
  labelCorto: string
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 6,
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
}

export function EvolutionChart(props: {
  points: EvolutionPoint[]
  currentValue: number | null
  currency: Currency
}) {
  const last = props.points.at(-1)
  return (
    <div style={{ width: '100%', height: 150 }}>
      <ResponsiveContainer>
        <LineChart data={props.points} margin={{ top: 10, right: 14, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="labelCorto"
            stroke="var(--text-disabled)"
            fontSize={8.5}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke="var(--text-disabled)"
            fontSize={8.5}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v: number) => formatNumber(v, 0)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: unknown) => [formatMoney(Number(v), props.currency), 'Capital aportado']}
            labelFormatter={(l: unknown) => String(l)}
          />
          <Line
            type="stepAfter"
            dataKey="aportado"
            name="Capital aportado"
            stroke="var(--chart-portfolio)"
            strokeWidth={2.2}
            dot={{ r: 3.2, fill: 'var(--brand-primary)', stroke: 'none' }}
            isAnimationActive={false}
          />
          {props.currentValue !== null && last !== undefined && (
            <ReferenceDot
              x={last.labelCorto}
              y={props.currentValue}
              r={3.6}
              fill="var(--info-neutral)"
              stroke="none"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">
        Gráfica del capital aportado acumulado en {props.points.length} operaciones, desde
        {props.points[0] !== undefined ? ` ${formatDate(props.points[0].date)}` : ''} hasta
        {last !== undefined ? ` ${formatDate(last.date)}` : ''}. Último capital aportado:
        {last !== undefined ? ` ${formatMoney(last.aportado, props.currency)}` : ' sin datos'}.
        {props.currentValue !== null ? ` Valor actual: ${formatMoney(props.currentValue, props.currency)}.` : ''}
      </p>
    </div>
  )
}
