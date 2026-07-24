import { Fragment } from 'react'
import { formatNumber } from '../../lib/format'

export function CovarianceHeatmap(props: {
  labels: string[]
  matrix: (number | null)[][]
}) {
  const finite = props.matrix.flat().filter((value): value is number => value !== null && Number.isFinite(value))
  const maxAbs = Math.max(...finite.map((value) => Math.abs(value)), 1e-12)

  return (
    <div className="heatmap-wrap" role="region" aria-label="Matriz de covarianzas anualizadas">
      <div
        className="heatmap"
        style={{ gridTemplateColumns: `minmax(68px, auto) repeat(${props.labels.length}, minmax(64px, 1fr))` }}
      >
        <div className="heatmap-corner" />
        {props.labels.map((label) => <div key={`head-${label}`} className="heatmap-label top">{label}</div>)}
        {props.labels.map((rowLabel, rowIndex) => (
          <Fragment key={rowLabel}>
            <div key={`row-${rowLabel}`} className="heatmap-label">{rowLabel}</div>
            {props.matrix[rowIndex]!.map((value, columnIndex) => {
              const intensity = value === null ? 0 : Math.min(Math.abs(value) / maxAbs, 1)
              const color =
                value === null
                  ? 'var(--color-surface-2)'
                  : value >= 0
                    ? `color-mix(in srgb, var(--color-negative) ${20 + intensity * 65}%, var(--color-surface-2))`
                    : `color-mix(in srgb, var(--color-primary) ${20 + intensity * 65}%, var(--color-surface-2))`
              return (
                <div
                  key={`${rowLabel}-${props.labels[columnIndex]}`}
                  className="heatmap-cell"
                  style={{ background: color }}
                  title={
                    value === null
                      ? 'Datos insuficientes'
                      : `${rowLabel} × ${props.labels[columnIndex]}: ${value.toPrecision(4)}`
                  }
                >
                  {value === null ? '—' : formatNumber(value * 10_000, 2)}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
      <p className="muted tiny mb-0">
        Valores ×10.000. Rojo: covarianza positiva; azul: negativa. La diagonal es la varianza de
        cada activo.
      </p>
    </div>
  )
}
