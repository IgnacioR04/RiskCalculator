/**
 * Cabecera de contexto persistente del Laboratorio (LAB-102).
 *
 * Responde en todo momento a «¿sobre qué datos estoy mirando esto?»:
 * cartera, fecha de valoración, moneda, perfil, estado de la política de
 * inversión, calidad de los datos y último cálculo.
 *
 * **Ningún dato se inventa.** Casi todas estas magnitudes las producen fases
 * posteriores (IPS en la 2, calidad en la 2, runs en la 9). Mientras no
 * existan, el hueco se muestra como no disponible y se explica por qué. Un
 * valor de relleno aquí sería peor que un hueco: el usuario decidiría creyendo
 * que mira su cartera.
 */
import type { Currency } from '../../../lib/domain'

export type IpsStatus = 'completa' | 'incompleta' | 'caducada'
export type DataQuality = 'suficiente' | 'parcial' | 'insuficiente'

export interface LabContextData {
  /** Nombre de la cartera analizada. */
  readonly portfolioName?: string
  /** Fecha de valoración de los datos, ISO `YYYY-MM-DD`. */
  readonly asOf?: string
  readonly currency?: Currency
  /** Perfil de riesgo efectivo, ya resuelto. */
  readonly riskProfile?: string
  readonly ipsStatus?: IpsStatus
  readonly dataQuality?: DataQuality
  /** Marca temporal del último cálculo publicado. */
  readonly lastRunAt?: string
}

export interface LabContextHeaderProps {
  readonly context?: LabContextData
  /** Crea un cálculo nuevo. Ausente ⇒ el botón se muestra deshabilitado. */
  readonly onRefresh?: () => void
  /**
   * Hay datos más recientes que los del resultado que se está leyendo. Nunca se
   * recalcula solo: se avisa y decide el usuario.
   */
  readonly hasFresherData?: boolean
}

const ETIQUETA_IPS: Record<IpsStatus, string> = {
  completa: 'Completa',
  incompleta: 'Incompleta',
  caducada: 'Caducada',
}

const ETIQUETA_CALIDAD: Record<DataQuality, string> = {
  suficiente: 'Suficiente',
  parcial: 'Parcial',
  insuficiente: 'Insuficiente',
}

/** Dato del que aún no hay fuente. Se dice, no se rellena. */
function Pendiente() {
  return (
    <span className="lab-context__pendiente" title="Todavía no hay dato para esto">
      No disponible
    </span>
  )
}

function Campo(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="lab-context__campo">
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  )
}

export function LabContextHeader(props: LabContextHeaderProps) {
  const c = props.context ?? {}

  return (
    /* `section` etiquetada y no `header`: dentro de la shell global el `header`
       queda anidado en otro elemento seccionador y deja de ser landmark
       `banner`, así que su rol dependería de dónde se monte. `region` es
       estable en cualquier anidamiento. */
    <section className="lab-context" aria-label="Contexto del análisis">
      <dl className="lab-context__campos">
        <Campo label="Cartera">{c.portfolioName ?? <Pendiente />}</Campo>
        <Campo label="Valoración">
          {c.asOf === undefined ? <Pendiente /> : <time dateTime={c.asOf}>{c.asOf}</time>}
        </Campo>
        <Campo label="Moneda">{c.currency ?? <Pendiente />}</Campo>
        <Campo label="Perfil">{c.riskProfile ?? <Pendiente />}</Campo>
        <Campo label="Política de inversión">
          {c.ipsStatus === undefined ? <Pendiente /> : ETIQUETA_IPS[c.ipsStatus]}
        </Campo>
        <Campo label="Calidad de datos">
          {c.dataQuality === undefined ? <Pendiente /> : ETIQUETA_CALIDAD[c.dataQuality]}
        </Campo>
        <Campo label="Último cálculo">
          {c.lastRunAt === undefined ? <Pendiente /> : <time dateTime={c.lastRunAt}>{c.lastRunAt}</time>}
        </Campo>
      </dl>

      <div className="lab-context__acciones">
        {props.hasFresherData === true && (
          <p className="lab-context__aviso" role="status">
            Hay datos más recientes; recalcular.
          </p>
        )}
        <button
          type="button"
          className="btn"
          onClick={props.onRefresh}
          disabled={props.onRefresh === undefined}
        >
          Actualizar análisis
        </button>
      </div>
    </section>
  )
}
