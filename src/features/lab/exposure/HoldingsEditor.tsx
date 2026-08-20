/**
 * Editor de composición de un fondo (LAB-404b).
 *
 * Deja escribir a mano lo que lleva dentro un ETF. Existe porque es la única
 * vía **legal y gratuita** para los UCITS europeos: los emisores publican sus
 * posiciones pero prohíben redistribuirlas, así que la aplicación no puede
 * traerlas por ti; tú sí puedes consultarlas y anotarlas.
 *
 * No hace falta meter las 1.400 posiciones de un índice mundial. Con las diez o
 * quince mayores se ve el solapamiento, que es lo que casi nadie tiene delante.
 * Y la cobertura declarada dirá honestamente qué parte del fondo es esa.
 */
import { useId, useState } from 'react'
import { Card, Note } from '../../../components/ui'
import type { Asset, AssetHolding } from '../../../lib/domain'
import { useAppStore } from '../../../state/store'
import { TableWrap } from '../../../components/TableWrap'

export interface HoldingsEditorProps {
  readonly asset: Asset
}

/** Peso válido: un porcentaje entre 0 (exclusive) y 100. */
function pesoValido(texto: string): number | null {
  if (!/^\d+([.,]\d+)?$/.test(texto)) return null
  const valor = Number(texto.replace(',', '.'))
  return valor > 0 && valor <= 100 ? valor : null
}

export function HoldingsEditor(props: HoldingsEditorProps) {
  const idBase = useId()
  const updateAsset = useAppStore((s) => s.updateAsset)

  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [peso, setPeso] = useState('')
  const [error, setError] = useState<string | null>(null)

  const holdings = props.asset.holdings ?? []
  const cubierto = holdings.reduce((suma, h) => suma + (Number(h.weight) || 0), 0)

  function anadir() {
    const simbolo = symbol.trim().toUpperCase()
    if (simbolo === '') {
      setError('Escribe el símbolo de la posición.')
      return
    }
    const porcentaje = pesoValido(peso)
    if (porcentaje === null) {
      setError('El peso debe ser un porcentaje mayor que cero y como mucho 100.')
      return
    }
    if (holdings.some((h) => h.symbol.toUpperCase() === simbolo)) {
      setError(`«${simbolo}» ya está en la lista. Quítalo antes si quieres cambiar su peso.`)
      return
    }

    // Se pregunta en porcentaje y se guarda en fracción, igual que en el resto
    // de la aplicación: mezclar las dos escalas es el error clásico aquí.
    const nueva: AssetHolding = {
      symbol: simbolo,
      ...(name.trim() === '' ? {} : { name: name.trim() }),
      weight: String(porcentaje / 100),
    }

    setError(null)
    updateAsset(props.asset.id, { holdings: [...holdings, nueva] })
    setSymbol('')
    setName('')
    setPeso('')
  }

  function quitar(simbolo: string) {
    updateAsset(props.asset.id, {
      holdings: holdings.filter((h) => h.symbol !== simbolo),
    })
  }

  return (
    <Card
      title={`Qué lleva dentro ${props.asset.symbol}`}
      sub={props.asset.name}
    >
      {holdings.length === 0 ? (
        <Note>
          Todavía no has declarado nada. Busca las mayores posiciones de este fondo en la web de
          su emisor y anótalas aquí: con las diez o quince primeras ya se ve el solapamiento.
        </Note>
      ) : (
        <>
          <TableWrap>
            <table className="data" aria-label={`Posiciones declaradas de ${props.asset.symbol}`}>
              <thead>
                <tr>
                  <th scope="col">Posición</th>
                  <th scope="col">Peso</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => (
                  <tr key={holding.symbol}>
                    <td>
                      <strong>{holding.symbol}</strong>
                      {holding.name !== undefined && <div className="meta">{holding.name}</div>}
                    </td>
                    <td className="num">
                      {(Number(holding.weight) * 100).toFixed(2).replace('.', ',')} %
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => quitar(holding.symbol)}
                      >
                        Quitar {holding.symbol}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="muted tiny">
            Llevas declarado el <strong>{(cubierto * 100).toFixed(1).replace('.', ',')} %</strong>{' '}
            del fondo. El resto se contará como no mirado: no se reparte a ojo entre lo que sí has
            puesto.
          </p>
        </>
      )}

      <fieldset className="ips-fieldset">
        <legend>Añadir una posición</legend>
        <div className="ips-campos">
          <div className="field">
            <label htmlFor={`${idBase}-symbol`}>Símbolo</label>
            <input
              id={`${idBase}-symbol`}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor={`${idBase}-name`}>Nombre (opcional)</label>
            <input
              id={`${idBase}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Apple Inc."
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor={`${idBase}-peso`}>Peso en el fondo</label>
            <div className="input-suffix">
              <input
                id={`${idBase}-peso`}
                inputMode="decimal"
                autoComplete="off"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
              />
              <span className="suffix">%</span>
            </div>
          </div>
        </div>

        <button type="button" className="btn primary" onClick={anadir}>
          Añadir posición
        </button>

        {error !== null && (
          <span className="error" role="alert">
            {error}
          </span>
        )}
      </fieldset>

      <Note>
        Estos datos son tuyos y se quedan en este dispositivo. La aplicación no los descarga de
        ningún proveedor porque los emisores no permiten redistribuir sus posiciones.
      </Note>
    </Card>
  )
}
