import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearCola, escribirSerie, leerSerie, vaciarCacheDeSeries } from './seriesCache'

const PUNTOS = [
  { date: '2026-07-28', close: 100 },
  { date: '2026-07-29', close: 101 },
]

describe('caché de series diarias', () => {
  beforeEach(() => {
    vaciarCacheDeSeries()
  })

  it('devuelve lo guardado el mismo día sin volver a pedirlo', () => {
    escribirSerie('a1', 90, 'EUR', PUNTOS, 'Twelve Data')
    const leido = leerSerie('a1', 90, 'EUR')
    expect(leido?.puntos).toEqual(PUNTOS)
    expect(leido?.proveedor).toBe('Twelve Data')
  })

  it('no mezcla ventanas ni divisas distintas', () => {
    escribirSerie('a1', 90, 'EUR', PUNTOS, 'Twelve Data')
    expect(leerSerie('a1', 30, 'EUR')).toBeNull()
    expect(leerSerie('a1', 90, 'USD')).toBeNull()
    expect(leerSerie('otro', 90, 'EUR')).toBeNull()
  })

  it('caduca al cambiar de día: una serie diaria se cierra cada jornada', () => {
    escribirSerie('a1', 90, 'EUR', PUNTOS, 'Twelve Data')
    expect(leerSerie('a1', 90, 'EUR')).not.toBeNull()

    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + 26 * 60 * 60 * 1000))
    expect(leerSerie('a1', 90, 'EUR')).toBeNull()
    vi.useRealTimers()
  })

  it('una serie vacía no se guarda', () => {
    escribirSerie('a1', 90, 'EUR', [], 'Twelve Data')
    expect(leerSerie('a1', 90, 'EUR')).toBeNull()
  })
})

describe('cola con separación entre peticiones', () => {
  it('las ejecuta de una en una y en orden, no en ráfaga', async () => {
    const encolar = crearCola(0)
    const orden: number[] = []
    let simultaneas = 0
    let maxSimultaneas = 0

    const tarea = (n: number) => async () => {
      simultaneas++
      maxSimultaneas = Math.max(maxSimultaneas, simultaneas)
      await new Promise((r) => setTimeout(r, 5))
      simultaneas--
      orden.push(n)
      return n
    }

    const resultados = await Promise.all([1, 2, 3, 4].map((n) => encolar(tarea(n))))

    expect(resultados).toEqual([1, 2, 3, 4])
    expect(orden).toEqual([1, 2, 3, 4])
    // Lo que agotaba la cuota era disparar todas a la vez.
    expect(maxSimultaneas).toBe(1)
  })

  it('un fallo no rompe la cola: las siguientes siguen ejecutándose', async () => {
    const encolar = crearCola(0)
    const fallo = encolar(() => Promise.reject(new Error('límite alcanzado')))
    await expect(fallo).rejects.toThrow('límite alcanzado')
    await expect(encolar(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })

  it('respeta la separación mínima entre llamadas', async () => {
    const encolar = crearCola(40)
    const t0 = Date.now()
    await encolar(() => Promise.resolve(1))
    await encolar(() => Promise.resolve(2))
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35)
  })
})
