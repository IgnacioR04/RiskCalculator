/**
 * Portada del Laboratorio (LAB-109).
 *
 * Responde a «¿por dónde empiezo?» con dos cosas: si los datos dan para
 * analizar, y cuáles son las dos mitades.
 *
 * **No hay hallazgos.** El plan reserva las conclusiones para los motores de la
 * Fase 3 en adelante; inventarlas ahora sería exactamente lo que el documento
 * prohíbe. Las únicas cifras que aparecen —número de posiciones y cuántas están
 * valoradas— salen de la cartera del usuario, y si no hay cartera no se muestra
 * ninguna.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, Note } from '../../../components/ui'
import { buildPortfolioView } from '../../../lib/portfolio'
import { useAppStore } from '../../../state/store'
import { LabShell } from '../components/LabShell'
import { TwoWorldsCard } from '../components/TwoWorldsCard'

export function LabHomePage() {
  const store = useAppStore()
  const currency = store.settings.displayCurrency

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

  const posiciones = view.positions.length
  const valoradas = view.positions.filter((p) => p.value !== null).length
  const sinCartera = posiciones === 0

  return (
    <LabShell routeId="lab.home">
      <Card>
        {sinCartera ? (
          <EmptyState icon="◇" title="Todavía no hay nada que analizar">
            <p>
              El Laboratorio trabaja sobre tu cartera. Puedes{' '}
              <button
                type="button"
                className="btn"
                onClick={() => store.loadDemoData()}
              >
                cargar datos de demostración
              </button>{' '}
              para verlo funcionando, <Link to="/importar">importar la tuya</Link> o{' '}
              <Link to="/cartera">añadir posiciones a mano</Link>.
            </p>
          </EmptyState>
        ) : (
          <>
            <h2>Estado del análisis</h2>
            <p>
              {valoradas === posiciones
                ? `Tu cartera tiene ${posiciones} posiciones y todas están valoradas.`
                : `Tu cartera tiene ${posiciones} posiciones, de las que ${valoradas} están valoradas.`}
            </p>
            {valoradas < posiciones && (
              <Note>
                Las posiciones sin precio quedan fuera de los cálculos. Puedes completarlas
                desde <Link to="/cartera">Cartera</Link>.
              </Note>
            )}
          </>
        )}
      </Card>

      <TwoWorldsCard />

      <Note>
        Las conclusiones automáticas —qué concentra tu riesgo, qué dependencia crece en las
        caídas— llegan con los motores de estabilidad. Hasta entonces esta portada no
        muestra hallazgos: prefiere no decir nada antes que insinuar un diagnóstico que no
        se ha calculado.
      </Note>
    </LabShell>
  )
}
