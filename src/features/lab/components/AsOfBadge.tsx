/**
 * Fecha de observación de un dato (LAB-212).
 *
 * Componente compartido del documento 01 §9. Dice **de cuándo** es lo que se
 * está mirando y si eso lo convierte en viejo, porque una cifra sin fecha invita
 * a creer que es de ahora mismo.
 *
 * `null` no se dibuja como una fecha vacía ni como un guion suelto: se dice «Sin
 * fecha», que es una afirmación distinta y la única honesta.
 */
import { formatDateTime } from '../../../lib/format'

export interface AsOfBadgeProps {
  /** Instante ISO del dato. `null` cuando no se conoce. */
  readonly at: string | null
  /** Si el dato ya se considera viejo para lo que se va a hacer con él. */
  readonly stale?: boolean
  /** Etiqueta previa, p. ej. «Precios». */
  readonly label?: string
}

export function AsOfBadge(props: AsOfBadgeProps) {
  if (props.at === null) {
    return (
      <span className="chip na">
        <span aria-hidden="true">—</span>
        {props.label === undefined ? 'Sin fecha' : `${props.label}: sin fecha`}
      </span>
    )
  }

  const legible = formatDateTime(props.at)
  const viejo = props.stale === true

  return (
    <span className={viejo ? 'chip warning' : 'chip info'}>
      {/* El estado nunca se distingue solo por color: glifo y texto también. */}
      <span aria-hidden="true">{viejo ? '▲' : '◷'}</span>
      {props.label === undefined ? '' : `${props.label}: `}
      <time dateTime={props.at}>{legible}</time>
      {viejo && <span className="sr-only"> — dato antiguo</span>}
    </span>
  )
}
