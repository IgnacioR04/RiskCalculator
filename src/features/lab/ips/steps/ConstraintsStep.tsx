/**
 * Paso 7 del asistente: restricciones de cartera (LAB-209).
 *
 * Una restricción es un límite que el usuario se pone a sí mismo, no una
 * recomendación de la herramienta. Aquí solo se recogen y se comprueba que no se
 * contradigan entre sí; nada se optimiza y nada se sugiere.
 *
 * Los pesos se **preguntan en porcentaje y se guardan en fracción**. Confundir
 * las dos escalas es un error de dos órdenes de magnitud que no se nota hasta
 * que ha producido un resultado absurdo, así que la conversión ocurre en un solo
 * sitio y va comentada.
 */
import { useId, useState } from 'react'
import { Card, Note } from '../../../../components/ui'
import type {
  ExposureDimension,
  PortfolioConstraint,
} from '../../../../lib/lab/domain/investmentPolicy'
import { findConstraintIssues } from '../../../../lib/lab/analytics/constraintConsistency'
import { useAppStore } from '../../../../state/store'

export interface ConstraintsStepProps {
  readonly constraints: readonly PortfolioConstraint[]
  readonly onChange: (constraints: readonly PortfolioConstraint[]) => void
}

/** Tipos que el asistente sabe editar hoy. El contrato admite más. */
type TipoEditable = 'groupWeight' | 'assetWeight' | 'liquidity' | 'turnover' | 'contributionsOnly'

const TIPOS: readonly { value: TipoEditable; label: string; ayuda: string }[] = [
  {
    value: 'groupWeight',
    label: 'Límite por grupo',
    ayuda: 'Cuánto como mucho, o como poco, en un sector, una región o una divisa.',
  },
  {
    value: 'assetWeight',
    label: 'Límite por activo',
    ayuda: 'Cuánto como mucho en una posición concreta.',
  },
  {
    value: 'liquidity',
    label: 'Liquidez mínima',
    ayuda: 'Parte de la cartera que quieres poder vender en cualquier momento.',
  },
  {
    value: 'turnover',
    label: 'Rotación máxima',
    ayuda: 'Cuánto de la cartera aceptas mover en una reestructuración.',
  },
  {
    value: 'contributionsOnly',
    label: 'Solo con aportaciones',
    ayuda: 'Ajustar la cartera con dinero nuevo, sin vender lo que ya tienes.',
  },
]

const DIMENSIONES: readonly { value: ExposureDimension; label: string }[] = [
  { value: 'sector', label: 'Sector' },
  { value: 'region', label: 'Región' },
  { value: 'currency', label: 'Divisa' },
  { value: 'assetType', label: 'Tipo de activo' },
  { value: 'issuer', label: 'Emisor' },
]

export function ConstraintsStep(props: ConstraintsStepProps) {
  const idBase = useId()
  const activos = useAppStore((s) => s.assets)

  const [tipo, setTipo] = useState<TipoEditable>('groupWeight')
  const [dimension, setDimension] = useState<ExposureDimension>('sector')
  const [clave, setClave] = useState('')
  const [instrumento, setInstrumento] = useState('')
  const [minimo, setMinimo] = useState('')
  const [maximo, setMaximo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const issues = findConstraintIssues(props.constraints)

  function anadir() {
    const nueva = construir()
    if (typeof nueva === 'string') {
      setError(nueva)
      return
    }
    setError(null)
    props.onChange([...props.constraints, nueva])
    setClave('')
    setInstrumento('')
    setMinimo('')
    setMaximo('')
  }

  /** Devuelve la restricción, o el motivo por el que todavía no puede montarse. */
  function construir(): PortfolioConstraint | string {
    const min = fraccion(minimo)
    const max = fraccion(maximo)
    if (minimo !== '' && min === undefined) return 'El mínimo debe ser un porcentaje entre 0 y 100.'
    if (maximo !== '' && max === undefined) return 'El máximo debe ser un porcentaje entre 0 y 100.'

    if (tipo === 'groupWeight') {
      if (clave.trim() === '') return 'Escribe a qué grupo se aplica el límite.'
      if (min === undefined && max === undefined) return 'Pon al menos un mínimo o un máximo.'
      return {
        kind: 'groupWeight',
        dimension,
        key: clave.trim(),
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      }
    }

    if (tipo === 'assetWeight') {
      if (instrumento === '') return 'Elige el activo al que se aplica el límite.'
      if (min === undefined && max === undefined) return 'Pon al menos un mínimo o un máximo.'
      return {
        kind: 'assetWeight',
        instrumentId: instrumento,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      }
    }

    if (tipo === 'liquidity') {
      if (min === undefined) return 'Indica qué parte de la cartera quieres líquida.'
      return { kind: 'liquidity', minimumLiquidWeight: min }
    }

    if (tipo === 'turnover') {
      if (max === undefined) return 'Indica la rotación máxima que aceptas.'
      return { kind: 'turnover', max }
    }

    return { kind: 'contributionsOnly', enabled: true }
  }

  const tipoActual = TIPOS.find((t) => t.value === tipo)

  return (
    <div className="ips-step">
      <p className="muted">
        Límites que quieres que cualquier cartera respete. Son tuyos: aquí no se propone ninguno.
        Lo único que se comprueba es que no se contradigan entre sí.
      </p>

      {props.constraints.length === 0 ? (
        <Note>
          No has puesto ninguna restricción. Es una opción legítima y no impide activar la
          política.
        </Note>
      ) : (
        <ul className="ips-restricciones">
          {props.constraints.map((restriccion, indice) => {
            const suyos = issues.filter((issue) => issue.indices.includes(indice))
            return (
              <li key={`${restriccion.kind}-${indice}`}>
                <Card variant={suyos.some((i) => i.severity === 'error') ? 'warning' : 'default'}>
                  <div className="ips-goal">
                    <div>
                      <strong>{describir(restriccion)}</strong>
                      {suyos.map((issue) => (
                        <p key={issue.code} className="error mb-0" role="alert">
                          {issue.message}
                        </p>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() =>
                        props.onChange(props.constraints.filter((_, i) => i !== indice))
                      }
                    >
                      Quitar {describir(restriccion)}
                    </button>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Card>
        <fieldset className="ips-fieldset">
          <legend>Añadir una restricción</legend>

          <div className="field">
            <label htmlFor={`${idBase}-tipo`}>Tipo de límite</label>
            <select
              id={`${idBase}-tipo`}
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoEditable)
                setError(null)
              }}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="hint">{tipoActual?.ayuda}</span>
          </div>

          {tipo === 'groupWeight' && (
            <div className="ips-campos">
              <div className="field">
                <label htmlFor={`${idBase}-dimension`}>Se agrupa por</label>
                <select
                  id={`${idBase}-dimension`}
                  value={dimension}
                  onChange={(e) => setDimension(e.target.value as ExposureDimension)}
                >
                  {DIMENSIONES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${idBase}-clave`}>Grupo concreto</label>
                <input
                  id={`${idBase}-clave`}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="tecnología"
                />
                <span className="hint">
                  Se guarda como lo escribas. La clasificación real llega más adelante.
                </span>
              </div>
            </div>
          )}

          {tipo === 'assetWeight' && (
            <div className="field">
              <label htmlFor={`${idBase}-activo`}>Activo</label>
              <select
                id={`${idBase}-activo`}
                value={instrumento}
                onChange={(e) => setInstrumento(e.target.value)}
              >
                <option value="">— Elige un activo —</option>
                {activos.map((activo) => (
                  <option key={activo.id} value={activo.id}>
                    {activo.symbol} · {activo.name}
                  </option>
                ))}
              </select>
              {activos.length === 0 && (
                <span className="hint">
                  Todavía no hay activos en tu cartera: añádelos en Cartera o carga los datos de
                  demostración.
                </span>
              )}
            </div>
          )}

          {(tipo === 'groupWeight' || tipo === 'assetWeight') && (
            <div className="ips-campos">
              <CampoPorcentaje
                id={`${idBase}-min`}
                etiqueta="Mínimo"
                valor={minimo}
                onChange={setMinimo}
              />
              <CampoPorcentaje
                id={`${idBase}-max`}
                etiqueta="Máximo"
                valor={maximo}
                onChange={setMaximo}
              />
            </div>
          )}

          {tipo === 'liquidity' && (
            <CampoPorcentaje
              id={`${idBase}-min`}
              etiqueta="Liquidez mínima"
              valor={minimo}
              onChange={setMinimo}
            />
          )}

          {tipo === 'turnover' && (
            <CampoPorcentaje
              id={`${idBase}-max`}
              etiqueta="Rotación máxima"
              valor={maximo}
              onChange={setMaximo}
            />
          )}

          <button type="button" className="btn primary" onClick={anadir}>
            Añadir restricción
          </button>

          {error !== null && (
            <span className="error" role="alert">
              {error}
            </span>
          )}
        </fieldset>
      </Card>

      {issues.length > 0 && (
        <Note kind={issues.some((i) => i.severity === 'error') ? 'negative' : 'warning'}>
          {issues.some((i) => i.severity === 'error')
            ? 'Hay límites que ninguna cartera puede cumplir a la vez. Mientras sigan así, la política no puede activarse.'
            : 'Hay límites que conviene mirar dos veces, pero no impiden activar la política.'}
        </Note>
      )}
    </div>
  )
}

function CampoPorcentaje(props: {
  readonly id: string
  readonly etiqueta: string
  readonly valor: string
  readonly onChange: (valor: string) => void
}) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.etiqueta}</label>
      <div className="input-suffix">
        <input
          id={props.id}
          inputMode="decimal"
          autoComplete="off"
          value={props.valor}
          onChange={(e) => props.onChange(e.target.value)}
        />
        <span className="suffix">%</span>
      </div>
    </div>
  )
}

/**
 * Porcentaje escrito a fracción 0–1. `undefined` si no es un porcentaje válido:
 * lo que no se entiende no se guarda como cero.
 */
function fraccion(texto: string): number | undefined {
  if (!/^\d+([.,]\d+)?$/.test(texto)) return undefined
  const valor = Number(texto.replace(',', '.'))
  if (valor < 0 || valor > 100) return undefined
  return valor / 100
}

/** Frase corta y estable para nombrar una restricción en pantalla. */
export function describir(restriccion: PortfolioConstraint): string {
  const rango = (min?: number, max?: number) => {
    if (min !== undefined && max !== undefined) return `entre ${pct(min)} y ${pct(max)}`
    if (min !== undefined) return `al menos ${pct(min)}`
    if (max !== undefined) return `como mucho ${pct(max)}`
    return 'sin límite declarado'
  }

  switch (restriccion.kind) {
    case 'groupWeight': {
      const nombre = DIMENSIONES.find((d) => d.value === restriccion.dimension)?.label ?? restriccion.dimension
      return `${nombre} «${restriccion.key}»: ${rango(restriccion.min, restriccion.max)}`
    }
    case 'assetWeight':
      return `Activo «${restriccion.instrumentId}»: ${rango(restriccion.min, restriccion.max)}`
    case 'liquidity':
      return `Liquidez mínima: ${pct(restriccion.minimumLiquidWeight)}`
    case 'turnover':
      return `Rotación máxima: ${pct(restriccion.max)}`
    case 'lockedPosition':
      return `Posición bloqueada «${restriccion.instrumentId}»${restriccion.weight === undefined ? '' : `: ${pct(restriccion.weight)}`}`
    case 'eligibleUniverse':
      return `Universo elegible: ${restriccion.instrumentIds.length} activos`
    case 'contributionsOnly':
      return 'Ajustar solo con aportaciones nuevas'
  }
}

function pct(fraccion: number): string {
  return `${Math.round(fraccion * 1000) / 10} %`
}
