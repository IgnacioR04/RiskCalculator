/**
 * Suficiencia de datos para las señales sectoriales (LAB-710).
 *
 * Estas pruebas no comprueban un cálculo: comprueban **una aritmética que
 * decide si la Fase 7 puede publicarse**.
 *
 * La conclusión que fijan es incómoda y por eso conviene que esté en código y no
 * solo en un documento: con el historial que la aplicación puede descargar, las
 * señales de momentum **no se pueden ni calcular**, y mucho menos validar.
 *
 * Si algún día la aplicación descarga más historial, estas pruebas empezarán a
 * fallar, y ese fallo será la señal de que hay que revisar la decisión.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIN_PERIODS } from './backtest'
import { DIAS_POR_MES, momentum12_1, type PricePoint } from './signals'

/** Máximo que ofrece `useStabilityAnalysis`, en días naturales. */
const MAX_DIAS_NATURALES = 365

/** Sesiones bursátiles aproximadas en un año natural. */
const SESIONES_POR_ANO = 252

function serieDeSesiones(n: number): PricePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    close: 100 + i,
  }))
}

describe('cuánto historial hace falta y cuánto hay', () => {
  it('el momentum 12-1 necesita 253 observaciones para dar un solo valor', () => {
    // 12 meses de ventana más el punto de partida.
    const necesarias = 12 * DIAS_POR_MES + 1
    expect(necesarias).toBe(253)

    const justo = momentum12_1(serieDeSesiones(necesarias), '2030-01-01')
    expect(justo.ok).toBe(true)

    const unaMenos = momentum12_1(serieDeSesiones(necesarias - 1), '2030-01-01')
    expect(unaMenos.ok).toBe(false)
  })

  it('el máximo que descarga la aplicación no llega', () => {
    // 365 días naturales son unas 252 sesiones: una menos de la que hace falta.
    expect(SESIONES_POR_ANO).toBeLessThan(12 * DIAS_POR_MES + 1)

    const todoLoQueHay = momentum12_1(serieDeSesiones(SESIONES_POR_ANO), '2030-01-01')
    expect(todoLoQueHay.ok).toBe(false)
    if (todoLoQueHay.ok) return
    expect(todoLoQueHay.reason).toBe('insufficient_history')
  })

  it('aun con el año entero de sesiones, saldría un único valor y no una serie', () => {
    // Y una serie de un punto no permite ningún backtest.
    const conUnaMas = momentum12_1(serieDeSesiones(253), '2030-01-01')
    expect(conUnaMas.ok).toBe(true)
    // El siguiente valor mensual exigiría 21 sesiones más, que no existen.
    expect(SESIONES_POR_ANO + DIAS_POR_MES).toBeGreaterThan(MAX_DIAS_NATURALES * (252 / 365))
  })
})

describe('cuánto historial haría falta para validar', () => {
  it('validar exige 24 periodos mensuales además de la ventana inicial', () => {
    // 12 meses para formar la primera señal + 24 meses de rentabilidades
    // siguientes = 36 meses. La aplicación puede descargar 12.
    const mesesNecesarios = 12 + MIN_PERIODS
    expect(mesesNecesarios).toBe(36)
    expect(mesesNecesarios).toBeGreaterThan(12)
  })

  it('la brecha es de tres a uno, no de un margen estrecho', () => {
    const mesesDisponibles = Math.floor((MAX_DIAS_NATURALES * (SESIONES_POR_ANO / 365)) / DIAS_POR_MES)
    expect(mesesDisponibles).toBe(12)
    expect((12 + MIN_PERIODS) / mesesDisponibles).toBe(3)
  })
})

describe('la señal que sí sobrevive a esta aritmética', () => {
  it('la diversificación marginal no consulta ninguna serie', () => {
    // No predice nada: describe la cartera de hoy a partir de la covarianza que
    // ya se estima para la Fase 4. Por eso es la única de las tres que se puede
    // publicar. Se comprueba recorriendo el fuente, no prometiéndolo.
    const fuente = readFileSync(join(process.cwd(), 'src/lib/lab/sectors/signals.ts'), 'utf8')
    const cuerpo = fuente.slice(fuente.indexOf('export function marginalDiversification'))
    expect(cuerpo).not.toMatch(/upTo\(/)
    expect(cuerpo).not.toMatch(/PricePoint/)
  })
})
