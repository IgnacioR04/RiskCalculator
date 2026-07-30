import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Card,
  EmptyState,
  Note,
  NumberField,
  Figure,
  QualityChip,
  SectionHeader,
  SeriesDot,
  Segmented,
  SignedValue,
  Stat,
} from '../components/ui'
import {
  estimateBrokerFee,
  presetsForBroker,
  suggestedFeePolicy,
} from '../lib/brokerFees'
import type {
  Asset,
  AssetHolding,
  AssetType,
  BrokerFeePolicy,
  Confidence,
  Currency,
  Transaction,
  TransactionSource,
} from '../lib/domain'
import { uid } from '../lib/domain'
import { dec } from '../lib/finance/decimal'
import { aggregatePosition } from '../lib/finance/position'
import {
  formatDateTime,
  formatMoney,
  formatPct,
  formatQty,
  parseUserNumber,
} from '../lib/format'
import { convertAmount } from '../lib/fx'
import type { AssetMatch } from '../lib/market/provider'
import {
  historicalDailyPrice,
  refreshAllQuotes,
  refreshFx,
  searchAssets,
} from '../lib/market/service'
import { buildPortfolioView, type PortfolioView } from '../lib/portfolio'
import { useAppStore } from '../state/store'

type PortfolioTab = 'overview' | 'manage'

export function PortfolioPage() {
  const store = useAppStore()
  const [tab, setTab] = useState<PortfolioTab>('overview')
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
    [
      store.assets,
      store.accounts,
      store.transactions,
      store.quotes,
      store.fxRates,
      store.settings.displayCurrency,
    ],
  )
  const currency = store.settings.displayCurrency

  return (
    <>
      <SectionHeader num="03" title="Cartera" />
      <div className="page-heading">
        <div>
          <p className="muted mb-0">
            Valor, rentabilidad y costes sin mezclar coste pendiente con dinero aportado.
            El riesgo vive en la seccion 04 y el reparto en la 05.
          </p>
        </div>
        <QualityChip
          quality={view.quality}
          detail={
            view.valuationComplete && view.financialsComplete
              ? 'Valoración y costes completos'
              : 'Hay métricas pendientes por datos incompletos'
          }
        />
      </div>

      {view.hasDemoData && (
        <Note kind="demo">Incluye posiciones ficticias de demostración.</Note>
      )}

      <Segmented<PortfolioTab>
        label="Sección de portfolio"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Posiciones' },
          { value: 'manage', label: 'Cuentas y operaciones' },
        ]}
      />

      {tab === 'overview' && (
        <OverviewTab view={view} currency={currency} onManage={() => setTab('manage')} />
      )}
      {tab === 'manage' && (
        <>
          <MarketRefreshSection />
          <AccountsSection />
          <AssetMetadataSection />
          <AddTransactionSection />
          <TransactionsSection />
        </>
      )}
    </>
  )
}

function OverviewTab(props: {
  view: PortfolioView
  currency: Currency
  onManage: () => void
}) {
  const { view, currency } = props
  if (view.positions.length === 0) {
    return (
      <Card>
        <EmptyState icon="◇" title="Construye tu primera cartera">
          <p>Añade una cuenta y una compra, o usa la importación asistida por IA.</p>
          <button type="button" className="btn primary" onClick={props.onManage}>
            Añadir mi primera posición
          </button>
        </EmptyState>
      </Card>
    )
  }
  return (
    <>
      <Card highlight>
        <div className="portfolio-hero">
          <div>
            <span className="eyebrow">Valor actual</span>
            <div className="big-figure">{formatMoney(view.totalValue, currency)}</div>
            <span className="muted tiny">
              {view.valuationComplete ? 'Todas las posiciones valoradas' : 'Valor parcial'}
            </span>
          </div>
          <div className="portfolio-result">
            <span className="muted">Resultado total</span>
            {view.totalPnl === null ? (
              <strong>Sin calcular</strong>
            ) : (
              <SignedValue
                formatted={formatMoney(view.totalPnl, currency)}
                sign={view.totalPnl.gt(0) ? 1 : view.totalPnl.lt(0) ? -1 : 0}
              />
            )}
            <span className="muted tiny">
              Valor + ventas − compras − comisiones
            </span>
          </div>
        </div>
        <div className="stat-grid mt-4">
          <Stat label="Aportación neta">
            {view.netContributed === null ? '—' : formatMoney(view.netContributed, currency)}
          </Stat>
          <Stat label="Capital histórico invertido">
            {view.totalInvested === null ? '—' : formatMoney(view.totalInvested, currency)}
          </Stat>
          <Stat label="Rentabilidad total">
            {view.totalReturnPct === null ? (
              '—'
            ) : (
              <SignedValue
                formatted={formatPct(view.totalReturnPct)}
                sign={view.totalReturnPct.gt(0) ? 1 : view.totalReturnPct.lt(0) ? -1 : 0}
              />
            )}
          </Stat>
          <Stat label="TIR monetaria">
            {view.moneyWeighted.ok ? formatPct(view.moneyWeighted.rate, 1) : 'No disponible'}
          </Stat>
          <Stat label="Realizado">
            {view.totalRealizedPnl === null ? '—' : formatMoney(view.totalRealizedPnl, currency)}
          </Stat>
          <Stat label="No realizado">
            {view.totalUnrealizedPnl === null ? '—' : formatMoney(view.totalUnrealizedPnl, currency)}
          </Stat>
          <Stat label="Comisiones">
            {view.totalFees === null ? '—' : formatMoney(view.totalFees, currency)}
          </Stat>
          <Stat label="Coste de posiciones abiertas">
            {view.totalCostBasis === null ? '—' : formatMoney(view.totalCostBasis, currency)}
          </Stat>
        </div>
      </Card>

      {view.warnings.length > 0 && (
        <details className="data-health">
          <summary>
            <span>Calidad de datos</span>
            <strong>{view.warnings.length} avisos</strong>
          </summary>
          <ul>{view.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}

      <div className="grid-2 portfolio-overview-grid">
        <Card title="Dónde está tu dinero" sub="el reparto completo por clase, cuenta, sector, país y divisa">
          <div className="stack mt-2">
            {view.byType.slice(0, 5).map((slice, i) => (
              <div key={slice.key} className="row" style={{ gap: 7, font: '400 var(--fs-aux) var(--font-ui)' }}>
                <SeriesDot index={i} />
                {slice.label}
                <span style={{ marginLeft: 'auto' }}>
                  <Figure size="sm">{slice.weight !== null ? formatPct(slice.weight, 1) : '—'}</Figure>
                </span>
              </div>
            ))}
          </div>
          <Link to="/diversificacion" className="btn small mt-3">
            Ver diversificación
          </Link>
        </Card>
        <Card title="Concentración">
          <div className="concentration-visual">
            <div className="concentration-ring">
              <strong>
                {view.concentration.effectivePositions?.toFixed(1) ?? '—'}
              </strong>
              <span>posiciones efectivas</span>
            </div>
            <div className="concentration-copy">
              <span className="muted">Mayor posición</span>
              <strong>
                {view.concentration.maxWeight === null
                  ? '—'
                  : formatPct(view.concentration.maxWeight, 1)}
              </strong>
              <p className="muted tiny mb-0">
                Compara el número real ({view.positions.filter((position) => position.quantity.gt(0)).length})
                con el efectivo para detectar concentración oculta.
              </p>
            </div>
          </div>
          <button type="button" className="btn small mt-4" onClick={props.onManage}>
            Ajustar clasificación y datos
          </button>
        </Card>
      </div>

      <PositionsCard view={view} currency={currency} />
    </>
  )
}

function PositionsCard(props: { view: PortfolioView; currency: Currency }) {
  return (
    <Card title="Posiciones">
      <div className="position-cards">
        {props.view.positions.map((position) => (
          <article className="position-card" key={position.asset.id}>
            <div className="row spread">
              <div>
                <strong className="position-symbol">{position.asset.symbol}</strong>
                <span className="muted tiny block">{position.asset.name}</span>
              </div>
              <QualityChip quality={position.quality} />
            </div>
            <div className="position-value">
              {position.value === null ? 'Sin precio' : formatMoney(position.value, props.currency)}
            </div>
            <div className="row spread">
              <span className="muted tiny">{formatQty(position.quantity)} unidades</span>
              {position.unrealizedPnl === null ? (
                <span className="muted tiny">P&L pendiente</span>
              ) : (
                <SignedValue
                  formatted={formatMoney(position.unrealizedPnl, props.currency)}
                  sign={
                    position.unrealizedPnl.gt(0)
                      ? 1
                      : position.unrealizedPnl.lt(0)
                        ? -1
                        : 0
                  }
                />
              )}
            </div>
            <div className="position-meta">
              <span>{position.asset.assetType.toUpperCase()}</span>
              <span>{position.asset.sector ?? 'Sin sector'}</span>
              <span>{position.asset.country ?? 'Sin país'}</span>
            </div>
          </article>
        ))}
      </div>
    </Card>
  )
}

function MarketRefreshSection() {
  const transactions = useAppStore((state) => state.transactions)
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  if (transactions.length === 0) return null

  async function refresh() {
    setBusy(true)
    setMessages([])
    try {
      const [fx, results] = await Promise.all([refreshFx(), refreshAllQuotes(true)])
      const notes = results.flatMap((result) => result.message ?? [])
      if (fx.message !== undefined) notes.push(fx.message)
      notes.unshift(
        `${results.filter((result) => result.ok).length}/${results.length} precios actualizados.`,
      )
      setMessages(notes)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Datos de mercado">
      <div className="row spread">
        <p className="muted mb-0">
          Actualiza precios, histórico y EUR/USD. Los fallos conservan el último dato conocido.
        </p>
        <button type="button" className="btn primary" onClick={() => void refresh()} disabled={busy}>
          {busy ? 'Actualizando…' : 'Actualizar todo'}
        </button>
      </div>
      {messages.length > 0 && (
        <Note kind="info">{messages.map((message) => <div key={message}>{message}</div>)}</Note>
      )}
    </Card>
  )
}

function AccountsSection() {
  const accounts = useAppStore((state) => state.accounts)
  const transactions = useAppStore((state) => state.transactions)
  const addAccount = useAppStore((state) => state.addAccount)
  const updateAccount = useAppStore((state) => state.updateAccount)
  const removeAccount = useAppStore((state) => state.removeAccount)
  const [broker, setBroker] = useState('')
  const [label, setLabel] = useState('')
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <Card title="Cuentas y comisiones">
      <div className="account-grid">
        {accounts.map((account) => {
          const count = transactions.filter((transaction) => transaction.accountId === account.id).length
          return (
            <article className="account-card" key={account.id}>
              <div className="row spread">
                <div>
                  <strong>{account.brokerName}</strong>
                  <span className="muted tiny block">{account.accountLabel} · {account.defaultCurrency}</span>
                </div>
                <span className="chip manual">{count} ops.</span>
              </div>
              <div className="fee-summary">
                <span className="muted tiny">Comisión automática</span>
                <strong>{account.feePolicy?.label ?? 'Sin configurar'}</strong>
              </div>
              <div className="row">
                <button type="button" className="btn small" onClick={() => setEditing(account.id)}>
                  Configurar tarifa
                </button>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={() => {
                    if (window.confirm(`Eliminar ${account.accountLabel} y sus ${count} operaciones?`)) {
                      removeAccount(account.id)
                    }
                  }}
                >
                  Eliminar
                </button>
              </div>
              {editing === account.id && (
                <FeePolicyEditor
                  brokerName={account.brokerName}
                  current={account.feePolicy}
                  onSave={(policy) => {
                    updateAccount(account.id, { feePolicy: policy })
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              )}
            </article>
          )
        })}
      </div>

      <details className="math">
        <summary>Añadir cuenta</summary>
        <div className="math-body">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="account-broker">Bróker o plataforma</label>
              <input
                id="account-broker"
                value={broker}
                onChange={(event) => setBroker(event.target.value)}
                placeholder="Revolut, Bitget, IBKR…"
              />
            </div>
            <div className="field">
              <label htmlFor="account-label">Nombre de la cuenta</label>
              <input
                id="account-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Cuenta principal"
              />
            </div>
          </div>
          <Segmented<Currency>
            label="Divisa por defecto"
            value={currency}
            onChange={setCurrency}
            options={[
              { value: 'EUR', label: 'EUR €' },
              { value: 'USD', label: 'USD $' },
            ]}
          />
          {broker.trim() !== '' && suggestedFeePolicy(broker) !== null && (
            <Note kind="info">
              Al crearla se aplicará como sugerencia <strong>{suggestedFeePolicy(broker)!.label}</strong>.
              Podrás editarla antes de registrar operaciones.
            </Note>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={broker.trim() === ''}
            onClick={() => {
              const suggestion = suggestedFeePolicy(broker)
              addAccount({
                id: uid(),
                brokerName: broker.trim(),
                accountLabel: label.trim() || 'Cuenta principal',
                defaultCurrency: currency,
                ...(suggestion !== null ? { feePolicy: suggestion } : {}),
              })
              setBroker('')
              setLabel('')
            }}
          >
            Añadir cuenta
          </button>
        </div>
      </details>
    </Card>
  )
}

function FeePolicyEditor(props: {
  brokerName: string
  current: BrokerFeePolicy | undefined
  onSave: (policy: BrokerFeePolicy) => void
  onCancel: () => void
}) {
  const presets = presetsForBroker(props.brokerName)
  const [selected, setSelected] = useState(props.current?.catalogId ?? (presets[0]?.id ?? 'custom'))
  const base =
    presets.find((preset) => preset.id === selected)?.policy ??
    props.current ?? {
      mode: 'custom' as const,
      label: 'Tarifa personalizada',
      rate: '0',
      fixed: '0',
      minimum: '0',
      currency: 'EUR' as const,
    }
  const [rate, setRate] = useState(String(Number(base.rate) * 100))
  const [fixed, setFixed] = useState(base.fixed)
  const [minimum, setMinimum] = useState(base.minimum)
  const [currency, setCurrency] = useState<Currency>(base.currency)
  const [freeTrades, setFreeTrades] = useState(String(base.freeTradesRemaining ?? 0))

  function choose(id: string) {
    setSelected(id)
    const preset = presets.find((item) => item.id === id)
    if (preset !== undefined) {
      setRate(String(Number(preset.policy.rate) * 100))
      setFixed(preset.policy.fixed)
      setMinimum(preset.policy.minimum)
      setCurrency(preset.policy.currency)
      setFreeTrades(String(preset.policy.freeTradesRemaining ?? 0))
    }
  }

  return (
    <div className="fee-editor">
      <div className="field">
        <label htmlFor={`fee-rule-${props.brokerName}`}>Regla</label>
        <select
          id={`fee-rule-${props.brokerName}`}
          value={selected}
          onChange={(event) => choose(event.target.value)}
        >
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.brokerLabel}</option>)}
          <option value="custom">Personalizada</option>
          <option value="none">Sin comisión</option>
        </select>
      </div>
      {selected !== 'none' && (
        <>
          <div className="grid-2">
            <NumberField label="Porcentaje" value={rate} onChange={setRate} suffix="%" />
            <NumberField label="Cargo fijo" value={fixed} onChange={setFixed} suffix={currency} />
            <NumberField label="Mínimo" value={minimum} onChange={setMinimum} suffix={currency} />
            <NumberField
              label="Órdenes gratuitas restantes"
              value={freeTrades}
              onChange={setFreeTrades}
            />
          </div>
          <Segmented<Currency>
            label="Divisa de la tarifa"
            value={currency}
            onChange={setCurrency}
            options={[
              { value: 'EUR', label: 'EUR' },
              { value: 'USD', label: 'USD' },
            ]}
          />
        </>
      )}
      {presets.find((preset) => preset.id === selected) !== undefined && (
        <p className="muted tiny">
          {presets.find((preset) => preset.id === selected)!.note}{' '}
          <a
            href={presets.find((preset) => preset.id === selected)!.policy.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Fuente oficial
          </a>
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="btn primary small"
          onClick={() => {
            const preset = presets.find((item) => item.id === selected)
            props.onSave(
              selected === 'none'
                ? {
                    mode: 'none',
                    label: 'Sin comisión',
                    rate: '0',
                    fixed: '0',
                    minimum: '0',
                    currency,
                  }
                : {
                    ...(preset?.policy ?? {}),
                    mode: preset === undefined ? 'custom' : 'catalog',
                    ...(preset !== undefined ? { catalogId: preset.id } : {}),
                    label:
                      preset?.policy.label ??
                      `${rate || '0'} % + ${fixed || '0'} ${currency} (mín. ${minimum || '0'})`,
                    rate: String((Number(parseUserNumber(rate) ?? 0) || 0) / 100),
                    fixed: parseUserNumber(fixed) ?? '0',
                    minimum: parseUserNumber(minimum) ?? '0',
                    currency,
                    freeTradesRemaining: Math.max(0, Math.floor(Number(freeTrades) || 0)),
                  },
            )
          }}
        >
          Guardar tarifa
        </button>
        <button type="button" className="btn small" onClick={props.onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function AssetMetadataSection() {
  const assets = useAppStore((state) => state.assets)
  const updateAsset = useAppStore((state) => state.updateAsset)
  const [assetId, setAssetId] = useState('')
  const asset = assets.find((item) => item.id === assetId)
  const [sector, setSector] = useState('')
  const [country, setCountry] = useState('')
  const [exchange, setExchange] = useState('')
  const [holdingsRaw, setHoldingsRaw] = useState('')
  const [enlaceHecho, setEnlaceHecho] = useState<string | null>(null)
  const enlazado = Object.keys(asset?.providerIds ?? {}).length > 0

  function select(id: string) {
    setAssetId(id)
    setEnlaceHecho(null)
    const selected = assets.find((item) => item.id === id)
    setSector(selected?.sector ?? '')
    setCountry(selected?.country ?? '')
    setExchange(selected?.exchange ?? '')
    setHoldingsRaw(
      (selected?.holdings ?? [])
        .map((holding) =>
          `${holding.symbol}${holding.weight === undefined ? '' : `,${Number(holding.weight) * 100}`}`,
        )
        .join('\n'),
    )
  }

  function parseHoldings(): AssetHolding[] {
    return holdingsRaw
      .split('\n')
      .flatMap((line) => {
        const [symbolRaw, weightRaw] = line.split(',').map((value) => value.trim())
        if (!symbolRaw) return []
        const parsedWeight = weightRaw ? parseUserNumber(weightRaw) : null
        return [{
          symbol: symbolRaw.toUpperCase(),
          ...(parsedWeight !== null ? { weight: dec(parsedWeight).div(100).toString() } : {}),
        }]
      })
  }

  if (assets.length === 0) return null
  return (
    <Card title="Clasificación y componentes">
      <p className="muted">
        Sector y país alimentan las gráficas. En ETF, los componentes permiten detectar
        solapamientos reales.
      </p>
      <div className="field">
        <label htmlFor="metadata-asset">Activo</label>
        <select id="metadata-asset" value={assetId} onChange={(event) => select(event.target.value)}>
          <option value="">— Selecciona —</option>
          {assets.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}
        </select>
      </div>
      {asset !== undefined && (
        <>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="asset-sector">Sector</label>
              <input id="asset-sector" value={sector} onChange={(event) => setSector(event.target.value)} placeholder="Tecnología, Banca…" />
            </div>
            <div className="field">
              <label htmlFor="asset-country">País o región principal</label>
              <input id="asset-country" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Estados Unidos, Global…" />
            </div>
            <div className="field">
              <label htmlFor="asset-exchange">Mercado</label>
              <input id="asset-exchange" value={exchange} onChange={(event) => setExchange(event.target.value)} placeholder="NASDAQ, XETRA…" />
            </div>
          </div>
          {asset.assetType === 'etf' && (
            <div className="field">
              <label htmlFor="asset-holdings">Componentes del ETF</label>
              <span className="hint">Una línea por activo: símbolo,peso %. Ej.: AAPL,6.5</span>
              <textarea id="asset-holdings" rows={6} value={holdingsRaw} onChange={(event) => setHoldingsRaw(event.target.value)} />
            </div>
          )}
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              updateAsset(asset.id, {
                sector: sector.trim(),
                country: country.trim(),
                exchange: exchange.trim(),
                ...(asset.assetType === 'etf' ? { holdings: parseHoldings() } : {}),
              })
            }
          >
            Guardar clasificación
          </button>

          <div className="mt-4">
            <span className="label">Origen de los precios</span>
            {enlazado ? (
              <Note kind="info">
                <span>
                  <strong>{asset.symbol}</strong> está enlazado con{' '}
                  <span className="mono">{Object.keys(asset.providerIds ?? {}).join(', ')}</span>.
                  Ya puede descargar histórico para volatilidad y correlaciones.
                </span>
              </Note>
            ) : (
              <Note kind="warning">
                <span>
                  <strong>{asset.symbol}</strong> no tiene proveedor de datos, así que no entra en
                  el análisis histórico: sin serie de precios no hay volatilidad, ni covarianzas,
                  ni frontera eficiente. Búscalo aquí para enlazarlo.
                </span>
              </Note>
            )}
            <AssetSearch
              expectedType={asset.assetType}
              onPick={(match) => {
                updateAsset(asset.id, {
                  providerIds: match.providerIds,
                  ...(asset.symbol === asset.name ? { symbol: match.symbol } : {}),
                  ...(match.exchange !== undefined && exchange.trim() === ''
                    ? { exchange: match.exchange }
                    : {}),
                })
                setEnlaceHecho(match.name)
              }}
            />
            {enlaceHecho !== null && (
              <p className="positive tiny">Enlazado con {enlaceHecho}.</p>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Acción' },
  { value: 'etf', label: 'ETF' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'commodity', label: 'Materia prima' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'manual', label: 'Otro' },
]

function AddTransactionSection() {
  const store = useAppStore()
  const [accountId, setAccountId] = useState('')
  const [assetChoice, setAssetChoice] = useState('')
  const [newSymbol, setNewSymbol] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AssetType>('stock')
  const [newQuoteCurrency, setNewQuoteCurrency] = useState<Currency>('EUR')
  const [newManualPrice, setNewManualPrice] = useState('')
  const [newSector, setNewSector] = useState('')
  const [newCountry, setNewCountry] = useState('')
  const [newExchange, setNewExchange] = useState('')
  const [pickedProviderIds, setPickedProviderIds] = useState<Record<string, string> | null>(null)
  const [txType, setTxType] = useState<'buy' | 'sell'>('buy')
  const [datetime, setDatetime] = useState(() => new Date().toISOString().slice(0, 16))
  const [amountRaw, setAmountRaw] = useState('')
  const [txCurrency, setTxCurrency] = useState<Currency>('EUR')
  const [qtyRaw, setQtyRaw] = useState('')
  const [priceRaw, setPriceRaw] = useState('')
  const [feeMode, setFeeMode] = useState<'auto' | 'manual' | 'none'>('auto')
  const [manualFeeRaw, setManualFeeRaw] = useState('')
  const [sourceType, setSourceType] = useState<TransactionSource>('exact')
  const [confidence, setConfidence] = useState<Confidence>('exact')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [historicalBusy, setHistoricalBusy] = useState(false)

  const amount = amountRaw.trim() ? parseUserNumber(amountRaw) : null
  const quantity = qtyRaw.trim() ? parseUserNumber(qtyRaw) : null
  const price = priceRaw.trim() ? parseUserNumber(priceRaw) : null
  const discrepancy = useMemo(() => {
    if (amount === null || quantity === null || price === null) return null
    const entered = dec(amount)
    const implied = dec(quantity).times(price)
    if (entered.lte(0)) return null
    const difference = implied.minus(entered).abs().div(entered)
    return difference.gt('0.005') ? { entered, implied, difference } : null
  }, [amount, quantity, price])
  const canDerive =
    (amount !== null && quantity !== null) ||
    (amount !== null && price !== null) ||
    (quantity !== null && price !== null)
  const selectedAccount = store.accounts.find((account) => account.id === accountId)
  const feeEstimate =
    amount === null || feeMode !== 'auto'
      ? null
      : estimateBrokerFee(selectedAccount, amount, txCurrency)

  function temporaryAsset(): Asset | null {
    if (assetChoice !== '_new') return store.assets.find((asset) => asset.id === assetChoice) ?? null
    if (newSymbol.trim() === '') return null
    return {
      id: 'temporary',
      symbol: newSymbol.trim().toUpperCase(),
      name: newName.trim() || newSymbol.trim(),
      assetType: newType,
      quoteCurrency: newQuoteCurrency,
      ...(pickedProviderIds !== null ? { providerIds: pickedProviderIds } : {}),
    }
  }

  async function lookupHistorical() {
    const asset = temporaryAsset()
    if (asset === null) {
      setMessage('Selecciona primero un activo con proveedor de datos.')
      return
    }
    setHistoricalBusy(true)
    setMessage(null)
    try {
      const date = datetime.slice(0, 10)
      const result = await historicalDailyPrice(asset, date)
      if (result === null) {
        setMessage('No hay cierre histórico disponible para ese activo y fecha.')
        return
      }
      let execution = dec(result.close)
      if (asset.quoteCurrency !== txCurrency) {
        await refreshFx(date)
        const conversion = convertAmount(
          execution,
          asset.quoteCurrency,
          txCurrency,
          useAppStore.getState().fxRates,
          date,
        )
        if (conversion === null) {
          setMessage(`Falta el cambio ${asset.quoteCurrency}→${txCurrency} de esa fecha.`)
          return
        }
        execution = conversion.amount
      }
      setPriceRaw(execution.toString())
      if (amount !== null && quantity === null) {
        setQtyRaw(dec(amount).div(execution).toDP(10).toString())
      }
      setNotes(
        `Cierre diario ${result.provider} del ${date}${result.low !== null && result.high !== null ? `; rango ${result.low}–${result.high} ${asset.quoteCurrency}` : ''}. Sin precisión intradía.`,
      )
      setConfidence(result.low === null ? 'medium' : 'high')
      setMessage('Precio histórico cargado. Revisa la cantidad antes de guardar.')
    } finally {
      setHistoricalBusy(false)
    }
  }

  function submit() {
    setMessage(null)
    if (accountId === '' || assetChoice === '') {
      setMessage('Selecciona una cuenta y un activo.')
      return
    }
    let assetId = assetChoice
    if (assetChoice === '_new') {
      if (newSymbol.trim() === '') {
        setMessage('Indica el símbolo del nuevo activo.')
        return
      }
      const manual = newManualPrice.trim() ? parseUserNumber(newManualPrice) : null
      const asset: Asset = {
        id: uid(),
        symbol: newSymbol.trim().toUpperCase(),
        name: newName.trim() || newSymbol.trim(),
        assetType: newType,
        quoteCurrency: newQuoteCurrency,
        ...(newSector.trim() ? { sector: newSector.trim() } : {}),
        ...(newCountry.trim() ? { country: newCountry.trim() } : {}),
        ...(newExchange.trim() ? { exchange: newExchange.trim() } : {}),
        ...(pickedProviderIds !== null ? { providerIds: pickedProviderIds } : {}),
        ...(manual !== null
          ? { manualPrice: { price: manual, currency: newQuoteCurrency, updatedAt: new Date().toISOString() } }
          : {}),
      }
      store.addAsset(asset)
      assetId = asset.id
    }

    let finalAmount = amount
    let finalQuantity = quantity
    if (finalAmount === null && finalQuantity !== null && price !== null) {
      finalAmount = dec(finalQuantity).times(price).toString()
    }
    if (finalQuantity === null && finalAmount !== null && price !== null) {
      finalQuantity = dec(finalAmount).div(price).toString()
    }
    if (finalAmount === null || finalQuantity === null || dec(finalAmount).lte(0) || dec(finalQuantity).lte(0)) {
      setMessage('Necesito dos datos válidos entre importe, cantidad y precio.')
      return
    }

    let fee: string | null = null
    let feeCurrency: Currency | null = null
    let consumesFreeTrade = false
    if (feeMode === 'manual') {
      const parsed = parseUserNumber(manualFeeRaw)
      if (parsed !== null && dec(parsed).gte(0)) {
        fee = parsed
        feeCurrency = txCurrency
      }
    } else if (feeMode === 'auto') {
      const estimate = estimateBrokerFee(selectedAccount, finalAmount, txCurrency)
      if (estimate === null) {
        setMessage('La tarifa del bróker está en otra divisa. Introduce la comisión manualmente.')
        return
      }
      fee = estimate.amount.toString()
      feeCurrency = estimate.currency
      consumesFreeTrade = estimate.consumesFreeTrade
    }

    if (txType === 'sell') {
      try {
        aggregatePosition(
          store.transactions
            .filter((transaction) => transaction.assetId === assetId && transaction.accountId === accountId)
            .map((transaction) => ({
              type: transaction.type,
              datetime: transaction.datetime,
              quantity: transaction.quantity,
              amount: transaction.investedAmount,
              fee: transaction.fee ?? 0,
            }))
            .concat([{
              type: 'sell' as const,
              datetime: new Date(datetime).toISOString(),
              quantity: finalQuantity,
              amount: finalAmount,
              fee: fee ?? 0,
            }]),
        )
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'La venta supera la posición disponible.')
        return
      }
    }

    const transaction: Transaction = {
      id: uid(),
      accountId,
      assetId,
      type: txType,
      datetime: new Date(datetime).toISOString(),
      investedAmount: finalAmount,
      investedCurrency: txCurrency,
      quantity: finalQuantity,
      executionPrice: price,
      quoteCurrency: temporaryAsset()?.quoteCurrency ?? txCurrency,
      fee,
      feeCurrency,
      sourceType,
      confidence,
      costKnown: true,
      ...(notes.trim() ? { estimationNotes: notes.trim() } : {}),
    }
    store.addTransaction(transaction)
    if (consumesFreeTrade && selectedAccount?.feePolicy !== undefined) {
      store.updateAccount(selectedAccount.id, {
        feePolicy: {
          ...selectedAccount.feePolicy,
          freeTradesRemaining: Math.max(0, (selectedAccount.feePolicy.freeTradesRemaining ?? 0) - 1),
        },
      })
    }
    setMessage(`Operación registrada${fee !== null && dec(fee).gt(0) ? ` con ${formatMoney(fee, feeCurrency ?? txCurrency)} de comisión` : ''}.`)
    setAmountRaw('')
    setQtyRaw('')
    setPriceRaw('')
    setManualFeeRaw('')
    setNotes('')
  }

  return (
    <Card title="Registrar operación">
      {store.accounts.length === 0 ? (
        <Note kind="info">Crea primero una cuenta.</Note>
      ) : (
        <>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="transaction-account">Cuenta</label>
              <select id="transaction-account" value={accountId} onChange={(event) => {
                setAccountId(event.target.value)
                const account = store.accounts.find((item) => item.id === event.target.value)
                if (account !== undefined) setTxCurrency(account.defaultCurrency)
              }}>
                <option value="">— Selecciona —</option>
                {store.accounts.map((account) => <option key={account.id} value={account.id}>{account.brokerName} · {account.accountLabel}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="transaction-asset">Activo</label>
              <select id="transaction-asset" value={assetChoice} onChange={(event) => setAssetChoice(event.target.value)}>
                <option value="">— Selecciona —</option>
                {store.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}
                <option value="_new">+ Crear activo…</option>
              </select>
            </div>
          </div>

          {assetChoice === '_new' && (
            <div className="new-asset-panel">
              <AssetSearch onPick={(match) => {
                setNewSymbol(match.symbol)
                setNewName(match.name)
                setNewType(match.assetType)
                setNewExchange(match.exchange ?? '')
                if (match.quoteCurrency !== null) setNewQuoteCurrency(match.quoteCurrency)
                setPickedProviderIds(match.providerIds)
              }} />
              <div className="grid-2">
                <div className="field"><label htmlFor="new-symbol">Símbolo</label><input id="new-symbol" value={newSymbol} onChange={(event) => setNewSymbol(event.target.value)} /></div>
                <div className="field"><label htmlFor="new-name">Nombre</label><input id="new-name" value={newName} onChange={(event) => setNewName(event.target.value)} /></div>
                <div className="field">
                  <label htmlFor="new-type">Tipo</label>
                  <select id="new-type" value={newType} onChange={(event) => setNewType(event.target.value as AssetType)}>
                    {ASSET_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <Segmented<Currency>
                  label="Divisa de cotización"
                  value={newQuoteCurrency}
                  onChange={setNewQuoteCurrency}
                  options={[{ value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }]}
                />
                <div className="field"><label htmlFor="new-sector">Sector</label><input id="new-sector" value={newSector} onChange={(event) => setNewSector(event.target.value)} /></div>
                <div className="field"><label htmlFor="new-country">País</label><input id="new-country" value={newCountry} onChange={(event) => setNewCountry(event.target.value)} /></div>
                <div className="field"><label htmlFor="new-exchange">Mercado</label><input id="new-exchange" value={newExchange} onChange={(event) => setNewExchange(event.target.value)} /></div>
                <NumberField label="Precio actual manual" value={newManualPrice} onChange={setNewManualPrice} suffix={newQuoteCurrency} />
              </div>
            </div>
          )}

          <div className="transaction-builder">
            <div className="grid-2">
              <Segmented<'buy' | 'sell'>
                label="Movimiento"
                value={txType}
                onChange={setTxType}
                options={[{ value: 'buy', label: 'Compra' }, { value: 'sell', label: 'Venta' }]}
              />
              <div className="field">
                <label htmlFor="transaction-date">Fecha y hora</label>
                <input id="transaction-date" type="datetime-local" value={datetime} onChange={(event) => setDatetime(event.target.value)} />
              </div>
              <NumberField label={txType === 'buy' ? 'Importe invertido' : 'Importe obtenido'} value={amountRaw} onChange={setAmountRaw} suffix={txCurrency} />
              <Segmented<Currency>
                label="Divisa"
                value={txCurrency}
                onChange={setTxCurrency}
                options={[{ value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }]}
              />
              <NumberField label="Unidades" value={qtyRaw} onChange={setQtyRaw} />
              <NumberField label="Precio por unidad" value={priceRaw} onChange={setPriceRaw} suffix={txCurrency} />
            </div>

            {discrepancy !== null && (
              <Note kind="warning">
                Importe y cantidad × precio difieren un {formatPct(discrepancy.difference)}.
                <div className="row mt-2">
                  <button type="button" className="btn small" onClick={() => setQtyRaw(discrepancy.entered.div(price!).toDP(10).toString())}>Mantener importe</button>
                  <button type="button" className="btn small" onClick={() => setAmountRaw(discrepancy.implied.toString())}>Mantener cantidad</button>
                </div>
              </Note>
            )}

            <div className="grid-2">
              <div className="field">
                <label htmlFor="transaction-source">Origen del dato</label>
                <select id="transaction-source" value={sourceType} onChange={(event) => {
                  const source = event.target.value as TransactionSource
                  setSourceType(source)
                  setConfidence(source === 'exact' ? 'exact' : 'medium')
                }}>
                  <option value="exact">Lo conozco exactamente</option>
                  <option value="historical_estimate">Estimar con cierre histórico</option>
                  <option value="return_estimate">Estimado desde una rentabilidad</option>
                </select>
              </div>
              <Segmented<'auto' | 'manual' | 'none'>
                label="Comisión"
                value={feeMode}
                onChange={setFeeMode}
                options={[{ value: 'auto', label: 'Automática' }, { value: 'manual', label: 'Manual' }, { value: 'none', label: 'Ninguna' }]}
              />
            </div>

            {sourceType === 'historical_estimate' && (
              <div className="inline-action">
                <div>
                  <strong>Precio histórico diario</strong>
                  <span className="muted tiny block">Carga el cierre y señala el rango; no inventa la hora de ejecución.</span>
                </div>
                <button type="button" className="btn" disabled={historicalBusy} onClick={() => void lookupHistorical()}>
                  {historicalBusy ? 'Consultando…' : 'Buscar precio de esa fecha'}
                </button>
              </div>
            )}
            {sourceType !== 'exact' && (
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="transaction-confidence">Confianza</label>
                  <select id="transaction-confidence" value={confidence} onChange={(event) => setConfidence(event.target.value as Confidence)}>
                    <option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="transaction-notes">Notas</label>
                  <textarea id="transaction-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              </div>
            )}
            {feeMode === 'manual' && <NumberField label="Comisión pagada" value={manualFeeRaw} onChange={setManualFeeRaw} suffix={txCurrency} />}
            {feeMode === 'auto' && amount !== null && (
              <div className="fee-preview">
                <span className="muted">Comisión estimada</span>
                <strong>
                  {feeEstimate === null
                    ? 'Requiere entrada manual por divisa'
                    : `${formatMoney(feeEstimate.amount, feeEstimate.currency)} · ${feeEstimate.explanation}`}
                </strong>
              </div>
            )}

            <div className="row">
              <button type="button" className="btn primary" onClick={submit} disabled={accountId === '' || assetChoice === '' || !canDerive}>
                Guardar operación
              </button>
              {message !== null && <span className="muted">{message}</span>}
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

function AssetSearch(props: { onPick: (match: AssetMatch) => void; expectedType?: AssetType }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AssetMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      setResults(await searchAssets(query.trim(), props.expectedType ?? null))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Búsqueda no disponible')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="asset-search">
      <label htmlFor="asset-search-input">Buscar activo</label>
      <div className="search-box">
        <span aria-hidden="true">⌕</span>
        <input
          id="asset-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && query.trim()) void run()
          }}
          placeholder="Apple, bitcoin, IWDA…"
        />
        <button type="button" className="btn small" onClick={() => void run()} disabled={busy || !query.trim()}>
          {busy ? '…' : 'Buscar'}
        </button>
      </div>
      {error !== null && <p className="negative tiny">{error}. Puedes introducirlo manualmente.</p>}
      {results !== null && (
        <div className="search-results">
          {results.slice(0, 6).map((match) => (
            <button
              type="button"
              key={`${match.provider}-${match.providerIds[match.provider] ?? match.symbol}`}
              onClick={() => props.onPick(match)}
            >
              <strong>{match.symbol}</strong>
              <span>{match.name}</span>
              <small>{match.provider}</small>
            </button>
          ))}
          {results.length === 0 && <span className="muted tiny">Sin resultados. Usa entrada manual.</span>}
        </div>
      )}
    </div>
  )
}

function TransactionsSection() {
  const transactions = useAppStore((state) => state.transactions)
  const assets = useAppStore((state) => state.assets)
  const accounts = useAppStore((state) => state.accounts)
  const removeTransaction = useAppStore((state) => state.removeTransaction)
  if (transactions.length === 0) return null

  return (
    <Card title="Historial de operaciones">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Fecha</th><th>Activo</th><th>Movimiento</th><th>Importe</th><th>Comisión</th><th>Unidades</th><th>Calidad</th><th /></tr>
          </thead>
          <tbody>
            {[...transactions].sort((a, b) => b.datetime.localeCompare(a.datetime)).map((transaction) => {
              const asset = assets.find((item) => item.id === transaction.assetId)
              const account = accounts.find((item) => item.id === transaction.accountId)
              return (
                <tr key={transaction.id}>
                  <td>{formatDateTime(transaction.datetime)}</td>
                  <td><strong>{asset?.symbol ?? '?'}</strong><span className="muted tiny block">{account?.brokerName}</span></td>
                  <td>{transaction.type === 'buy' ? 'Compra' : 'Venta'}</td>
                  <td>{formatMoney(transaction.investedAmount, transaction.investedCurrency)}</td>
                  <td>{transaction.fee === null ? '—' : formatMoney(transaction.fee, transaction.feeCurrency ?? transaction.investedCurrency)}</td>
                  <td>{formatQty(transaction.quantity)}</td>
                  <td>
                    <QualityChip
                      quality={transaction.sourceType === 'exact' ? 'real' : 'estimated'}
                      detail={transaction.estimationNotes}
                    />
                    {transaction.costKnown === false && <span className="negative tiny block">Coste pendiente</span>}
                  </td>
                  <td>
                    <button type="button" className="btn small danger" onClick={() => {
                      if (window.confirm('¿Eliminar esta operación?')) removeTransaction(transaction.id)
                    }}>Eliminar</button>
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
