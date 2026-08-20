/**
 * Cajón de evidencia y panel de metodología (LAB-904).
 *
 * El componente compartido desde el que se llega a la evidencia de cualquier
 * métrica. Existe para que ninguna pantalla tenga que inventarse su forma de
 * enseñar de dónde sale un número.
 *
 * ## Accesibilidad, que aquí no es un extra
 *
 * Es un cajón que se abre y se cierra, así que:
 *
 * - el disparador es un `<button>` con `aria-expanded`, no un `div` con
 *   `onClick`;
 * - el contenido va en una región etiquetada, para que un lector de pantalla
 *   pueda saltar a ella;
 * - se cierra con `Escape`, porque un cajón que solo se cierra con el ratón
 *   deja atrapado a quien navega con teclado.
 *
 * No se usa `<dialog>` ni se atrapa el foco: no es un modal. El usuario tiene
 * que poder seguir leyendo la pantalla con la evidencia abierta al lado.
 */
import { useId, useState } from 'react'
import { Card, Note } from '../../../components/ui'
import type { EvidenceItem } from '../../../lib/lab/evidence/contracts'
import { EVIDENCE_KIND_LABEL } from '../../../lib/lab/evidence/contracts'
import { explain } from '../../../lib/lab/evidence/explanations'

const CLASE_POR_PAPEL: Readonly<Record<string, string>> = {
  claim: '',
  method: 'meta',
  source: 'meta',
  limitation: 'meta',
  warning: 'warning',
}

export interface EvidenceDrawerProps {
  readonly evidence: EvidenceItem
  /** Texto del disparador. Por defecto, «De dónde sale este número». */
  readonly label?: string
}

export function EvidenceDrawer(props: EvidenceDrawerProps) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  const explicacion = explain(props.evidence)

  return (
    <div
      className="evidencia"
      onKeyDown={(e) => {
        // Un cajón que solo se cierra con el ratón atrapa a quien usa teclado.
        if (e.key === 'Escape' && abierto) setAbierto(false)
      }}
    >
      <button
        type="button"
        className="btn small"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
      >
        {props.label ?? 'De dónde sale este número'}
      </button>

      {abierto && (
        <section
          id={id}
          className="evidencia-cuerpo"
          aria-label={`Evidencia: ${EVIDENCE_KIND_LABEL[props.evidence.kind]}`}
        >
          <ul className="lista-grupos">
            {explicacion.lines.map((linea, i) => (
              <li key={`${linea.role}-${i}`}>
                <span className={CLASE_POR_PAPEL[linea.role] ?? ''}>{linea.text}</span>
              </li>
            ))}
          </ul>
          <p className="muted tiny mb-0">
            Modelo {props.evidence.modelVersion}. Esta explicación se genera con plantillas fijas:
            no puede cambiar el resultado.
          </p>
        </section>
      )}
    </div>
  )
}

/* ── Panel de metodología ──────────────────────────────────────────────────── */

export interface MethodologyPanelProps {
  readonly title?: string
  readonly items: readonly EvidenceItem[]
}

/**
 * Todas las evidencias de una pantalla, juntas.
 *
 * Es la vista para quien quiere auditar la pantalla entera en vez de un número
 * suelto. Si no hay ninguna evidencia, **no se enseña un panel vacío**: se dice
 * que esa pantalla no publica métricas que auditar.
 */
export function MethodologyPanel(props: MethodologyPanelProps) {
  if (props.items.length === 0) return null

  return (
    <Card
      title={props.title ?? 'Cómo se calcula todo esto'}
      sub="Cada número, con su fuente, su método y lo que no cubre"
    >
      {props.items.map((item, i) => {
        const explicacion = explain(item)
        return (
          <div key={`${item.modelVersion}-${i}`} className="metodologia-bloque">
            <p className="card-title">{EVIDENCE_KIND_LABEL[item.kind]}</p>
            <ul className="lista-grupos">
              {explicacion.lines.map((linea, j) => (
                <li key={`${linea.role}-${j}`}>
                  <span className={CLASE_POR_PAPEL[linea.role] ?? ''}>{linea.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <Note kind="info">
        Todas estas explicaciones se generan con plantillas fijas a partir del resultado. Ninguna
        las escribe un modelo de lenguaje, y ninguna puede alterar un número.
      </Note>
    </Card>
  )
}
