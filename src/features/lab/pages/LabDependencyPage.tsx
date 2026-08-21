/**
 * Dependencia (LAB-413).
 *
 * Contesta «¿estoy diversificado de verdad?», que no es lo mismo que «¿tengo
 * muchas cosas?». Diez posiciones que suben y bajan a la vez son una sola
 * apuesta repetida diez veces, y eso no se ve en ninguna pantalla de reparto:
 * el reparto mira **cuánto** hay de cada cosa, no si esas cosas se comportan
 * igual.
 *
 * El orden de la página es deliberado. Primero cuántas apuestas hay de verdad,
 * que es la conclusión; después las parejas concretas; después qué pasa en las
 * caídas, que es cuando la respuesta cambia; y al final la matriz completa,
 * para quien quiera comprobarlo casilla a casilla. Poner la matriz arriba
 * obligaría a leer 435 celdas para llegar a una frase.
 *
 * La página no calcula: junta el hook de adquisición con cuatro bloques puros.
 */
import { useMemo } from 'react'
import { Card, Note, Segmented } from '../../../components/ui'
import { clusterByDependency } from '../../../lib/lab/dependency/dependencyClustering'
import {
  dependencyMatrix,
  strongestPairs,
  type ReturnSeries,
} from '../../../lib/lab/dependency/dependencyMatrix'
import { downsideDependency } from '../../../lib/lab/dependency/rollingDependency'
import { hasDemoHistoricalSeries } from '../../../state/demoHistory'
import {
  useStabilityAnalysis,
  type StabilityPeriod,
} from '../../../lib/lab/stability/useStabilityAnalysis'
import { buildPortfolioView } from '../../../lib/portfolio'
import { useAppStore } from '../../../state/store'
import { LabShell } from '../components/LabShell'
import {
  BetsBlock,
  DownsideBlock,
  MatrixBlock,
  PairsBlock,
} from '../dependency/DependencyBlocks'

const PERIODOS: readonly { value: StabilityPeriod; label: string }[] = [
  { value: '90', label: '3 meses' },
  { value: '180', label: '6 meses' },
  { value: '365', label: '1 año' },
]

export function LabDependencyPage() {
  const store = useAppStore()
  const displayCurrency = store.settings.displayCurrency

  const view = useMemo(
    () =>
      buildPortfolioView({
        assets: store.assets,
        accounts: store.accounts,
        transactions: store.transactions,
        quotes: store.quotes,
        fxRates: store.fxRates,
        displayCurrency,
      }),
    [store.assets, store.accounts, store.transactions, store.quotes, store.fxRates, displayCurrency],
  )

  const candidatos = useMemo(
    () =>
      view.positions
        .filter((p) => p.quantity.gt(0))
        .map((p) => p.asset)
        // El efectivo queda fuera: su serie es plana por definición, así que no
        // correlaciona con nada y solo aporta filas de «no se pudo calcular».
        // No es un dato que falte, es una pregunta que no aplica.
        .filter((a) => a.assetType !== 'cash')
        .filter(
          (a) =>
            hasDemoHistoricalSeries(a.id) ||
            a.providerIds?.['coingecko'] !== undefined ||
            a.providerIds?.['twelvedata'] !== undefined,
        ),
    [view.positions],
  )

  const { period, busy, loaded, missing, setPeriod } = useStabilityAnalysis(
    candidatos,
    displayCurrency,
  )

  const analisis = useMemo(() => {
    if (loaded === null || loaded.length < 2) return null

    const series: ReturnSeries[] = loaded.map((item) => ({
      id: item.asset.id,
      label: item.asset.symbol,
      returns: item.returns,
    }))

    const matriz = dependencyMatrix(series)
    const clustering = clusterByDependency(matriz)

    // La condición de «día malo» la define la cartera, no uno de los dos
    // activos comparados: así el resultado es simétrico. Se aproxima con la
    // media de los retornos disponibles cada día, que es la cartera que el
    // usuario tiene delante.
    const porFecha = new Map<string, number[]>()
    for (const s of series) {
      for (const punto of s.returns) {
        const lista = porFecha.get(punto.date)
        if (lista === undefined) porFecha.set(punto.date, [punto.value])
        else lista.push(punto.value)
      }
    }
    const cartera: ReturnSeries = {
      id: '__cartera',
      label: 'Cartera',
      returns: [...porFecha.entries()]
        .map(([date, valores]) => ({
          date,
          value: valores.reduce((s, v) => s + v, 0) / valores.length,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }

    const porId = new Map(series.map((s) => [s.id, s]))
    const fuertes = strongestPairs(matriz, 5)

    return {
      matriz,
      clustering,
      fuertes,
      caidas: fuertes.flatMap((par) => {
        const a = porId.get(par.a)
        const b = porId.get(par.b)
        return a === undefined || b === undefined ? [] : [downsideDependency(a, b, cartera)]
      }),
    }
  }, [loaded])

  const controles = (
    <Card
      title="Periodo analizado"
      sub="Cada pareja usa los días que tengan en común dentro de este plazo"
    >
      <div className="controles-fila">
        <Segmented<StabilityPeriod>
          label="Periodo"
          options={PERIODOS}
          value={period}
          onChange={setPeriod}
        />
        {busy && <span className="muted tiny">Descargando historial…</span>}
      </div>
      {missing.length > 0 && (
        <p className="muted tiny mb-0">
          Sin historial disponible: {missing.join(', ')}. No entran en el análisis en vez de
          contarse como si no se movieran.
        </p>
      )}
    </Card>
  )

  if (candidatos.length < 2) {
    return (
      <LabShell routeId="lab.stability.dependence">
        <Card title="Hacen falta al menos dos posiciones con historial">
          <p className="muted mb-0">
            La dependencia compara unas posiciones con otras, así que con menos de dos no hay nada
            que comparar. Carga los datos de demostración o añade posiciones con precio histórico.
          </p>
        </Card>
      </LabShell>
    )
  }

  return (
    <LabShell routeId="lab.stability.dependence">
      {controles}

      {analisis === null ? (
        <Card title={busy ? 'Calculando…' : 'Sin historial suficiente'}>
          <p className="muted mb-0">
            {busy
              ? 'Descargando el historial de tus posiciones para ver si se mueven juntas.'
              : 'No ha llegado historial de al menos dos posiciones, así que no hay parejas que comparar. Revisa en Cartera que tus activos estén enlazados con un proveedor.'}
          </p>
        </Card>
      ) : (
        <>
          <BetsBlock
            clustering={analisis.clustering}
            totalPositions={analisis.matriz.ids.length}
            labels={analisis.matriz.labels}
          />
          <PairsBlock
            pairs={analisis.fuertes}
            labels={analisis.matriz.labels}
            minObservations={analisis.matriz.minObservations}
            unavailablePairs={analisis.matriz.unavailablePairs}
          />
          <DownsideBlock items={analisis.caidas} labels={analisis.matriz.labels} />
          <MatrixBlock matrix={analisis.matriz} order={analisis.clustering.leafOrder} />

          <Note kind="info">
            Correlación no es causa. Que dos posiciones se hayan movido juntas describe lo que ha
            pasado, no explica por qué ni promete que siga pasando.
          </Note>
        </>
      )}
    </LabShell>
  )
}
