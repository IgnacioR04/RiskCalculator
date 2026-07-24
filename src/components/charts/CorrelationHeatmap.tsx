/**
 * Matriz de correlación como heatmap (relaciones entre activos / riesgo).
 * Escala divergente: azul = correlación negativa (diversifica), gris = 0,
 * naranja/rojo = correlación positiva alta (se mueven juntos → más riesgo
 * concentrado). El valor numérico va SIEMPRE impreso: el color no es la única
 * codificación.
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

/** Color divergente para c ∈ [-1, 1]. -1 azul · 0 gris · +1 rojo cálido. */
function colorFor(c: number): { bg: string; fg: string } {
  const neg = { r: 57, g: 135, b: 229 } // #3987e5
  const mid = { r: 42, g: 50, b: 63 } // gris oscuro (surface-ish)
  const pos = { r: 217, g: 89, b: 38 } // #d95926
  const t = Math.max(-1, Math.min(1, c))
  const from = t < 0 ? neg : pos
  const k = Math.abs(t)
  const r = Math.round(mid.r + (from.r - mid.r) * k)
  const g = Math.round(mid.g + (from.g - mid.g) * k)
  const b = Math.round(mid.b + (from.b - mid.b) * k)
  // Texto claro siempre (fondos oscuros/saturados).
  return { bg: `rgb(${r} ${g} ${b})`, fg: k > 0.55 ? '#ffffff' : '#e6e9ef' }
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
                        background: 'var(--color-surface-2)',
                        color: 'var(--color-text-faint)',
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
        style={{ gap: 12, marginTop: 8, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}
      >
        <span>
          <span
            style={{ display: 'inline-block', width: 12, height: 12, background: '#3987e5', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }}
          />
          −1 (se mueven al revés · diversifica)
        </span>
        <span>
          <span
            style={{ display: 'inline-block', width: 12, height: 12, background: '#2a323f', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }}
          />
          0 (sin relación)
        </span>
        <span>
          <span
            style={{ display: 'inline-block', width: 12, height: 12, background: '#d95926', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }}
          />
          +1 (se mueven juntos · concentra riesgo)
        </span>
      </div>
    </div>
  )
}
