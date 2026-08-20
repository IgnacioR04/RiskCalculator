/**
 * Historial de cálculos (LAB-905) y exportación (LAB-907).
 *
 * Lista lo que se ha calculado, permite abrirlo y sacarlo del navegador.
 *
 * ## La regla que la gobierna
 *
 * **Abrir un cálculo guardado no lo recalcula.** Es el criterio de aceptación de
 * LAB-905, y no es una optimización: recalcular al abrir haría que un registro
 * cambiara al mirarlo, y entonces no sería un registro. Si hay datos nuevos, se
 * ofrece **crear otro**, no reescribir el que había.
 *
 * Los cálculos viven en el navegador, no en la nube: es la decisión de
 * `LAB-311`, confirmada por
 * [`ADR-006`](../../../../docs/adr/ADR-006-scenario-persistence-and-execution.md).
 * Son material reconstruible y contienen la cartera implícitamente.
 */
import { useMemo, useState } from 'react'
import { Card, Note } from '../../../components/ui'
import { BUILD_INFO } from '../../../lib/buildInfo'
import { clearRuns, listRuns, type LabRun } from '../../../lib/lab/runs/localRuns'
import {
  buildExport,
  suggestedFilename,
  toJson,
  toMarkdown,
} from '../../../lib/lab/evidence/exportRun'
import { LabShell } from '../components/LabShell'

const ETIQUETA_TIPO: Readonly<Record<string, string>> = {
  stability: 'Estabilidad',
  scenario: 'Escenario',
  quality: 'Calidad de datos',
}

/**
 * Descarga un texto como fichero.
 *
 * Se hace con un blob y no con un enlace a un servicio: el fichero no sale del
 * navegador hasta que el usuario lo guarda, que es coherente con que los
 * cálculos tampoco salgan.
 */
function descargar(nombre: string, contenido: string, tipo: string): void {
  const blob = new Blob([contenido], { type: tipo })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

export function LabRunsPage() {
  const [version, setVersion] = useState(0)
  const runs = useMemo(() => listRuns(), [version])
  const [abierto, setAbierto] = useState<string | null>(null)

  const seleccionado = runs.find((r) => r.id === abierto) ?? null

  if (runs.length === 0) {
    return (
      <LabShell routeId="lab.runs">
        <Card title="Todavía no has guardado ningún cálculo">
          <p className="muted mb-0">
            Cuando ejecutes un escenario o un análisis de estabilidad y lo guardes, aparecerá aquí
            con su fecha, su versión de modelo y sus entradas, para poder volver a mirarlo.
          </p>
        </Card>
      </LabShell>
    )
  }

  return (
    <LabShell routeId="lab.runs">
      <Card
        title="Lo que has calculado"
        sub="Abrir uno no lo recalcula: es lo que salió entonces, con los datos de entonces"
      >
        <div className="table-wrap">
          <table className="data" aria-label="Historial de cálculos">
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Datos de</th>
                <th scope="col">Calculado</th>
                <th scope="col">Modelo</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{ETIQUETA_TIPO[run.kind] ?? run.kind}</td>
                  <td className="num">{run.asOf}</td>
                  <td className="num">
                    <span className="meta">{run.createdAt.slice(0, 16).replace('T', ' ')}</span>
                  </td>
                  <td className="num">{run.modelVersion}</td>
                  <td>
                    <button
                      type="button"
                      className="btn small"
                      aria-expanded={abierto === run.id}
                      onClick={() => setAbierto((v) => (v === run.id ? null : run.id))}
                    >
                      {abierto === run.id ? 'Cerrar' : 'Abrir'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {seleccionado !== null && <DetalleRun run={seleccionado} />}

      <Card title="Borrar el historial" sub="Los cálculos viven en este navegador, no en la nube">
        <button
          type="button"
          className="btn small danger"
          onClick={() => {
            clearRuns()
            setAbierto(null)
            setVersion((v) => v + 1)
          }}
        >
          Borrar todos los cálculos guardados
        </button>
        <p className="muted tiny mb-0">
          No hay copia en ningún servidor: si los borras, se van. Es la contrapartida de que tu
          cartera no viaje a ninguna parte.
        </p>
      </Card>
    </LabShell>
  )
}

function DetalleRun(props: { readonly run: LabRun }) {
  const { run } = props
  const exportacion = buildExport(run, [], BUILD_INFO.commit)

  return (
    <Card
      title={`${ETIQUETA_TIPO[run.kind] ?? run.kind} · ${run.asOf}`}
      sub={`Modelo ${run.modelVersion}, calculado el ${run.createdAt.slice(0, 10)}`}
    >
      <div className="table-wrap">
        <table className="data" aria-label={`Detalle del cálculo ${run.id}`}>
          <thead>
            <tr>
              <th scope="col">Campo</th>
              <th scope="col">Valor</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(run.inputs)
              .sort()
              .map(([clave, valor]) => (
                <tr key={`in-${clave}`}>
                  <td>
                    {clave} <span className="meta">entrada</span>
                  </td>
                  <td className="num">{String(valor)}</td>
                </tr>
              ))}
            {Object.entries(run.summary)
              .sort()
              .map(([clave, valor]) => (
                <tr key={`out-${clave}`}>
                  <td>
                    <strong>{clave}</strong> <span className="meta">resultado</span>
                  </td>
                  <td className="num">
                    {valor === null ? <span className="meta">No disponible</span> : String(valor)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="controles-fila">
        <button
          type="button"
          className="btn small"
          onClick={() =>
            descargar(suggestedFilename(run, 'md'), toMarkdown(exportacion), 'text/markdown')
          }
        >
          Descargar para leer (Markdown)
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            descargar(suggestedFilename(run, 'json'), toJson(exportacion), 'application/json')
          }
        >
          Descargar datos (JSON)
        </button>
      </div>

      <Note kind="info">
        Al abrir un cálculo guardado no se vuelve a calcular nada: esto es lo que salió entonces,
        con los datos de entonces. Si quieres el resultado con los datos de hoy, ejecuta el análisis
        otra vez y guárdalo aparte.
      </Note>
    </Card>
  )
}
