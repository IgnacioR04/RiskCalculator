/**
 * Medidor de cobertura ponderada (LAB-212).
 *
 * Componente compartido del documento 01 §9: «cobertura ponderada y huecos». Las
 * dos cosas, no solo la primera. Un 92 % sin decir qué falta es un número que
 * tranquiliza sin informar.
 *
 * Cuando la cobertura no se puede calcular **no se pinta un cero**. Una barra
 * vacía diría «no hay nada cubierto», y lo cierto es que no hay nada que cubrir:
 * son dos situaciones distintas y se leen distinto.
 */
import type { CoverageResult } from '../../../lib/lab/data/quality'

export interface CoverageMeterProps {
  readonly label: string
  readonly coverage: CoverageResult
  /** Mínimo exigido, como fracción. Se marca en la barra si se declara. */
  readonly minimum?: number
}

export function CoverageMeter(props: CoverageMeterProps) {
  const { covered } = props.coverage
  const huecos =
    props.coverage.unknownValueEntities.length + props.coverage.missingDataEntities.length

  if (covered === null) {
    return (
      <div className="coverage-meter">
        <div className="coverage-meter__head">
          <span className="label">{props.label}</span>
          <span className="muted">No disponible</span>
        </div>
        <p className="muted tiny mb-0">
          No hay capital conocido sobre el que medir la cobertura. No es que no haya nada
          cubierto: es que todavía no hay nada que cubrir.
        </p>
      </div>
    )
  }

  const porcentaje = Math.round(covered * 1000) / 10
  const insuficiente = props.minimum !== undefined && covered < props.minimum

  return (
    <div className="coverage-meter">
      <div className="coverage-meter__head">
        <span className="label">{props.label}</span>
        <span className={insuficiente ? 'negative' : undefined}>
          <span aria-hidden="true">{insuficiente ? '■ ' : '● '}</span>
          {porcentaje} %
        </span>
      </div>
      <div
        className="coverage-meter__bar"
        role="img"
        aria-label={`${props.label}: ${porcentaje} % del capital${
          props.minimum === undefined
            ? ''
            : `, mínimo exigido ${Math.round(props.minimum * 100)} %`
        }`}
      >
        <span
          className={insuficiente ? 'coverage-meter__fill baja' : 'coverage-meter__fill'}
          style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }}
        />
        {props.minimum !== undefined && (
          <span
            className="coverage-meter__min"
            style={{ left: `${Math.min(100, props.minimum * 100)}%` }}
          />
        )}
      </div>
      <p className="muted tiny mb-0">
        {huecos === 0
          ? 'Sin huecos.'
          : `${huecos} ${huecos === 1 ? 'activo' : 'activos'} sin este dato.`}
        {props.coverage.unknownValueEntities.length > 0 &&
          ` De ellos, ${props.coverage.unknownValueEntities.length} sin valor conocido, así que este porcentaje no los tiene en cuenta.`}
      </p>
    </div>
  )
}
