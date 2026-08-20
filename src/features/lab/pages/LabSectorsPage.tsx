/**
 * Sectores para investigar (LAB-713, LAB-714).
 *
 * Esta pantalla existe en el estado en que la dejó
 * [`LAB-710`](../../../../docs/models/sector-signals-v1-validation.md): **no hay
 * ranking de sectores**, porque con doce meses de historial las señales de
 * momentum no se pueden ni calcular, y mucho menos validar.
 *
 * Lo que sí se enseña es lo único que no exige predecir nada: **qué le falta a
 * la cartera que ya se tiene**. Eso se responde con la covarianza que la Fase 4
 * ya estima.
 *
 * ## Por qué la pantalla explica lo que no hay
 *
 * Una pantalla vacía con un «próximamente» sería peor que no tenerla: dejaría
 * al usuario suponiendo que falta trabajo, cuando lo que falta son **datos**, y
 * la diferencia importa. Aquí se dice cuántos meses harían falta y por qué.
 */
import { useMemo, useState } from 'react'
import { Card, Note } from '../../../components/ui'
import {
  annualizedVolatility,
  correlation,
  MIN_OBSERVATIONS,
} from '../../../lib/finance/historical'
import { formatPct } from '../../../lib/format'
import { buildPortfolioView } from '../../../lib/portfolio'
import { assessCompatibility, type SectorCandidate } from '../../../lib/lab/sectors/compatibility'
import { SIGNAL_CATALOG } from '../../../lib/lab/sectors/signals'
import { useStabilityAnalysis } from '../../../lib/lab/stability/useStabilityAnalysis'
import { hasDemoHistoricalSeries } from '../../../state/demoHistory'
import { useAppStore } from '../../../state/store'
import { LabShell } from '../components/LabShell'
import { TableWrap } from '../../../components/TableWrap'

const ETIQUETA: Readonly<Record<string, { texto: string; clase: string }>> = {
  aporta_algo_distinto: { texto: 'Aporta algo distinto', clase: 'positive' },
  mas_de_lo_mismo: { texto: 'Más de lo mismo', clase: 'warning' },
  ya_lo_tienes: { texto: 'Ya lo tienes', clase: 'warning' },
  sin_datos: { texto: 'Sin datos', clase: 'muted' },
}

export function LabSectorsPage() {
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

  const compatibilidad = useMemo(() => {
    if (!calculado || loaded === null || loaded.length < 2) return null

    const valoradas = view.positions.filter((p) => p.quantity.gt(0) && p.value !== null)
    const total = valoradas.reduce((s, p) => s + p.value!.toNumber(), 0)
    if (total <= 0) return null

    // La «cartera» es la media de los retornos disponibles cada día: la misma
    // aproximación declarada que usa la pantalla de Dependencia.
    const porFecha = new Map<string, number[]>()
    for (const item of loaded) {
      for (const punto of item.returns) {
        const lista = porFecha.get(punto.date)
        if (lista === undefined) porFecha.set(punto.date, [punto.value])
        else lista.push(punto.value)
      }
    }
    const cartera = [...porFecha.entries()]
      .map(([date, valores]) => ({
        date,
        value: valores.reduce((s, v) => s + v, 0) / valores.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const volCartera = annualizedVolatility(cartera.map((p) => p.value))
    if (!volCartera.ok) return null

    const mapaCartera = new Map(cartera.map((p) => [p.date, p.value]))

    // Cada posición con etiqueta de sector se evalúa como candidata. Sin
    // etiqueta no entra: inventarle un sector sería inventar el dato.
    const sectorCandidatos: SectorCandidate[] = loaded.flatMap((item) => {
      const sector = item.asset.sector
      if (sector === undefined || sector.trim() === '') return []

      const comunes = item.returns.flatMap((p) => {
        const c = mapaCartera.get(p.date)
        return c === undefined ? [] : [{ activo: p.value, cartera: c }]
      })
      const r = correlation(
        comunes.map((x) => x.activo),
        comunes.map((x) => x.cartera),
      )
      const vol = annualizedVolatility(item.returns.map((p) => p.value))
      const posicion = valoradas.find((p) => p.asset.id === item.asset.id)

      return [
        {
          sector,
          symbol: item.asset.symbol,
          volatility: vol.ok ? vol.value : 0,
          correlation: r.ok ? r.value : Number.NaN,
          observations: comunes.length,
          currentWeight: posicion === undefined ? 0 : posicion.value!.toNumber() / total,
        },
      ]
    })

    if (sectorCandidatos.length === 0) return { vacio: true as const }

    return {
      vacio: false as const,
      resultado: assessCompatibility({
        portfolioVolatility: volCartera.value,
        candidates: sectorCandidatos,
        minObservations: MIN_OBSERVATIONS,
      }),
    }
  }, [calculado, loaded, view.positions])

  const porQueNoHayRanking = (
    <Card
      title="Por qué no hay un ranking de sectores"
      sub="No falta trabajo: faltan datos, y se sabe cuántos"
    >
      <p className="muted">
        Las dos señales de momentum están construidas y probadas, pero{' '}
        <strong>no se pueden calcular</strong> con el historial que esta aplicación puede
        descargar. El momentum a doce meses necesita 253 sesiones para dar un solo valor, y un año
        natural son unas 252.
      </p>
      <p className="muted">
        Y aunque saliera: para distinguir una señal de la suerte harían falta{' '}
        <strong>36 meses</strong> de historial y hay <strong>12</strong>. La diferencia es de tres
        a uno.
      </p>

      <ul className="lista-grupos">
        {SIGNAL_CATALOG.map((s) => (
          <li key={s.modelKey}>
            <strong>{s.label}</strong>
            <span className="meta">
              {' '}
              · {s.predictive ? 'en borrador, sin publicar' : 'activa'}
            </span>
            <div className="meta">{s.hypothesis}</div>
          </li>
        ))}
      </ul>

      <Note kind="warning">
        Publicar un top de sectores con doce observaciones habría sido indistinguible de la suerte,
        justo en la pantalla que más se parece a un consejo de inversión.
      </Note>
    </Card>
  )

  if (candidatos.length < 2) {
    return (
      <LabShell routeId="lab.future.sectors">
        <Card title="Hacen falta al menos dos posiciones con historial">
          <p className="muted mb-0">
            Esta pantalla compara tus sectores con tu propia cartera. Con menos de dos posiciones
            valoradas y con historial no hay con qué comparar.
          </p>
        </Card>
        {porQueNoHayRanking}
      </LabShell>
    )
  }

  return (
    <LabShell routeId="lab.future.sectors">
      <Card
        title="Qué le falta a tu cartera"
        sub="Qué sectores aportarían algo distinto y cuáles serían más de lo mismo"
      >
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            void run().then(() => setCalculado(true))
          }}
        >
          {busy ? 'Comparando…' : 'Comparar con mi cartera'}
        </button>
      </Card>

      {compatibilidad === null ? (
        <Card title="Todavía no se ha comparado">
          <p className="muted mb-0">
            Pulsa «Comparar con mi cartera». No se muestra ninguna cifra antes de calcularla.
          </p>
        </Card>
      ) : compatibilidad.vacio ? (
        <Card title="Ninguna de tus posiciones tiene sector declarado">
          <p className="muted mb-0">
            Para comparar por sector hace falta que tus activos digan a cuál pertenecen. Puedes
            rellenarlo en Cartera. No se les asigna uno automáticamente: inventarlo sería inventar
            el dato.
          </p>
        </Card>
      ) : (
        <Card
          title="Tus sectores, comparados con tu cartera"
          sub={`Evaluado con un peso hipotético del ${formatPct(compatibilidad.resultado.testWeight, 0)}`}
        >
          <TableWrap>
            <table className="data" aria-label="Compatibilidad de sectores con la cartera">
              <thead>
                <tr>
                  <th scope="col">Sector</th>
                  <th scope="col">Qué aportaría</th>
                  <th scope="col">Se mueve como tu cartera</th>
                  <th scope="col">Efecto en la oscilación</th>
                </tr>
              </thead>
              <tbody>
                {compatibilidad.resultado.sectors.map((s) => {
                  const etiqueta = ETIQUETA[s.label]!
                  return (
                    <tr key={`${s.sector}-${s.symbol}`}>
                      <td>
                        <strong>{s.sector}</strong>
                        <div className="meta">{s.symbol}</div>
                      </td>
                      <td>
                        <span className={etiqueta.clase}>{etiqueta.texto}</span>
                        <div className="meta">{s.explanation}</div>
                      </td>
                      <td className="num">
                        {s.correlation === null
                          ? '—'
                          : s.correlation.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="num">
                        {s.volatilityChange === null
                          ? '—'
                          : `${s.volatilityChange > 0 ? '+' : ''}${formatPct(s.volatilityChange, 2)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>

          <Note>{compatibilidad.resultado.limitations.join(' ')}</Note>
          <Note kind="info">{compatibilidad.resultado.disclaimer}</Note>
        </Card>
      )}

      {porQueNoHayRanking}
    </LabShell>
  )
}
