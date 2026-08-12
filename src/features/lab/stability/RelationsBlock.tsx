/**
 * Cómo se relacionan los activos entre sí (LAB-307).
 *
 * Dos vistas de lo mismo: la correlación dice **si** se mueven juntos, la
 * covarianza dice si se mueven juntos **y cuánto**. Las conclusiones de abajo
 * existen para no obligar a nadie a leer la matriz casilla a casilla.
 */
import { Note, Segmented } from '../../../components/ui'
import { RiskMatrix } from '../../../components/charts/RiskMatrix'
import type { PairInsight } from './contracts'

export type MatrixKind = 'correlacion' | 'covarianza'

export interface RelationsBlockProps {
  readonly labels: readonly string[]
  /** Matriz de correlación. `null` en una casilla es «no se pudo calcular». */
  readonly correlation: readonly (readonly (number | null)[])[]
  /** Matriz de covarianza anualizada, o `null` si no había muestra. */
  readonly covariance: readonly (readonly number[])[] | null
  readonly insights: readonly PairInsight[]
  readonly kind: MatrixKind
  readonly onKindChange: (kind: MatrixKind) => void
}

export function RelationsBlock(props: RelationsBlockProps) {
  const esCorrelacion = props.kind === 'correlacion'

  return (
    <section className="risk-block">
      <div className="card-head">
        <div>
          <div className="card-title">
            {esCorrelacion ? 'Cómo se mueven entre sí' : 'Cuánto riesgo comparten'}
          </div>
          <div className="card-sub">
            {esCorrelacion
              ? 'Pasa el ratón por una casilla y te lo explico en una frase.'
              : 'Covarianza anualizada: relación y magnitud del riesgo a la vez.'}
          </div>
        </div>
        <Segmented<MatrixKind>
          label="Tipo de matriz"
          hideLabel
          value={props.kind}
          onChange={props.onKindChange}
          options={[
            { value: 'correlacion', label: 'Correlación' },
            { value: 'covarianza', label: 'Covarianza' },
          ]}
        />
      </div>

      {esCorrelacion ? (
        <RiskMatrix
          mode="correlacion"
          labels={[...props.labels]}
          values={props.correlation.map((fila) => [...fila])}
        />
      ) : props.covariance !== null ? (
        <RiskMatrix
          mode="covarianza"
          labels={[...props.labels]}
          values={props.covariance.map((fila) => [...fila])}
        />
      ) : (
        <Note kind="info">Se necesitan al menos 30 retornos comunes.</Note>
      )}

      {props.insights.length > 0 && (
        <div className="stack mt-3">
          {props.insights.map((insight) => (
            <div key={insight.text} className={'note ' + insight.kind}>
              <span className="note-glyph" aria-hidden="true">
                {insight.kind === 'warning' ? '▲' : '◆'}
              </span>
              <span>{insight.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
