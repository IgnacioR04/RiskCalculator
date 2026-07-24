import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AllocationDonut } from '../components/charts/AllocationDonut'
import { ProjectionChart } from '../components/charts/ProjectionChart'
import { Card, EmptyState, Note, QualityChip, SignedValue, Stat } from '../components/ui'
import { buildPortfolioView } from '../lib/portfolio'
import { formatDateTime, formatMoney, formatPct } from '../lib/format'
import { useAppStore } from '../state/store'

export function ResumenPage() {
  const assets = useAppStore((s) => s.assets)
  const accounts = useAppStore((s) => s.accounts)
  const transactions = useAppStore((s) => s.transactions)
  const quotes = useAppStore((s) => s.quotes)
  const fxRates = useAppStore((s) => s.fxRates)
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)
  const loadDemoData = useAppStore((s) => s.loadDemoData)
  const demoLoaded = useAppStore((s) => s.demoLoaded)

  const view = useMemo(
    () =>
      buildPortfolioView({ assets, accounts, transactions, quotes, fxRates, displayCurrency }),
    [assets, accounts, transactions, quotes, fxRates, displayCurrency],
  )

  const lastQuote = useMemo(() => {
    const stamps = Object.values(quotes).map((q) => q.fetchedAt)
    return stamps.length > 0 ? stamps.sort().at(-1)! : null
  }, [quotes])

  if (view.positions.length === 0) {
    return (
      <>
        <h1>Resumen</h1>
        <Card>
          <EmptyState icon="◇" title="Todavía no hay nada que resumir">
            <p>
              Empieza por la <Link to="/calculadora">calculadora</Link> (funciona sin registrar
              nada), añade tus posiciones en <Link to="/portfolio">Portfolio</Link>, o carga los
              datos de demostración para explorar la aplicación.
            </p>
            {!demoLoaded && (
              <button type="button" className="btn primary" onClick={loadDemoData}>
                Cargar datos de demostración
              </button>
            )}
          </EmptyState>
        </Card>
      </>
    )
  }

  return (
    <>
      <h1>Resumen</h1>
      {view.hasDemoData && (
        <Note kind="demo">
          Estás viendo datos de demostración ficticios. Puedes quitarlos en Perfil y ajustes.
        </Note>
      )}
      <Card>
        <div className="row spread">
          <div>
            <span className="muted">Valor total</span>
            <div className="big-figure">{formatMoney(view.totalValue, displayCurrency)}</div>
          </div>
          <QualityChip
            quality={view.quality}
            detail={lastQuote !== null ? `Actualizado: ${formatDateTime(lastQuote)}` : undefined}
          />
        </div>
        <div className="stat-grid mt-4">
          <Stat label="Capital aportado">{formatMoney(view.totalCost, displayCurrency)}</Stat>
          <Stat label="Resultado no realizado">
            <SignedValue
              formatted={formatMoney(view.totalUnrealizedPnl, displayCurrency)}
              sign={view.totalUnrealizedPnl.gt(0) ? 1 : view.totalUnrealizedPnl.lt(0) ? -1 : 0}
            />
          </Stat>
          <Stat label="Rentabilidad simple">
            {view.simpleReturnPct !== null ? (
              <SignedValue
                formatted={formatPct(view.simpleReturnPct)}
                sign={view.simpleReturnPct.gt(0) ? 1 : view.simpleReturnPct.lt(0) ? -1 : 0}
              />
            ) : (
              '—'
            )}
          </Stat>
          <Stat label="Posiciones">{view.positions.length}</Stat>
        </div>
        {lastQuote !== null && (
          <p className="muted mt-2 mb-0">Precios actualizados: {formatDateTime(lastQuote)}</p>
        )}
      </Card>

      {view.warnings.length > 0 && (
        <Note kind="warning">
          <strong>Calidad de los datos:</strong>
          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
            {view.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Note>
      )}

      <div className="grid-2">
        <Card title="Mayores posiciones">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Activo</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {view.positions
                  .filter((p) => p.value !== null)
                  .sort((a, b) => b.value!.comparedTo(a.value!))
                  .slice(0, 5)
                  .map((p) => (
                    <tr key={p.asset.id}>
                      <td>
                        {p.asset.symbol}{' '}
                        {p.quality !== 'real' && <QualityChip quality={p.quality} />}
                      </td>
                      <td>{formatMoney(p.value!, displayCurrency)}</td>
                      <td>
                        {p.unrealizedPnl !== null ? (
                          <SignedValue
                            formatted={formatMoney(p.unrealizedPnl, displayCurrency)}
                            sign={p.unrealizedPnl.gt(0) ? 1 : p.unrealizedPnl.lt(0) ? -1 : 0}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Link to="/portfolio" className="btn small">
            Ver todo el portfolio
          </Link>
        </Card>

        <Card title="Distribución por clase">
          {view.byType.length > 0 && (
            <AllocationDonut
              currency={displayCurrency}
              data={view.byType.map((s) => ({
                label: s.label,
                value: Number(s.value.toString()),
                weight: s.weight !== null ? Number(s.weight.toString()) : 0,
              }))}
            />
          )}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Clase</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Peso</th>
                </tr>
              </thead>
              <tbody>
                {view.byType.map((slice) => (
                  <tr key={slice.key}>
                    <td>{slice.label}</td>
                    <td>{formatMoney(slice.value, displayCurrency)}</td>
                    <td>{slice.weight !== null ? formatPct(slice.weight, 1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.concentration.effectivePositions !== null && (
            <p className="muted mb-0">
              Nº efectivo de posiciones:{' '}
              <strong>{view.concentration.effectivePositions.toFixed(1)}</strong> — mide en cuántas
              posiciones «equivalentes» está repartido tu dinero; no dice nada sobre la calidad de
              cada activo.
            </p>
          )}
        </Card>
      </div>

      <Card title="Proyección ilustrativa">
        <p className="muted">
          Cómo evolucionaría tu valor actual ({formatMoney(view.totalValue, displayCurrency)}) con
          rentabilidades anuales constantes. <strong>No es una predicción</strong>: es interés
          compuesto sobre supuestos que eliges tú, para hacerte una idea de las magnitudes.
        </p>
        <ProjectionChart
          initialValue={Number(view.totalValue.toString())}
          years={10}
          currency={displayCurrency}
          scenarios={[
            { name: 'Pesimista', annualReturn: -0.03 },
            { name: 'Base', annualReturn: 0.05 },
            { name: 'Optimista', annualReturn: 0.12 },
          ]}
        />
        <p className="muted mb-0">
          Supuestos: −3 % / +5 % / +12 % anual, sin aportaciones nuevas. Los mercados no crecen de
          forma constante; la realidad tiene subidas y bajadas.
        </p>
      </Card>
    </>
  )
}
