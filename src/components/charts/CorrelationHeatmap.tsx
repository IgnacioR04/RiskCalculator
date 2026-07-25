/**
 * Matriz de correlación como heatmap (relaciones entre activos / riesgo).
 * Escala divergente desaturada del sistema: burdeos = correlación negativa
 * (diversifica), superficie = cerca de cero, acero = correlación positiva alta
 * (se mueven juntos → riesgo más concentrado). El valor numérico va SIEMPRE
 * impreso: el color nunca es la única codificación.
 */
export interface CorrelationCell {
  /** null = muestra insuficiente para calcular. */
  value: number | null
}

export interface CorrelationMatrix {
  labels: string[]
  /** matriz[fila][col]; la diagonal es 1. */
  cells: CorrelationCell[][]
}

/** Color divergente para c ∈ [-1, 1]: −1 burdeos · 0 superficie · +1 acero. */
function colorFor(c: number): { bg: string; fg: string } {
  // Escala divergente desaturada del sistema: burdeos negativa, superficie
  // cerca de cero, acero positiva (tokens --matrix-*).
  const neg = { r: 168, g: 69, b: 90 } // --matrix-negative
  const mid = { r: 27, g: 29, b: 30 } // --matrix-zero (surface-default)
  const pos = { r: 109, g: 129, b: 143 } // --matrix-positive
  const t = Math.max(-1, Math.min(1, c))
  const from = t < 0 ? neg : pos
  const k = Math.abs(t)
  const r = Math.round(mid.r + (from.r - mid.r) * k)
  const g = Math.round(mid.g + (from.g - mid.g) * k)
  const b = Math.round(mid.b + (from.b - mid.b) * k)
  // Texto claro siempre (fondos oscuros/saturados).
  return { bg: `rgb(${r} ${g} ${b})`, fg: k > 0.5 ? 'var(--text-primary)' : 'var(--text-body)' }
}

export function CorrelationHeatmap(props: { matrix: CorrelationMatrix }) {
  const { labels, cells } = props.matrix
  return (
    <div className="table-wrap">
      <table
        className="data"
        style={{ borderCollapse: 'separate', borderSpacing: 2 }}
        aria-label="Matriz de correlación entre activos"
      >
        <thead>
          <tr>
            <th scope="col"></th>
            {labels.map((l) => (
              <th key={l} scope="col" style={{ textAlign: 'center' }}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((rowLabel, i) => (
            <tr key={rowLabel}>
              <th scope="row" style={{ textAlign: 'left' }}>
                {rowLabel}
              </th>
              {labels.map((colLabel, j) => {
                const cell = cells[i]?.[j]
                if (cell === undefined || cell.value === null) {
                  return (
                    <td
                      key={colLabel}
                      style={{
                        textAlign: 'center',
                        background: 'var(--surface-raised)',
                        color: 'var(--text-disabled)',
                        borderRadius: 6,
                      }}
                      title="Muestra insuficiente"
                    >
                      —
                    </td>
                  )
                }
                const { bg, fg } = colorFor(cell.value)
                return (
                  <td
                    key={colLabel}
                    style={{
                      textAlign: 'center',
                      background: bg,
                      color: fg,
                      borderRadius: 6,
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                    }}
                    title={`${rowLabel} vs ${colLabel}: ${cell.value.toFixed(2)}`}
                  >
                    {cell.value.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="row"
        style={{ gap: 12, marginTop: 8, fontSize: '9px', color: 'var(--text-secondary)' }}
      >
        <span>
          <span
            style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--matrix-negative)', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }}
          />
          −1 · se mueven al revés (diversifica)
        </span>
        <span>
          <span
            style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--matrix-zero)', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }}
          />
          0 · sin relación
        </span>
        <span>
          <span
            style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--matrix-positive)', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }}
          />
          +1 · se mueven juntos (concentra riesgo)
        </span>
      </div>
    </div>
  )
}
