import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, Note, NumberField, SectionHeader, SignedValue, Stat } from '../components/ui'
import { dec } from '../lib/finance/decimal'
import { applyStress, contributionImpact, type StressPosition } from '../lib/finance/stress'
import { STRESS_PRESETS, type StressPreset } from '../lib/finance/stressPresets'
import { targetPriceWithBudget } from '../lib/finance/recovery'
import { formatDateTime, formatMoney, formatPct, parseUserNumber } from '../lib/format'
import { buildPortfolioView } from '../lib/portfolio'
import { useAppStore } from '../state/store'
import { TableWrap } from '../components/TableWrap'

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

/**
 * Pantalla 06 Simular. Sigue siendo su propia ruta mientras dura la migración
 * al Laboratorio (LAB-107).
 */
export function SimularPage() {
  return <SimularContenido conEncabezado />
}

/**
 * Contenido de Simular, sin decidir dónde vive. El Laboratorio lo reutiliza tal
 * cual desde `LabScenariosPage`: una sola implementación, resultados
 * idénticos en ambas rutas.
 */
export function SimularContenido(props: { conEncabezado?: boolean }) {
  const store = useAppStore()
  const view = useMemo(
    () =>
      buildPortfolioView({
        assets: store.assets,
        accounts: store.accounts,
        transactions: store.transactions,
        quotes: store.quotes,
        fxRates: store.fxRates,
        displayCurrency: store.settings.displayCurrency,
      }),
    [store.assets, store.accounts, store.transactions, store.quotes, store.fxRates, store.settings.displayCurrency],
  )

  const stressPositions = useMemo<StressPosition[]>(
    () =>
      view.positions
        .filter((p) => p.value !== null)
        .map((p) => ({
          assetId: p.asset.id,
          symbol: p.asset.symbol,
          assetType: p.asset.assetType,
          quoteCurrency: p.quote?.currency ?? p.asset.quoteCurrency,
          value: p.value!,
        })),
    [view.positions],
  )

  return (
    <>
      {props.conEncabezado === true && <SectionHeader num="06" title="Simular" />}
      <p className="muted">
        Cálculos «qué pasaría si» sobre tu cartera: shocks deterministas y simulaciones de
        aportación. No son predicciones y no ejecutan ninguna operación.
      </p>

      <StressSection positions={stressPositions} />
      <SimulatorSection positions={stressPositions} />
      <SavedScenariosSection />
    </>
  )
}

/* ── Escenarios de estrés ── */

function StressSection({ positions }: { positions: StressPosition[] }) {
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)
  const [preset, setPreset] = useState<StressPreset | null>(null)
  const [general, setGeneral] = useState('')
  const [cryptoShock, setCryptoShock] = useState('')
  const [equityShock, setEquityShock] = useState('')
  const [fxShock, setFxShock] = useState('')
  const [assetId, setAssetId] = useState('')
  const [assetShock, setAssetShock] = useState('')

  // Cualquier ajuste manual desactiva el preset activo (evita mezclas confusas).
  function manual<T>(setter: (v: T) => void): (v: T) => void {
    return (v: T) => {
      setPreset(null)
      setter(v)
    }
  }

  const parsedShock = (raw: string): string | null => {
    if (raw.trim() === '') return null
    const n = parseUserNumber(raw)
    if (n === null) return null
    return dec(n).div(100).toString()
  }

  const result = useMemo(() => {
    if (positions.length === 0) return null
    if (preset !== null) {
      return applyStress(positions, {
        ...(preset.general !== undefined ? { general: preset.general } : {}),
        ...(preset.byType !== undefined ? { byType: preset.byType } : {}),
        ...(preset.fxForeign !== undefined ? { fxForeign: preset.fxForeign } : {}),
        displayCurrency,
      })
    }
    const g = parsedShock(general)
    const crypto = parsedShock(cryptoShock)
    const equity = parsedShock(equityShock)
    const fx = parsedShock(fxShock)
    const perAsset = parsedShock(assetShock)
    const hasAny =
      g !== null || crypto !== null || equity !== null || fx !== null || (assetId !== '' && perAsset !== null)
    if (!hasAny) return null
    return applyStress(positions, {
      ...(g !== null ? { general: g } : {}),
      byType: {
        ...(crypto !== null ? { crypto } : {}),
        ...(equity !== null ? { etf: equity, stock: equity } : {}),
      },
      ...(assetId !== '' && perAsset !== null ? { byAsset: { [assetId]: perAsset } } : {}),
      ...(fx !== null ? { fxForeign: fx } : {}),
      displayCurrency,
    })
  }, [positions, preset, general, cryptoShock, equityShock, fxShock, assetId, assetShock, displayCurrency])

  if (positions.length === 0) {
    return (
      <Card title="Escenarios de estrés">
        <EmptyState icon="⇄" title="Necesito posiciones valoradas">
          <p>
            Añade posiciones en <Link to="/cartera">Cartera</Link> (o carga los datos demo) para
            simular shocks sobre tu cartera.
          </p>
        </EmptyState>
      </Card>
    )
  }

  return (
    <Card title="Escenarios de estrés">
      <p className="muted">
        Elige un escenario típico (magnitudes coherentes por clase de activo) o define tus propios
        shocks abajo. Todo es determinista, no una predicción.
      </p>
      <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
        {STRESS_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn small"
            aria-pressed={preset?.id === p.id}
            style={
              preset?.id === p.id
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary-strong)' }
                : undefined
            }
            title={p.description}
            onClick={() => {
              setPreset(p)
              setGeneral('')
              setCryptoShock('')
              setEquityShock('')
              setFxShock('')
              setAssetId('')
              setAssetShock('')
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setPreset(null)
            setGeneral('')
            setCryptoShock('')
            setEquityShock('')
            setFxShock('')
            setAssetId('')
            setAssetShock('')
          }}
        >
          Limpiar
        </button>
      </div>
      {preset !== null && (
        <Note kind="info">
          <strong>{preset.name}:</strong> {preset.description}
        </Note>
      )}
      <details className="math">
        <summary>Definir shocks manualmente</summary>
        <div className="math-body">
          <div className="grid-2">
            <NumberField label="Shock general" hint="A toda la cartera. Ej.: −20" value={general} onChange={manual(setGeneral)} suffix="%" />
            <NumberField label="Shock a cripto" hint="Solo clase cripto" value={cryptoShock} onChange={manual(setCryptoShock)} suffix="%" />
            <NumberField label="Shock a renta variable" hint="Acciones y ETF" value={equityShock} onChange={manual(setEquityShock)} suffix="%" />
            <NumberField
              label="Movimiento divisa extranjera"
              hint="Afecta a activos cotizados en divisa distinta a la tuya"
              value={fxShock}
              onChange={manual(setFxShock)}
              suffix="%"
            />
            <div className="field">
              <label htmlFor="stress-asset">Shock a un activo concreto</label>
              <select id="stress-asset" value={assetId} onChange={(e) => manual(setAssetId)(e.target.value)}>
                <option value="">— Ninguno —</option>
                {positions.map((p) => (
                  <option key={p.assetId} value={p.assetId}>
                    {p.symbol}
                  </option>
                ))}
              </select>
            </div>
            {assetId !== '' && (
              <NumberField label="Shock del activo" hint="Ej.: −30" value={assetShock} onChange={manual(setAssetShock)} suffix="%" />
            )}
          </div>
        </div>
      </details>

      {result !== null && (
        <>
          <div className="stat-grid mt-2">
            <Stat label="Valor actual">{formatMoney(result.totalBefore, displayCurrency)}</Stat>
            <Stat label="Valor tras el shock">{formatMoney(result.totalAfter, displayCurrency)}</Stat>
            <Stat label="Variación">
              <SignedValue
                formatted={formatMoney(result.totalChange, displayCurrency)}
                sign={result.totalChange.gt(0) ? 1 : result.totalChange.lt(0) ? -1 : 0}
              />
            </Stat>
            <Stat label="Variación %">
              {result.totalChangePct !== null ? (
                <SignedValue
                  formatted={formatPct(result.totalChangePct)}
                  sign={result.totalChangePct.gt(0) ? 1 : result.totalChangePct.lt(0) ? -1 : 0}
                />
              ) : (
                '—'
              )}
            </Stat>
          </div>
          <TableWrap>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Activo</th>
                  <th scope="col">Antes</th>
                  <th scope="col">Después</th>
                  <th scope="col">Variación</th>
                </tr>
              </thead>
              <tbody>
                {result.positions.map((p) => (
                  <tr key={p.assetId}>
                    <td>{p.symbol}</td>
                    <td>{formatMoney(dec(p.value), displayCurrency)}</td>
                    <td>{formatMoney(p.stressedValue, displayCurrency)}</td>
                    <td>
                      {p.changePct !== null ? (
                        <SignedValue
                          formatted={formatPct(p.changePct)}
                          sign={p.changePct.gt(0) ? 1 : p.changePct.lt(0) ? -1 : 0}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Note kind="info">
            Resultado determinista del shock configurado, no una predicción. Concentración (peso
            máximo): antes{' '}
            {result.concentrationBefore.maxWeight !== null
              ? formatPct(result.concentrationBefore.maxWeight, 1)
              : '—'}
            , después{' '}
            {result.concentrationAfter.maxWeight !== null
              ? formatPct(result.concentrationAfter.maxWeight, 1)
              : '—'}
            .
          </Note>
        </>
      )}
    </Card>
  )
}

/* ── Simulador antes/después ── */

function SimulatorSection({ positions }: { positions: StressPosition[] }) {
  const store = useAppStore()
  const displayCurrency = store.settings.displayCurrency
  const [assetId, setAssetId] = useState('')
  const [amountRaw, setAmountRaw] = useState('')

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

  const amount = amountRaw.trim() === '' ? null : parseUserNumber(amountRaw)

  const impact = useMemo(() => {
    if (assetId === '' || amount === null || dec(amount).lte(0) || positions.length === 0) return null
    return contributionImpact(positions, assetId, amount)
  }, [positions, assetId, amount])

  const avgPriceChange = useMemo(() => {
    if (assetId === '' || amount === null) return null
    const position = view.positions.find((p) => p.asset.id === assetId)
    if (
      position === undefined ||
      position.quantity.lte(0) ||
      position.value === null ||
      position.cost === null
    ) return null
    const currentPrice = position.value.div(position.quantity)
    const r = targetPriceWithBudget({
      quantity: position.quantity,
      cost: position.cost,
      currentPrice,
      contribution: amount,
    })
    return { before: position.averagePrice, after: r.newAveragePrice }
  }, [view.positions, assetId, amount])

  const riskProfile = store.riskProfile

  if (positions.length === 0) return null

  return (
    <Card title="Simulador antes/después de una aportación">
      <p className="muted">
        Qué pasaría con tus pesos y tu concentración si aportaras a un activo. No ejecuta ninguna
        compra.
      </p>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="sim-asset">Activo</label>
          <select id="sim-asset" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">— Elige activo —</option>
            {positions.map((p) => (
              <option key={p.assetId} value={p.assetId}>
                {p.symbol}
              </option>
            ))}
          </select>
        </div>
        <NumberField
          label="Aportación hipotética"
          hint="Ej.: 100"
          value={amountRaw}
          onChange={setAmountRaw}
          suffix={displayCurrency}
        />
      </div>
      {impact !== null && (
        <>
          <div className="stat-grid">
            <Stat label="Peso del activo (antes)">
              {impact.before.weight !== null ? formatPct(impact.before.weight, 1) : '—'}
            </Stat>
            <Stat label="Peso del activo (después)">
              {impact.after.weight !== null ? formatPct(impact.after.weight, 1) : '—'}
            </Stat>
            <Stat label="Nº efectivo de posiciones (antes)">
              {impact.before.concentration.effectivePositions !== null
                ? impact.before.concentration.effectivePositions.toFixed(1)
                : '—'}
            </Stat>
            <Stat label="Nº efectivo (después)">
              {impact.after.concentration.effectivePositions !== null
                ? impact.after.concentration.effectivePositions.toFixed(1)
                : '—'}
            </Stat>
          </div>
          {avgPriceChange !== null && avgPriceChange.before !== null && (
            <p>
              Esta aportación cambiaría tu precio medio de{' '}
              <strong>{formatMoney(avgPriceChange.before, displayCurrency, 4)}</strong> a{' '}
              <strong>{formatMoney(avgPriceChange.after, displayCurrency, 4)}</strong>.
            </p>
          )}
          {impact.after.weight !== null && impact.after.weight.gt('0.4') && (
            <Note kind="warning">
              Tras la aportación, este activo pesaría{' '}
              <strong>{formatPct(impact.after.weight, 1)}</strong> de tu cartera
              {riskProfile !== null ? ` (perfil ${riskProfile.category})` : ''}. Considera revisar
              si ese nivel de concentración encaja con tu objetivo. Esta nota mide concentración,
              no la calidad del activo.
            </Note>
          )}
        </>
      )}
    </Card>
  )
}

/* ── Escenarios guardados de la calculadora ── */

function SavedScenariosSection() {
  const scenarios = useAppStore((s) => s.scenarios)
  const removeScenario = useAppStore((s) => s.removeScenario)

  return (
    <>
      <h2 style={{ marginTop: 'var(--space-5)' }}>Escenarios guardados de la calculadora</h2>
      {scenarios.length === 0 ? (
        <Card>
          <EmptyState icon="∑" title="No hay escenarios guardados">
            <p>
              Ve a la <Link to="/calculadora">calculadora</Link> y pulsa «Guardar como escenario»
              para conservar aquí tus cálculos.
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
              <TableWrap>
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
              </TableWrap>
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
