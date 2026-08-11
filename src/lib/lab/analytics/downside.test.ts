/**
 * Pruebas de VaR, CVaR, drawdown y ventanas (LAB-309, LAB-310).
 *
 * Los valores esperados se calculan a mano sobre series construidas para eso,
 * no se copian de lo que devuelve el código.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDOWS,
  MIN_TAIL_OBSERVATIONS,
  VAR_DISCLAIMER,
  drawdownProfile,
  historicalTailRisk,
  overWindows,
  type SeriesPoint,
} from './downside'

/** 100 retornos: 95 de +0,1 % y 5 pérdidas conocidas. */
function retornosConCola(): number[] {
  return [...Array(95).fill(0.001), -0.02, -0.03, -0.04, -0.05, -0.10]
}

function serie(closes: readonly number[], desde = '2026-01-01'): SeriesPoint[] {
  const base = new Date(`${desde}T00:00:00Z`).getTime()
  return closes.map((close, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    close,
  }))
}

describe('VaR y CVaR históricos (LAB-309)', () => {
  it('el VaR es el umbral de la cola y el CVaR la pérdida media dentro de ella', () => {
    const r = historicalTailRisk(retornosConCola(), 0.95)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // La cola al 95 % son los 5 peores: -10, -5, -4, -3 y -2 %.
    expect(r.value.tailSize).toBe(5)
    // El umbral es el mejor de la cola: -2 % → VaR 0,02.
    expect(r.value.var).toBeCloseTo(0.02, 10)
    // La media de la cola: (10+5+4+3+2)/5 = 4,8 %.
    expect(r.value.cvar).toBeCloseTo(0.048, 10)
  })

  it('el CVaR nunca es menor que el VaR: mide dentro de la misma cola', () => {
    const r = historicalTailRisk(retornosConCola())
    if (!r.ok) throw new Error('debería resolver')
    expect(r.value.cvar).toBeGreaterThanOrEqual(r.value.var)
  })

  it('ACEPTACIÓN · el VaR nunca se describe como pérdida máxima', () => {
    expect(VAR_DISCLAIMER).toContain('no es la pérdida máxima')
    // Y de hecho hay pérdidas peores que el VaR en la propia muestra.
    const r = historicalTailRisk(retornosConCola())
    if (!r.ok) throw new Error('debería resolver')
    const peores = retornosConCola().filter((x) => -x > r.value.var)
    expect(peores.length).toBeGreaterThan(0)
  })

  it('con muestra corta no da un número: dice cuánta falta', () => {
    const r = historicalTailRisk(Array(50).fill(-0.01))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('insufficient_data')
    expect(r.required).toBe(MIN_TAIL_OBSERVATIONS)
    expect(r.observations).toBe(50)
  })

  it('una confianza más alta mira una cola más estrecha y más profunda', () => {
    const r99 = historicalTailRisk(retornosConCola(), 0.99)
    const r95 = historicalTailRisk(retornosConCola(), 0.95)
    if (!r99.ok || !r95.ok) throw new Error('deberían resolver')
    expect(r99.value.tailSize).toBeLessThan(r95.value.tailSize)
    expect(r99.value.cvar).toBeGreaterThanOrEqual(r95.value.cvar)
  })
})

describe('perfil de caída (LAB-309)', () => {
  it('mide profundidad, duración y recuperación', () => {
    // Sube a 100, cae a 50 en 2 días, vuelve a 100 cuatro días después.
    const r = drawdownProfile(serie([100, 75, 50, 60, 80, 100]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.maxDrawdown).toBeCloseTo(0.5, 10)
    expect(r.value.declineDays).toBe(2)
    expect(r.value.recoveryDays).toBe(3)
    expect(r.value.recovered).toBe(true)
  })

  it('sin recuperar lo dice, y no pone cero días', () => {
    const r = drawdownProfile(serie([100, 50, 60, 70]))
    if (!r.ok) throw new Error('debería resolver')
    expect(r.value.recovered).toBe(false)
    expect(r.value.recoveryDays).toBeNull()
  })

  it('una serie que solo sube no tiene caída que medir', () => {
    const r = drawdownProfile(serie([100, 110, 120]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('no_losses')
  })

  it('con un solo punto no hay nada que medir', () => {
    expect(drawdownProfile(serie([100])).ok).toBe(false)
  })

  it('el orden de entrada no cambia el resultado', () => {
    const puntos = serie([100, 75, 50, 100])
    const revuelta = [...puntos].reverse()
    expect(drawdownProfile(revuelta)).toEqual(drawdownProfile(puntos))
  })
})

describe('ventanas temporales (LAB-310)', () => {
  const dosAnos = serie(Array.from({ length: 800 }, (_, i) => 100 + i * 0.1))

  it('ACEPTACIÓN · una ventana que la serie no cubre no se simula', () => {
    const salida = overWindows(dosAnos, (tramo) => tramo.length)
    const porId = Object.fromEntries(salida.map((o) => [o.window.id, o.status]))

    expect(porId['1a']).toBe('ok')
    expect(porId['3a']).toBe('unavailable')
    expect(porId['5a']).toBe('unavailable')
  })

  it('la ventana se recorta por fecha, no por número de puntos', () => {
    // Serie con huecos: 200 puntos repartidos en dos años.
    const conHuecos = Array.from({ length: 200 }, (_, i) => ({
      date: new Date(Date.UTC(2024, 0, 1) + i * 3 * 86_400_000).toISOString().slice(0, 10),
      close: 100 + i,
    }))
    const salida = overWindows(conHuecos, (tramo) => tramo.length, [DEFAULT_WINDOWS[0]!])
    const unAno = salida[0]!
    expect(unAno.status).toBe('ok')
    // Un año a un punto cada 3 días son ~122 puntos, no 200.
    expect(unAno.observations).toBeLessThan(140)
    expect(unAno.observations).toBeGreaterThan(110)
  })

  it('si la métrica no puede calcularse, la ventana queda no disponible', () => {
    const salida = overWindows(dosAnos, () => null, [DEFAULT_WINDOWS[0]!])
    expect(salida[0]?.status).toBe('unavailable')
  })

  it('una serie vacía deja todas las ventanas no disponibles', () => {
    const salida = overWindows([], (t) => t.length)
    expect(salida.every((o) => o.status === 'unavailable')).toBe(true)
  })
})
