/**
 * Pruebas de composiciones con vigencia (LAB-406).
 *
 * El criterio de aceptación: **los holdings antiguos no se reemplazan si hacen
 * falta para reproducir**.
 */
import { describe, expect, it } from 'vitest'
import type { FundComposition } from './contracts'
import {
  appendObservation,
  compositionAsOf,
  compositionsAsOf,
  latestComposition,
  removeObservation,
  type CompositionHistory,
} from './observations'

function obs(asOf: string, pesoApple: number, assetId = 'iwda'): FundComposition {
  return {
    assetId,
    source: 'manual',
    asOf,
    holdings: [{ symbol: 'AAPL', weight: pesoApple }],
    coverage: pesoApple,
  }
}

/** En marzo Apple pesaba un 5 %; en agosto, un 7 %. Las dos son verdad. */
function historial(): CompositionHistory {
  const a = appendObservation({}, obs('2026-03-31', 0.05))
  if (!a.ok) throw new Error('alta de marzo rechazada')
  const b = appendObservation(a.history, obs('2026-08-01', 0.07))
  if (!b.ok) throw new Error('alta de agosto rechazada')
  return b.history
}

describe('actualizar no es borrar', () => {
  it('una observación nueva no destruye la anterior', () => {
    expect(historial()['iwda']).toHaveLength(2)
  })

  it('la de marzo sigue diciendo lo que decía en marzo', () => {
    expect(compositionAsOf(historial(), 'iwda', '2026-05-01')?.holdings[0]?.weight).toBe(0.05)
  })

  it('la de agosto rige a partir de agosto', () => {
    expect(compositionAsOf(historial(), 'iwda', '2026-09-01')?.holdings[0]?.weight).toBe(0.07)
  })

  it('el mismo día de la observación ya rige', () => {
    expect(compositionAsOf(historial(), 'iwda', '2026-08-01')?.holdings[0]?.weight).toBe(0.07)
  })

  it('antes de la primera observación no se sabía nada, y se dice', () => {
    // Usar un dato del futuro para explicar el pasado es la forma más común de
    // mentirse con un backtest.
    expect(compositionAsOf(historial(), 'iwda', '2026-01-01')).toBeNull()
  })

  it('de un fondo del que no hay nada, no se inventa una composición vacía', () => {
    expect(compositionAsOf(historial(), 'vwce', '2026-09-01')).toBeNull()
  })
})

describe('perder historial tiene que ser explícito', () => {
  it('repetir fecha se rechaza en vez de reemplazar en silencio', () => {
    const r = appendObservation(historial(), obs('2026-03-31', 0.06))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('debería haberse rechazado')
    expect(r.reason).toBe('duplicate_asOf')
  })

  it('una fecha con formato inválido no entra', () => {
    const r = appendObservation({}, obs('31/03/2026', 0.05))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('debería haberse rechazado')
    expect(r.reason).toBe('invalid_asOf')
  })

  it('quitar una observación es la única forma de perderla', () => {
    const sinMarzo = removeObservation(historial(), 'iwda', '2026-03-31')
    expect(sinMarzo['iwda']).toHaveLength(1)
    expect(compositionAsOf(sinMarzo, 'iwda', '2026-05-01')).toBeNull()
  })
})

describe('orden y consulta en bloque', () => {
  it('las observaciones quedan ordenadas aunque lleguen desordenadas', () => {
    const a = appendObservation({}, obs('2026-08-01', 0.07))
    if (!a.ok) throw new Error('falló')
    const b = appendObservation(a.history, obs('2026-03-31', 0.05))
    if (!b.ok) throw new Error('falló')
    expect(b.history['iwda']?.map((c) => c.asOf)).toEqual(['2026-03-31', '2026-08-01'])
  })

  it('la más reciente se consulta sin condición de fecha', () => {
    expect(latestComposition(historial(), 'iwda')?.asOf).toBe('2026-08-01')
  })

  it('el mapa a fecha solo trae lo vigente entonces', () => {
    const a = appendObservation(historial(), obs('2026-07-01', 0.2, 'sxr8'))
    if (!a.ok) throw new Error('falló')

    // En mayo SXR8 todavía no se había anotado: no aparece.
    expect(Object.keys(compositionsAsOf(a.history, '2026-05-01'))).toEqual(['iwda'])
    expect(Object.keys(compositionsAsOf(a.history, '2026-09-01')).sort()).toEqual(['iwda', 'sxr8'])
  })

  it('sin historial devuelve un mapa vacío, no rompe', () => {
    expect(compositionsAsOf({}, '2026-09-01')).toEqual({})
  })
})
