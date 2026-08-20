/**
 * Reparar (LAB-613).
 *
 * «¿Qué le pasa a mi cartera?», con la lista **ordenada por lo que importa** y
 * no por lo que llama la atención.
 *
 * Lo estructural va primero aunque lo táctico sea más urgente: actuar sobre el
 * ruido ignorando cómo está construida la cartera es exactamente cómo se
 * arruina una. El orden lo garantiza el motor, no esta pantalla.
 *
 * Cada hallazgo enlaza a una herramienta del Laboratorio. **No hay botones de
 * comprar ni de vender**, y no es una omisión: esta pantalla describe, y quien
 * decide es el usuario mirando por sí mismo.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Note } from '../../../components/ui'
import { formatMoney, formatPct } from '../../../lib/format'
import { buildPortfolioView } from '../../../lib/portfolio'
import { compileConstraints, violations as comprobar, type CompilerInstrument } from '../../../lib/lab/candidates/constraintCompiler'
import { clusterByDependency, distinctBets } from '../../../lib/lab/dependency/dependencyClustering'
import { dependencyMatrix, strongestPairs, type ReturnSeries } from '../../../lib/lab/dependency/dependencyMatrix'
import { assessRepair } from '../../../lib/lab/repair/repairEngine'
import type { RepairContext } from '../../../lib/lab/repair/rules'
import { labPath, type LabRouteId } from '../routes/labRoutes'
import { useStabilityAnalysis } from '../../../lib/lab/stability/useStabilityAnalysis'
import { hasDemoHistoricalSeries } from '../../../state/demoHistory'
import { useAppStore } from '../../../state/store'
import { LabShell } from '../components/LabShell'

const SEVERIDAD_CLASE: Readonly<Record<string, string>> = {
  alta: 'negative',
  media: 'warning',
  baja: 'muted',
}

export function LabRepairPage() {
  const store = useAppStore()
  const displayCurrency = store.settings.displayCurrency
  const [calculado, setCalculado] = useState(false)

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
        .filter((p) => p.quantity.gt(0) && p.value !== null && p.asset.assetType !== 'cash')
        .filter(
          (p) =>
            hasDemoHistoricalSeries(p.asset.id) ||
            p.asset.providerIds?.['coingecko'] !== undefined ||
            p.asset.providerIds?.['twelvedata'] !== undefined,
        )
        .map((p) => p.asset),
    [view.positions],
  )

  const { loaded, busy, run } = useStabilityAnalysis(candidatos, displayCurrency)

  const informe = useMemo(() => {
    if (!calculado) return null

    const conCantidad = view.positions.filter((p) => p.quantity.gt(0))
    const valoradas = conCantidad.filter((p) => p.value !== null)
    if (valoradas.length === 0) return null

    const total = valoradas.reduce((s, p) => s + p.value!.toNumber(), 0)
    const posiciones = valoradas.map((p) => ({
      symbol: p.asset.symbol,
      weight: total > 0 ? p.value!.toNumber() / total : 0,
      assetType: p.asset.assetType,
    }))
    const mayor = posiciones.reduce((a, b) => (b.weight > a.weight ? b : a), posiciones[0]!)
    const hhi = posiciones.reduce((s, p) => s + p.weight * p.weight, 0)

    // Dependencia: solo si hay series descargadas. Sin ellas no se concluye
    // nada sobre si las posiciones se mueven juntas.
    let apuestas: number | null = null
    let duplicados: RepairContext['nearDuplicates'] = []
    if (loaded !== null && loaded.length >= 2) {
      const series: ReturnSeries[] = loaded.map((item) => ({
        id: item.asset.id,
        label: item.asset.symbol,
        returns: item.returns,
      }))
      const matriz = dependencyMatrix(series)
      apuestas = distinctBets(clusterByDependency(matriz))
      duplicados = strongestPairs(matriz, 5).map((par) => ({
        a: matriz.labels[par.a] ?? par.a,
        b: matriz.labels[par.b] ?? par.b,
        correlation: par.value!,
      }))
    }

    // Incumplimientos de la política vigente, con el mismo compilador que usan
    // las candidatas: dos comprobaciones distintas darían dos verdades.
    const universo: CompilerInstrument[] = valoradas.map((p) => ({
      id: p.asset.id,
      symbol: p.asset.symbol,
      dimensions: {
        assetType: p.asset.assetType,
        ...(p.asset.sector === undefined ? {} : { sector: p.asset.sector }),
        currency: p.asset.quoteCurrency,
      },
      currentWeight: total > 0 ? p.value!.toNumber() / total : 0,
    }))
    const compilado = compileConstraints(store.labPolicyActive?.constraints ?? [], universo)
    const incumple = comprobar(compilado, universo.map((u) => u.currentWeight)).map((v) => v.label)

    const contexto: RepairContext = {
      totalValue: total,
      baseCurrency: displayCurrency,
      maxWeight: mayor.weight,
      maxWeightSymbol: mayor.symbol,
      effectivePositions: hhi > 0 ? 1 / hhi : 0,
      positions: posiciones,
      distinctBets: apuestas,
      nearDuplicates: duplicados,
      violations: incumple,
      priceCoverage: conCantidad.length === 0 ? null : valoradas.length / conCantidad.length,
    }

    return assessRepair(contexto)
  }, [calculado, view.positions, loaded, store.labPolicyActive, displayCurrency])

  if (view.positions.filter((p) => p.quantity.gt(0)).length === 0) {
    return (
      <LabShell routeId="lab.future.repair">
        <Card title="Hace falta una cartera">
          <p className="muted mb-0">
            Esta pantalla mira cómo está construida tu cartera. Sin posiciones no hay nada que
            mirar. Carga los datos de demostración o añade posiciones en{' '}
            <Link to="/cartera">Cartera</Link>.
          </p>
        </Card>
      </LabShell>
    )
  }

  return (
    <LabShell routeId="lab.future.repair">
      <Card
        title="Qué le pasa a tu cartera"
        sub="Ordenado por lo que importa, no por lo que llama la atención"
      >
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            void run().then(() => setCalculado(true))
          }}
        >
          {busy ? 'Revisando…' : 'Revisar mi cartera'}
        </button>
      </Card>

      {informe === null ? (
        <Card title="Todavía no se ha revisado">
          <p className="muted mb-0">
            Pulsa «Revisar mi cartera». No se muestra ningún diagnóstico antes de calcularlo.
          </p>
        </Card>
      ) : informe.findings.length === 0 ? (
        <Card title="No se ha encontrado nada estructural">
          <p className="muted mb-0">
            Ninguna posición domina la cartera, nada se repite y se cumplen tus reglas. Eso no
            significa que la cartera sea buena: significa que no tiene los problemas que esta
            pantalla sabe buscar.
          </p>
        </Card>
      ) : (
        <>
          {informe.findings.map((hallazgo) => (
            <Card
              key={hallazgo.id}
              title={hallazgo.title}
              sub={hallazgo.nature === 'structural' ? 'Cómo está construida' : 'Qué dicen los datos ahora'}
            >
              <p className={SEVERIDAD_CLASE[hallazgo.severity] ?? 'muted'}>{hallazgo.detail}</p>

              <p className="muted tiny">
                Afecta a {formatPct(hallazgo.materiality.weight, 0)} de tu cartera (
                {formatMoney(hallazgo.materiality.value, displayCurrency)}).
              </p>

              <ul className="lista-grupos">
                {hallazgo.evidence.map((linea) => (
                  <li key={linea}>
                    <span className="meta">{linea}</span>
                  </li>
                ))}
              </ul>

              <div className="controles-fila">
                {hallazgo.explore.map((opcion) => (
                  <Link
                    key={opcion.routeId}
                    className="btn small"
                    to={labPath(opcion.routeId as LabRouteId)}
                  >
                    {opcion.label}
                  </Link>
                ))}
              </div>
            </Card>
          ))}

          {informe.hidden > 0 && (
            <p className="muted tiny">
              Hay {informe.hidden} {informe.hidden === 1 ? 'hallazgo más' : 'hallazgos más'} por
              debajo de estos. Se muestran los cuatro primeros: doce avisos no informan de doce
              cosas.
            </p>
          )}

          <Note kind="info">{informe.disclaimer}</Note>
        </>
      )}
    </LabShell>
  )
}
