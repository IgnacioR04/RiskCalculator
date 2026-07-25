import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AllocationDonut } from '../components/charts/AllocationDonut'
import {
  Card,
  EmptyState,
  Figure,
  Kpi,
  Money,
  Note,
  SectionHeader,
  Segmented,
  SeriesDot,
  Tabs,
} from '../components/ui'
import { Decimal } from '../lib/finance/decimal'
import { formatNumber, formatPct } from '../lib/format'
import { buildPortfolioView, type AllocationSlice } from '../lib/portfolio'
import { useAppStore } from '../state/store'

type DivTab = 'distribucion' | 'concentracion' | 'solapamientos'
type Dimension = 'clase' | 'cuenta' | 'divisa'

export function DiversificacionPage() {
  const store = useAppStore()
  const displayCurrency = store.settings.displayCurrency
  const [tab, setTab] = useState<DivTab>('distribucion')
  const [dimension, setDimension] = useState<Dimension>('clase')

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

  const slices: AllocationSlice[] =
    dimension === 'clase' ? view.byType : dimension === 'cuenta' ? view.byAccount : view.byCurrency

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
        <SectionHeader num="05" title="Diversificación" />
        <Card>
          <EmptyState icon="◇" title="Sin posiciones valoradas">
            <p>
              Necesito posiciones con precio para analizar el reparto. Añádelas en{' '}
              <Link to="/cartera">Cartera</Link> o carga los datos de demostración.
            </p>
          </EmptyState>
        </Card>
      </>
    )
  }

  return (
    <>
      <SectionHeader num="05" title="Diversificación" />

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

      {tab === 'distribucion' && (
        <>
          <Segmented<Dimension>
            label="Ver el reparto por"
            value={dimension}
            onChange={setDimension}
            options={[
              { value: 'clase', label: 'Clase de activo' },
              { value: 'cuenta', label: 'Cuenta' },
              { value: 'divisa', label: 'Divisa' },
            ]}
          />

          <div className="grid-main">
            <div className="col-wide">
              <Card title="Reparto" sub="misma paleta y mismo orden de series en todas las vistas">
                <div className="grid-2">
                  <AllocationDonut
                    currency={displayCurrency}
                    data={slices.map((s) => ({
                      label: s.label,
                      value: Number(s.value.toString()),
                      weight: s.weight !== null ? Number(s.weight.toString()) : 0,
                    }))}
                  />
                  <div className="stack" style={{ justifyContent: 'center' }}>
                    {slices.map((s, i) => (
                      <div key={s.key}>
                        <div className="row" style={{ gap: 7, font: '400 10.5px var(--font-ui)' }}>
                          <SeriesDot index={i} />
                          {s.label}
                          <span style={{ marginLeft: 'auto' }}>
                            <Figure size="sm">{s.weight !== null ? formatPct(s.weight, 1) : '—'}</Figure>
                          </span>
                        </div>
                        <div className="weight-bar">
                          <i
                            style={{
                              width: s.weight !== null ? `${Number(s.weight.toString()) * 100}%` : '0%',
                              background: `var(--series-${(i % 7) + 1})`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">{dimension === 'clase' ? 'Clase' : dimension === 'cuenta' ? 'Cuenta' : 'Divisa'}</th>
                        <th scope="col">Valor</th>
                        <th scope="col">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slices.map((s) => (
                        <tr key={s.key}>
                          <td>{s.label}</td>
                          <td className="num">
                            <Money value={s.value} currency={displayCurrency} size="sm" />
                          </td>
                          <td className="num">{s.weight !== null ? formatPct(s.weight, 1) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div className="col-side">
              <Card>
                <span className="label">Reparto por activo</span>
                <div className="stack mt-3">
                  {[...valued]
                    .sort((a, b) => b.value!.comparedTo(a.value!))
                    .map((p, i) => {
                      const w = topFive.total.gt(0) ? p.value!.div(topFive.total) : new Decimal(0)
                      return (
                        <div key={p.asset.id} className="row" style={{ gap: 7, font: '400 10px var(--font-ui)' }}>
                          <SeriesDot index={i} />
                          {p.asset.symbol}
                          <span style={{ marginLeft: 'auto' }}>
                            <Figure size="sm">{formatPct(w, 1)}</Figure>
                          </span>
                        </div>
                      )
                    })}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {tab === 'concentracion' && (
        <Card title="Concentración" sub="cuánto depende tu resultado de unas pocas posiciones">
          <div className="kpi-row mt-2">
            <Kpi
              label="Mayor posición"
              hint="Peso del activo más grande sobre el total valorado."
            >
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
                        <Money value={p.value!} currency={displayCurrency} size="sm" />
                      </td>
                      <td className="num">{formatPct(w, 1)}</td>
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

      {tab === 'solapamientos' && (
        <Card title="Solapamientos entre fondos y acciones">
          <EmptyState icon="◇" title="Análisis no disponible">
            <p>
              Para saber si tu ETF ya contiene una acción que tienes por separado hace falta la composición oficial del
              fondo (holdings), con su fecha y su fuente. Este piloto no descarga esos datos.
            </p>
            <p className="meta">
              No se inventan composiciones: mientras no haya datos fiables, el análisis se declara no disponible en
              lugar de mostrar un porcentaje aproximado.
            </p>
          </EmptyState>
        </Card>
      )}
    </>
  )
}
