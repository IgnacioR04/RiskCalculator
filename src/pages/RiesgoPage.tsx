import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HistoricalRiskSection } from '../components/analytics/HistoricalRiskSection'
import {
  Card,
  EmptyState,
  Figure,
  Help,
  Note,
  RiskScale,
  SectionHeader,
  StateChip,
  Tabs,
  type RiskLevel,
} from '../components/ui'
import { Decimal } from '../lib/finance/decimal'
import { formatNumber, formatPct } from '../lib/format'
import { buildPortfolioView } from '../lib/portfolio'
import { useAppStore } from '../state/store'

type RiskTab = 'resumen' | 'historico' | 'contribucion'

interface RiskCardData {
  name: string
  level: RiskLevel
  value: string
  explanation: string
  /** Posición 0–1 del marcador en la escala. */
  position?: number
}

export function RiesgoPage() {
  const store = useAppStore()
  const displayCurrency = store.settings.displayCurrency
  const [tab, setTab] = useState<RiskTab>('resumen')

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

  const valued = view.positions.filter((p) => p.value !== null)

  /** Fichas construidas SOLO con datos reales del estado. */
  const cards = useMemo<RiskCardData[]>(() => {
    if (valued.length === 0) return []
    const out: RiskCardData[] = []

    const max = view.concentration.maxWeight
    const top = [...valued].sort((a, b) => b.value!.comparedTo(a.value!))[0]
    if (max !== null && top !== undefined) {
      out.push({
        name: 'Dependencia de un activo',
        level: max.gt('0.5') ? 'high' : max.gt('0.3') ? 'warn' : 'ok',
        value: formatPct(max, 1),
        position: Math.min(Number(max.toString()), 1),
        explanation: `${top.asset.symbol} concentra la mayor parte de tu dinero. Cuanto más pesa un solo activo, más depende tu resultado de él.`,
      })
    }

    const eff = view.concentration.effectivePositions
    if (eff !== null) {
      const n = Number(eff.toString())
      out.push({
        name: 'Diversificación efectiva',
        level: n < 2 ? 'high' : n < 4 ? 'warn' : 'ok',
        value: formatNumber(eff, 1),
        position: Math.min(n / 10, 1),
        explanation:
          'Número de posiciones «equivalentes» en las que está repartido tu dinero. Diez posiciones muy desiguales pueden equivaler a dos.',
      })
    }

    // Exposición a divisa distinta de la de presentación (dato real).
    const foreign = valued.filter((p) => (p.quote?.currency ?? p.asset.quoteCurrency) !== displayCurrency)
    const foreignValue = foreign.reduce((a, p) => a.plus(p.value!), new Decimal(0))
    const totalValue = valued.reduce((a, p) => a.plus(p.value!), new Decimal(0))
    if (totalValue.gt(0)) {
      const share = foreignValue.div(totalValue)
      const n = Number(share.toString())
      out.push({
        name: 'Exposición a otra divisa',
        level: n > 0.6 ? 'warn' : 'ok',
        value: formatPct(share, 1),
        position: n,
        explanation: `Parte de tu cartera cotiza en una divisa distinta de ${displayCurrency}: el tipo de cambio también mueve tu resultado.`,
      })
    }

    const estimated = view.positions.filter((p) => p.hasEstimatedTransactions || p.quality !== 'real').length
    out.push({
      name: 'Calidad de los datos',
      level: view.warnings.length > 0 ? 'warn' : estimated > 0 ? 'warn' : 'ok',
      value: `${view.positions.length - estimated}/${view.positions.length}`,
      position: view.positions.length > 0 ? (view.positions.length - estimated) / view.positions.length : 0,
      explanation:
        estimated > 0
          ? 'Algunas posiciones usan precios estimados, manuales o de demostración. Las métricas heredan esa incertidumbre.'
          : 'Todas tus posiciones tienen datos exactos o en vivo.',
    })

    // Métricas que exigen serie histórica: se declaran no disponibles, no se inventan.
    out.push({
      name: 'Volatilidad',
      level: 'na',
      value: '—',
      explanation:
        'Necesita series históricas de precios. Descárgalas en la pestaña «Histórico y correlaciones».',
    })
    out.push({
      name: 'Caída máxima',
      level: 'na',
      value: '—',
      explanation: 'El drawdown se calcula sobre el histórico de precios; se muestra en «Histórico y correlaciones».',
    })

    return out
  }, [valued, view, displayCurrency])

  const overall: RiskLevel = useMemo(() => {
    if (cards.length === 0) return 'na'
    if (cards.some((c) => c.level === 'high')) return 'high'
    if (cards.some((c) => c.level === 'warn')) return 'warn'
    return 'ok'
  }, [cards])

  if (valued.length === 0) {
    return (
      <>
        <SectionHeader num="04" title="Riesgo" />
        <Card>
          <EmptyState icon="◇" title="Sin posiciones valoradas">
            <p>
              El análisis de riesgo necesita posiciones con precio. Añádelas en <Link to="/cartera">Cartera</Link> o
              carga los datos de demostración desde <Link to="/resumen">Resumen</Link>.
            </p>
          </EmptyState>
        </Card>
      </>
    )
  }

  return (
    <>
      <SectionHeader num="04" title="Riesgo" />

      <Tabs<RiskTab>
        label="Apartados de riesgo"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'resumen', label: 'Resumen de riesgo' },
          { value: 'historico', label: 'Histórico y correlaciones' },
          { value: 'contribucion', label: 'Contribución al riesgo' },
        ]}
      />

      {tab === 'resumen' && (
        <Card>
          <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
            <div>
              <div className="row" style={{ gap: 7 }}>
                <span className="label">Riesgo general</span>
                <Help text="Resume las señales calculables con tus datos actuales. No es una nota de calidad ni un consejo." />
              </div>
              <Figure size="hero" className="mt-1">
                <span style={{ fontSize: 40 }}>
                  {overall === 'ok'
                    ? 'Adecuado'
                    : overall === 'warn'
                      ? 'Atención'
                      : overall === 'high'
                        ? 'Alto'
                        : 'Sin datos'}
                </span>
              </Figure>
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 200, paddingBottom: 6 }}>
              <RiskScale level={overall} />
            </div>
          </div>

          <div className="grid-2 mt-4">
            {cards.map((c) => (
              <div key={c.name} className="card-raised">
                <div className="row" style={{ gap: 7 }}>
                  <span style={{ fontSize: 8, color: `var(--${c.level === 'ok' ? 'positive' : c.level === 'warn' ? 'warning' : c.level === 'high' ? 'negative' : 'na'})` }} aria-hidden="true">
                    {c.level === 'ok' ? '●' : c.level === 'warn' ? '▲' : c.level === 'high' ? '■' : '—'}
                  </span>
                  <span style={{ font: '500 10.5px var(--font-ui)', color: 'var(--text-primary)' }}>{c.name}</span>
                  <StateChip level={c.level} />
                  <span style={{ marginLeft: 'auto' }}>
                    <Figure size="sm">{c.value}</Figure>
                  </span>
                </div>
                <div className="mt-3">
                  <RiskScale level={c.level} position={c.position} dim showLegend={false} />
                </div>
                <p className="meta mt-2 mb-0" style={{ lineHeight: 1.45 }}>
                  {c.explanation}
                </p>
              </div>
            ))}
          </div>

          <Note kind="warning">
            Cada métrica dice lo que mide y lo que no: la concentración no juzga la calidad de un activo, y la
            volatilidad describe el pasado, no el futuro.
          </Note>
        </Card>
      )}

      {tab === 'historico' && <HistoricalRiskSection />}

      {tab === 'contribucion' && (
        <Card
          title="Peso de cada activo"
          sub="cuánto pesa cada posición sobre el total valorado"
        >
          <div className="stack mt-2">
            {[...valued]
              .sort((a, b) => b.value!.comparedTo(a.value!))
              .map((p) => {
                const total = valued.reduce((a, x) => a.plus(x.value!), new Decimal(0))
                const w = total.gt(0) ? p.value!.div(total) : new Decimal(0)
                return (
                  <div key={p.asset.id}>
                    <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                      <span style={{ font: '500 10px var(--font-ui)', color: 'var(--text-primary)' }}>
                        {p.asset.symbol}
                      </span>
                      <span className="meta">{p.asset.name}</span>
                      <span style={{ marginLeft: 'auto' }}>
                        <Figure size="sm">{formatPct(w, 1)}</Figure>
                      </span>
                    </div>
                    <div className="weight-bar" style={{ height: 7, marginTop: 4 }}>
                      <i style={{ width: `${Number(w.toString()) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
          </div>
          <Note kind="info">
            La contribución al <strong>riesgo</strong> (no solo al peso) necesita la volatilidad y las correlaciones de
            cada activo. Descarga las series en «Histórico y correlaciones» y aquí verás además cuánto riesgo aporta
            cada posición; mientras tanto no se muestra un número estimado.
          </Note>
        </Card>
      )}
    </>
  )
}
