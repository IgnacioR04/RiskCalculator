import type { ReactNode } from 'react'
import { useId } from 'react'

/* Primitivas de UI compartidas. Sin lógica financiera: solo presentación. */

export function Card(props: { title?: ReactNode; children: ReactNode; highlight?: boolean }) {
  return (
    <section className={props.highlight ? 'card highlight' : 'card'}>
      {props.title !== undefined && <h2>{props.title}</h2>}
      {props.children}
    </section>
  )
}

export function Note(props: {
  kind?: 'info' | 'warning' | 'negative' | 'demo'
  children: ReactNode
}) {
  return <div className={`note ${props.kind ?? 'info'}`}>{props.children}</div>
}

/** Campo numérico con ayuda contextual, sufijo y error accesible. */
export function NumberField(props: {
  label: string
  value: string
  onChange: (raw: string) => void
  hint?: string
  suffix?: string
  placeholder?: string
  error?: string | undefined
  required?: boolean
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      {props.hint !== undefined && (
        <span className="hint" id={hintId}>
          {props.hint}
        </span>
      )}
      <div className={props.suffix !== undefined ? 'input-suffix' : undefined}>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.error !== undefined ? 'true' : undefined}
          aria-describedby={
            [props.hint !== undefined ? hintId : null, props.error !== undefined ? errorId : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          required={props.required}
        />
        {props.suffix !== undefined && <span className="suffix">{props.suffix}</span>}
      </div>
      {props.error !== undefined && (
        <span className="error" id={errorId} role="alert">
          {props.error}
        </span>
      )}
    </div>
  )
}

/** Control segmentado accesible (patrón radiogroup). */
export function Segmented<T extends string>(props: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="field">
      <span className="hint" style={{ fontWeight: 600 }}>
        {props.label}
      </span>
      <div className="segmented" role="radiogroup" aria-label={props.label}>
        {props.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={opt.value === props.value}
            onClick={() => props.onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Valor con signo explícito y flecha: nunca solo color para el sentido. */
export function SignedValue(props: { formatted: string; sign: -1 | 0 | 1 }) {
  if (props.sign > 0) {
    return (
      <span className="positive">
        <span aria-hidden="true">▲ </span>+{props.formatted}
      </span>
    )
  }
  if (props.sign < 0) {
    return (
      <span className="negative">
        <span aria-hidden="true">▼ </span>
        {props.formatted}
      </span>
    )
  }
  return <span>{props.formatted}</span>
}

export function Stat(props: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="stat">
      <span className="label">{props.label}</span>
      <span className="value">{props.children}</span>
    </div>
  )
}

/** Desglose matemático expandible («fórmulas bajo demanda»). */
export function MathDetails(props: { summary?: string; children: ReactNode }) {
  return (
    <details className="math">
      <summary>{props.summary ?? 'Ver el desglose matemático'}</summary>
      <div className="math-body">{props.children}</div>
    </details>
  )
}

export type DataQuality = 'real' | 'delayed' | 'estimated' | 'demo' | 'manual'

const QUALITY_LABEL: Record<DataQuality, string> = {
  real: 'En tiempo real',
  delayed: 'Demorado',
  estimated: 'Estimado',
  demo: 'Datos demo',
  manual: 'Manual',
}

/** Etiqueta de calidad del dato: real / demorado / estimado / demo / manual. */
export function QualityChip(props: { quality: DataQuality; detail?: string | undefined }) {
  return (
    <span className={`chip ${props.quality}`} title={props.detail}>
      {QUALITY_LABEL[props.quality]}
      {props.detail !== undefined && <span className="sr-only"> — {props.detail}</span>}
    </span>
  )
}

export function EmptyState(props: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="icon" aria-hidden="true">
        {props.icon}
      </div>
      <h3>{props.title}</h3>
      {props.children}
    </div>
  )
}
