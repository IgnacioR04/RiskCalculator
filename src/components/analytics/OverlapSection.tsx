import { useMemo } from 'react'
import type { PortfolioView } from '../../lib/portfolio'
import { formatPct } from '../../lib/format'
import { Card, Note } from '../ui'

interface DirectOverlap {
  etf: string
  stock: string
  fundWeight: number | null
  portfolioExposure: number | null
}

interface FundOverlap {
  left: string
  right: string
  common: string[]
  sharedWeight: number | null
}

export function OverlapSection(props: { view: PortfolioView }) {
  const result = useMemo(() => {
    const valued = props.view.positions.filter((position) => position.value !== null)
    const total = Number(props.view.totalValue.toString())
    const directStocks = new Map(
      valued
        .filter((position) => position.asset.assetType === 'stock')
        .map((position) => [
          position.asset.symbol.toUpperCase(),
          total > 0 ? Number(position.value!.toString()) / total : 0,
        ]),
    )
    const funds = valued.filter((position) => position.asset.assetType === 'etf')
    const direct: DirectOverlap[] = []
    for (const fund of funds) {
      const fundPortfolioWeight = total > 0 ? Number(fund.value!.toString()) / total : 0
      for (const holding of fund.asset.holdings ?? []) {
        const stockWeight = directStocks.get(holding.symbol.toUpperCase())
        if (stockWeight === undefined) continue
        const fundWeight = holding.weight === undefined ? null : Number(holding.weight)
        direct.push({
          etf: fund.asset.symbol,
          stock: holding.symbol.toUpperCase(),
          fundWeight,
          portfolioExposure:
            fundWeight === null ? null : stockWeight + fundPortfolioWeight * fundWeight,
        })
      }
    }
    const fundPairs: FundOverlap[] = []
    for (let leftIndex = 0; leftIndex < funds.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < funds.length; rightIndex++) {
        const left = funds[leftIndex]!
        const right = funds[rightIndex]!
        const leftMap = new Map(
          (left.asset.holdings ?? []).map((holding) => [
            holding.symbol.toUpperCase(),
            holding.weight === undefined ? null : Number(holding.weight),
          ]),
        )
        const common = (right.asset.holdings ?? [])
          .map((holding) => holding.symbol.toUpperCase())
          .filter((symbol) => leftMap.has(symbol))
        if (common.length === 0) continue
        const rightMap = new Map(
          (right.asset.holdings ?? []).map((holding) => [
            holding.symbol.toUpperCase(),
            holding.weight === undefined ? null : Number(holding.weight),
          ]),
        )
        const weightsKnown = common.every(
          (symbol) => leftMap.get(symbol) !== null && rightMap.get(symbol) !== null,
        )
        fundPairs.push({
          left: left.asset.symbol,
          right: right.asset.symbol,
          common,
          sharedWeight: weightsKnown
            ? common.reduce(
                (sum, symbol) =>
                  sum + Math.min(leftMap.get(symbol)!, rightMap.get(symbol)!),
                0,
              )
            : null,
        })
      }
    }
    return {
      direct,
      fundPairs,
      missing: funds.filter((fund) => (fund.asset.holdings?.length ?? 0) === 0),
    }
  }, [props.view])

  return (
    <Card title="Solapamientos">
      <p className="muted">
        Detecta exposición repetida usando las posiciones internas conocidas de tus ETF. No se
        infieren componentes: si faltan, puedes pegarlos en la clasificación del activo.
      </p>
      {result.direct.length === 0 && result.fundPairs.length === 0 ? (
        <Note kind="info">
          No hay solapamientos verificables con los componentes disponibles.
        </Note>
      ) : (
        <div className="overlap-grid">
          {result.direct.map((item) => (
            <div className="overlap-card" key={`${item.etf}-${item.stock}`}>
              <span className="eyebrow">ETF + acción directa</span>
              <strong>{item.etf} ↔ {item.stock}</strong>
              <span className="muted">
                {item.portfolioExposure === null
                  ? 'Coincidencia confirmada; falta el peso interno'
                  : `${formatPct(item.portfolioExposure, 1)} de exposición combinada`}
              </span>
            </div>
          ))}
          {result.fundPairs.map((item) => (
            <div className="overlap-card" key={`${item.left}-${item.right}`}>
              <span className="eyebrow">ETF + ETF</span>
              <strong>{item.left} ↔ {item.right}</strong>
              <span className="muted">
                {item.common.slice(0, 5).join(', ')}
                {item.common.length > 5 ? ` y ${item.common.length - 5} más` : ''}
                {item.sharedWeight !== null ? ` · ${formatPct(item.sharedWeight, 1)} compartido` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {result.missing.length > 0 && (
        <p className="muted tiny mb-0">
          Sin componentes cargados: {result.missing.map((fund) => fund.asset.symbol).join(', ')}.
        </p>
      )}
    </Card>
  )
}
