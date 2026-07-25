import { useMemo, useState } from 'react'
import { Card, Note, QualityChip, SectionHeader, Segmented } from '../components/ui'
import { buildImportProposal, type ImportProposal } from '../lib/import/convert'
import {
  buildPortfolioUpdatePrompt,
  EXAMPLE_VALID_JSON,
  EXTRACTION_PROMPT,
  validateImportJson,
  type ImportValidation,
} from '../lib/import/schema'
import { formatDateTime, formatMoney, formatQty } from '../lib/format'
import { dec } from '../lib/finance/decimal'
import { useAppStore } from '../state/store'

type ImportMode = 'create' | 'update'

export function ImportarPage() {
  const store = useAppStore()
  const [mode, setMode] = useState<ImportMode>('create')
  const [raw, setRaw] = useState('')
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  const updatePrompt = useMemo(
    () =>
      buildPortfolioUpdatePrompt({
        accounts: store.accounts.map((account) => ({
          broker: account.brokerName,
          label: account.accountLabel,
        })),
        assets: store.assets.map((asset) => ({
          symbol: asset.symbol,
          name: asset.name,
          ...(asset.exchange !== undefined ? { exchange: asset.exchange } : {}),
          accounts: store.transactions
            .filter((transaction) => transaction.assetId === asset.id)
            .map(
              (transaction) =>
                store.accounts.find((account) => account.id === transaction.accountId)?.brokerName ??
                'Cuenta desconocida',
            )
            .filter((value, index, all) => all.indexOf(value) === index),
        })),
      }),
    [store.accounts, store.assets, store.transactions],
  )
  const prompt = mode === 'create' ? EXTRACTION_PROMPT : updatePrompt

  function resetResult() {
    setValidation(null)
    setProposal(null)
    setConfirmed(false)
  }

  function validate() {
    resetResult()
    try {
      const result = validateImportJson(raw)
      setValidation(result)
      if (result.ok && result.payload !== null) {
        setProposal(
          buildImportProposal(
            result.payload,
            store.accounts,
            store.assets,
            store.transactions,
          ),
        )
      }
    } catch (error) {
      setValidation({
        ok: false,
        payload: null,
        errors: [
          `No se pudo procesar el JSON (${error instanceof Error ? error.message : String(error)}).`,
        ],
        warnings: [],
      })
    }
  }

  function confirm() {
    if (proposal === null) return
    for (const account of proposal.newAccounts) store.addAccount(account)
    for (const asset of proposal.newAssets) store.addAsset(asset)
    for (const update of proposal.assetUpdates) store.updateAsset(update.id, update.patch)
    store.addTransactions(proposal.transactions)
    setConfirmed(true)
    setProposal(null)
    setValidation(null)
    setRaw('')
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Asistente de cartera</span>
          <SectionHeader num="07" title="Importar" />
          <p className="muted">
            Las imágenes se procesan en el asistente que elijas; aquí solo entra el JSON que tú
            revisas y confirmas.
          </p>
        </div>
      </div>

      <Segmented<ImportMode>
        label="¿Qué quieres hacer?"
        value={mode}
        onChange={(next) => {
          setMode(next)
          setCopied(false)
          resetResult()
        }}
        options={[
          { value: 'create', label: 'Crear cartera desde capturas' },
          { value: 'update', label: 'Actualizar una cartera existente' },
        ]}
      />

      <div className="workflow-steps" aria-label="Proceso de importación">
        <div className="workflow-step active"><span>1</span> Copia el prompt</div>
        <div className="workflow-step"><span>2</span> Pide el JSON a una IA</div>
        <div className="workflow-step"><span>3</span> Revisa y confirma</div>
      </div>

      <Card
        title={
          mode === 'create'
            ? 'Prompt para leer tus capturas'
            : 'Prompt para convertir cambios en operaciones'
        }
      >
        <div className="feature-callout">
          <div className="feature-callout-icon" aria-hidden="true">
            {mode === 'create' ? '▧' : '↻'}
          </div>
          <div>
            <strong>
              {mode === 'create'
                ? 'Adjunta capturas de Revolut, Bitget u otras apps'
                : 'Escribe “vendí 100 € de BTC a 65.000” o adjunta una captura nueva'}
            </strong>
            <p className="muted mb-0">
              El prompt obliga a la IA a dejar en blanco lo que no vea y a no duplicar tu cartera
              actual.
            </p>
          </div>
        </div>
        <Note kind="warning">
          Oculta nombres, emails, números de cuenta, documentos y códigos QR antes de enviar
          imágenes a cualquier IA.
        </Note>
        <details className="math">
          <summary>Ver el prompt completo</summary>
          <div className="math-body">
            <pre className="prompt-preview">{prompt}</pre>
          </div>
        </details>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              void navigator.clipboard.writeText(prompt).then(() => setCopied(true))
            }}
          >
            {copied ? '✓ Prompt copiado' : 'Copiar prompt'}
          </button>
          {mode === 'create' && (
            <button type="button" className="btn small" onClick={() => setRaw(EXAMPLE_VALID_JSON)}>
              Cargar un ejemplo
            </button>
          )}
        </div>
      </Card>

      <Card title="Pega el JSON">
        <div className="field">
          <label htmlFor="import-json">Respuesta de la IA</label>
          <span className="hint">
            Se aceptan vallas de código y texto alrededor; el validador extrae el objeto JSON.
          </span>
          <textarea
            id="import-json"
            rows={11}
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value)
              resetResult()
            }}
            spellCheck={false}
            className="json-input"
            placeholder='{"schema_version": 1, ...}'
          />
        </div>
        <button type="button" className="btn primary" onClick={validate} disabled={raw.trim() === ''}>
          Validar y previsualizar
        </button>
      </Card>

      {validation !== null && !validation.ok && (
        <Card title="Necesita correcciones">
          <Note kind="negative">
            <strong>No se ha guardado nada.</strong>
            <ul>
              {validation.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </Note>
        </Card>
      )}

      {validation?.ok === true && proposal !== null && (
        <Card highlight title="Previsualización">
          <div className="preview-kpis">
            <div><strong>{proposal.newAccounts.length}</strong><span>Cuentas nuevas</span></div>
            <div><strong>{proposal.newAssets.length}</strong><span>Activos nuevos</span></div>
            <div><strong>{proposal.assetUpdates.length}</strong><span>Activos actualizados</span></div>
            <div><strong>{proposal.transactions.length}</strong><span>Operaciones</span></div>
          </div>

          {proposal.incompletePositions.length > 0 && (
            <Note kind="warning">
              <strong>Datos que necesitan completarse:</strong>
              <ul>
                {proposal.incompletePositions.map((item) => (
                  <li key={`${item.label}-${item.reason}`}>
                    <strong>{item.label}:</strong> {item.reason}
                  </li>
                ))}
              </ul>
            </Note>
          )}
          {validation.warnings.length > 0 && (
            <Note kind="warning">
              <strong>Avisos del validador:</strong>
              <ul>{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </Note>
          )}
          {proposal.notes.length > 0 && (
            <details className="math">
              <summary>Ver decisiones e inferencias ({proposal.notes.length})</summary>
              <div className="math-body">
                <ul>{proposal.notes.map((note) => <li key={note}>{note}</li>)}</ul>
              </div>
            </details>
          )}

          {proposal.transactions.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Activo</th>
                    <th>Movimiento</th>
                    <th>Importe</th>
                    <th>Unidades</th>
                    <th>Coste conocido</th>
                    <th>Confianza</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.transactions.map((transaction) => {
                    const asset =
                      proposal.newAssets.find((item) => item.id === transaction.assetId) ??
                      store.assets.find((item) => item.id === transaction.assetId)
                    return (
                      <tr key={transaction.id}>
                        <td>{formatDateTime(transaction.datetime)}</td>
                        <td><strong>{asset?.symbol ?? '?'}</strong></td>
                        <td>{transaction.type === 'buy' ? 'Compra' : 'Venta'}</td>
                        <td>{formatMoney(dec(transaction.investedAmount), transaction.investedCurrency)}</td>
                        <td>{formatQty(dec(transaction.quantity))}</td>
                        <td>{transaction.costKnown === false ? 'No — P&L bloqueado' : 'Sí'}</td>
                        <td>
                          <QualityChip
                            quality="estimated"
                            detail={`Confianza ${transaction.confidence}`}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={confirm}
              disabled={
                proposal.newAccounts.length === 0 &&
                proposal.newAssets.length === 0 &&
                proposal.assetUpdates.length === 0 &&
                proposal.transactions.length === 0
              }
            >
              Confirmar cambios
            </button>
            <button type="button" className="btn" onClick={resetResult}>
              Descartar
            </button>
          </div>
        </Card>
      )}

      {confirmed && (
        <Note kind="info">
          Cambios aplicados. Las posiciones con coste desconocido se muestran sin rentabilidad
          hasta que completes ese dato; nunca se asume una ganancia del 0 %.
        </Note>
      )}
    </>
  )
}
