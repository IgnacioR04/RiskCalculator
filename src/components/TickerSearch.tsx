import { useState } from 'react'
import type { Currency } from '../lib/domain'
import { getQuoteForMatch, searchAssets } from '../lib/market/service'
import type { AssetMatch } from '../lib/market/provider'
import { formatMoney } from '../lib/format'
import { Note } from './ui'

/**
 * Buscador de instrumento con lupa. Al elegir un resultado intenta traer el
 * precio actual (cripto en vivo por CoinGecko; acciones/ETF si hay proxy).
 * Si no hay proveedor o falla, avisa y deja meter el precio a mano.
 */
export function TickerSearch(props: {
  currency: Currency
  onPrice: (price: string, source: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AssetMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'info' | 'warning'; text: string } | null>(null)

  async function run() {
    setBusy(true)
    setMessage(null)
    setResults(null)
    try {
      const r = await searchAssets(query.trim())
      setResults(r)
      if (r.length === 0) {
        setMessage({
          kind: 'warning',
          text: `No se encontró «${query.trim()}». Escribe el precio a mano más abajo.`,
        })
      }
    } catch (e) {
      setMessage({
        kind: 'warning',
        text: `Búsqueda no disponible (${e instanceof Error ? e.message : 'error'}). Introduce el precio a mano.`,
      })
    } finally {
      setBusy(false)
    }
  }

  async function pick(match: AssetMatch) {
    const id = match.providerIds[match.provider] ?? match.symbol
    setLoadingId(id)
    setMessage(null)
    try {
      const q = await getQuoteForMatch(match, props.currency)
      if (q.ok) {
        props.onPrice(q.quote.price, `${match.symbol} · ${q.quote.provider}`)
        setMessage({
          kind: 'info',
          text: `${match.symbol}: ${formatMoney(q.quote.price, q.quote.currency)} (${q.quote.provider}). Precio actual cargado; ajústalo si quieres.`,
        })
        setResults(null)
        setQuery('')
      } else {
        setMessage({ kind: 'warning', text: q.message })
      }
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="field">
      <label htmlFor="ticker-search">Buscar activo (opcional)</label>
      <span className="hint">
        Escribe un nombre o símbolo (ej.: bitcoin, ethereum, apple) y coge su precio de hoy. Cripto
        funciona en vivo; acciones/ETF necesitan el proveedor con clave.
      </span>
      <div className="input-search">
        <span className="input-search-icon" aria-hidden="true">
          🔍
        </span>
        <input
          id="ticker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (query.trim() !== '') void run()
            }
          }}
          placeholder="Ej.: bitcoin"
        />
        <button
          type="button"
          className="btn small"
          disabled={busy || query.trim() === ''}
          onClick={() => void run()}
        >
          {busy ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {message !== null && <Note kind={message.kind}>{message.text}</Note>}

      {results !== null && results.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 'var(--space-2)' }}>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Símbolo</th>
                <th scope="col">Nombre</th>
                <th scope="col">Tipo</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 8).map((m) => {
                const id = m.providerIds[m.provider] ?? m.symbol
                return (
                  <tr key={`${m.provider}-${id}`}>
                    <td>{m.symbol}</td>
                    <td style={{ whiteSpace: 'normal' }}>{m.name}</td>
                    <td>{m.assetType}</td>
                    <td>
                      <button
                        type="button"
                        className="btn small"
                        disabled={loadingId !== null}
                        onClick={() => void pick(m)}
                      >
                        {loadingId === id ? 'Cargando…' : 'Usar precio'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
