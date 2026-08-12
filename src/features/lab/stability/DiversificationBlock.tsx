/**
 * ¿Estás diversificando de verdad? (LAB-307)
 *
 * Cuatro medidas que contestan lo mismo desde ángulos distintos: tener muchos
 * activos no diversifica si se mueven todos a la vez.
 */
import { describeDiversification } from '../../../lib/finance/diversification'
import { formatPct } from '../../../lib/format'
import type { DiversificationData } from './contracts'

/** Un número con coma decimal, o una raya si no se pudo calcular. */
function cifra(valor: number | null, decimales: number): string {
  return valor === null ? '—' : valor.toFixed(decimales).replace('.', ',')
}

export function DiversificationBlock(props: { readonly data: DiversificationData }) {
  const { data } = props
  const lectura = describeDiversification(data.diversificationRatio)
  const bien = lectura.level === 'ok'

  return (
    <section className="risk-block mt-3">
      <div className="card-title">¿Estás diversificando de verdad?</div>
      <p className="card-sub">
        No basta con tener muchos activos: lo que cuenta es que no se muevan todos a la vez.
      </p>
      <div className="div-metrics">
        <div className="div-metric">
          <span className="label">Ratio de diversificación</span>
          <span className="figure">{cifra(data.diversificationRatio, 2)}</span>
          <p>
            1,00 sería no diversificar nada. Compara la volatilidad que tendrías si todo se moviera
            junto con la que tienes.
          </p>
        </div>
        <div className="div-metric">
          <span className="label">Riesgo que te ahorras</span>
          <span className="figure">{formatPct(data.volatilityReduction, 1)}</span>
          <p>
            Parte de la volatilidad que desaparece solo por repartir, en lugar de tenerlo todo en un
            único activo.
          </p>
        </div>
        <div className="div-metric">
          <span className="label">Apuestas reales de riesgo</span>
          <span className="figure">{cifra(data.effectiveBets, 1)}</span>
          <p>
            Entre cuántas fuentes de riesgo independientes está repartido de verdad. Diez activos que
            se mueven igual son una sola apuesta.
          </p>
        </div>
        <div className="div-metric">
          <span className="label">Correlación media</span>
          <span className="figure">{cifra(data.averageCorrelation, 2)}</span>
          <p>
            Lo parecidos que son entre sí tus activos, de media. Cuanto más bajo, mejor reparten el
            riesgo.
          </p>
        </div>
      </div>
      {/* El estado no se distingue solo por color: glifo y texto también. */}
      <div className={'note ' + (bien ? 'info' : 'warning')}>
        <span className="note-glyph" aria-hidden="true">
          {bien ? '◆' : '▲'}
        </span>
        <span>
          {lectura.text} Sin repartir, tu volatilidad sería{' '}
          <strong>{formatPct(data.weightedAverageVolatility, 1)}</strong>; repartiendo se queda en{' '}
          <strong>{formatPct(data.portfolioVolatility, 1)}</strong>.
        </span>
      </div>
    </section>
  )
}
