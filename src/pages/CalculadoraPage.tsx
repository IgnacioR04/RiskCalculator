import { useMemo, useState } from 'react'
import { ContributionCurveChart, type CurvePoint } from '../components/charts/ContributionCurveChart'
import {
  PriceOutcomeChart,
  type PriceMarker,
  type PricePoint,
} from '../components/charts/PriceOutcomeChart'
import { Card, MathDetails, Note, NumberField, Segmented, SignedValue, Stat } from '../components/ui'
import { Decimal, dec } from '../lib/finance/decimal'
import {
  breakevenContribution,
  growthFromPrices,
  outcomeAtPrice,
  requiredGrowthToRestore,
  restoreValueContribution,
  targetPriceWithBudget,
} from '../lib/finance/recovery'
import type { Currency } from '../lib/format'
import { formatMoney, formatPct, formatQty, parseUserNumber } from '../lib/format'
import { uid } from '../lib/domain'
import { useAppStore } from '../state/store'

type Mode = 'restore' | 'breakeven'

/** Parsea un campo de usuario; '' → null sin error, inválido → error. */
function useField(initial = '') {
  const [raw, setRaw] = useState(initial)
  const parsed = useMemo(() => {
    if (raw.trim() === '') return { value: null, error: undefined } as const
    const normalized = parseUserNumber(raw)
    if (normalized === null) {
      return { value: null, error: 'Introduce un número válido (ej. 1.234,56)' } as const
    }
    return { value: dec(normalized), error: undefined } as const
  }, [raw])
  return { raw, setRaw, value: parsed.value, error: parsed.error }
}

function fieldError(
  field: { value: Decimal | null; error: string | undefined },
  check?: (v: Decimal) => string | undefined,
): string | undefined {
  if (field.error !== undefined) return field.error
  if (field.value !== null && check) return check(field.value)
  return undefined
}

const mustBePositive = (label: string) => (v: Decimal) =>
  v.lte(0) ? `${label} debe ser mayor que 0` : undefined
const mustBeNonNegative = (label: string) => (v: Decimal) =>
  v.lt(0) ? `${label} no puede ser negativo` : undefined

export function CalculadoraPage() {
  const [mode, setMode] = useState<Mode>('restore')
  const displayCurrency = useAppStore((s) => s.settings.displayCurrency)
  const [currency, setCurrency] = useState<Currency>(displayCurrency)

  return (
    <>
      <h1>Calculadora</h1>
      <p className="muted">
        Dos preguntas distintas que no conviene mezclar: volver a <em>ver</em> una cantidad en tu
        posición no es lo mismo que recuperar todo el dinero aportado.
      </p>
      <Card>
        <Segmented<Mode>
          label="¿Qué quieres calcular?"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'restore', label: 'Restaurar valor inicial' },
            { value: 'breakeven', label: 'Punto de equilibrio real' },
          ]}
        />
        <Segmented<Currency>
          label="Divisa de los importes"
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'EUR', label: 'EUR €' },
            { value: 'USD', label: 'USD $' },
          ]}
        />
      </Card>
      {mode === 'restore' ? (
        <RestoreCalculator currency={currency} />
      ) : (
        <BreakevenCalculator currency={currency} />
      )}
    </>
  )
}

/* ─────────────────────────── Restaurar valor inicial ─────────────────────── */

function RestoreCalculator({ currency }: { currency: Currency }) {
  const addScenario = useAppStore((s) => s.addScenario)
  const [saved, setSaved] = useState(false)

  const cRef = useField('100')
  const vNow = useField('90')
  const growthPct = useField('5')
  const budget = useField('')

  const cRefError = fieldError(cRef, mustBeNonNegative('El valor de referencia'))
  const vNowError = fieldError(vNow, mustBeNonNegative('El valor actual'))
  const growthError = fieldError(growthPct, (v) =>
    v.lte(-100) ? 'La subida debe ser mayor que −100 %' : undefined,
  )
  const budgetError = fieldError(budget, mustBeNonNegative('El presupuesto'))

  const ready =
    cRef.value !== null &&
    vNow.value !== null &&
    growthPct.value !== null &&
    cRefError === undefined &&
    vNowError === undefined &&
    growthError === undefined

  const result = useMemo(() => {
    if (!ready) return null
    return restoreValueContribution({
      referenceValue: cRef.value!,
      currentValue: vNow.value!,
      expectedGrowth: growthPct.value!.div(100),
    })
  }, [ready, cRef.value, vNow.value, growthPct.value])

  const budgetGrowth = useMemo(() => {
    if (!ready || budget.value === null || budgetError !== undefined) return null
    return requiredGrowthToRestore(cRef.value!, vNow.value!, budget.value)
  }, [ready, cRef.value, vNow.value, budget.value, budgetError])

  const curve = useMemo<CurvePoint[]>(() => {
    if (!ready) return []
    const g = growthPct.value!
    const maxG = Decimal.max(g.times(2), 30)
    const points: CurvePoint[] = []
    const steps = 60
    for (let i = 0; i <= steps; i++) {
      const gp = maxG.times(i).div(steps) // 0 … maxG
      const r = restoreValueContribution({
        referenceValue: cRef.value!,
        currentValue: vNow.value!,
        expectedGrowth: gp.div(100),
      })
      points.push({ growthPct: Number(gp.toFixed(4)), contribution: Number(r.contribution.toFixed(2)) })
    }
    return points
  }, [ready, cRef.value, vNow.value, growthPct.value])

  const scenarioRows = useMemo(() => {
    if (!ready) return []
    const g = growthPct.value!
    const growths = dedupeDecimals([dec(2), dec(5), g, dec(10), dec(20)]).filter((x) => x.gt(-100))
    return growths.map((gp) => {
      const r = restoreValueContribution({
        referenceValue: cRef.value!,
        currentValue: vNow.value!,
        expectedGrowth: gp.div(100),
      })
      return { growth: gp, result: r, isSelected: gp.eq(g) }
    })
  }, [ready, cRef.value, vNow.value, growthPct.value])

  return (
    <>
      <Card title="Tu situación">
        <div className="grid-2">
          <NumberField
            label="Cantidad que quieres volver a ver"
            hint="Normalmente, lo que invertiste. Ej.: 100"
            value={cRef.raw}
            onChange={cRef.setRaw}
            suffix={currency}
            error={cRefError}
          />
          <NumberField
            label="Valor actual de tu posición"
            hint="Lo que vale hoy, antes de aportar nada. Ej.: 90"
            value={vNow.raw}
            onChange={vNow.setRaw}
            suffix={currency}
            error={vNowError}
          />
          <NumberField
            label="Subida que esperas desde hoy"
            hint="Desde el precio actual hasta tu objetivo. Ej.: 5"
            value={growthPct.raw}
            onChange={growthPct.setRaw}
            suffix="%"
            error={growthError}
          />
          <NumberField
            label="Presupuesto disponible (opcional)"
            hint="Si lo indicas, te diré qué subida necesitarías con esa cantidad"
            value={budget.raw}
            onChange={budget.setRaw}
            suffix={currency}
            error={budgetError}
          />
        </div>
      </Card>

      {result !== null && ready && (
        <>
          <Card highlight title="Capital para restaurar el valor inicial">
            {result.alreadyRestored ? (
              <>
                <p className="big-figure">{formatMoney(0, currency)}</p>
                <p>
                  No necesitas aportar nada: si tu posición sube un{' '}
                  {formatPct(growthPct.value!.div(100))}, pasaría a valer{' '}
                  <strong>{formatMoney(result.valueAtTarget, currency)}</strong>, igual o por encima
                  de {formatMoney(cRef.value!, currency)}.
                </p>
              </>
            ) : (
              <>
                <p className="big-figure">{formatMoney(result.contribution, currency)}</p>
                <p>
                  Si aportas <strong>{formatMoney(result.contribution, currency)}</strong> hoy y tu
                  posición sube un <strong>{formatPct(growthPct.value!.div(100))}</strong>, volverá
                  a valer <strong>{formatMoney(result.valueAtTarget, currency)}</strong>.
                </p>
              </>
            )}
            <Note kind="warning">
              <strong>Ojo:</strong> volver a ver {formatMoney(cRef.value!, currency)} en tu posición{' '}
              <em>no</em> significa recuperar todo tu dinero. Habrías aportado en total{' '}
              <strong>{formatMoney(result.totalCapital, currency)}</strong>, así que en ese objetivo
              tu resultado económico sería{' '}
              <SignedValue
                formatted={formatMoney(result.netResultAtTarget, currency)}
                sign={sign(result.netResultAtTarget)}
              />
              . Para saber cuánto necesitas para no perder dinero, usa la pestaña «Punto de
              equilibrio real».
            </Note>
            <div className="stat-grid">
              <Stat label="Valor en el objetivo">{formatMoney(result.valueAtTarget, currency)}</Stat>
              <Stat label="Capital total aportado">{formatMoney(result.totalCapital, currency)}</Stat>
              <Stat label="Resultado neto en el objetivo">
                <SignedValue
                  formatted={formatMoney(result.netResultAtTarget, currency)}
                  sign={sign(result.netResultAtTarget)}
                />
              </Stat>
            </div>
            <MathDetails>
              <p>
                Fórmula: <span className="formula">A = max(0, C_ref / (1 + g) − V_actual)</span>
              </p>
              <p>
                Con tus datos:{' '}
                <span className="formula">
                  A = {cRef.value!.toString()} / (1 + {growthPct.value!.div(100).toString()}) −{' '}
                  {vNow.value!.toString()} = {result.contribution.toDP(6).toString()}
                </span>
              </p>
              <p className="muted">
                C_ref = cantidad de referencia · V_actual = valor actual · g = subida esperada. Sin
                comisiones ni efecto divisa (fuera del alcance del MVP).
              </p>
            </MathDetails>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  addScenario({
                    id: uid(),
                    name: `Restaurar ${formatMoney(cRef.value!, currency)} con +${growthPct.value!.toString()} %`,
                    createdAt: new Date().toISOString(),
                    mode: 'restore',
                    currency,
                    inputs: {
                      referenceValue: cRef.value!.toString(),
                      currentValue: vNow.value!.toString(),
                      expectedGrowthPct: growthPct.value!.toString(),
                      ...(budget.value !== null ? { budget: budget.value.toString() } : {}),
                    },
                  })
                  setSaved(true)
                }}
              >
                Guardar como escenario
              </button>
              {saved && <span className="muted">Guardado en «Escenarios». No ejecuta ninguna compra.</span>}
            </div>
          </Card>

          {budget.value !== null && budgetError === undefined && (
            <Card title="Con tu presupuesto">
              {budgetGrowth === null ? (
                <p>Con esos datos no hay valor sobre el que calcular una subida.</p>
              ) : budget.value.gte(result.contribution) && !result.alreadyRestored ? (
                <p>
                  Tu presupuesto de <strong>{formatMoney(budget.value, currency)}</strong> cubre la
                  aportación necesaria ({formatMoney(result.contribution, currency)}). Con él, te
                  bastaría una subida del{' '}
                  <strong>{formatPct(Decimal.max(budgetGrowth, 0))}</strong> para volver a ver{' '}
                  {formatMoney(cRef.value!, currency)}.
                </p>
              ) : (
                <p>
                  Aportando <strong>{formatMoney(budget.value, currency)}</strong>, necesitarías que
                  tu posición subiera un <strong>{formatPct(Decimal.max(budgetGrowth, 0))}</strong>{' '}
                  desde hoy para volver a ver {formatMoney(cRef.value!, currency)} (en lugar del{' '}
                  {formatPct(growthPct.value!.div(100))} indicado).
                </p>
              )}
              <MathDetails summary="Ver la fórmula">
                <span className="formula">g = C_ref / (V_actual + A) − 1</span>
              </MathDetails>
            </Card>
          )}

          <Card title="¿Cuánto tendrías que aportar según la subida?">
            <p className="muted">
              La aportación necesaria baja cuanto mayor sea la subida que esperas. El punto marcado
              es tu escenario actual.
            </p>
            <ContributionCurveChart
              points={curve}
              selected={
                result.alreadyRestored
                  ? undefined
                  : {
                      growthPct: Number(growthPct.value!.toFixed(4)),
                      contribution: Number(result.contribution.toFixed(2)),
                    }
              }
              currency={currency}
            />
          </Card>

          <Card title="Tabla de escenarios">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Si sube…</th>
                    <th scope="col">Aportación necesaria</th>
                    <th scope="col">Capital total</th>
                    <th scope="col">Resultado neto en el objetivo</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioRows.map((row) => (
                    <tr key={row.growth.toString()} className={row.isSelected ? 'highlight' : undefined}>
                      <td>+{formatPct(row.growth.div(100))}</td>
                      <td>{formatMoney(row.result.contribution, currency)}</td>
                      <td>{formatMoney(row.result.totalCapital, currency)}</td>
                      <td>
                        <SignedValue
                          formatted={formatMoney(row.result.netResultAtTarget, currency)}
                          sign={sign(row.result.netResultAtTarget)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Note kind="info">
            Para calcular tu <strong>punto de equilibrio económico real</strong> (no perder dinero
            contando también lo nuevo que aportes) necesito el precio medio de compra y el precio
            actual del activo: cambia arriba a la pestaña «Punto de equilibrio real».
          </Note>
        </>
      )}
    </>
  )
}

/* ─────────────────────────── Punto de equilibrio real ────────────────────── */

function BreakevenCalculator({ currency }: { currency: Currency }) {
  const addScenario = useAppStore((s) => s.addScenario)
  const [saved, setSaved] = useState(false)

  const invested = useField('100')
  const avgPrice = useField('70000')
  const currentPrice = useField('58000')
  const [targetKind, setTargetKind] = useState<'price' | 'pct'>('price')
  const targetPriceField = useField('62000')
  const targetPctField = useField('')
  const budget = useField('')
  const [comparatorRaw, setComparatorRaw] = useState('50, 100, 165.71')

  const investedError = fieldError(invested, mustBeNonNegative('Lo invertido'))
  const avgPriceError = fieldError(avgPrice, mustBePositive('El precio medio'))
  const currentPriceError = fieldError(currentPrice, mustBePositive('El precio actual'))
  const targetPriceError = targetKind === 'price' ? fieldError(targetPriceField, mustBePositive('El precio objetivo')) : undefined
  const targetPctError =
    targetKind === 'pct'
      ? fieldError(targetPctField, (v) => (v.lte(-100) ? 'Debe ser mayor que −100 %' : undefined))
      : undefined
  const budgetError = fieldError(budget, mustBeNonNegative('El presupuesto'))

  const baseReady =
    invested.value !== null &&
    avgPrice.value !== null &&
    currentPrice.value !== null &&
    investedError === undefined &&
    avgPriceError === undefined &&
    currentPriceError === undefined

  const targetPrice = useMemo(() => {
    if (!baseReady) return null
    if (targetKind === 'price') {
      if (targetPriceField.value === null || targetPriceError !== undefined) return null
      return targetPriceField.value
    }
    if (targetPctField.value === null || targetPctError !== undefined) return null
    return currentPrice.value!.times(targetPctField.value.div(100).plus(1))
  }, [baseReady, targetKind, targetPriceField.value, targetPctField.value, currentPrice.value, targetPriceError, targetPctError])

  const derived = useMemo(() => {
    if (!baseReady || targetPrice === null || targetPrice.lte(0)) return null
    const quantity = invested.value!.div(avgPrice.value!)
    const currentValue = quantity.times(currentPrice.value!)
    const growth = growthFromPrices(currentPrice.value!, targetPrice)
    const restore = restoreValueContribution({
      referenceValue: invested.value!,
      currentValue,
      expectedGrowth: growth,
    })
    const breakeven = breakevenContribution({
      quantity,
      cost: invested.value!,
      currentPrice: currentPrice.value!,
      targetPrice,
    })
    return { quantity, currentValue, growth, restore, breakeven }
  }, [baseReady, invested.value, avgPrice.value, currentPrice.value, targetPrice])

  const withBudget = useMemo(() => {
    if (!derived || budget.value === null || budgetError !== undefined) return null
    const bp = targetPriceWithBudget({
      quantity: derived.quantity,
      cost: invested.value!,
      currentPrice: currentPrice.value!,
      contribution: budget.value,
    })
    const outcome = outcomeAtPrice({
      quantity: derived.quantity,
      cost: invested.value!,
      currentPrice: currentPrice.value!,
      contribution: budget.value,
      evaluationPrice: targetPrice!,
    })
    return { bp, outcome }
  }, [derived, budget.value, budgetError, invested.value, currentPrice.value, targetPrice])

  /** Aportación dibujada en la gráfica: el presupuesto, o la de equilibrio. */
  const chartContribution = useMemo(() => {
    if (!derived) return null
    if (budget.value !== null && budgetError === undefined && budget.value.gt(0)) return budget.value
    if (derived.breakeven.status === 'achievable') return derived.breakeven.contribution
    return null
  }, [derived, budget.value, budgetError])

  const chart = useMemo(() => {
    if (!derived || targetPrice === null) return null
    const q = derived.quantity
    const c = invested.value!
    const p = currentPrice.value!
    const a = chartContribution
    const candidates = [p, targetPrice, avgPrice.value!]
    const lo = Decimal.min(...candidates).times('0.85')
    const hi = Decimal.max(...candidates).times('1.1')
    const points: PricePoint[] = []
    const steps = 60
    for (let i = 0; i <= steps; i++) {
      const price = lo.plus(hi.minus(lo).times(i).div(steps))
      const without = q.times(price).minus(c)
      const point: PricePoint = {
        price: Number(price.toFixed(4)),
        sinAportacion: Number(without.toFixed(2)),
      }
      if (a !== null) {
        const withA = q.plus(a.div(p)).times(price).minus(c.plus(a))
        point.conAportacion = Number(withA.toFixed(2))
      }
      points.push(point)
    }
    const markers: PriceMarker[] = [
      { price: Number(p.toFixed(4)), label: 'Actual' },
      { price: Number(avgPrice.value!.toFixed(4)), label: 'Precio medio' },
      { price: Number(targetPrice.toFixed(4)), label: 'Objetivo' },
    ]
    if (a !== null) {
      const bp = targetPriceWithBudget({ quantity: q, cost: c, currentPrice: p, contribution: a })
      markers.push({ price: Number(bp.breakevenPrice.toFixed(4)), label: 'Equilibrio con aportación' })
    }
    return { points, markers, hasContribution: a !== null }
  }, [derived, targetPrice, invested.value, avgPrice.value, currentPrice.value, chartContribution])

  const comparatorResults = useMemo(() => {
    if (!derived || targetPrice === null) return []
    return comparatorRaw
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .flatMap((s) => {
        const normalized = parseUserNumber(s)
        if (normalized === null) return []
        const a = dec(normalized)
        if (a.lt(0)) return []
        const bp = targetPriceWithBudget({
          quantity: derived.quantity,
          cost: invested.value!,
          currentPrice: currentPrice.value!,
          contribution: a,
        })
        const outcome = outcomeAtPrice({
          quantity: derived.quantity,
          cost: invested.value!,
          currentPrice: currentPrice.value!,
          contribution: a,
          evaluationPrice: targetPrice,
        })
        return [{ amount: a, bp, outcome }]
      })
  }, [comparatorRaw, derived, invested.value, currentPrice.value, targetPrice])

  const scenarioRows = useMemo(() => {
    if (!derived || targetPrice === null) return []
    const p = currentPrice.value!
    const factors = ['-0.2', '-0.1', '0', '0.05', '0.1', '0.2']
    const prices = dedupeDecimals([
      ...factors.map((f) => p.times(dec(f).plus(1))),
      targetPrice,
    ]).sort((x, y) => x.comparedTo(y))
    return prices.map((price) => {
      const without = derived.quantity.times(price).minus(invested.value!)
      const withA =
        chartContribution !== null
          ? outcomeAtPrice({
              quantity: derived.quantity,
              cost: invested.value!,
              currentPrice: p,
              contribution: chartContribution,
              evaluationPrice: price,
            }).netResult
          : null
      return { price, without, withA, isTarget: price.eq(targetPrice) }
    })
  }, [derived, targetPrice, currentPrice.value, invested.value, chartContribution])

  return (
    <>
      <Card title="Tu posición">
        <div className="grid-2">
          <NumberField
            label="Dinero invertido hasta hoy"
            hint="Todo lo que has puesto en este activo. Ej.: 100"
            value={invested.raw}
            onChange={invested.setRaw}
            suffix={currency}
            error={investedError}
          />
          <NumberField
            label="Precio medio de compra"
            hint="Precio medio al que compraste. Ej.: 70.000"
            value={avgPrice.raw}
            onChange={avgPrice.setRaw}
            suffix={currency}
            error={avgPriceError}
          />
          <NumberField
            label="Precio actual del activo"
            hint="Ej.: 58.000"
            value={currentPrice.raw}
            onChange={currentPrice.setRaw}
            suffix={currency}
            error={currentPriceError}
          />
          <div>
            <Segmented<'price' | 'pct'>
              label="Objetivo"
              value={targetKind}
              onChange={setTargetKind}
              options={[
                { value: 'price', label: 'Precio objetivo' },
                { value: 'pct', label: 'Subida %' },
              ]}
            />
            {targetKind === 'price' ? (
              <NumberField
                label="Precio objetivo"
                hint="Precio que crees que puede alcanzar. Ej.: 62.000"
                value={targetPriceField.raw}
                onChange={targetPriceField.setRaw}
                suffix={currency}
                error={targetPriceError}
              />
            ) : (
              <NumberField
                label="Subida esperada"
                hint="Desde el precio actual. Ej.: 6,9"
                value={targetPctField.raw}
                onChange={targetPctField.setRaw}
                suffix="%"
                error={targetPctError}
              />
            )}
          </div>
          <NumberField
            label="Presupuesto disponible (opcional)"
            hint="Si lo indicas, calcularé tu nuevo equilibrio y resultado con esa aportación"
            value={budget.raw}
            onChange={budget.setRaw}
            suffix={currency}
            error={budgetError}
          />
        </div>
        {derived && (
          <p className="muted mb-0">
            Posición derivada: <strong>{formatQty(derived.quantity)}</strong> unidades · valor
            actual <strong>{formatMoney(derived.currentValue, currency)}</strong> · objetivo{' '}
            <strong>
              {targetPrice !== null ? formatMoney(targetPrice, currency) : '—'} (
              {formatPct(derived.growth)} desde hoy)
            </strong>
          </p>
        )}
      </Card>

      {derived && targetPrice !== null && (
        <>
          <Card highlight title="Dos números distintos para tu objetivo">
            <div className="grid-2">
              <div>
                <h3>Restaurar el valor inicial</h3>
                <p className="big-figure">
                  {derived.restore.alreadyRestored
                    ? formatMoney(0, currency)
                    : formatMoney(derived.restore.contribution, currency)}
                </p>
                <p className="muted">
                  Aportación para que, al llegar a {formatMoney(targetPrice, currency)}, tu posición
                  vuelva a <em>mostrar</em> {formatMoney(invested.value!, currency)}. No implica
                  recuperar todo tu dinero: contando lo nuevo, tu resultado neto sería{' '}
                  <SignedValue
                    formatted={formatMoney(derived.restore.netResultAtTarget, currency)}
                    sign={sign(derived.restore.netResultAtTarget)}
                  />
                  .
                </p>
              </div>
              <div>
                <h3>Punto de equilibrio real</h3>
                <p className="big-figure">
                  {derived.breakeven.status === 'achievable'
                    ? formatMoney(derived.breakeven.contribution!, currency)
                    : derived.breakeven.status === 'already_achieved'
                      ? formatMoney(0, currency)
                      : '—'}
                </p>
                <p className="muted">{derived.breakeven.explanation}</p>
                {derived.breakeven.status === 'unreachable' && (
                  <Note kind="negative">
                    Sin aportar nada, en ese precio tu resultado sería{' '}
                    <SignedValue
                      formatted={formatMoney(derived.breakeven.netWithoutContribution, currency)}
                      sign={sign(derived.breakeven.netWithoutContribution)}
                    />
                    . Prueba con un precio objetivo por encima del precio actual.
                  </Note>
                )}
              </div>
            </div>
            <Note kind="info">
              <strong>¿Por qué no coinciden?</strong> «Restaurar» solo pide que la posición vuelva a
              mostrar la cifra de partida; el dinero nuevo que aportas también cuenta como coste. El
              «equilibrio real» exige que el valor cubra <em>todo</em> lo aportado, incluida la
              aportación nueva, por eso suele ser bastante mayor.
            </Note>
            <MathDetails>
              <p>
                Restaurar: <span className="formula">A = max(0, C_ref/(1+g) − V_actual)</span> ={' '}
                <span className="formula">{derived.restore.contribution.toDP(6).toString()}</span>
              </p>
              <p>
                Equilibrio real: <span className="formula">(q + A/P_actual)·P_obj = C + A</span> ⇒{' '}
                <span className="formula">A = (C − q·P_obj)/(P_obj/P_actual − 1)</span>
                {derived.breakeven.status === 'achievable' && (
                  <>
                    {' '}
                    = <span className="formula">{derived.breakeven.contribution!.toDP(6).toString()}</span>
                  </>
                )}
              </p>
              <p className="muted">
                q = {formatQty(derived.quantity)} unidades · C ={' '}
                {formatMoney(invested.value!, currency)} · P_actual ={' '}
                {formatMoney(currentPrice.value!, currency)} · P_obj ={' '}
                {formatMoney(targetPrice, currency)}. Sin comisiones ni efecto divisa (fuera del
                alcance del MVP).
              </p>
            </MathDetails>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  addScenario({
                    id: uid(),
                    name: `Equilibrio real a ${formatMoney(targetPrice, currency)}`,
                    createdAt: new Date().toISOString(),
                    mode: 'breakeven',
                    currency,
                    inputs: {
                      investedAmount: invested.value!.toString(),
                      averagePrice: avgPrice.value!.toString(),
                      currentPrice: currentPrice.value!.toString(),
                      targetPrice: targetPrice.toString(),
                      ...(budget.value !== null ? { budget: budget.value.toString() } : {}),
                    },
                  })
                  setSaved(true)
                }}
              >
                Guardar como escenario
              </button>
              {saved && <span className="muted">Guardado en «Escenarios». No ejecuta ninguna compra.</span>}
            </div>
          </Card>

          {withBudget && budget.value !== null && (
            <Card title={`Con tu presupuesto de ${formatMoney(budget.value, currency)}`}>
              <div className="stat-grid">
                <Stat label="Nuevo precio medio">
                  {formatMoney(withBudget.bp.newAveragePrice, currency)}
                </Stat>
                <Stat label="Tu equilibrio pasa a">
                  {formatMoney(withBudget.bp.breakevenPrice, currency)}
                </Stat>
                <Stat label="Subida necesaria hasta el equilibrio">
                  <SignedValue
                    formatted={formatPct(withBudget.bp.requiredGrowth)}
                    sign={sign(withBudget.bp.requiredGrowth)}
                  />
                </Stat>
                <Stat label={`Resultado neto en ${formatMoney(targetPrice, currency)}`}>
                  <SignedValue
                    formatted={formatMoney(withBudget.outcome.netResult, currency)}
                    sign={sign(withBudget.outcome.netResult)}
                  />
                </Stat>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <caption className="sr-only">Desglose del resultado con tu presupuesto</caption>
                  <tbody>
                    <tr>
                      <td>Valor futuro de la posición</td>
                      <td>{formatMoney(withBudget.outcome.futureValue, currency)}</td>
                    </tr>
                    <tr>
                      <td>Capital histórico total</td>
                      <td>{formatMoney(withBudget.outcome.totalCapital, currency)}</td>
                    </tr>
                    <tr>
                      <td>Rentabilidad neta</td>
                      <td>
                        {withBudget.outcome.netReturnPct !== null ? (
                          <SignedValue
                            formatted={formatPct(withBudget.outcome.netReturnPct)}
                            sign={sign(withBudget.outcome.netReturnPct)}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>Parte de la posición previa</td>
                      <td>
                        <SignedValue
                          formatted={formatMoney(withBudget.outcome.previousPositionPnl, currency)}
                          sign={sign(withBudget.outcome.previousPositionPnl)}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>Parte de la aportación nueva</td>
                      <td>
                        <SignedValue
                          formatted={formatMoney(withBudget.outcome.newContributionPnl, currency)}
                          sign={sign(withBudget.outcome.newContributionPnl)}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {chart && (
            <Card title="Resultado neto según el precio">
              <p className="muted">
                Dónde ganas o pierdes según el precio que alcance el activo. La línea horizontal es
                el equilibrio (resultado 0).
              </p>
              <PriceOutcomeChart
                points={chart.points}
                markers={chart.markers}
                currency={currency}
                hasContribution={chart.hasContribution}
              />
              {chart.hasContribution && chartContribution !== null && (
                <p className="muted mb-0">
                  «Con aportación» dibuja una aportación de{' '}
                  <strong>{formatMoney(chartContribution, currency)}</strong>
                  {budget.value === null || budgetError !== undefined
                    ? ' (la necesaria para el equilibrio real)'
                    : ' (tu presupuesto)'}
                  .
                </p>
              )}
            </Card>
          )}

          <Card title="Tabla de escenarios">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Precio</th>
                    <th scope="col">Desde hoy</th>
                    <th scope="col">Neto sin aportación</th>
                    {chartContribution !== null && <th scope="col">Neto con aportación</th>}
                  </tr>
                </thead>
                <tbody>
                  {scenarioRows.map((row) => (
                    <tr key={row.price.toString()} className={row.isTarget ? 'highlight' : undefined}>
                      <td>
                        {formatMoney(row.price, currency)}
                        {row.isTarget ? ' (objetivo)' : ''}
                      </td>
                      <td>
                        <SignedValue
                          formatted={formatPct(row.price.div(currentPrice.value!).minus(1))}
                          sign={sign(row.price.minus(currentPrice.value!))}
                        />
                      </td>
                      <td>
                        <SignedValue
                          formatted={formatMoney(row.without, currency)}
                          sign={sign(row.without)}
                        />
                      </td>
                      {chartContribution !== null && (
                        <td>
                          {row.withA !== null ? (
                            <SignedValue
                              formatted={formatMoney(row.withA, currency)}
                              sign={sign(row.withA)}
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Comparador de aportaciones">
            <div className="field">
              <label htmlFor="comparator-input">Aportaciones a comparar (separadas por comas)</label>
              <span className="hint">Ej.: 50, 100, 200</span>
              <input
                id="comparator-input"
                value={comparatorRaw}
                onChange={(e) => setComparatorRaw(e.target.value)}
                inputMode="decimal"
              />
            </div>
            {comparatorResults.length > 0 && (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Aportación</th>
                      <th scope="col">Nuevo precio medio</th>
                      <th scope="col">Precio de equilibrio</th>
                      <th scope="col">Neto en {formatMoney(targetPrice, currency)}</th>
                      <th scope="col">Rentabilidad neta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparatorResults.map((r) => (
                      <tr key={r.amount.toString()}>
                        <td>{formatMoney(r.amount, currency)}</td>
                        <td>{formatMoney(r.bp.newAveragePrice, currency)}</td>
                        <td>{formatMoney(r.bp.breakevenPrice, currency)}</td>
                        <td>
                          <SignedValue
                            formatted={formatMoney(r.outcome.netResult, currency)}
                            sign={sign(r.outcome.netResult)}
                          />
                        </td>
                        <td>
                          {r.outcome.netReturnPct !== null ? (
                            <SignedValue
                              formatted={formatPct(r.outcome.netReturnPct)}
                              sign={sign(r.outcome.netReturnPct)}
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}

/* ────────────────────────────── utilidades ──────────────────────────────── */

function sign(d: Decimal): -1 | 0 | 1 {
  if (d.gt(0)) return 1
  if (d.lt(0)) return -1
  return 0
}

function dedupeDecimals(values: Decimal[]): Decimal[] {
  const out: Decimal[] = []
  for (const v of values) {
    if (!out.some((x) => x.eq(v))) out.push(v)
  }
  return out
}
