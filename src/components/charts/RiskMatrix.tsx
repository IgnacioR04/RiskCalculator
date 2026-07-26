/**
 * Matriz de riesgo (correlación o covarianza) como mapa de calor.
 *
 * Se dibuja con CSS Grid, no con `<table>`: la versión anterior aplicaba
 * `display:flex` a las celdas de una tabla, lo que anula el layout de tabla y
 * apilaba todas las casillas en una sola columna.
 *
 * El número va SIEMPRE impreso: el color acompaña, nunca es la única
 * codificación. Cada casilla se explica en una frase al pasar el ratón.
 */
import { useMemo, useState } from 'react'

export type MatrixMode = 'correlacion' | 'covarianza'

export interface RiskMatrixProps {
  labels: string[]
  /** matriz[fila][columna]; null = muestra insuficiente. */
  values: (number | null)[][]
  mode: MatrixMode
}

/** Interpola entre dos colores RGB. */
function mix(a: [number, number, number], b: [number, number, number], k: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * k)
  const g = Math.round(a[1] + (b[1] - a[1]) * k)
  const bl = Math.round(a[2] + (b[2] - a[2]) * k)
  return `rgb(${r} ${g} ${bl})`
}

// Escala divergente del sistema: burdeos (negativo) · superficie (cero) · acero (positivo).
const NEG: [number, number, number] = [168, 69, 90] // --matrix-negative
const ZERO: [number, number, number] = [27, 29, 30] // --matrix-zero
const POS: [number, number, number] = [109, 129, 143] // --matrix-positive

function cellColor(value: number, maxAbs: number): { bg: string; strong: boolean } {
  const k = maxAbs > 0 ? Math.min(Math.abs(value) / maxAbs, 1) : 0
  return { bg: mix(ZERO, value < 0 ? NEG : POS, k), strong: k > 0.55 }
}

/** Formato del número dentro de la casilla. */
function cellText(value: number, mode: MatrixMode): string {
  if (mode === 'correlacion') return value.toFixed(2).replace('.', ',')
  // La covarianza anualizada es un número grande y sin unidad intuitiva:
  // se muestra compacto para que quepa y se lea.
  const abs = Math.abs(value)
  if (abs >= 1000) return Math.round(value).toLocaleString('es-ES')
  if (abs >= 10) return value.toFixed(0)
  if (abs >= 1) return value.toFixed(1).replace('.', ',')
  return value.toFixed(3).replace('.', ',')
}

/** Explicación en lenguaje llano de una casilla. */
function explain(a: string, b: string, value: number, mode: MatrixMode): string {
  if (a === b) {
    return mode === 'correlacion'
      ? `${a} consigo mismo: siempre 1,00.`
      : `Varianza de ${a}: cuánto oscila por su cuenta.`
  }
  if (mode === 'covarianza') {
    const signo = value > 0 ? 'a la vez' : 'en sentidos opuestos'
    return `${a} y ${b} se han movido ${signo}. Cuanto mayor es la cifra, más pesa esa relación en el riesgo del conjunto.`
  }
  const v = value.toFixed(2).replace('.', ',')
  if (value >= 0.9) return `${a} y ${b} se mueven casi como un mismo activo (${v}): juntarlos apenas diversifica.`
  if (value >= 0.6) return `${a} y ${b} suelen subir y bajar a la vez (${v}).`
  if (value >= 0.3) return `${a} y ${b} se parecen algo (${v}), pero no van siempre de la mano.`
  if (value > -0.3) return `${a} y ${b} van bastante por libre (${v}): reparten riesgo entre sí.`
  return `${a} y ${b} tienden a moverse al revés (${v}): uno amortigua al otro.`
}

export function RiskMatrix(props: RiskMatrixProps) {
  const { labels, values, mode } = props
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)

  const maxAbs = useMemo(() => {
    const finite = values
      .flat()
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .map(Math.abs)
    // En correlación la escala es fija [−1, 1]; en covarianza depende de los datos.
    return mode === 'correlacion' ? 1 : Math.max(...finite, 1e-12)
  }, [values, mode])

  const active = hover !== null ? values[hover.row]?.[hover.col] ?? null : null
  const activeText =
    hover !== null && active !== null
      ? explain(labels[hover.row] ?? '', labels[hover.col] ?? '', active, mode)
      : null

  return (
    <div className="rmatrix-wrap">
      <div
        className="rmatrix"
        style={{ gridTemplateColumns: `var(--rmatrix-head) repeat(${labels.length}, minmax(52px, 86px))` }}
        role="table"
        aria-label={mode === 'correlacion' ? 'Matriz de correlación' : 'Matriz de covarianzas anualizadas'}
      >
        {/* Esquina vacía + cabecera de columnas */}
        <div className="rmatrix-corner" />
        {labels.map((label, col) => (
          <div
            key={`h-${label}`}
            className={`rmatrix-head-cell${hover?.col === col ? ' on' : ''}`}
            role="columnheader"
          >
            {label}
          </div>
        ))}

        {labels.map((rowLabel, row) => (
          <div key={`r-${rowLabel}`} style={{ display: 'contents' }}>
            <div className={`rmatrix-head-cell row${hover?.row === row ? ' on' : ''}`} role="rowheader">
              {rowLabel}
            </div>
            {labels.map((colLabel, col) => {
              const value = values[row]?.[col] ?? null
              const isDiagonal = row === col
              if (value === null || !Number.isFinite(value)) {
                return (
                  <div
                    key={`${rowLabel}-${colLabel}`}
                    className="rmatrix-cell empty"
                    role="cell"
                    title={`Sin muestra común suficiente entre ${rowLabel} y ${colLabel}.`}
                  >
                    —
                  </div>
                )
              }
              const { bg, strong } = cellColor(value, maxAbs)
              return (
                <div
                  key={`${rowLabel}-${colLabel}`}
                  className={`rmatrix-cell${isDiagonal ? ' diagonal' : ''}${
                    hover?.row === row || hover?.col === col ? ' cross' : ''
                  }`}
                  role="cell"
                  tabIndex={0}
                  style={{
                    background: bg,
                    color: strong ? 'var(--text-primary)' : 'var(--text-body)',
                  }}
                  title={explain(rowLabel, colLabel, value, mode)}
                  onMouseEnter={() => setHover({ row, col })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ row, col })}
                  onBlur={() => setHover(null)}
                >
                  {cellText(value, mode)}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Explicación de la casilla apuntada: el usuario no tiene que saber leer una matriz. */}
      <div className="rmatrix-readout" role="status">
        {activeText ?? 'Pasa el ratón (o tabula) por una casilla y te la explico aquí.'}
      </div>

      <div className="rmatrix-legend">
        <span className="rmatrix-ramp" aria-hidden="true" />
        <span className="meta">
          {mode === 'correlacion'
            ? '−1 se mueven al revés · 0 sin relación · +1 se mueven juntos'
            : `menos riesgo compartido · más riesgo compartido (máx. ${cellText(maxAbs, mode)})`}
        </span>
      </div>

      <p className="sr-only">
        {labels
          .map((rowLabel, row) =>
            labels
              .map((colLabel, col) => {
                const value = values[row]?.[col]
                return value === null || value === undefined
                  ? `${rowLabel} y ${colLabel}: sin datos`
                  : `${rowLabel} y ${colLabel}: ${cellText(value, mode)}`
              })
              .join('; '),
          )
          .join('. ')}
      </p>
    </div>
  )
}
