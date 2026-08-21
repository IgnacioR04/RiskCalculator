/**
 * Estado del análisis automático (LAB-1207).
 *
 * Visualización mínima y deliberadamente provisional: el rediseño de las seis
 * pantallas es una fase aparte, y adelantar aquí una versión a medias obligaría
 * a rehacerla dos veces. Lo que sí tiene que existir ya es **poder comprobar
 * que el análisis arranca solo**, porque un pipeline automático que no se ve no
 * se puede distinguir de uno que no funciona.
 *
 * Enseña la etapa, el avance y lo que ya está calculado. Nada de botones: si
 * hiciera falta pulsar algo, el automatismo no estaría hecho.
 */
import { Card, Note } from '../../../components/ui'
import {
  ANALYSIS_STAGES,
  STAGE_LABEL,
  type PortfolioHealthReport,
} from '../../../lib/lab/fullAnalysis/contracts'

export interface AnalysisProgressProps {
  readonly report: PortfolioHealthReport | undefined
  readonly running: boolean
}

const ESTADO_TEXTO: Readonly<Record<PortfolioHealthReport['status'], string>> = {
  empty: 'Sin cartera que analizar',
  normalizing: 'Ordenando tus posiciones',
  loadingMarketData: 'Descargando historial',
  partial: 'Resultados parciales',
  calculating: 'Calculando',
  ready: 'Análisis completo',
  insufficient: 'Faltan datos',
  error: 'Error en el análisis',
  stale: 'Recalculando: la cartera ha cambiado',
}

export function AnalysisProgress(props: AnalysisProgressProps) {
  const { report } = props

  if (report === undefined) {
    return (
      <Card title="Diagnóstico automático" sub="Empieza solo cuando cambia tu cartera">
        <p className="muted mb-0">
          {props.running
            ? 'Preparando el análisis…'
            : 'Sin posiciones valoradas todavía. En cuanto las haya, el análisis arranca sin que pulses nada.'}
        </p>
      </Card>
    )
  }

  const hechas = report.completedStages.length
  const siguiente = ANALYSIS_STAGES.find((e) => !report.completedStages.includes(e))

  return (
    <Card title="Diagnóstico automático" sub={ESTADO_TEXTO[report.status]}>
      <div className="bootstrap-progreso">
        <label htmlFor="analisis-avance">
          {siguiente === undefined
            ? `${hechas} de ${ANALYSIS_STAGES.length} etapas`
            : `${STAGE_LABEL[siguiente]} · ${hechas} de ${ANALYSIS_STAGES.length}`}
        </label>
        <progress id="analisis-avance" max={ANALYSIS_STAGES.length} value={hechas} />
      </div>

      <dl className="bootstrap-rango">
        <div>
          <dt>Posiciones</dt>
          <dd>{report.snapshot.status === 'available' ? report.snapshot.value.positions.length : '—'}</dd>
        </div>
        <div>
          <dt>Mayor posición</dt>
          <dd>
            {report.concentration.status === 'available' && report.concentration.value.top1 !== null
              ? `${(report.concentration.value.top1 * 100).toFixed(1).replace('.', ',')} %`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Volatilidad</dt>
          <dd>
            {report.risk.status === 'available'
              ? `${(report.risk.value.annualizedVolatility * 100).toFixed(1).replace('.', ',')} %`
              : '—'}
          </dd>
        </div>
      </dl>

      {report.risk.status === 'insufficient' && (
        // Un guion no es un cero: se dice por qué falta, no se rellena.
        <p className="muted tiny">{report.risk.message}</p>
      )}

      {report.findings.length > 0 && (
        <ul className="muted tiny">
          {report.findings.slice(0, 5).map((f) => (
            <li key={f.code}>{f.claim}</li>
          ))}
        </ul>
      )}

      <Note kind="info">
        Esto es la fase 2 del Laboratorio automático: el análisis ya arranca solo, y las pantallas
        que lo presentan llegan después. Optimización, escenarios y simulación todavía no forman
        parte de él.
      </Note>
    </Card>
  )
}
