/**
 * Pruebas de las señales sectoriales (LAB-705, 706, 707).
 *
 * Lo que más importa comprobar: **ninguna usa datos posteriores a la fecha de
 * cálculo**. Es fácil de incumplir sin darse cuenta —basta tomar los últimos N
 * puntos de la serie entera— y el resultado sale plausible igual.
 */
import { describe, expect, it } from 'vitest'
import {
  DIAS_POR_MES,
  MOMENTUM_DISCLAIMER,
  SIGNAL_CATALOG,
  marginalDiversification,
  momentum12_1,
  upTo,
  volAdjustedMomentum,
  type PricePoint,
} from './signals'

/** Serie diaria desde 2024-01-01 con el precio que dé `f`. */
function serie(n: number, f: (i: number) => number): PricePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    close: f(i),
  }))
}

const N = 16 * DIAS_POR_MES
const fecha = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)

/**
 * Ruido determinista.
 *
 * Hace falta porque una exponencial perfecta tiene **volatilidad cero**: sus
 * retornos logarítmicos son todos iguales. Sin ruido, cualquier prueba sobre la
 * señal ajustada por volatilidad choca con una división por cero, que es
 * exactamente lo que el motor detecta y rechaza.
 */
function ruido(semilla: number) {
  let s = semilla >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296 - 0.5
  }
}

/** Serie con tendencia y ruido de amplitud `amplitud`. */
function serieConRuido(n: number, deriva: number, amplitud: number, semilla = 7): PricePoint[] {
  const r = ruido(semilla)
  let precio = 100
  return Array.from({ length: n }, (_, i) => {
    precio *= Math.exp(deriva + r() * amplitud)
    return { date: fecha(i), close: precio }
  })
}

describe('ninguna señal mira al futuro', () => {
  it('upTo descarta todo lo posterior a la fecha', () => {
    const s = serie(100, (i) => 100 + i)
    const recortada = upTo(s, fecha(49))
    expect(recortada).toHaveLength(50)
    expect(recortada.at(-1)!.date).toBe(fecha(49))
  })

  it('el momentum cambia si se calcula antes, aunque la serie sea la misma', () => {
    // Si usara la serie entera, las dos llamadas darían lo mismo, y ese es
    // exactamente el sesgo que hay que evitar.
    const s = serieConRuido(N, 0.002, 0.01)
    const antes = momentum12_1(s, fecha(N - 40))
    const despues = momentum12_1(s, fecha(N - 1))
    expect(antes.ok && despues.ok).toBe(true)
    if (!antes.ok || !despues.ok) return
    expect(antes.value).not.toBeCloseTo(despues.value, 6)
  })

  it('los datos futuros de la serie no alteran el resultado de una fecha pasada', () => {
    const base = serieConRuido(N, 0.002, 0.01)
    const conFuturo = [...base, ...serie(50, () => 1_000_000).map((p, i) => ({
      ...p,
      date: fecha(N + i),
    }))]
    const a = momentum12_1(base, fecha(N - 1))
    const b = momentum12_1(conFuturo, fecha(N - 1))
    expect(a).toEqual(b)
  })

  it('upTo ordena, así que una serie desordenada da el mismo resultado', () => {
    const s = serie(N, (i) => 100 + i)
    const desordenada = [...s].reverse()
    expect(momentum12_1(desordenada, fecha(N - 1))).toEqual(momentum12_1(s, fecha(N - 1)))
  })
})

describe('momentum 12-1', () => {
  it('una serie que sube da momentum positivo', () => {
    const r = momentum12_1(serie(N, (i) => 100 + i), fecha(N - 1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toBeGreaterThan(0)
  })

  it('una serie que baja da momentum negativo', () => {
    const r = momentum12_1(serie(N, (i) => 500 - i), fecha(N - 1))
    expect(r.ok && r.value).toBeLessThan(0)
  })

  it('una serie plana da momentum cero', () => {
    const r = momentum12_1(serie(N, () => 100), fecha(N - 1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toBeCloseTo(0, 12)
  })

  it('excluye el último mes: un desplome reciente no lo cambia', () => {
    // Es lo que hace «12-1» distinto de «12»: a un mes vista domina la
    // reversión a corto plazo, que empuja en sentido contrario.
    //
    // Esta prueba encontró un error de un solo índice: `fin` caía en el primer
    // día del mes excluido en vez de en el último día anterior, así que el
    // desplome entraba en la medida.
    const subiendo = serie(N, (i) => 100 + i)
    const conDesplome = subiendo.map((p, i) =>
      i >= N - DIAS_POR_MES ? { ...p, close: 10 } : p,
    )
    const a = momentum12_1(subiendo, fecha(N - 1))
    const b = momentum12_1(conDesplome, fecha(N - 1))
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.value).toBeCloseTo(a.value, 12)
  })

  it('el valor es exactamente la variación entre los dos puntos', () => {
    const s = serie(N, (i) => 100 + i)
    const r = momentum12_1(s, fecha(N - 1))
    if (!r.ok) throw new Error('debería calcular')
    const inicio = s[N - 1 - 12 * DIAS_POR_MES]!.close
    const fin = s[N - 1 - DIAS_POR_MES]!.close
    expect(r.value).toBeCloseTo(fin / inicio - 1, 12)
  })
})

describe('sin muestra no hay señal', () => {
  it('con menos de doce meses no se devuelve un número pequeño', () => {
    // Un momentum sobre cuatro meses no es un momentum débil: es otra cosa.
    const r = momentum12_1(serie(4 * DIAS_POR_MES, (i) => 100 + i), fecha(80))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('insufficient_history')
  })

  it('se dice cuántas observaciones había', () => {
    const r = momentum12_1(serie(50, (i) => 100 + i), fecha(49))
    expect(r.observations).toBe(50)
  })

  it('un precio no positivo invalida el cálculo en vez de dar infinito', () => {
    const s = serie(N, (i) => (i === N - 1 - 12 * DIAS_POR_MES ? 0 : 100 + i))
    const r = momentum12_1(s, fecha(N - 1))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('invalid_price')
  })

  it('sin serie no rompe', () => {
    expect(momentum12_1([], '2026-01-01').ok).toBe(false)
  })
})

describe('momentum ajustado por volatilidad', () => {
  it('con la misma subida, más volatilidad da menos señal', () => {
    // Es la hipótesis de la señal: penaliza subir a base de sobresaltos.
    const tranquila = serieConRuido(N, 0.002, 0.004)
    const nerviosa = serieConRuido(N, 0.002, 0.04)

    const a = volAdjustedMomentum(tranquila, fecha(N - 1))
    const b = volAdjustedMomentum(nerviosa, fecha(N - 1))
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(Math.abs(b.value)).toBeLessThan(Math.abs(a.value))
  })

  it('conserva el signo del momentum', () => {
    const bajando = volAdjustedMomentum(serieConRuido(N, -0.002, 0.01), fecha(N - 1))
    expect(bajando.ok).toBe(true)
    if (!bajando.ok) return
    expect(bajando.value).toBeLessThan(0)
  })

  it('una exponencial perfecta no tiene volatilidad, y se dice', () => {
    // Sus retornos logarítmicos son todos iguales: dividir por su volatilidad
    // sería dividir por cero.
    const r = volAdjustedMomentum(serie(N, (i) => 100 * Math.exp(i * 0.002)), fecha(N - 1))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('constant_series')
  })

  it('una serie plana no se puede dividir por su volatilidad', () => {
    const r = volAdjustedMomentum(serie(N, () => 100), fecha(N - 1))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('constant_series')
  })

  it('hereda la falta de muestra del momentum base', () => {
    const r = volAdjustedMomentum(serieConRuido(50, 0.002, 0.01), fecha(49))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('insufficient_history')
  })
})

describe('diversificación marginal', () => {
  it('un sector poco correlacionado reduce más la volatilidad que uno muy correlacionado', () => {
    // Es la hipótesis, y se comprueba con aritmética, no con un backtest.
    const base = { portfolioVolatility: 0.2, sectorVolatility: 0.2, weight: 0.1 }
    const poco = marginalDiversification({ ...base, correlation: 0 })
    const mucho = marginalDiversification({ ...base, correlation: 0.95 })
    expect(poco).toBeLessThan(mucho)
    expect(poco).toBeLessThan(0)
  })

  it('un sector idéntico a la cartera no cambia nada', () => {
    const r = marginalDiversification({
      portfolioVolatility: 0.2,
      sectorVolatility: 0.2,
      correlation: 1,
      weight: 0.1,
    })
    expect(r).toBeCloseTo(0, 12)
  })

  it('un sector perfectamente opuesto reduce mucho', () => {
    const r = marginalDiversification({
      portfolioVolatility: 0.2,
      sectorVolatility: 0.2,
      correlation: -1,
      weight: 0.5,
    })
    // Mitad y mitad de dos opuestos idénticos: volatilidad cero.
    expect(r).toBeCloseTo(-0.2, 9)
  })

  it('un sector más volátil puede subir la volatilidad aunque diversifique', () => {
    const r = marginalDiversification({
      portfolioVolatility: 0.1,
      sectorVolatility: 0.6,
      correlation: 0,
      weight: 0.3,
    })
    expect(r).toBeGreaterThan(0)
  })

  it('con peso cero no cambia nada', () => {
    const r = marginalDiversification({
      portfolioVolatility: 0.2,
      sectorVolatility: 0.9,
      correlation: 0.5,
      weight: 0,
    })
    expect(r).toBeCloseTo(0, 12)
  })

  it('un peso fuera de rango se acota en vez de producir un absurdo', () => {
    const r = marginalDiversification({
      portfolioVolatility: 0.2,
      sectorVolatility: 0.2,
      correlation: 1,
      weight: 5,
    })
    expect(Number.isFinite(r)).toBe(true)
  })
})

describe('cada señal declara su hipótesis y cómo se falsa', () => {
  it('las tres están en el catálogo', () => {
    expect(SIGNAL_CATALOG).toHaveLength(3)
  })

  it('ninguna viaja sin hipótesis ni sin forma de invalidarla', () => {
    for (const s of SIGNAL_CATALOG) {
      expect(s.hypothesis.length).toBeGreaterThan(20)
      expect(s.falsification.length).toBeGreaterThan(20)
    }
  })

  it('la diversificación marginal se declara como no predictiva', () => {
    // Describe la cartera de hoy; no dice nada sobre el futuro.
    const div = SIGNAL_CATALOG.find((s) => s.modelKey.includes('marginal'))!
    expect(div.predictive).toBe(false)
  })

  it('el aviso del momentum dice que falla durante años seguidos', () => {
    expect(MOMENTUM_DISCLAIMER).toMatch(/falla durante años seguidos/)
  })
})

describe('determinismo', () => {
  it('los mismos datos dan exactamente el mismo valor', () => {
    const s = serie(N, (i) => 100 * Math.exp(i * 0.002))
    expect(momentum12_1(s, fecha(N - 1))).toEqual(momentum12_1(s, fecha(N - 1)))
    expect(volAdjustedMomentum(s, fecha(N - 1))).toEqual(volAdjustedMomentum(s, fecha(N - 1)))
  })
})
