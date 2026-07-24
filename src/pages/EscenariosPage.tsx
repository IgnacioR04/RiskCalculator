import { Link } from 'react-router-dom'
import { Card, EmptyState } from '../components/ui'
import { formatDateTime } from '../lib/format'
import { useAppStore } from '../state/store'

const INPUT_LABEL: Record<string, string> = {
  referenceValue: 'Valor de referencia',
  currentValue: 'Valor actual',
  investedAmount: 'Invertido',
  averagePrice: 'Precio medio',
  currentPrice: 'Precio actual',
  targetPrice: 'Precio objetivo',
  expectedGrowthPct: 'Subida esperada (%)',
  budget: 'Presupuesto',
}

export function EscenariosPage() {
  const scenarios = useAppStore((s) => s.scenarios)
  const removeScenario = useAppStore((s) => s.removeScenario)

  return (
    <>
      <h1>Escenarios</h1>
      <p className="muted">
        Escenarios guardados desde la calculadora. Son cálculos «qué pasaría si»: no ejecutan
        ninguna compra ni modifican tu portfolio.
      </p>
      {scenarios.length === 0 ? (
        <Card>
          <EmptyState icon="⇄" title="No hay escenarios guardados">
            <p>
              Ve a la <Link to="/calculadora">calculadora</Link>, ajusta un cálculo y pulsa
              «Guardar como escenario» para conservarlo aquí.
            </p>
          </EmptyState>
        </Card>
      ) : (
        [...scenarios]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((s) => (
            <Card key={s.id} title={s.name}>
              <p className="muted">
                {s.mode === 'restore' ? 'Restaurar valor inicial' : 'Punto de equilibrio real'} ·
                guardado el {formatDateTime(s.createdAt)} · importes en {s.currency}
              </p>
              <div className="table-wrap">
                <table className="data">
                  <tbody>
                    {Object.entries(s.inputs).map(([key, value]) => (
                      <tr key={key}>
                        <td>{INPUT_LABEL[key] ?? key}</td>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row">
                <Link to="/calculadora" className="btn small">
                  Recalcular en la calculadora
                </Link>
                <button type="button" className="btn small danger" onClick={() => removeScenario(s.id)}>
                  Eliminar
                </button>
              </div>
            </Card>
          ))
      )}
    </>
  )
}
