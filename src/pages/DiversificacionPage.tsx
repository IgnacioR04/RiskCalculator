import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AllocationExplorer } from '../components/analytics/AllocationExplorer'
import { OverlapSection } from '../components/analytics/OverlapSection'
import { Card, EmptyState, Figure, Kpi, Money, Note, SectionHeader, Tabs } from '../components/ui'
import { Decimal } from '../lib/finance/decimal'
import { formatNumber, formatPct } from '../lib/format'
import { buildPortfolioView } from '../lib/portfolio'
import { useAppStore } from '../state/store'

type DivTab = 'distribucion' | 'concentracion' | 'solapamientos'

/**
 * Pantalla 05 Diversificación. Sigue siendo su propia ruta mientras dura la
 * migración al Laboratorio (LAB-106).
 */
export function DiversificacionPage() {
  return <DiversificacionContenido conEncabezado />
}

/**
 * Contenido de Diversificación, sin decidir dónde vive. El Laboratorio lo
 * reutiliza tal cual desde `LabExposureLegacyPage`: una sola implementación,
 * ningún cálculo duplicado.
 */
export function DiversificacionContenido(props: { conEncabezado?: boolean }) {
  const store = useAppStore()
  const currency = store.settings.displayCurrency
  const [tab, setTab] = useState<DivTab>('distribucion')

  const view = useMemo(
    () =>
      buildPortfolioView({
        assets: store.assets,
        accounts: store.accounts,
        transactions: store.transactions,
        quotes: store.quotes,
        fxRates: store.fxRates,
        displayCurrency: currency,
      }),
    [store.assets, store.accounts, store.transactions, store.quotes, store.fxRates, currency],
  )

  const valued = view.positions.filter((p) => p.value !== null)

  const topFive = useMemo(() => {
    const total = valued.reduce((a, p) => a.plus(p.value!), new Decimal(0))
    const sorted = [...valued].sort((a, b) => b.value!.comparedTo(a.value!)).slice(0, 5)
    const sum = sorted.reduce((a, p) => a.plus(p.value!), new Decimal(0))
    return { sorted, share: total.gt(0) ? sum.div(total) : null, total }
  }, [valued])

  if (valued.length === 0) {
    return (
      <>
        {props.conEncabezado === true && <SectionHeader num="05" title="Diversificación" />}
        <Card>
          <EmptyState icon="◇" title="Sin posiciones valoradas">
            <p>
              Necesito posiciones con precio para analizar el reparto. Añádelas en{' '}
              <Link to="/cartera">Cartera</Link> o carga los datos de demostración desde{' '}
              <Link to="/resumen">Resumen</Link>.
            </p>
          </EmptyState>
        </Card>
      </>
    )
  }

  return (
    <>
      {props.conEncabezado === true && <SectionHeader num="05" title="Diversificación" />}

      <Tabs<DivTab>
        label="Apartados de diversificación"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'distribucion', label: 'Distribución' },
          { value: 'concentracion', label: 'Concentración' },
          { value: 'solapamientos', label: 'Solapamientos' },
        ]}
      />

      {/* Explorador por clase, cuenta, sector, país y divisa. */}
      {tab === 'distribucion' && (
        <Card title="Reparto" sub="misma paleta y mismo orden de series en todas las dimensiones">
          <AllocationExplorer view={view} currency={currency} />
        </Card>
      )}

      {tab === 'concentracion' && (
        <Card title="Concentración" sub="cuánto depende tu resultado de unas pocas posiciones">
          <div className="kpi-row mt-2">
            <Kpi label="Mayor posición" hint="Peso del activo más grande sobre el total valorado.">
              {view.concentration.maxWeight !== null ? formatPct(view.concentration.maxWeight, 1) : '—'}
            </Kpi>
            <Kpi label="Cinco mayores" hint="Peso conjunto de tus cinco posiciones más grandes.">
              {topFive.share !== null ? formatPct(topFive.share, 1) : '—'}
            </Kpi>
            <Kpi
              label="Índice HHI"
              hint="Herfindahl-Hirschman: suma de los pesos al cuadrado. Cuanto más cerca de 1, más concentrado."
            >
              {view.concentration.hhi !== null ? formatNumber(view.concentration.hhi, 3) : '—'}
            </Kpi>
            <Kpi
              label="Nº efectivo de activos"
              hint="1 dividido por el HHI: en cuántas posiciones «equivalentes» está repartido tu dinero."
            >
              {view.concentration.effectivePositions !== null
                ? formatNumber(view.concentration.effectivePositions, 1)
                : '—'}
            </Kpi>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Posición</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Peso</th>
                </tr>
              </thead>
              <tbody>
                {topFive.sorted.map((p) => {
                  const w = topFive.total.gt(0) ? p.value!.div(topFive.total) : new Decimal(0)
                  return (
                    <tr key={p.asset.id}>
                      <td>
                        {p.asset.symbol}
                        <div className="meta">{p.asset.name}</div>
                      </td>
                      <td className="num">
                        <Money value={p.value!} currency={currency} size="sm" />
                      </td>
                      <td className="num">
                        <Figure size="sm">{formatPct(w, 1)}</Figure>
                        <div className="weight-bar">
                          <i style={{ width: `${Number(w.toString()) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Note kind="info">
            Son observaciones, no órdenes: una concentración alta no es un error en sí misma, pero conviene que sea una
            decisión consciente y no un descuido.
          </Note>
        </Card>
      )}

      {/* Exposición real: acción directa + la que ya llevas dentro de tus ETF. */}
      {tab === 'solapamientos' && <OverlapSection view={view} />}
    </>
  )
}
