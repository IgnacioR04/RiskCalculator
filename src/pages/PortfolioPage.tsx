import { useMemo, useState } from 'react'
import { Card, EmptyState, Note, NumberField, QualityChip, Segmented, SignedValue, Stat } from '../components/ui'
import type { Asset, AssetType, Confidence, Currency, Transaction, TransactionSource } from '../lib/domain'
import { uid } from '../lib/domain'
import { dec } from '../lib/finance/decimal'
import { formatDateTime, formatMoney, formatPct, formatQty, parseUserNumber } from '../lib/format'
import { HistoricalRiskSection } from '../components/analytics/HistoricalRiskSection'
import type { AssetMatch } from '../lib/market/provider'
import { refreshAllQuotes, refreshFx, searchAssets } from '../lib/market/service'
import { buildPortfolioView } from '../lib/portfolio'
import { useAppStore } from '../state/store'

export function PortfolioPage() {
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
  const currency = store.settings.displayCurrency

  return (
    <>
      <h1>Portfolio</h1>
      {view.hasDemoData && (
        <Note kind="demo">Incluye datos de demostración ficticios (etiquetados «Datos demo»).</Note>
      )}

      {view.positions.length > 0 && (
        <Card>
          <div className="stat-grid">
            <Stat label="Valor total">{formatMoney(view.totalValue, currency)}</Stat>
            <Stat label="Capital aportado">{formatMoney(view.totalCost, currency)}</Stat>
            <Stat label="No realizado">
              <SignedValue
                formatted={formatMoney(view.totalUnrealizedPnl, currency)}
                sign={view.totalUnrealizedPnl.gt(0) ? 1 : view.totalUnrealizedPnl.lt(0) ? -1 : 0}
              />
            </Stat>
            <Stat label="Realizado">
              <SignedValue
                formatted={formatMoney(view.totalRealizedPnl, currency)}
                sign={view.totalRealizedPnl.gt(0) ? 1 : view.totalRealizedPnl.lt(0) ? -1 : 0}
              />
            </Stat>
          </div>
        </Card>
      )}

      <Card title="Posiciones">
        {view.positions.length === 0 ? (
          <EmptyState icon="▤" title="Sin posiciones todavía">
            <p>
              Registra tu primera operación más abajo, o carga los datos demo desde el Resumen. Un
              ejemplo: «compré 0,0014 BTC por 100 €».
            </p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Activo</th>
                  <th scope="col">Unidades</th>
                  <th scope="col">Precio medio</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Datos</th>
                </tr>
              </thead>
              <tbody>
                {view.positions.map((p) => (
                  <tr key={p.asset.id}>
                    <td>
                      <strong>{p.asset.symbol}</strong>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {p.asset.name}
                        {p.asset.assetType === 'index' && ' (índice: referencia, no invertible directamente)'}
                      </div>
                    </td>
                    <td>{p.inconsistent === true ? '—' : formatQty(p.quantity)}</td>
                    <td>{p.averagePrice !== null ? formatMoney(p.averagePrice, currency, 4) : '—'}</td>
                    <td>
                      {p.inconsistent === true ? (
                        <span className="negative">⚠ Datos incoherentes</span>
                      ) : p.value !== null ? (
                        formatMoney(p.value, currency)
                      ) : (
                        'Sin precio'
                      )}
                    </td>
                    <td>
                      {p.unrealizedPnl !== null ? (
                        <>
                          <SignedValue
                            formatted={formatMoney(p.unrealizedPnl, currency)}
                            sign={p.unrealizedPnl.gt(0) ? 1 : p.unrealizedPnl.lt(0) ? -1 : 0}
                          />
                          {p.unrealizedPnlPct !== null && (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {formatPct(p.unrealizedPnlPct)}
                            </div>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <QualityChip
                        quality={p.quality}
                        detail={
                          p.quote !== null
                            ? `${p.quote.provider} · ${formatDateTime(p.quote.timestamp)}`
                            : 'Sin cotización'
                        }
                      />
                      {p.hasEstimatedTransactions && (
                        <div className="muted" style={{ fontSize: '0.72rem' }}>
                          Incluye operaciones estimadas
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.warnings.length > 0 && (
          <Note kind="warning">
            {view.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </Note>
        )}
      </Card>

      <MarketRefreshSection />
      <HistoricalRiskSection />
      <AccountsSection />
      <AddTransactionSection />
      <TransactionsSection />
    </>
  )
}

/* ── Actualización de precios ── */

function MarketRefreshSection() {
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  const transactions = useAppStore((s) => s.transactions)
  if (transactions.length === 0) return null

  async function refresh() {
    setBusy(true)
    setMessages([])
    try {
      const fx = await refreshFx()
      const results = await refreshAllQuotes(true)
      const notes: string[] = []
      if (!fx.ok && fx.message !== undefined) notes.push(fx.message)
      for (const r of results) {
        if (r.message !== undefined) notes.push(r.message)
      }
      const okCount = results.filter((r) => r.ok).length
      notes.unshift(`Actualizadas ${okCount} de ${results.length} cotizaciones no demo.`)
      setMessages(notes)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Datos de mercado">
      <p className="muted">
        Actualiza cotizaciones (Twelve Data si está configurado, CoinGecko para cripto) y el cambio
        EUR/USD del BCE. Si un proveedor falla, la aplicación sigue funcionando con precios
        manuales.
      </p>
      <button type="button" className="btn primary" onClick={() => void refresh()} disabled={busy}>
        {busy ? 'Actualizando…' : 'Actualizar precios y FX'}
      </button>
      {messages.length > 0 && (
        <Note kind="info">
          {messages.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </Note>
      )}
    </Card>
  )
}

/* ── Cuentas ── */

function AccountsSection() {
  const accounts = useAppStore((s) => s.accounts)
  const addAccount = useAppStore((s) => s.addAccount)
  const removeAccount = useAppStore((s) => s.removeAccount)
  const transactions = useAppStore((s) => s.transactions)
  const [broker, setBroker] = useState('')
  const [label, setLabel] = useState('')
  const [accCurrency, setAccCurrency] = useState<Currency>('EUR')

  return (
    <Card title="Cuentas y brókeres">
      {accounts.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Bróker</th>
                <th scope="col">Cuenta</th>
                <th scope="col">Divisa</th>
                <th scope="col">Operaciones</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const txCount = transactions.filter((t) => t.accountId === a.id).length
                return (
                  <tr key={a.id}>
                    <td>{a.brokerName}</td>
                    <td>{a.accountLabel}</td>
                    <td>{a.defaultCurrency}</td>
                    <td>{txCount}</td>
                    <td>
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              txCount > 0
                                ? `Eliminar la cuenta borrará también sus ${txCount} operaciones. ¿Continuar?`
                                : '¿Eliminar la cuenta?',
                            )
                          ) {
                            removeAccount(a.id)
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <details className="math">
        <summary>Añadir cuenta</summary>
        <div className="math-body">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="acc-broker">Bróker o plataforma</label>
              <span className="hint">Ej.: Revolut, Interactive Brokers, Binance…</span>
              <input id="acc-broker" value={broker} onChange={(e) => setBroker(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="acc-label">Nombre de la cuenta</label>
              <span className="hint">Ej.: «Cuenta de valores», «Cripto»</span>
              <input id="acc-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          </div>
          <Segmented<Currency>
            label="Divisa por defecto"
            value={accCurrency}
            onChange={setAccCurrency}
            options={[
              { value: 'EUR', label: 'EUR €' },
              { value: 'USD', label: 'USD $' },
            ]}
          />
          <button
            type="button"
            className="btn primary"
            disabled={broker.trim() === ''}
            onClick={() => {
              addAccount({
                id: uid(),
                brokerName: broker.trim(),
                accountLabel: label.trim() === '' ? 'Cuenta principal' : label.trim(),
                defaultCurrency: accCurrency,
              })
              setBroker('')
              setLabel('')
            }}
          >
            Añadir cuenta
          </button>
          <p className="muted mt-2 mb-0">
            El bróker sirve para agrupar cuentas y operaciones. Las comisiones no se aplican en este
            piloto (decisión registrada en docs/DECISIONS.md).
          </p>
        </div>
      </details>
    </Card>
  )
}

/* ── Alta de operaciones ── */

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Acción' },
  { value: 'etf', label: 'ETF' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'commodity', label: 'Materia prima' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'manual', label: 'Otro (manual)' },
]

function AddTransactionSection() {
  const store = useAppStore()
  const accounts = store.accounts
  const assets = store.assets

  const [accountId, setAccountId] = useState('')
  const [assetChoice, setAssetChoice] = useState('') // id o '_new'
  const [newSymbol, setNewSymbol] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AssetType>('stock')
  const [newQuoteCurrency, setNewQuoteCurrency] = useState<Currency>('EUR')
  const [newManualPrice, setNewManualPrice] = useState('')
  const [pickedProviderIds, setPickedProviderIds] = useState<Record<string, string> | null>(null)

  const [txType, setTxType] = useState<'buy' | 'sell'>('buy')
  const [datetime, setDatetime] = useState(() => new Date().toISOString().slice(0, 16))
  const [amountRaw, setAmountRaw] = useState('')
  const [txCurrency, setTxCurrency] = useState<Currency>('EUR')
  const [qtyRaw, setQtyRaw] = useState('')
  const [priceRaw, setPriceRaw] = useState('')
  const [sourceType, setSourceType] = useState<TransactionSource>('exact')
  const [confidence, setConfidence] = useState<Confidence>('exact')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const amount = amountRaw.trim() === '' ? null : parseUserNumber(amountRaw)
  const qty = qtyRaw.trim() === '' ? null : parseUserNumber(qtyRaw)
  const price = priceRaw.trim() === '' ? null : parseUserNumber(priceRaw)

  // Comprobación de coherencia importe ≈ cantidad × precio (criterio spec:
  // si los datos son incompatibles, mostrar la discrepancia y elegir cuál manda).
  const discrepancy = useMemo(() => {
    if (amount === null || qty === null || price === null) return null
    const a = dec(amount)
    const implied = dec(qty).times(dec(price))
    if (a.lte(0) || implied.lte(0)) return null
    const diff = implied.minus(a).abs().div(a)
    return diff.gt('0.005') ? { entered: a, implied, diffPct: diff } : null
  }, [amount, qty, price])

  const canDerive =
    (amount !== null && qty !== null) ||
    (amount !== null && price !== null) ||
    (qty !== null && price !== null)

  const ready = accountId !== '' && assetChoice !== '' && canDerive

  function submit() {
    setMessage(null)
    if (accountId === '') {
      setMessage('Elige una cuenta (o crea una en la sección anterior).')
      return
    }

    let assetId = assetChoice
    if (assetChoice === '_new') {
      if (newSymbol.trim() === '') {
        setMessage('Indica al menos el símbolo o nombre del nuevo activo.')
        return
      }
      const manualPriceNorm = newManualPrice.trim() === '' ? null : parseUserNumber(newManualPrice)
      const asset: Asset = {
        id: uid(),
        symbol: newSymbol.trim().toUpperCase(),
        name: newName.trim() === '' ? newSymbol.trim() : newName.trim(),
        assetType: newType,
        quoteCurrency: newQuoteCurrency,
        ...(pickedProviderIds !== null ? { providerIds: pickedProviderIds } : {}),
        ...(manualPriceNorm !== null
          ? {
              manualPrice: {
                price: manualPriceNorm,
                currency: newQuoteCurrency,
                updatedAt: new Date().toISOString(),
              },
            }
          : {}),
      }
      store.addAsset(asset)
      assetId = asset.id
    }
    if (assetId === '' || assetId === '_new') return

    // Deriva el dato que falte entre importe, cantidad y precio.
    let finalAmount = amount
    let finalQty = qty
    const finalPrice = price
    if (finalAmount === null && finalQty !== null && finalPrice !== null) {
      finalAmount = dec(finalQty).times(dec(finalPrice)).toString()
    }
    if (finalQty === null && finalAmount !== null && finalPrice !== null) {
      finalQty = dec(finalAmount).div(dec(finalPrice)).toString()
    }
    if (finalAmount === null || finalQty === null) {
      setMessage('Necesito al menos dos de: importe, cantidad y precio.')
      return
    }
    if (dec(finalAmount).lte(0) || dec(finalQty).lte(0)) {
      setMessage('Importe y cantidad deben ser mayores que 0.')
      return
    }

    const tx: Transaction = {
      id: uid(),
      accountId,
      assetId,
      type: txType,
      datetime: new Date(datetime).toISOString(),
      investedAmount: finalAmount,
      investedCurrency: txCurrency,
      quantity: finalQty,
      executionPrice: finalPrice,
      quoteCurrency: txCurrency,
      fee: null,
      feeCurrency: null,
      sourceType,
      confidence,
      ...(notes.trim() !== '' ? { estimationNotes: notes.trim() } : {}),
    }
    store.addTransaction(tx)
    setMessage('Operación registrada.')
    setAmountRaw('')
    setQtyRaw('')
    setPriceRaw('')
    setNotes('')
  }

  return (
    <Card title="Registrar operación">
      {accounts.length === 0 ? (
        <Note kind="info">Crea primero una cuenta en «Cuentas y brókeres».</Note>
      ) : (
        <>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="tx-account">Cuenta</label>
              <select id="tx-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">— Elige cuenta —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.brokerName} · {a.accountLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tx-asset">Activo</label>
              <select id="tx-asset" value={assetChoice} onChange={(e) => setAssetChoice(e.target.value)}>
                <option value="">— Elige activo —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol} — {a.name}
                  </option>
                ))}
                <option value="_new">+ Nuevo activo…</option>
              </select>
            </div>
          </div>

          {assetChoice === '_new' && (
            <div className="grid-2">
              <div style={{ gridColumn: '1 / -1' }}>
                <AssetSearch
                  onPick={(m) => {
                    setNewSymbol(m.symbol)
                    setNewName(m.name)
                    setNewType(m.assetType)
                    if (m.quoteCurrency !== null) setNewQuoteCurrency(m.quoteCurrency)
                    setPickedProviderIds(m.providerIds)
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="new-symbol">Símbolo</label>
                <span className="hint">Ej.: AAPL, BTC, SXR8… Si es un producto del S&amp;P 500, usa el ETF o fondo concreto, no el índice.</span>
                <input id="new-symbol" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="new-name">Nombre</label>
                <input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="new-type">Tipo</label>
                <select
                  id="new-type"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as AssetType)}
                >
                  {ASSET_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                label="Precio actual (manual, opcional)"
                hint="Para poder valorar el activo si no hay datos de mercado"
                value={newManualPrice}
                onChange={setNewManualPrice}
                suffix={newQuoteCurrency}
              />
              <Segmented<Currency>
                label="Divisa de cotización"
                value={newQuoteCurrency}
                onChange={setNewQuoteCurrency}
                options={[
                  { value: 'EUR', label: 'EUR €' },
                  { value: 'USD', label: 'USD $' },
                ]}
              />
            </div>
          )}

          <div className="grid-2">
            <Segmented<'buy' | 'sell'>
              label="Tipo de operación"
              value={txType}
              onChange={setTxType}
              options={[
                { value: 'buy', label: 'Compra' },
                { value: 'sell', label: 'Venta' },
              ]}
            />
            <div className="field">
              <label htmlFor="tx-datetime">Fecha y hora</label>
              <input
                id="tx-datetime"
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
              />
            </div>
            <NumberField
              label={txType === 'buy' ? 'Importe invertido' : 'Importe obtenido'}
              hint="Ej.: 100"
              value={amountRaw}
              onChange={setAmountRaw}
              suffix={txCurrency}
            />
            <Segmented<Currency>
              label="Divisa de la operación"
              value={txCurrency}
              onChange={setTxCurrency}
              options={[
                { value: 'EUR', label: 'EUR €' },
                { value: 'USD', label: 'USD $' },
              ]}
            />
            <NumberField
              label="Cantidad (unidades)"
              hint="Ej.: 0,0014 — puede derivarse de importe y precio"
              value={qtyRaw}
              onChange={setQtyRaw}
            />
            <NumberField
              label="Precio por unidad (opcional)"
              hint="Ej.: 70.000 — puede derivarse de importe y cantidad"
              value={priceRaw}
              onChange={setPriceRaw}
              suffix={txCurrency}
            />
          </div>

          {discrepancy !== null && (
            <Note kind="warning">
              <strong>Los datos no cuadran:</strong> indicaste{' '}
              {formatMoney(discrepancy.entered, txCurrency)} de importe, pero cantidad × precio ={' '}
              {formatMoney(discrepancy.implied, txCurrency)} (difiere un{' '}
              {formatPct(discrepancy.diffPct)}). Elige cuál prevalece:
              <div className="row mt-2">
                <button
                  type="button"
                  className="btn small"
                  onClick={() =>
                    setQtyRaw(dec(amount!).div(dec(price!)).toDP(8).toString())
                  }
                >
                  Manda el importe (recalcular cantidad)
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() =>
                    setAmountRaw(dec(qty!).times(dec(price!)).toDP(2).toString())
                  }
                >
                  Mandan cantidad y precio (recalcular importe)
                </button>
              </div>
            </Note>
          )}

          <div className="grid-2">
            <div className="field">
              <label htmlFor="tx-source">Origen del dato</label>
              <select
                id="tx-source"
                value={sourceType}
                onChange={(e) => {
                  const v = e.target.value as TransactionSource
                  setSourceType(v)
                  setConfidence(v === 'exact' ? 'exact' : 'medium')
                }}
              >
                <option value="exact">Exacto (lo sé con certeza)</option>
                <option value="historical_estimate">Estimado con precio histórico</option>
                <option value="return_estimate">Estimado desde la rentabilidad</option>
              </select>
            </div>
            {sourceType !== 'exact' && (
              <div className="field">
                <label htmlFor="tx-confidence">Confianza</label>
                <select
                  id="tx-confidence"
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value as Confidence)}
                >
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </select>
              </div>
            )}
          </div>
          {sourceType !== 'exact' && (
            <div className="field">
              <label htmlFor="tx-notes">Notas de la estimación</label>
              <span className="hint">
                Fuente y fecha del precio usado. La estimación automática con precios históricos se
                activa al configurar un proveedor de datos (pestaña Perfil).
              </span>
              <textarea id="tx-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}

          <div className="row">
            <button type="button" className="btn primary" onClick={submit} disabled={!ready}>
              Registrar operación
            </button>
            {message !== null && <span className="muted">{message}</span>}
          </div>
        </>
      )}
    </Card>
  )
}

/* ── Búsqueda de instrumentos ── */

function AssetSearch(props: { onPick: (match: AssetMatch) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AssetMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setResults(null)
    try {
      setResults(await searchAssets(query.trim()))
    } catch (e) {
      setError(
        `La búsqueda no está disponible ahora (${e instanceof Error ? e.message : 'error'}). Puedes rellenar el activo a mano.`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="field">
        <label htmlFor="asset-search">Buscar instrumento (opcional)</label>
        <span className="hint">
          Busca en los proveedores configurados y rellena los campos automáticamente. Si no hay
          resultados, rellena a mano.
        </span>
        <div className="row">
          <input
            id="asset-search"
            style={{ flex: 1 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim() !== '') void run()
            }}
            placeholder="Ej.: bitcoin, apple, S&P 500…"
          />
          <button
            type="button"
            className="btn"
            disabled={busy || query.trim() === ''}
            onClick={() => void run()}
          >
            {busy ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </div>
      {error !== null && <Note kind="warning">{error}</Note>}
      {results !== null && results.length === 0 && (
        <Note kind="info">Sin resultados. Rellena los campos a mano.</Note>
      )}
      {results !== null && results.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Símbolo</th>
                <th scope="col">Nombre</th>
                <th scope="col">Tipo</th>
                <th scope="col">Fuente</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((m) => (
                <tr key={`${m.provider}-${m.providerIds[m.provider] ?? m.symbol}`}>
                  <td>{m.symbol}</td>
                  <td style={{ whiteSpace: 'normal' }}>{m.name}</td>
                  <td>{m.assetType}</td>
                  <td>{m.provider}</td>
                  <td>
                    <button type="button" className="btn small" onClick={() => props.onPick(m)}>
                      Usar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Historial ── */

function TransactionsSection() {
  const transactions = useAppStore((s) => s.transactions)
  const assets = useAppStore((s) => s.assets)
  const accounts = useAppStore((s) => s.accounts)
  const removeTransaction = useAppStore((s) => s.removeTransaction)

  if (transactions.length === 0) return null

  const sorted = [...transactions].sort((a, b) => b.datetime.localeCompare(a.datetime))

  return (
    <Card title="Operaciones">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Activo</th>
              <th scope="col">Tipo</th>
              <th scope="col">Importe</th>
              <th scope="col">Unidades</th>
              <th scope="col">Origen</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const asset = assets.find((a) => a.id === t.assetId)
              const account = accounts.find((a) => a.id === t.accountId)
              return (
                <tr key={t.id}>
                  <td>{formatDateTime(t.datetime)}</td>
                  <td>
                    {asset?.symbol ?? '?'}
                    <div className="muted" style={{ fontSize: '0.72rem' }}>
                      {account?.brokerName ?? ''}
                    </div>
                  </td>
                  <td>{t.type === 'buy' ? 'Compra' : 'Venta'}</td>
                  <td>{formatMoney(dec(t.investedAmount), t.investedCurrency)}</td>
                  <td>{formatQty(dec(t.quantity))}</td>
                  <td>
                    {t.sourceType === 'exact' ? (
                      <QualityChip quality="real" detail="Dato exacto" />
                    ) : (
                      <QualityChip
                        quality="estimated"
                        detail={`Confianza: ${t.confidence}. ${t.estimationNotes ?? ''}`}
                      />
                    )}
                    {t.sourceType !== 'exact' && (
                      <div className="muted" style={{ fontSize: '0.72rem' }}>
                        {t.estimationNotes ?? `Confianza ${t.confidence}`}
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => {
                        if (window.confirm('¿Eliminar esta operación?')) removeTransaction(t.id)
                      }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
