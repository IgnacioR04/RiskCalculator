import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AllocationDonut } from '../components/charts/AllocationDonut'
import { EvolutionChart, type EvolutionPoint } from '../components/charts/EvolutionChart'
import {
  Button,
  Card,
  DataQualityBadge,
  EmptyState,
  Figure,
  Help,
  Kpi,
  Money,
  Note,
  RiskScale,
  SectionHeader,
  SeriesDot,
  SignedValue,
  type RiskLevel,
} from '../components/ui'
import { Decimal } from '../lib/finance/decimal'
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPct } from '../lib/format'
import { buildPortfolioView } from '../lib/portfolio'
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
    () => buildPortfolioView({ assets, accounts, transactions, quotes, fxRates, displayCurrency }),
    [assets, accounts, transactions, quotes, fxRates, displayCurrency],
  )

  /** Serie real de capital aportado acumulado (no se inventa histórico de precios). */
  const evolution = useMemo<EvolutionPoint[]>(() => {
    const buys = [...transactions]
      .filter((t) => t.type === 'buy')
      .sort((a, b) => a.datetime.localeCompare(b.datetime))
    let acc = new Decimal(0)
    return buys.map((t) => {
      acc = acc.plus(t.investedAmount)
      return {
        date: t.datetime,
        aportado: Number(acc.toFixed(2)),
        labelCorto: new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' }).format(
          new Date(t.datetime),
        ),
      }
    })
  }, [transactions])

  const lastQuote = useMemo(() => {
    const stamps = Object.values(quotes).map((q) => q.fetchedAt)
    return stamps.length > 0 ? stamps.sort().at(-1)! : null
  }, [quotes])

  const lastMovement = useMemo(
    () => [...transactions].sort((a, b) => b.datetime.localeCompare(a.datetime))[0],
    [transactions],
  )

  /** Riesgo orientativo por concentración: el detalle vive en la sección 04. */
  const riskLevel: RiskLevel = useMemo(() => {
    const max = view.concentration.maxWeight
    if (max === null) return 'na'
    if (max.gt('0.5')) return 'high'
    if (max.gt('0.3')) return 'warn'
    return 'ok'
  }, [view.concentration.maxWeight])

  /** Mayor posición por valor: la usamos para explicar la concentración. */
  const topPosition = useMemo(
    () =>
      view.positions
        .filter((p) => p.value !== null)
        .sort((a, b) => b.value!.comparedTo(a.value!))[0],
    [view.positions],
  )

  /** Posición con la mayor pérdida no realizada: es la que da pie a recuperar. */
  const biggestLoss = useMemo(
    () =>
      view.positions
        .filter((p) => p.unrealizedPnl !== null && p.unrealizedPnl.lt(0))
        .sort((a, b) => a.unrealizedPnl!.comparedTo(b.unrealizedPnl!))[0],
    [view.positions],
  )

  if (view.positions.length === 0) {
    return (
      <>
        <SectionHeader num="01" title="Resumen" />
        <Card>
          <EmptyState icon="◇" title="Todavía no hay nada que resumir">
            <p>
              Empieza por la <Link to="/calculadora">calculadora</Link> (funciona sin registrar nada), añade posiciones
              en <Link to="/cartera">Cartera</Link>, o carga los datos de demostración para recorrer la aplicación.
            </p>
            {!demoLoaded && (
              <Button variant="primary" onClick={loadDemoData}>
                Cargar datos de demostración
              </Button>
            )}
          </EmptyState>
        </Card>
      </>
    )
  }

  return (
    <>
      <SectionHeader num="01" title="Resumen" />

      {view.hasDemoData && (
        <Note kind="demo">
          Estás viendo datos de demostración ficticios. Puedes quitarlos en <Link to="/perfil">Perfil</Link>.
        </Note>
      )}

      <div className="grid-main">
        {/* ── Columna principal ── */}
        <div className="col-wide">
          <Card>
            <div className="row" style={{ gap: 7 }}>
              <span className="label">Tienes ahora mismo</span>
              <Help text="Valor de mercado de todas tus posiciones, convertido a tu divisa con el último cambio disponible." />
              <span style={{ marginLeft: 'auto' }}>
                <DataQualityBadge
                  quality={view.quality}
                  detail={lastQuote !== null ? `Actualizado: ${formatDateTime(lastQuote)}` : undefined}
                />
              </span>
            </div>

            <div className="row" style={{ alignItems: 'flex-end', gap: 18, marginTop: 7 }}>
              <Money value={view.totalValue} currency={displayCurrency} size="hero" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingBottom: 5 }}>
                {view.totalPnl !== null ? (
                  <Figure size="result" className={view.totalPnl.gte(0) ? 'positive' : 'negative'}>
                    <span style={{ fontSize: 19 }}>
                      {view.totalPnl.gte(0) ? '+' : ''}
                      {formatMoney(view.totalPnl, displayCurrency)}
                    </span>
                  </Figure>
                ) : (
                  <span className="muted">Resultado no disponible</span>
                )}
                <span className="meta">
                  {view.totalReturnPct !== null
                    ? `${view.totalReturnPct.gte(0) ? '+' : ''}${formatPct(view.totalReturnPct)} sobre el capital invertido`
                    : 'faltan costes para calcular la rentabilidad'}
                </span>
              </div>
            </div>

            <div className="kpi-row mt-4">
              <Kpi
                label="Aportación neta"
                hint="Compras y comisiones menos ventas netas. No es el coste pendiente de las posiciones abiertas."
              >
                {view.netContributed !== null ? (
                  <Money value={view.netContributed} currency={displayCurrency} size="kpi" />
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>No disponible</span>
                )}
              </Kpi>
              <Kpi
                label="Rentabilidad (XIRR)"
                hint="Rendimiento ponderado por dinero, teniendo en cuenta cuándo aportaste cada euro."
              >
                {view.moneyWeighted.ok ? (
                  <SignedValue
                    formatted={formatPct(view.moneyWeighted.rate)}
                    sign={view.moneyWeighted.rate > 0 ? 1 : view.moneyWeighted.rate < 0 ? -1 : 0}
                  />
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    No disponible
                  </span>
                )}
              </Kpi>
              <Kpi label="Comisiones" hint="Comisiones acumuladas según la política de cada bróker.">
                {view.totalFees !== null ? (
                  <Money value={view.totalFees} currency={displayCurrency} size="kpi" />
                ) : (
                  '—'
                )}
              </Kpi>
              <Kpi
                label="Nº efectivo de activos"
                hint="En cuántas posiciones «equivalentes» está repartido tu dinero. No juzga la calidad de cada activo."
              >
                {view.concentration.effectivePositions !== null
                  ? formatNumber(view.concentration.effectivePositions, 1)
                  : '—'}
              </Kpi>
            </div>

            {evolution.length > 1 && (
              <div className="mt-4">
                <div className="row spread">
                  <span className="label">Capital aportado · histórico</span>
                  <span className="row" style={{ gap: 11 }}>
                    <span className="meta row" style={{ gap: 5 }}>
                      <i
                        style={{ width: 13, height: 2, background: 'var(--chart-portfolio)', display: 'inline-block' }}
                      />
                      aportado
                    </span>
                    <span className="meta row" style={{ gap: 5 }}>
                      <i
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'var(--brand-primary)',
                          display: 'inline-block',
                        }}
                      />
                      aportaciones
                    </span>
                  </span>
                </div>
                <EvolutionChart
                  points={evolution}
                  currentValue={view.totalValue.gt(0) ? Number(view.totalValue.toString()) : null}
                  currency={displayCurrency}
                />
                <p className="meta mb-0">
                  La línea es tu capital aportado real. El valor de mercado día a día necesita histórico de precios de
                  todos tus activos, que este piloto todavía no descarga: no se dibuja una curva inventada.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* ── Columna lateral ── */}
        <div className="col-side">
          {biggestLoss !== undefined && (
            <Card variant="highlight" title="Puedes calcular tu recuperación">
              <Figure size="result" className="mt-1">
                {formatMoney(biggestLoss.unrealizedPnl!.abs(), displayCurrency)}
              </Figure>
              <p style={{ font: '400 10.5px/1.55 var(--font-ui)', color: 'var(--text-body)', marginTop: 6 }}>
                Es lo que pierdes ahora mismo en <b style={{ color: 'var(--text-primary)' }}>{biggestLoss.asset.symbol}</b>. La
                calculadora te dice cuánto tendrías que aportar para volver al equilibrio.
              </p>
              <div className="row" style={{ gap: 7, marginTop: 13 }}>
                <Link to="/calculadora" className="btn primary">
                  Abrir calculadora
                </Link>
                <Link to="/riesgo" className="btn">
                  Ver riesgo
                </Link>
              </div>
            </Card>
          )}

          <Card>
            <div className="row" style={{ gap: 7 }}>
              <span className="label">Riesgo general</span>
              <Help text="Resume la concentración de tu cartera. No es una nota de calidad ni un consejo." />
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 9, marginTop: 5 }}>
              <span style={{ fontSize: 9, color: 'var(--warning)' }} aria-hidden="true">
                {riskLevel === 'ok' ? '●' : riskLevel === 'warn' ? '▲' : riskLevel === 'high' ? '■' : '—'}
              </span>
              <Figure size="result" className="mb-0">
                <span style={{ fontSize: 26 }}>
                  {riskLevel === 'ok'
                    ? 'Adecuado'
                    : riskLevel === 'warn'
                      ? 'Atención'
                      : riskLevel === 'high'
                        ? 'Alto'
                        : 'Sin datos'}
                </span>
              </Figure>
            </div>
            <div className="mt-3">
              <RiskScale level={riskLevel} />
            </div>
            {topPosition !== undefined && view.concentration.maxWeight !== null && (
              <p style={{ font: '400 10px/1.55 var(--font-ui)', color: 'var(--text-body)', marginTop: 10 }}>
                <b style={{ color: 'var(--text-primary)' }}>{topPosition.asset.symbol}</b> es el{' '}
                <b style={{ color: 'var(--text-primary)' }}>{formatPct(view.concentration.maxWeight, 1)}</b> de tu
                dinero.{' '}
                <Link to="/riesgo" style={{ fontSize: 10 }}>
                  Ver el análisis completo
                </Link>
              </p>
            )}
          </Card>

          <Card>
            <div className="row spread">
              <span className="label">Dónde está tu dinero</span>
              <Link to="/diversificacion" style={{ font: '400 9.5px var(--font-ui)' }}>
                ver detalle
              </Link>
            </div>
            {view.byType.length > 0 && (
              <>
                <AllocationDonut
                  currency={displayCurrency}
                  compact
                  data={view.byType.map((s) => ({
                    label: s.label,
                    value: Number(s.value.toString()),
                    weight: s.weight !== null ? Number(s.weight.toString()) : 0,
                  }))}
                />
                <div className="stack mt-2">
                  {view.byType.map((slice, i) => (
                    <div key={slice.key} className="row" style={{ gap: 7, font: '400 10px var(--font-ui)' }}>
                      <SeriesDot index={i} />
                      {slice.label}
                      <span style={{ marginLeft: 'auto' }}>
                        <Figure size="sm">{slice.weight !== null ? formatPct(slice.weight, 1) : '—'}</Figure>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card variant="warning">
            {view.warnings.length > 0 ? (
              <>
                <span className="chip warning">▲ {view.warnings.length} dato(s) por revisar</span>
                <div style={{ font: '400 10px/1.55 var(--font-ui)', color: 'var(--text-body)', marginTop: 9 }}>
                  {view.warnings[0]}
                </div>
                <Link to="/cartera" style={{ font: '400 10px var(--font-ui)' }}>
                  Revisar en Cartera
                </Link>
              </>
            ) : (
              <span className="chip positive">● Sin avisos pendientes</span>
            )}
            {lastMovement !== undefined && (
              <>
                <div className="divider" />
                <div className="meta">Último movimiento</div>
                <div className="row" style={{ gap: 7, font: '400 10px var(--font-ui)', marginTop: 3 }}>
                  {lastMovement.type === 'buy' ? 'Compra' : 'Venta'}{' '}
                  {assets.find((a) => a.id === lastMovement.assetId)?.symbol ?? ''}
                  <span style={{ marginLeft: 'auto' }}>
                    <Figure size="sm">
                      {lastMovement.type === 'buy' ? '+' : '−'}
                      {formatMoney(lastMovement.investedAmount, lastMovement.investedCurrency)}
                    </Figure>
                  </span>
                </div>
                <div className="meta mt-1">
                  {formatDate(lastMovement.datetime)} ·{' '}
                  {accounts.find((a) => a.id === lastMovement.accountId)?.brokerName ?? 'sin cuenta'}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
