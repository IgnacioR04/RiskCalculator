/**
 * Tema único de las gráficas.
 *
 * Antes cada gráfica traía su propio tooltip (cinco variantes inline), su
 * tamaño de eje (8,5 / 11 / 12 / 12,5 / 13 px) y su grosor de línea
 * (1,5 / 2 / 2,2). Aquí vive una sola respuesta para cada cosa.
 *
 * Las especificaciones vienen de la skill `dataviz`:
 *  - marcas finas: 2px de línea, marcadores de 8px de diámetro (r = 4),
 *    extremos de barra redondeados a 4px;
 *  - separación de 2px del color de superficie entre rellenos contiguos;
 *  - rejilla y ejes recesivos, nunca compitiendo con los datos;
 *  - el texto lleva tokens de texto, nunca el color de la serie;
 *  - leyenda siempre presente con 2 o más series.
 *
 * El color sigue saliendo de tokens.css: aquí no se escribe ni un hexadecimal.
 */

/** Superficie sobre la que se dibujan las gráficas (para los huecos de 2px). */
export const CHART_SURFACE = 'var(--surface-default)'

/** Tooltip: lo único que se superpone al contenido, así que lo único con sombra. */
export const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 6,
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
  boxShadow: 'var(--shadow-popover)',
} as const

export const TOOLTIP_LABEL_STYLE = {
  color: 'var(--text-secondary)',
  fontSize: 11,
  marginBottom: 2,
} as const

/** Cursor del tooltip: una guía tenue, no un bloque de resalte. */
export const TOOLTIP_CURSOR = { stroke: 'var(--border-strong)', strokeWidth: 1 } as const
export const TOOLTIP_CURSOR_FILL = { fill: 'var(--chart-area)' } as const

/**
 * Ejes. 11px es el tamaño de rótulo del sistema: son etiquetas, no prosa.
 * `stroke` va en secundario porque `--text-disabled` no llegaba a 4,5:1.
 */
export const AXIS = {
  stroke: 'var(--text-secondary)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

/** Rejilla recesiva: horizontal, sin verticales que troceen la lectura. */
export const GRID = {
  stroke: 'var(--chart-grid)',
  vertical: false,
} as const

/** Marcas. */
export const LINE_WIDTH = 2
/** Radio del punto = 4 ⇒ 8px de diámetro, el mínimo táctil de la skill. */
export const DOT_RADIUS = 4
export const ACTIVE_DOT_RADIUS = 5
/** Extremos de barra redondeados a 4px, anclados a la línea base. */
export const BAR_RADIUS_H: [number, number, number, number] = [0, 4, 4, 0]
export const BAR_RADIUS_V: [number, number, number, number] = [4, 4, 0, 0]
/** Hueco del color de superficie entre rellenos contiguos y anillo en solapes. */
export const SEGMENT_GAP = 2

/** Leyenda: texto en tinta de texto, nunca en el color de la serie. */
export const LEGEND_STYLE = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  paddingTop: 6,
} as const

/**
 * Orden categórico fijo. Nunca se cicla: a partir del último slot, las
 * categorías restantes se agrupan en «Otros» con el gris neutro. El color
 * sigue a la entidad, no a su posición en el ranking.
 */
export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
] as const

/** Gris de «Otros» y de cualquier resto agrupado. */
export const SERIES_OTHER = 'var(--na)'

/** Color de la serie i respetando el orden fijo; fuera de rango, «Otros». */
export function seriesColor(index: number): string {
  return index < SERIES.length ? SERIES[index]! : SERIES_OTHER
}
