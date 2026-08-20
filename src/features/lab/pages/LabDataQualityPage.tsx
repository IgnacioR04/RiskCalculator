/**
 * Calidad y cobertura de datos (LAB-212).
 *
 * Contesta la pregunta del documento 01 §6.2: «¿qué datos sostienen el análisis
 * y qué falta?». Una tabla por activo, la cobertura ponderada y qué cálculos
 * quedan bloqueados por lo que falta.
 *
 * La regla visual que manda sobre todas las demás: **«no disponible» nunca es un
 * cero, ni una celda en blanco, ni un guion suelto**. Se escribe con esas
 * palabras. Una celda vacía se lee como «nada» y lo que quiere decir es «no se
 * sabe», que son cosas distintas y llevan a decisiones distintas.
 *
 * La página no descarga nada. Mira lo que ya hay en memoria y en la caché de
 * series, exactamente igual que el adaptador de LAB-211: si el usuario quiere
 * datos frescos, actualiza desde Cartera y vuelve.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Note } from '../../../components/ui'
import { formatMoney } from '../../../lib/format'
import { leerSerie } from '../../../lib/market/seriesCache'
import type { SeriesPoint } from '../../../lib/market/seriesCache'
import { buildPortfolioView } from '../../../lib/portfolio'
import { DATA_QUALITY_STATUS_INFO, REMEDIATION_TEXT } from '../../../lib/lab/domain/dataQuality'
import type { DataQualityStatus } from '../../../lib/lab/domain/dataQuality'
import { blockingRemediations } from '../../../lib/lab/data/quality'
import {
  assessPortfolioQuality,
  type AssetQualityRow,
  type FieldState,
} from '../../../lib/lab/data/portfolioQuality'
import {
  CALCULATION_LABEL,
  CALCULATION_REQUIREMENTS,
  type LabCalculation,
} from '../../../lib/lab/data/thresholds'
import { useAppStore } from '../../../state/store'
import { AsOfBadge } from '../components/AsOfBadge'
import { CoverageMeter } from '../components/CoverageMeter'
import { LabShell } from '../components/LabShell'
import { TableWrap } from '../../../components/TableWrap'

/**
 * Cómo se dibuja cada estado de campo.
 *
 * `missing` dice «No disponible» con todas sus letras, que es el criterio de
 * aceptación de la tarea. `not_applicable` dice «No aplica», que no es lo mismo:
 * a una acción suelta no le falta el desglose de componentes, es que no tiene.
 */
const CAMPO: Readonly<Record<FieldState, { texto: string; glifo: string; clase: string }>> = {
  ok: { texto: 'Sí', glifo: '●', clase: 'positive' },
  stale: { texto: 'Antiguo', glifo: '▲', clase: 'warning' },
  manual: { texto: 'Manual', glifo: '✎', clase: 'warning' },
  estimated: { texto: 'Estimado', glifo: '≈', clase: 'warning' },
  demo: { texto: 'Demostración', glifo: '▲', clase: 'warning' },
  missing: { texto: 'No disponible', glifo: '—', clase: 'negative' },
  not_applicable: { texto: 'No aplica', glifo: '·', clase: 'muted' },
}

const ESTADO_CLASE: Readonly<Record<DataQualityStatus, string>> = {
  good: 'positive',
  partial: 'warning',
  stale: 'warning',
  insufficient: 'negative',
  invalid: 'negative',
}

/** El mínimo de cobertura de un cálculo, omitido cuando no declara ninguno. */
function minimoDe(calculo: LabCalculation): { minimum?: number } {
  const minimo = CALCULATION_REQUIREMENTS[calculo].minCoverage
  return minimo === undefined ? {} : { minimum: minimo }
}

/** Días de historia que la aplicación pide a los proveedores hoy. */
const DIAS_DE_SERIE = 365

export function LabDataQualityPage() {
  const assets = useAppStore((s) => s.assets)
  const accounts = useAppStore((s) => s.accounts)
  const transactions = useAppStore((s) => s.transactions)
  const quotes = useAppStore((s) => s.quotes)
  const fxRates = useAppStore((s) => s.fxRates)
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)

  const informe = useMemo(() => {
    const vista = buildPortfolioView({
      assets,
      accounts,
      transactions,
      quotes,
      fxRates,
      displayCurrency,
    })

    // Solo se lee lo que ya está descargado. `leerSerie` mira la caché local y
    // devuelve `null` si no hay nada: no dispara ninguna petición.
    const series: Record<string, readonly SeriesPoint[]> = {}
    for (const posicion of vista.positions) {
      const guardada = leerSerie(posicion.asset.id, DIAS_DE_SERIE, displayCurrency)
      if (guardada !== null) series[posicion.asset.id] = guardada.puntos
    }

    return assessPortfolioQuality(
      { positions: vista.positions, quotes, fxRates, displayCurrency, series },
      new Date().toISOString(),
    )
  }, [assets, accounts, transactions, quotes, fxRates, displayCurrency])

  const acciones = [
    ...new Set(informe.calculations.flatMap((evaluacion) => blockingRemediations(evaluacion))),
  ]

  return (
    <LabShell routeId="lab.stability.data">
      <Note>
        Esta pantalla no descarga nada: mira lo que ya tienes guardado. Para traer datos nuevos,
        actualiza los precios desde <Link to="/cartera">Cartera</Link> y vuelve.
      </Note>

      {informe.rows.length === 0 ? (
        <Card title="Todavía no hay nada que evaluar">
          <p className="muted mb-0">
            Cuando tengas posiciones en la cartera, aquí verás qué datos las sostienen y cuáles
            faltan. Puedes empezar con los datos de demostración desde Perfil.
          </p>
        </Card>
      ) : (
        <>
          <Card title="Cobertura de la cartera">
            <div className="coverage-grid">
              {/* El mínimo se pasa solo si el cálculo declara uno: con
                  `exactOptionalPropertyTypes`, mandar `undefined` no es lo
                  mismo que omitir la propiedad. */}
              <CoverageMeter
                label="Con precio conocido"
                coverage={informe.coverage.price}
                {...minimoDe('directExposure')}
              />
              <CoverageMeter
                label="Con historia suficiente"
                coverage={informe.coverage.history}
                {...minimoDe('volatility')}
              />
              <CoverageMeter
                label="Con componentes declarados"
                coverage={informe.coverage.lookThrough}
              />
            </div>
          </Card>

          <Card
            title="Datos por activo"
            action={<AsOfBadge at={informe.asOf} label="Evaluado" />}
          >
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Activo</th>
                    <th scope="col">Valor</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Cambio</th>
                    <th scope="col">Historia</th>
                    <th scope="col">Clasificación</th>
                    <th scope="col">Componentes</th>
                    <th scope="col">Última actualización</th>
                    <th scope="col">Fuente</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.rows.map((fila) => (
                    <Fila key={fila.assetId} fila={fila} divisa={informe.baseCurrency} />
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>

          <Card title="Qué se puede calcular con esto">
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Cálculo</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Por qué</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.calculations.map((evaluacion) => (
                    <tr key={evaluacion.calculation}>
                      <td style={{ whiteSpace: 'normal' }}>
                        {CALCULATION_LABEL[evaluacion.calculation]}
                      </td>
                      <td>
                        <span className={ESTADO_CLASE[evaluacion.status]}>
                          {DATA_QUALITY_STATUS_INFO[evaluacion.status].nombre}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'normal' }}>
                        {evaluacion.issues.length === 0
                          ? DATA_QUALITY_STATUS_INFO[evaluacion.status].lectura
                          : [...new Set(evaluacion.issues.map(explicar))].join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <p className="muted tiny mb-0">
              Umbrales de la versión {informe.thresholdsVersion}. Están centralizados y
              versionados: un resultado antiguo se puede explicar con los mínimos que regían
              entonces.
            </p>
          </Card>

          {acciones.length > 0 && (
            <Card title="Qué puedes hacer">
              <ul className="ips-pendientes">
                {acciones.map((accion) => (
                  <li key={accion}>{REMEDIATION_TEXT[accion]}</li>
                ))}
              </ul>
              <p className="muted tiny mb-0">
                Excluir un activo del análisis es legítimo, pero conviene saber qué parte de la
                cartera dejas fuera: aparece arriba, en la cobertura.
              </p>
            </Card>
          )}

          <Note kind="info">
            Un dato que falta no vale cero. Ninguna cifra de esta pantalla rellena huecos, y por
            eso algunos cálculos aparecen bloqueados en vez de dar un número que parecería bueno.
            Puedes revisar tu política en <Link to="/perfil">Perfil e IPS</Link>.
          </Note>
        </>
      )}
    </LabShell>
  )
}

function Fila(props: { fila: AssetQualityRow; divisa: 'EUR' | 'USD' }) {
  const { fila } = props
  return (
    <tr>
      <td style={{ whiteSpace: 'normal' }}>
        <strong>{fila.symbol}</strong>
        <div className="muted tiny">{fila.name}</div>
      </td>
      <td>
        {/* El valor desconocido se dice, no se deja en blanco ni se pone a cero. */}
        {fila.value === null ? (
          <span className="negative">No disponible</span>
        ) : (
          formatMoney(fila.value, props.divisa)
        )}
      </td>
      <Campo estado={fila.price} />
      <Campo estado={fila.fx} />
      <Campo estado={fila.history} />
      <Campo estado={fila.classification} />
      <Campo estado={fila.lookThrough} />
      <td>
        <AsOfBadge at={fila.lastUpdate ?? null} stale={fila.price === 'stale'} />
      </td>
      <td>{fila.source ?? <span className="muted">No disponible</span>}</td>
      <td>
        <span className={ESTADO_CLASE[fila.status]}>
          {DATA_QUALITY_STATUS_INFO[fila.status].nombre}
        </span>
      </td>
    </tr>
  )
}

function Campo(props: { estado: FieldState }) {
  const meta = CAMPO[props.estado]
  return (
    <td>
      <span className={meta.clase}>
        <span aria-hidden="true">{meta.glifo} </span>
        {meta.texto}
      </span>
    </td>
  )
}

/** Traduce una incidencia a una frase corta para la tabla de cálculos. */
function explicar(issue: { code: string; observed?: unknown; required?: unknown }): string {
  switch (issue.code) {
    case 'coverage_below_minimum':
      return `La cobertura no llega al mínimo exigido.`
    case 'sample_below_minimum':
      return `Hay ${String(issue.observed)} observaciones y hacen falta ${String(issue.required)}.`
    case 'sample_below_preferred':
      // Redactado como un hecho y no como «se puede calcular»: con cero
      // observaciones esa frase sería falsa.
      return `Hay ${String(issue.observed)} observaciones y lo deseable son ${String(issue.required)}.`
    case 'value_unknown':
      return 'Hay posiciones sin valor conocido, así que la cobertura no se puede afirmar.'
    case 'no_data':
      return 'No hay datos que medir.'
    case 'data_stale':
      return 'Algunos datos son antiguos.'
    case 'inconsistent_values':
      return 'Hay datos que se contradicen entre sí.'
    default:
      return ''
  }
}
