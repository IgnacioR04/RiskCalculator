/**
 * Bloques de presentación de la pantalla de Dependencia (LAB-413).
 *
 * No calculan nada, no tocan el store y no descargan: reciben datos ya
 * resueltos. Por eso cada uno se prueba con un objeto fijo, sin montar una
 * cartera ni simular una descarga.
 */
import { Card, Note } from '../../../components/ui'
import { RiskMatrix } from '../../../components/charts/RiskMatrix'
import {
  distinctBets,
  type ClusteringResult,
} from '../../../lib/lab/dependency/dependencyClustering'
import type { DependencyCell, DependencyMatrix } from '../../../lib/lab/dependency/dependencyMatrix'
import type { DownsideDependency } from '../../../lib/lab/dependency/rollingDependency'
import { TableWrap } from '../../../components/TableWrap'

const pct = (valor: number) => `${(valor * 100).toFixed(0)}`
const num = (valor: number) => valor.toFixed(2).replace('.', ',')

/* ── Cuántas apuestas hay de verdad ────────────────────────────────────────── */

export interface BetsBlockProps {
  readonly clustering: ClusteringResult
  readonly totalPositions: number
  readonly labels: Readonly<Record<string, string>>
}

export function BetsBlock(props: BetsBlockProps) {
  const grupos = props.clustering.clusters.filter((c) => c.members.length > 1)
  // Cuenta los grupos **y** lo que quedó sin agrupar. Contar solo los grupos
  // haría desaparecer del titular a las posiciones sin historial suficiente, y
  // saldría un número más bonito por haber medido menos.
  const apuestas = distinctBets(props.clustering)

  return (
    <Card
      title="Cuántas apuestas tienes en realidad"
      sub="Posiciones que se han movido juntas cuentan como una sola"
    >
      <p className="figure figure-result">
        {props.totalPositions} → {apuestas}
      </p>
      <p className="muted">
        {grupos.length === 0
          ? 'Ninguna de tus posiciones se ha movido junto a otra lo bastante como para agruparlas: cada una es una apuesta distinta.'
          : `Tienes ${props.totalPositions} posiciones, pero se comportan como ${apuestas} apuestas distintas.`}
      </p>

      {grupos.length > 0 && (
        <ul className="lista-grupos">
          {grupos.map((grupo) => (
            <li key={grupo.label}>
              <strong>{grupo.label}</strong>
              {grupo.averageCorrelation !== null && (
                <span className="meta"> · se mueven un {pct(grupo.averageCorrelation)} % igual</span>
              )}
              <div className="meta">
                {grupo.members.map((id) => props.labels[id] ?? id).join(', ')}
              </div>
            </li>
          ))}
        </ul>
      )}

      {props.clustering.unclustered.length > 0 && (
        <p className="muted tiny">
          Sin historial suficiente para agrupar:{' '}
          {props.clustering.unclustered.map((id) => props.labels[id] ?? id).join(', ')}. No se
          colocan a ojo.
        </p>
      )}

      <Note>
        Son grupos de activos que <strong>se han movido juntos</strong>, no sectores ni estilos.
        Por eso se llaman «Grupo 1» y no «Tecnología»: ponerles un nombre temático afirmaría una
        causa que el cálculo no ha mirado.
      </Note>
    </Card>
  )
}

/* ── Los pares que más se mueven juntos ────────────────────────────────────── */

export interface PairsBlockProps {
  readonly pairs: readonly DependencyCell[]
  readonly labels: Readonly<Record<string, string>>
  readonly minObservations: number
  readonly unavailablePairs: number
}

export function PairsBlock(props: PairsBlockProps) {
  if (props.pairs.length === 0) {
    return (
      <Card title="Los que más se mueven juntos">
        <p className="muted mb-0">
          Todavía no hay ningún par con historial suficiente. Hacen falta al menos{' '}
          {props.minObservations} días en común.
        </p>
      </Card>
    )
  }

  return (
    <Card
      title="Los que más se mueven juntos"
      sub="Cada pareja con su propia muestra: no se recorta el historial de todas por culpa de una"
    >
      <TableWrap>
        <table className="data" aria-label="Parejas más correlacionadas">
          <thead>
            <tr>
              <th scope="col">Pareja</th>
              <th scope="col">Se mueven igual</th>
              <th scope="col">Días usados</th>
              <th scope="col">Periodo</th>
            </tr>
          </thead>
          <tbody>
            {props.pairs.map((par) => (
              <tr key={`${par.a}-${par.b}`}>
                <td>
                  {props.labels[par.a] ?? par.a} y {props.labels[par.b] ?? par.b}
                </td>
                <td className="num">
                  <strong>{num(par.value!)}</strong>
                </td>
                <td className="num">{par.observations}</td>
                <td>
                  <span className="meta">
                    {par.from} → {par.to}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {props.unavailablePairs > 0 && (
        <p className="muted tiny mb-0">
          {props.unavailablePairs}{' '}
          {props.unavailablePairs === 1 ? 'pareja no se ha podido' : 'parejas no se han podido'}{' '}
          calcular por falta de días en común. No cuentan como cero.
        </p>
      )}
    </Card>
  )
}

/* ── Qué pasa cuando el mercado cae ────────────────────────────────────────── */

export interface DownsideBlockProps {
  readonly items: readonly DownsideDependency[]
  readonly labels: Readonly<Record<string, string>>
}

export function DownsideBlock(props: DownsideBlockProps) {
  const conDato = props.items.filter((d) => d.downside !== null && d.overall !== null)

  if (conDato.length === 0) {
    return (
      <Card title="Qué pasa cuando el mercado cae">
        <p className="muted mb-0">
          No hay suficientes días malos en el periodo elegido para calcular esto sin inventar.
          Prueba con un plazo más largo.
        </p>
      </Card>
    )
  }

  const empeoran = conDato.filter((d) => d.worsensInDrawdown)

  return (
    <Card
      title="Qué pasa cuando el mercado cae"
      sub="La diversificación tiende a desaparecer justo cuando hace falta"
    >
      <TableWrap>
        <table className="data" aria-label="Dependencia en días de caída">
          <thead>
            <tr>
              <th scope="col">Pareja</th>
              <th scope="col">Días normales</th>
              <th scope="col">Días de caída</th>
              <th scope="col">Días malos usados</th>
            </tr>
          </thead>
          <tbody>
            {conDato.map((d) => (
              <tr key={`${d.a}-${d.b}`}>
                <td>
                  {props.labels[d.a] ?? d.a} y {props.labels[d.b] ?? d.b}
                </td>
                <td className="num">{num(d.overall!)}</td>
                <td className="num">
                  <strong>{num(d.downside!)}</strong>
                  {d.worsensInDrawdown && <div className="meta">sube</div>}
                </td>
                <td className="num">{d.downsideObservations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      {/* La definición nunca viaja lejos del número: sin ella no significa nada. */}
      <p className="muted tiny">{conDato[0]!.condition}</p>

      {empeoran.length > 0 && (
        <Note kind="warning">
          {empeoran.length === 1 ? 'Una pareja se parece' : `${empeoran.length} parejas se parecen`}{' '}
          más en las caídas que en el día a día. Es el patrón que arruina una cartera que parecía
          repartida: el reparto se deshace justo el día que tenía que sostenerla.
        </Note>
      )}
    </Card>
  )
}

/* ── La matriz completa ────────────────────────────────────────────────────── */

export interface MatrixBlockProps {
  readonly matrix: DependencyMatrix
  /** Orden de las filas, normalmente el de los grupos. */
  readonly order: readonly string[]
}

export function MatrixBlock(props: MatrixBlockProps) {
  const ids = props.order.length > 0 ? props.order : props.matrix.ids
  if (ids.length < 2) return null

  const labels = ids.map((id) => props.matrix.labels[id] ?? id)
  const values = ids.map((fila) =>
    ids.map((columna) => {
      if (fila === columna) return 1
      const celda = props.matrix.cells.find(
        (c) => (c.a === fila && c.b === columna) || (c.a === columna && c.b === fila),
      )
      return celda?.value ?? null
    }),
  )

  return (
    <Card
      title="La matriz completa"
      sub="Ordenada por grupos: los bloques de color son las posiciones que van juntas"
    >
      {/* El número va siempre impreso y el color solo acompaña, así que la
          matriz es a la vez el mapa de calor y su alternativa textual. */}
      <RiskMatrix labels={labels} values={values} mode="correlacion" />
      <p className="muted tiny mb-0">
        Una casilla vacía es «no se pudo calcular», nunca un cero. Hacen falta{' '}
        {props.matrix.minObservations} días en común por pareja, y cada una usa los suyos.
      </p>
    </Card>
  )
}
