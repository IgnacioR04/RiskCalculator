/**
 * Exposición real (LAB-409).
 *
 * Contesta «¿cuánto tengo de verdad de cada empresa?», que no es lo mismo que
 * «¿qué tengo en cartera?». Quien tiene un ETF mundial, otro del S&P 500 y
 * acciones de Apple cree tener tres cosas distintas: Apple está dentro de los
 * dos fondos, y su exposición real puede ser el doble de lo que ve.
 *
 * La pantalla no descarga composiciones de ningún proveedor, y eso es una
 * decisión legal, no técnica: los emisores publican lo que llevan sus fondos
 * pero **prohíben redistribuirlo**. Lo que sí se puede es que cada usuario
 * consulte y anote las posiciones de sus propios fondos, así que el editor
 * está en esta misma página.
 */
import { useMemo } from 'react'
import { Card, Note } from '../../../components/ui'
import { formatMoney, formatPct } from '../../../lib/format'
import { buildPortfolioView } from '../../../lib/portfolio'
import { compositionsFromAssets, isWrapper } from '../../../lib/lab/holdings/adapters'
import { allFundOverlaps, lookThrough } from '../../../lib/lab/holdings/lookThrough'
import { useAppStore } from '../../../state/store'
import { DiversificacionContenido } from '../../../pages/DiversificacionPage'
import { HoldingsEditor } from '../exposure/HoldingsEditor'
import { LabShell } from '../components/LabShell'

export function LabExposurePage() {
  const assets = useAppStore((s) => s.assets)
  const accounts = useAppStore((s) => s.accounts)
  const transactions = useAppStore((s) => s.transactions)
  const quotes = useAppStore((s) => s.quotes)
  const fxRates = useAppStore((s) => s.fxRates)
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)

  const { resultado, solapes, envoltorios } = useMemo(() => {
    const vista = buildPortfolioView({
      assets,
      accounts,
      transactions,
      quotes,
      fxRates,
      displayCurrency,
    })

    const hoy = new Date().toISOString().slice(0, 10)
    const composiciones = compositionsFromAssets(
      vista.positions.map((p) => p.asset),
      hoy,
    )

    const posiciones = vista.positions
      .filter((p) => p.quantity.gt(0))
      .map((p) => ({
        assetId: p.asset.id,
        symbol: p.asset.symbol,
        ...(p.asset.name === undefined ? {} : { name: p.asset.name }),
        value: p.value === null ? null : p.value.toNumber(),
        isWrapper: isWrapper(p.asset),
      }))

    const simbolos = Object.fromEntries(
      vista.positions.map((p) => [p.asset.id, p.asset.symbol]),
    )

    return {
      resultado: lookThrough({ positions: posiciones, compositions: composiciones, baseCurrency: displayCurrency }),
      solapes: allFundOverlaps(composiciones, simbolos).filter((s) => s.overlap > 0),
      envoltorios: vista.positions.filter((p) => p.quantity.gt(0) && isWrapper(p.asset)),
    }
  }, [assets, accounts, transactions, quotes, fxRates, displayCurrency])

  if (envoltorios.length === 0 && resultado.exposures.length === 0) {
    return (
      <LabShell routeId="lab.stability.exposure">
        <Card title="Todavía no hay nada que mirar por dentro">
          <p className="muted mb-0">
            Cuando tengas posiciones, aquí verás tu exposición real a cada empresa, sumando lo que
            tienes directo y lo que llevas dentro de los fondos.
          </p>
        </Card>
        <DiversificacionContenido />
      </LabShell>
    )
  }

  return (
    <LabShell routeId="lab.stability.exposure">
      <Card title="Qué parte de tu cartera se ha podido mirar por dentro">
        <p className="figure figure-result">{formatPct(resultado.lookThroughCoverage, 1)}</p>
        <p className="muted">
          {resultado.fundsWithoutComposition.length === 0
            ? 'Todos tus fondos declaran lo que llevan dentro.'
            : `Sin composición declarada: ${resultado.fundsWithoutComposition.join(', ')}. Ese valor no se reparte entre lo conocido: se cuenta como no mirado.`}
        </p>
        {resultado.unresolvedValue > 0 && (
          <p className="muted tiny mb-0">
            Quedan {formatMoney(resultado.unresolvedValue, resultado.baseCurrency)} sin desglosar.
            {resultado.oldestAsOf !== null &&
              ` La composición más antigua que se ha usado es del ${resultado.oldestAsOf}.`}
          </p>
        )}
      </Card>

      {resultado.exposures.length > 0 && (
        <Card
          title="Tu exposición real, empresa por empresa"
          sub="Sumando lo que tienes directo y lo que viene dentro de los fondos"
        >
          <div className="table-wrap">
            {/* Con nombre: la página tiene varias tablas y un lector de
                pantalla necesita distinguirlas. */}
            <table className="data" aria-label="Exposición real por empresa">
              <thead>
                <tr>
                  <th scope="col">Empresa</th>
                  <th scope="col">Directo</th>
                  <th scope="col">Dentro de fondos</th>
                  <th scope="col">Total</th>
                  <th scope="col">Peso</th>
                  <th scope="col">A través de</th>
                </tr>
              </thead>
              <tbody>
                {resultado.exposures.slice(0, 25).map((exposure) => (
                  <tr key={exposure.symbol}>
                    <td>
                      <strong>{exposure.symbol}</strong>
                      {exposure.name !== undefined && <div className="meta">{exposure.name}</div>}
                    </td>
                    <td className="num">
                      {exposure.directValue === 0
                        ? '—'
                        : formatMoney(exposure.directValue, resultado.baseCurrency)}
                    </td>
                    <td className="num">
                      {exposure.indirectValue === 0
                        ? '—'
                        : formatMoney(exposure.indirectValue, resultado.baseCurrency)}
                    </td>
                    <td className="num">
                      <strong>{formatMoney(exposure.totalValue, resultado.baseCurrency)}</strong>
                    </td>
                    <td className="num">{formatPct(exposure.weight, 1)}</td>
                    <td>
                      <span className="meta">
                        {exposure.viaFunds.length === 0 ? 'Solo directo' : exposure.viaFunds.join(', ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resultado.exposures.length > 25 && (
            <p className="muted tiny mb-0">
              Se muestran las 25 mayores de {resultado.exposures.length}.
            </p>
          )}
        </Card>
      )}

      {solapes.length > 0 && (
        <Card
          title="Cuánto se repiten tus fondos entre sí"
          sub="No es que se muevan parecido: es que llevan literalmente lo mismo dentro"
        >
          <div className="table-wrap">
            <table className="data" aria-label="Solapamiento entre fondos">
              <thead>
                <tr>
                  <th scope="col">Pareja</th>
                  <th scope="col">Comparten</th>
                  <th scope="col">Sobre todo en</th>
                </tr>
              </thead>
              <tbody>
                {solapes.map((solape) => (
                  <tr key={`${solape.a}-${solape.b}`}>
                    <td>
                      {solape.a} y {solape.b}
                    </td>
                    <td className="num">{formatPct(solape.overlap, 1)}</td>
                    <td>
                      <span className="meta">
                        {solape.sharedTop
                          .slice(0, 5)
                          .map((s) => s.symbol)
                          .join(', ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted tiny mb-0">
            Calculado sobre lo que has declarado de cada fondo, así que es un <strong>suelo</strong>:
            el solape real solo puede ser mayor.
          </p>
        </Card>
      )}

      <Note kind="info">
        Los emisores publican lo que llevan sus fondos, pero no permiten que otra aplicación
        redistribuya esos datos. Por eso los anotas tú: con las diez o quince mayores posiciones de
        cada fondo ya se ve el solapamiento.
      </Note>

      {envoltorios.map((posicion) => (
        <HoldingsEditor key={posicion.asset.id} asset={posicion.asset} />
      ))}

      {/* El reparto clásico sigue aquí: `/diversificacion` redirige a esta ruta
          desde LAB-108, y quitarlo habría roto un recorrido que G1 declaró
          disponible. La exposición real lo complementa, no lo sustituye. */}
      <DiversificacionContenido />
    </LabShell>
  )
}
