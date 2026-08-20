/**
 * Bootstrap por bloques en pantalla (LAB-1014).
 *
 * La pregunta que responde no es «cuánto valdrá mi cartera» sino **«qué abanico
 * de finales sale si el futuro se parece al pasado que tengo»**. Por eso lo que
 * se enseña es un rango de percentiles y no una cifra: una sola cifra de una
 * distribución se lee como una previsión, y esto no lo es.
 *
 * El bloque no calcula: recibe el estado del worker y lo pinta. La ejecución
 * vive en `useBootstrapRun`, y ahí está la razón de que exista este bloque —
 * [`ADR-006`](../../../../docs/adr/ADR-006-scenario-persistence-and-execution.md)
 * exigía worker, cancelación y progreso antes de exponerlo.
 */
import { Card, Note } from '../../../components/ui'
import { formatMoney, formatPct } from '../../../lib/format'
import type { Currency } from '../../../lib/domain'
import type { BootstrapState } from './useBootstrapRun'

export interface BootstrapBlockProps {
  readonly state: BootstrapState
  /** Días con historia común a todas las posiciones. */
  readonly availableDays: number
  readonly horizonDays: number
  readonly paths: number
  readonly blockDays: number
  readonly currency: Currency
  readonly onHorizonChange: (dias: number) => void
  readonly onPathsChange: (n: number) => void
  readonly onRun: () => void
  readonly onCancel: () => void
}

const HORIZONTES: readonly { readonly dias: number; readonly label: string }[] = [
  { dias: 63, label: '3 meses' },
  { dias: 126, label: '6 meses' },
  { dias: 252, label: '1 año' },
]

/**
 * Cuántas trayectorias. Más trayectorias no hacen el modelo más acertado,
 * hacen los percentiles más estables; conviene que se lea así.
 */
const TRAYECTORIAS: readonly number[] = [1_000, 5_000, 10_000]

export function BootstrapBlock(props: BootstrapBlockProps) {
  const { state } = props
  const calculando = state.estado === 'calculando'
  // El horizonte no puede exceder la historia disponible: extrapolar más allá
  // de lo que se ha observado no es remuestrear, es inventar.
  const horizontes = HORIZONTES.filter((h) => h.dias <= props.availableDays)
  const sinHistoriaSuficiente = horizontes.length === 0

  return (
    <Card
      title="Muchos futuros posibles"
      sub="Remuestreo por bloques de tu propia historia, no una campana de Gauss"
    >
      {sinHistoriaSuficiente ? (
        <p className="muted mb-0">
          Con {props.availableDays} días de historia común a todas tus posiciones no llega ni para
          el horizonte más corto (3 meses). Descarga más historial desde Estabilidad. No se calcula
          con menos: un abanico construido sobre cuatro semanas parecería igual de firme y no lo
          sería.
        </p>
      ) : (
        <>
          <div className="controles-fila">
            <div className="field">
              <label htmlFor="bootstrap-horizonte">Horizonte</label>
              <select
                id="bootstrap-horizonte"
                value={props.horizonDays}
                onChange={(e) => props.onHorizonChange(Number(e.target.value))}
                disabled={calculando}
              >
                {horizontes.map((h) => (
                  <option key={h.dias} value={h.dias}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bootstrap-trayectorias">Trayectorias</label>
              <select
                id="bootstrap-trayectorias"
                value={props.paths}
                onChange={(e) => props.onPathsChange(Number(e.target.value))}
                disabled={calculando}
              >
                {TRAYECTORIAS.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString('es-ES')}
                  </option>
                ))}
              </select>
            </div>
            {calculando ? (
              <button type="button" className="btn" onClick={props.onCancel}>
                Cancelar
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={props.onRun}>
                Generar futuros
              </button>
            )}
          </div>

          {calculando && (
            <div className="bootstrap-progreso">
              <label htmlFor="bootstrap-avance">
                Generando trayectorias: {state.hechas.toLocaleString('es-ES')} de{' '}
                {state.total.toLocaleString('es-ES')}
              </label>
              {/* `progress` nativo: anuncia su valor a los lectores de pantalla
                  sin necesidad de `role` ni `aria-valuenow` a mano. */}
              <progress id="bootstrap-avance" max={state.total} value={state.hechas} />
            </div>
          )}

          {state.estado === 'cancelado' && (
            <p className="muted mb-0">
              Cancelado. No se ha calculado nada, así que no hay ninguna cifra que enseñar.
            </p>
          )}

          {state.estado === 'error' && <Note kind="warning">{state.motivo}</Note>}

          {state.estado === 'listo' && (
            <Resultado
              resultado={state.resultado}
              currency={props.currency}
              horizonDays={props.horizonDays}
              blockDays={props.blockDays}
            />
          )}
        </>
      )}
    </Card>
  )
}

function Resultado(props: {
  resultado: Extract<BootstrapState, { estado: 'listo' }>['resultado']
  currency: Currency
  horizonDays: number
  blockDays: number
}) {
  const { resultado } = props
  const cambio = (valor: number) => valor / resultado.baseValue - 1

  const filas: readonly { readonly etiqueta: string; readonly valor: number }[] = [
    { etiqueta: 'Peor 5 %', valor: resultado.distribution.p05 },
    { etiqueta: 'Cuartil bajo', valor: resultado.distribution.p25 },
    { etiqueta: 'Mediana', valor: resultado.distribution.p50 },
    { etiqueta: 'Cuartil alto', valor: resultado.distribution.p75 },
    { etiqueta: 'Mejor 5 %', valor: resultado.distribution.p95 },
  ]

  return (
    <>
      <dl className="bootstrap-rango">
        {filas.map((fila) => (
          <div key={fila.etiqueta}>
            <dt>{fila.etiqueta}</dt>
            <dd>
              {formatMoney(fila.valor, props.currency)}
              <span className="muted tiny"> ({formatPct(cambio(fila.valor))})</span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="muted tiny">
        Peor caída típica dentro del recorrido: {formatPct(resultado.medianMaxDrawdown)}. Es la
        mediana de las {resultado.paths.toLocaleString('es-ES')} trayectorias, no la peor de todas:
        la mitad de los futuros generados pasan por algo peor que eso.
      </p>

      <Note kind="info">
        Esto no es una probabilidad de nada. Es lo que sale al recolocar al azar bloques de{' '}
        {props.blockDays} días de tu propia historia, {resultado.paths.toLocaleString('es-ES')}{' '}
        veces, sobre un horizonte de {props.horizonDays} días hábiles. Los bloques van por fechas y
        no por activo, de modo que se conserva cómo se mueven tus posiciones entre sí. Se pierde la
        dependencia <em>entre</em> bloques, y la cartera no se rebalancea. Semilla {resultado.seed}:
        con la misma semilla sale exactamente lo mismo.
      </Note>
    </>
  )
}
