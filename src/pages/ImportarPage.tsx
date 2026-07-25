import { useMemo, useState } from 'react'
import { Card, Note, QualityChip, SectionHeader } from '../components/ui'
import { buildImportProposal, type ImportProposal } from '../lib/import/convert'
import {
  EXAMPLE_VALID_JSON,
  EXTRACTION_PROMPT,
  validateImportJson,
  type ImportValidation,
} from '../lib/import/schema'
import { formatDateTime, formatMoney, formatQty } from '../lib/format'
import { dec } from '../lib/finance/decimal'
import { useAppStore } from '../state/store'

export function ImportarPage() {
  const store = useAppStore()
  const [raw, setRaw] = useState('')
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  const accounts = store.accounts
  const assets = store.assets

  const preview = useMemo(() => {
    if (proposal === null) return null
    return {
      accountsCount: proposal.newAccounts.length,
      assetsCount: proposal.newAssets.length,
      txCount: proposal.transactions.length,
    }
  }, [proposal])

  function validate() {
    setConfirmed(false)
    setProposal(null)
    try {
      const v = validateImportJson(raw)
      setValidation(v)
      if (v.ok && v.payload !== null) {
        // La construcción de la propuesta puede toparse con datos raros del
        // JSON; si algo falla, se muestra como error en vez de dejar el botón
        // sin respuesta.
        setProposal(buildImportProposal(v.payload, accounts, assets))
      }
    } catch (e) {
      setProposal(null)
      setValidation({
        ok: false,
        payload: null,
        errors: [
          `No se pudo procesar el JSON (${e instanceof Error ? e.message : String(e)}). Revisa que los importes, cantidades y precios sean números válidos.`,
        ],
        warnings: [],
      })
    }
  }

  function confirm() {
    if (proposal === null) return
    for (const account of proposal.newAccounts) store.addAccount(account)
    for (const asset of proposal.newAssets) store.addAsset(asset)
    store.addTransactions(proposal.transactions)
    setConfirmed(true)
    setProposal(null)
    setValidation(null)
    setRaw('')
  }

  return (
    <>
      <SectionHeader num="07" title="Importar" />
      <p className="muted">
        Usa un asistente de IA externo para convertir capturas de tus aplicaciones de inversión en
        un JSON que esta página valida e importa. Nada se guarda hasta que confirmes la
        previsualización.
      </p>

      <Card title="1 · Copia este prompt en tu asistente de IA">
        <Note kind="warning">
          <strong>Antes de adjuntar capturas:</strong> oculta o recorta nombres, emails, números de
          cuenta, documentos, códigos QR y cualquier dato personal innecesario. Solo se necesitan
          los datos de las posiciones y operaciones.
        </Note>
        <details className="disclose">
          <summary>Ver el prompt completo</summary>
          <div className="disclose-body">
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem' }}>{EXTRACTION_PROMPT}</pre>
          </div>
        </details>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              void navigator.clipboard.writeText(EXTRACTION_PROMPT).then(() => setCopied(true))
            }}
          >
            Copiar prompt
          </button>
          {copied && <span className="muted">Copiado.</span>}
          <button type="button" className="btn small" onClick={() => setRaw(EXAMPLE_VALID_JSON)}>
            Probar con un JSON de ejemplo
          </button>
        </div>
      </Card>

      <Card title="2 · Pega aquí el JSON que te devuelva">
        <div className="field">
          <label htmlFor="import-json">JSON de importación</label>
          <span className="hint">
            El asistente debe devolver solo JSON (esquema v1). Límite: 200 kB / 500 operaciones.
          </span>
          <textarea
            id="import-json"
            rows={10}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
          />
        </div>
        <button type="button" className="btn primary" onClick={validate} disabled={raw.trim() === ''}>
          Validar y previsualizar
        </button>
      </Card>

      {validation !== null && !validation.ok && (
        <Card title="El JSON no es válido">
          <Note kind="negative">
            <strong>No se ha importado nada.</strong> Corrige estos errores y vuelve a validar:
            <ul style={{ margin: '4px 0 0 18px' }}>
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Note>
        </Card>
      )}

      {validation !== null && validation.ok && proposal !== null && preview !== null && (
        <Card highlight title="3 · Previsualización — nada se ha guardado todavía">
          {validation.warnings.length > 0 && (
            <Note kind="warning">
              <strong>Revisa estos avisos del validador:</strong>
              <ul style={{ margin: '4px 0 0 18px' }}>
                {validation.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Note>
          )}
          {proposal.notes.length > 0 && (
            <Note kind="info">
              <strong>Datos inferidos o descartados:</strong>
              <ul style={{ margin: '4px 0 0 18px' }}>
                {proposal.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Note>
          )}
          <p>
            Se crearán <strong>{preview.accountsCount}</strong> cuentas nuevas,{' '}
            <strong>{preview.assetsCount}</strong> activos nuevos y{' '}
            <strong>{preview.txCount}</strong> operaciones (todas marcadas como «importadas»):
          </p>
          {proposal.transactions.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Activo</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Importe</th>
                    <th scope="col">Unidades</th>
                    <th scope="col">Confianza</th>
                    <th scope="col">Evidencia</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.transactions.map((t) => {
                    const asset =
                      proposal.newAssets.find((a) => a.id === t.assetId) ??
                      assets.find((a) => a.id === t.assetId)
                    return (
                      <tr key={t.id}>
                        <td>{formatDateTime(t.datetime)}</td>
                        <td>{asset?.symbol ?? '?'}</td>
                        <td>{t.type === 'buy' ? 'Compra' : 'Venta'}</td>
                        <td>{formatMoney(dec(t.investedAmount), t.investedCurrency)}</td>
                        <td>{formatQty(dec(t.quantity))}</td>
                        <td>
                          <QualityChip quality="estimated" detail={`Confianza ${t.confidence}`} />{' '}
                          {t.confidence}
                        </td>
                        <td style={{ maxWidth: 220, whiteSpace: 'normal', fontSize: '0.75rem' }}>
                          {t.estimationNotes}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="row">
            <button type="button" className="btn primary" onClick={confirm}>
              Confirmar importación
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setProposal(null)
                setValidation(null)
              }}
            >
              Descartar
            </button>
          </div>
        </Card>
      )}

      {confirmed && (
        <Note kind="info">
          Importación confirmada. Revisa las posiciones en <strong>Portfolio</strong>; las
          operaciones importadas quedan marcadas como estimadas con su evidencia.
        </Note>
      )}
    </>
  )
}
