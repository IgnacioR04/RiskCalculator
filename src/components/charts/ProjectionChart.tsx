/**
 * Proyección ILUSTRATIVA del valor del portfolio a futuro bajo varios
 * supuestos de rentabilidad anual constante. NO es una predicción: es
 * aritmética de interés compuesto para visualizar escenarios.
 */
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from './chartTheme'
import { formatMoney, formatNumber } from '../../lib/format'

const SERIES: Record<string, string> = {
  Pesimista: 'var(--negative-muted)',
  Base: 'var(--series-4)',
  Optimista: 'var(--positive-muted)',
}

export interface ProjectionScenario {
  name: 'Pesimista' | 'Base' | 'Optimista'
  annualReturn: number // fracción, p. ej. -0.03, 0.05, 0.12
}

interface Row {
  year: number
  Pesimista: number
  Base: number
  Optimista: number
}

export function ProjectionChart(props: {
  initialValue: number
  /** Aportación anual adicional (opcional). */
  annualContribution?: number
  years: number
  scenarios: ProjectionScenario[]
  currency: Currency
}) {
  const rows: Row[] = []
  for (let y = 0; y <= props.years; y++) {
    const row: Row = { year: y, Pesimista: 0, Base: 0, Optimista: 0 }
    for (const s of props.scenarios) {
      // Capitalización anual con aportación al final de cada año.
      let v = props.initialValue
      for (let k = 0; k < y; k++) {
        v = v * (1 + s.annualReturn) + (props.annualContribution ?? 0)
      }
      row[s.name] = Math.round(v)
    }
    rows.push(row)
  }

  return (
    <div style={{ width: '100%', height: 300 }} role="img" aria-label="Proyección del valor del portfolio">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 12, right: 18, bottom: 4, left: 8 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            dataKey="year"
            {...AXIS}
            tickLine={false}
            tickFormatter={(y: number) => `${y}a`}
          />
          <YAxis
            {...AXIS}
            tickLine={false}
            width={72}
            tickFormatter={(v: number) => formatNumber(v, 0)}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [formatMoney(Number(value), props.currency), String(name)]}
            labelFormatter={(y: unknown) => `Dentro de ${Number(y)} año(s)`}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={TOOLTIP_CURSOR}
          />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {props.scenarios.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={SERIES[s.name] ?? 'var(--series-4)'}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
