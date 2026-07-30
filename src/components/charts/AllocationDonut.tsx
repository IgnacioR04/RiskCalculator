/**
 * Donut de distribución. Colores del orden fijo de series (tokens); la
 * identidad nunca depende solo del color: la lista de al lado repite etiqueta
 * y porcentaje, y el resumen textual describe el reparto completo.
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Currency } from '../../lib/format'
import { formatMoney, formatPct } from '../../lib/format'
import { CHART_SURFACE, SEGMENT_GAP, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE, seriesColor } from './chartTheme'

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
            paddingAngle={SEGMENT_GAP}
            stroke={CHART_SURFACE}
            strokeWidth={SEGMENT_GAP}
            isAnimationActive={false}
          >
            {/* Orden fijo, nunca ciclado: a partir del séptimo slot el color no
                se reutiliza, se cae al gris de «Otros». Repetir el oro en la
                categoría 8 haría que dos entidades distintas compartiesen
                identidad. */}
            {props.data.map((s, i) => (
              <Cell key={s.label} fill={seriesColor(i)} />
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
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
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
