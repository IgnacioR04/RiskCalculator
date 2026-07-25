/**
 * Sistema de componentes de RiskCalculator.
 *
 * Reglas del handoff aplicadas aquí:
 * · Las cifras van SIEMPRE en serif 600 tabular (`Figure`), nunca en sans.
 * · Ningún estado se comunica solo con color: color + glifo + texto.
 * · El color sale de tokens.css; aquí no se escriben hexadecimales.
 */
import type { ReactNode } from 'react'
import { useId } from 'react'
import type { Currency } from '../lib/domain'
import { formatMoneyParts, type Numeric } from '../lib/format'

/* ── Encabezado numerado de sección ──────────────────────────────────────── */

export function SectionHeader(props: { num: string; title: string }) {
  return (
    <div className="section-header">
      <span className="section-num">{props.num}</span>
      <span className="section-title">{props.title}</span>
      <span className="section-rule" />
    </div>
  )
}

/* ── Tarjetas ────────────────────────────────────────────────────────────── */

export type CardVariant = 'default' | 'raised' | 'highlight' | 'warning'

export function Card(props: {
  title?: ReactNode
  sub?: ReactNode
  action?: ReactNode
  variant?: CardVariant
  /** Compatibilidad con el uso anterior: highlight={true}. */
  highlight?: boolean
  children: ReactNode
}) {
  const variant: CardVariant = props.highlight === true ? 'highlight' : (props.variant ?? 'default')

  if (variant === 'highlight') {
    return (
      <section className="card-highlight">
        <div className="accent-rule" />
        <div style={{ flex: 1, minWidth: 0 }}>
          {props.title !== undefined && <div className="label" style={{ color: 'var(--brand-text)' }}>{props.title}</div>}
          {props.children}
        </div>
      </section>
    )
  }

  const cls = variant === 'warning' ? 'card-warning' : variant === 'raised' ? 'card-raised' : 'card'
  return (
    <section className={cls}>
      {(props.title !== undefined || props.action !== undefined) && (
        <div className="card-head" style={{ marginBottom: props.children !== undefined ? 10 : 0 }}>
          <div>
            {props.title !== undefined && <div className="card-title">{props.title}</div>}
            {props.sub !== undefined && <div className="card-sub">{props.sub}</div>}
          </div>
          {props.action}
        </div>
      )}
      {props.children}
    </section>
  )
}

/* ── Cifras ──────────────────────────────────────────────────────────────── */

export type FigureSize = 'hero' | 'result' | 'kpi' | 'sm'

/** Cifra monetaria con el símbolo de divisa separado (Archivo, menor, secundario). */
export function Money(props: {
  value: Numeric
  currency: Currency
  size?: FigureSize
  decimals?: number
  className?: string
}) {
  const { amount, symbol } = formatMoneyParts(props.value, props.currency, props.decimals ?? 2)
  const size = props.size ?? 'kpi'
  return (
    <span className={`figure figure-${size}${props.className !== undefined ? ` ${props.className}` : ''}`}>
      {amount}
      <span className="cur"> {symbol}</span>
    </span>
  )
}

/** Cifra genérica (porcentajes, ratios, unidades) en serif tabular. */
export function Figure(props: { children: ReactNode; size?: FigureSize; className?: string }) {
  const size = props.size ?? 'kpi'
  return (
    <span className={`figure figure-${size}${props.className !== undefined ? ` ${props.className}` : ''}`}>
      {props.children}
    </span>
  )
}

/* ── KPI ─────────────────────────────────────────────────────────────────── */

export function Kpi(props: {
  label: ReactNode
  children: ReactNode
  hint?: string
  /** El benchmark nunca compite con las cifras propias. */
  benchmark?: boolean
}) {
  return (
    <div className="kpi" title={props.hint}>
      <div className="kpi-label">{props.label}</div>
      <div className={props.benchmark === true ? 'kpi-value benchmark' : 'kpi-value'}>{props.children}</div>
    </div>
  )
}

/** Alias del uso anterior. */
export function Stat(props: { label: ReactNode; children: ReactNode }) {
  return <Kpi label={props.label}>{props.children}</Kpi>
}

/* ── Botones ─────────────────────────────────────────────────────────────── */

export function Button(props: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger'
  disabled?: boolean
  small?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  const variant = props.variant ?? 'secondary'
  const cls = [
    'btn',
    variant === 'primary' ? 'primary' : '',
    variant === 'tertiary' ? 'tertiary' : '',
    variant === 'danger' ? 'danger' : '',
    props.small === true ? 'small' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type={props.type ?? 'button'}
      className={cls}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      {props.children}
    </button>
  )
}

/* ── Estados de riesgo ───────────────────────────────────────────────────── */

export type RiskLevel = 'ok' | 'warn' | 'high' | 'na'

/** Cada estado lleva glifo propio: nunca se distingue solo por color. */
export const RISK_META: Record<RiskLevel, { label: string; glyph: string; color: string }> = {
  ok: { label: 'Adecuado', glyph: '●', color: 'var(--positive)' },
  warn: { label: 'Atención', glyph: '▲', color: 'var(--warning)' },
  high: { label: 'Alto', glyph: '■', color: 'var(--negative)' },
  na: { label: 'No disponible', glyph: '—', color: 'var(--na)' },
}

/** Posición del marcador (0–1) dentro de la escala de 4 tramos. */
function markerLeft(level: RiskLevel, position?: number): string {
  if (position !== undefined) return `${Math.min(Math.max(position, 0), 1) * 100}%`
  const centers: Record<RiskLevel, number> = { ok: 0.14, warn: 0.42, high: 0.7, na: 0.92 }
  return `${centers[level] * 100}%`
}

export function RiskScale(props: {
  level: RiskLevel
  /** 0–1 para posicionar el marcador con precisión. */
  position?: number | undefined
  /** Versión apagada para fichas pequeñas. */
  dim?: boolean | undefined
  showLegend?: boolean | undefined
}) {
  const levels: RiskLevel[] = ['ok', 'warn', 'high', 'na']
  return (
    <div>
      <div
        className={props.dim === true ? 'risk-scale dim' : 'risk-scale'}
        role="img"
        aria-label={`Nivel de riesgo: ${RISK_META[props.level].label}`}
      >
        <span className="seg s-ok" />
        <span className="seg s-warn" />
        <span className="seg s-high" />
        <span className="seg s-na" />
        <span className="risk-marker" style={{ left: markerLeft(props.level, props.position) }} />
      </div>
      {props.showLegend !== false && (
        <div className="risk-legend">
          {levels.map((l) => (
            <span
              key={l}
              className={l === props.level ? 'on' : undefined}
              style={l === props.level ? { color: RISK_META[l].color } : undefined}
            >
              {l === props.level ? `${RISK_META[l].glyph} ` : ''}
              {l === 'na' ? 'N/D' : RISK_META[l].label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Chip de estado con glifo + texto. */
export function StateChip(props: { level: RiskLevel; label?: string }) {
  const meta = RISK_META[props.level]
  const kind =
    props.level === 'ok' ? 'positive' : props.level === 'warn' ? 'warning' : props.level === 'high' ? 'negative' : 'na'
  return (
    <span className={`chip ${kind}`}>
      <span aria-hidden="true">{meta.glyph}</span>
      {props.label ?? meta.label}
    </span>
  )
}

/* ── Calidad del dato ────────────────────────────────────────────────────── */

export type DataQuality = 'real' | 'delayed' | 'estimated' | 'demo' | 'manual' | 'na'

const QUALITY_META: Record<DataQuality, { label: string; kind: string; glyph: string }> = {
  real: { label: 'En vivo', kind: 'positive', glyph: '●' },
  delayed: { label: 'Reciente', kind: 'info', glyph: '◷' },
  estimated: { label: 'Estimado', kind: 'info', glyph: '≈' },
  manual: { label: 'Manual', kind: 'warning', glyph: '✎' },
  demo: { label: 'Demostración', kind: 'warning', glyph: '▲' },
  na: { label: 'No disponible', kind: 'na', glyph: '—' },
}

export function DataQualityBadge(props: { quality: DataQuality; detail?: string | undefined }) {
  const meta = QUALITY_META[props.quality]
  return (
    <span className={`badge-quality chip ${meta.kind}`} title={props.detail}>
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.label}
      {props.detail !== undefined && <span className="sr-only"> — {props.detail}</span>}
    </span>
  )
}

/** Alias del uso anterior. */
export const QualityChip = DataQualityBadge

/* ── Pestañas y segmentado ───────────────────────────────────────────────── */

export function Tabs<T extends string>(props: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="tabs" role="tablist" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === props.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>(props: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** Oculta la etiqueta visible (queda accesible). */
  hideLabel?: boolean
}) {
  return (
    <div className="field" style={{ marginBottom: props.hideLabel === true ? 0 : undefined }}>
      {props.hideLabel !== true && <span className="label">{props.label}</span>}
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

/** Fila de filtros tipo periodo / frecuencia. */
export function FilterPills<T extends string>(props: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="filter-row" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="pill"
          aria-pressed={o.value === props.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Formularios ─────────────────────────────────────────────────────────── */

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

/** Celda de entrada de la rejilla de la calculadora (superficie interna). */
export function InputCell(props: {
  label: string
  value: string
  onChange: (raw: string) => void
  suffix?: string
  hint?: string
  error?: string | undefined
}) {
  const id = useId()
  return (
    <div className="input-cell" title={props.hint}>
      <label htmlFor={id}>{props.label}</label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.error !== undefined ? 'true' : undefined}
        />
        {props.suffix !== undefined && (
          <span style={{ font: '400 10px var(--font-ui)', color: 'var(--text-secondary)' }}>{props.suffix}</span>
        )}
      </div>
      {props.error !== undefined && (
        <span className="error" role="alert">
          {props.error}
        </span>
      )}
    </div>
  )
}

/* ── Notas ───────────────────────────────────────────────────────────────── */

export function Note(props: { kind?: 'info' | 'warning' | 'negative' | 'demo'; children: ReactNode }) {
  const kind = props.kind ?? 'info'
  const glyph = kind === 'warning' || kind === 'demo' ? '▲' : kind === 'negative' ? '■' : '◆'
  return (
    <div className={`note ${kind}`}>
      <span className="note-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span style={{ minWidth: 0 }}>{props.children}</span>
    </div>
  )
}

/** Valor con signo y flecha: nunca solo color para el sentido. */
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

/* ── Desplegables ────────────────────────────────────────────────────────── */

export function Disclose(props: { summary: string; aside?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="disclose" open={props.open}>
      <summary>
        {props.summary}
        {props.aside !== undefined && (
          <span style={{ marginLeft: 'auto', font: '400 9px var(--font-ui)', color: 'var(--text-disabled)' }}>
            {props.aside}
          </span>
        )}
      </summary>
      <div className="disclose-body">{props.children}</div>
    </details>
  )
}

/** Alias del uso anterior. */
export function MathDetails(props: { summary?: string; children: ReactNode }) {
  return (
    <Disclose summary={props.summary ?? 'Ver la cuenta y la fórmula'} aside="opcional">
      {props.children}
    </Disclose>
  )
}

/* ── Ayuda contextual ────────────────────────────────────────────────────── */

export function Help(props: { text: string }) {
  return (
    <button type="button" className="help" title={props.text} aria-label={props.text}>
      ?
    </button>
  )
}

/* ── Estado vacío ────────────────────────────────────────────────────────── */

export function EmptyState(props: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="icon" aria-hidden="true">
        {props.icon ?? '◇'}
      </div>
      <h3>{props.title}</h3>
      {props.children}
    </div>
  )
}

/** Bloque de carga. */
export function Skeleton(props: { height?: number; width?: string }) {
  return (
    <div
      className="skeleton"
      style={{ height: props.height ?? 14, width: props.width ?? '100%' }}
      aria-hidden="true"
    />
  )
}

/** Punto de color de una serie de gráfica. */
export function SeriesDot(props: { index: number }) {
  return (
    <i
      className="series-dot"
      style={{ background: `var(--series-${(props.index % 7) + 1})` }}
      aria-hidden="true"
    />
  )
}
