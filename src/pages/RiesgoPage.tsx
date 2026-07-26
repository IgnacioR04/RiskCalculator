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

type RiskTab = 'resumen' | 'historico'

interface RiskCardData {
  name: string
  level: RiskLevel
  value: string
  explanation: string
  /** Posición 0–1 del marcador dentro de la escala. */
  position?: number
}

function levelVar(level: RiskLevel): string {
  return level === 'ok' ? 'positive' : level === 'warn' ? 'warning' : level === 'high' ? 'negative' : 'na'
}

function levelGlyph(level: RiskLevel): string {
  return level === 'ok' ? '●' : level === 'warn' ? '▲' : level === 'high' ? '■' : '—'
}

export function RiesgoPage() {
  const store = useAppStore()
  const currency = store.settings.displayCurrency
  const [tab, setTab] = useState<RiskTab>('resumen')

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

  /**
   * Fichas con lo calculable sin descargar series históricas. Volatilidad,
   * drawdown, correlaciones y contribución al riesgo viven en «Análisis
   * histórico», que sí las calcula de verdad.
   */
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
    const foreign = valued.filter((p) => (p.quote?.currency ?? p.asset.quoteCurrency) !== currency)
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
        explanation: `Parte de tu cartera cotiza en una divisa distinta de ${currency}: el tipo de cambio también mueve tu resultado.`,
      })
    }

    const complete = view.valuationComplete && view.financialsComplete
    out.push({
      name: 'Calidad de los datos',
      level: complete ? 'ok' : 'warn',
      value: complete ? 'Completa' : 'Parcial',
      position: complete ? 0.14 : 0.42,
      explanation: complete
        ? 'Todas las posiciones tienen valoración y coste conocidos.'
        : 'Faltan valoraciones o costes en alguna posición: las métricas heredan esa incertidumbre.',
    })

    return out
  }, [valued, view, currency])

  const overall: RiskLevel = useMemo(() => {
    if (cards.length === 0) return 'na'
    if (cards.some((c) => c.level === 'high')) return 'high'
    if (cards.some((c) => c.level === 'warn')) return 'warn'
    return 'ok'
  }, [cards])

  const overallLabel =
    overall === 'ok' ? 'Adecuado' : overall === 'warn' ? 'Atención' : overall === 'high' ? 'Alto' : 'Sin datos'

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
          { value: 'historico', label: 'Análisis histórico' },
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
              <div className="row" style={{ alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: `var(--${levelVar(overall)})` }} aria-hidden="true">
                  {levelGlyph(overall)}
                </span>
                <Figure size="hero">
                  <span style={{ fontSize: 40 }}>{overallLabel}</span>
                </Figure>
              </div>
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 200, paddingBottom: 6 }}>
              <RiskScale level={overall} />
            </div>
          </div>

          <div className="grid-2 mt-4">
            {cards.map((c) => (
              <div key={c.name} className="card-raised">
                <div className="row" style={{ gap: 7 }}>
                  <span style={{ fontSize: 8, color: `var(--${levelVar(c.level)})` }} aria-hidden="true">
                    {levelGlyph(c.level)}
                  </span>
                  <span className="risk-card-name">{c.name}</span>
                  <StateChip level={c.level} />
                  <span style={{ marginLeft: 'auto' }}>
                    <Figure size="kpi">{c.value}</Figure>
                  </span>
                </div>
                <div className="mt-3">
                  <RiskScale level={c.level} position={c.position} dim showLegend={false} />
                </div>
                <p className="risk-card-explain mt-2 mb-0">{c.explanation}</p>
              </div>
            ))}
          </div>

          <Note kind="info">
            Volatilidad, caída máxima, correlaciones, covarianzas y contribución al riesgo necesitan series
            históricas: los tienes en <strong>Análisis histórico</strong>, que se calcula solo al abrirlo.
          </Note>
          <Note kind="warning">
            Cada métrica dice lo que mide y lo que no: la concentración no juzga la calidad de un activo, y la
            volatilidad describe el pasado, no el futuro.
          </Note>
        </Card>
      )}

      {/* Volatilidad, drawdown, Sharpe/Sortino, beta/alpha, correlación,
          covarianza y contribución al riesgo, todo con datos reales. */}
      {tab === 'historico' && <HistoricalRiskSection />}
    </>
  )
}
