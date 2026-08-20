/**
 * Pruebas del almacén de observaciones y de la combinación (LAB-704, LAB-708).
 *
 * El criterio de aceptación de LAB-704: **no se reescribe el pasado que ya usó
 * una ejecución**. Si se sobrescribiera, un resultado calculado ayer dejaría de
 * ser reproducible hoy y nadie sabría por qué cambió.
 */
import { describe, expect, it } from 'vitest'
import {
  FEATURE_ERROR_TEXT,
  correctObservation,
  historyOf,
  observationAsOf,
  putObservation,
  snapshotAsOf,
  type FeatureObservation,
  type FeatureStore,
} from './featureStore'
import {
  MIN_COVERAGE,
  combineSignals,
  normalizeByRank,
  type SignalReading,
} from './combine'

const obs = (cambios: Partial<FeatureObservation> = {}): FeatureObservation => ({
  modelKey: 'sector.momentum',
  featureVersion: 1,
  sector: 'tecnologia',
  observedAt: '2026-03-31',
  availableAt: '2026-04-01',
  ingestedAt: '2026-04-02',
  value: 0.18,
  source: 'twelvedata',
  ...cambios,
})

function almacen(): FeatureStore {
  const r = putObservation([], obs())
  if (!r.ok) throw new Error('alta rechazada')
  return r.store
}

/* ── LAB-704 ──────────────────────────────────────────────────────────────── */

describe('una corrección no borra el pasado', () => {
  const corregido = correctObservation(
    almacen(),
    obs({ value: 0.15, availableAt: '2026-05-10', ingestedAt: '2026-05-10' }),
  )

  it('las dos observaciones conviven', () => {
    expect(corregido.ok).toBe(true)
    if (!corregido.ok) return
    expect(historyOf(corregido.store, 'sector.momentum', 'tecnologia', '2026-03-31')).toHaveLength(2)
  })

  it('quien consultó en abril sigue viendo el dato de abril', () => {
    // Esto es lo que hace reproducible un resultado antiguo.
    if (!corregido.ok) return
    const visto = observationAsOf(
      corregido.store,
      'sector.momentum',
      'tecnologia',
      '2026-03-31',
      '2026-04-15',
    )
    expect(visto?.value).toBe(0.18)
  })

  it('quien consulta en junio ve el corregido', () => {
    if (!corregido.ok) return
    const visto = observationAsOf(
      corregido.store,
      'sector.momentum',
      'tecnologia',
      '2026-03-31',
      '2026-06-01',
    )
    expect(visto?.value).toBe(0.15)
  })

  it('la observación antigua queda marcada como corregida', () => {
    if (!corregido.ok) return
    const historia = historyOf(corregido.store, 'sector.momentum', 'tecnologia', '2026-03-31')
    expect(historia[0]!.corrected).toBe(true)
    expect(historia[1]!.corrected).toBeUndefined()
  })
})

describe('las tres fechas impiden usar información del futuro', () => {
  it('un dato disponible antes de la fecha a la que se refiere se rechaza', () => {
    const r = putObservation([], obs({ observedAt: '2026-03-31', availableAt: '2026-03-15' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('available_before_observed')
    expect(r.detail).toMatch(/información del futuro/)
  })

  it('antes de estar disponible, la consulta no lo devuelve', () => {
    expect(
      observationAsOf(almacen(), 'sector.momentum', 'tecnologia', '2026-03-31', '2026-03-31'),
    ).toBeNull()
  })

  it('el mismo día en que está disponible, ya se devuelve', () => {
    expect(
      observationAsOf(almacen(), 'sector.momentum', 'tecnologia', '2026-03-31', '2026-04-01'),
    ).not.toBeNull()
  })

  it('una fecha inválida se rechaza', () => {
    expect(putObservation([], obs({ observedAt: '31/03/2026' })).ok).toBe(false)
    expect(putObservation([], obs({ availableAt: '2026-02-30' })).ok).toBe(false)
  })
})

describe('un hueco es un dato, y lleva motivo', () => {
  it('una observación sin valor tiene que decir por qué', () => {
    const r = putObservation([], obs({ value: null }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('missing_reason')
  })

  it('con motivo, entra', () => {
    const r = putObservation([], obs({ value: null, missingReason: 'Menos de doce meses de serie.' }))
    expect(r.ok).toBe(true)
  })

  it('«null con motivo» es distinto de «no existe la observación»', () => {
    // El primero significa «se intentó y no había muestra»; el segundo, «no se
    // intentó».
    const r = putObservation([], obs({ value: null, missingReason: 'Sin serie.' }))
    if (!r.ok) return
    const encontrado = observationAsOf(r.store, 'sector.momentum', 'tecnologia', '2026-03-31', '2026-04-01')
    expect(encontrado).not.toBeNull()
    expect(encontrado!.value).toBeNull()
    expect(encontrado!.missingReason).toBe('Sin serie.')
  })

  it('el mensaje explica por qué un null sin motivo no informa', () => {
    expect(FEATURE_ERROR_TEXT.missing_reason).toMatch(/no informa/)
  })
})

describe('sin duplicados', () => {
  it('la misma observación con la misma disponibilidad se rechaza', () => {
    const r = putObservation(almacen(), obs())
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('duplicate_observation')
  })

  it('la misma observación con disponibilidad posterior sí entra: es una corrección', () => {
    expect(putObservation(almacen(), obs({ availableAt: '2026-05-01' })).ok).toBe(true)
  })
})

describe('instantánea de todos los sectores a una fecha', () => {
  it('devuelve un sector por señal, ordenados', () => {
    const a = putObservation([], obs({ sector: 'zeta' }))
    if (!a.ok) throw new Error('falló')
    const b = putObservation(a.store, obs({ sector: 'alfa' }))
    if (!b.ok) throw new Error('falló')

    const foto = snapshotAsOf(b.store, 'sector.momentum', '2026-03-31', '2026-04-01')
    expect(foto.map((o) => o.sector)).toEqual(['alfa', 'zeta'])
  })

  it('no incluye lo que aún no estaba disponible', () => {
    const a = putObservation([], obs({ sector: 'alfa' }))
    if (!a.ok) throw new Error('falló')
    const b = putObservation(a.store, obs({ sector: 'zeta', availableAt: '2026-06-01' }))
    if (!b.ok) throw new Error('falló')

    expect(snapshotAsOf(b.store, 'sector.momentum', '2026-03-31', '2026-04-15')).toHaveLength(1)
  })

  it('sin almacén no rompe', () => {
    expect(snapshotAsOf([], 'sector.momentum', '2026-03-31', '2026-04-01')).toEqual([])
  })
})

/* ── LAB-708 ──────────────────────────────────────────────────────────────── */

describe('normalización por rango', () => {
  const lectura = (sector: string, value: number | null): SignalReading => ({ sector, value })

  it('el mayor tiene rango 1 y el menor rango 0', () => {
    const r = normalizeByRank([lectura('a', 0.1), lectura('b', 0.5), lectura('c', 0.3)])
    expect(r.find((x) => x.sector === 'b')!.rank).toBe(1)
    expect(r.find((x) => x.sector === 'a')!.rank).toBe(0)
  })

  it('los empates comparten rango, así que el orden de entrada no importa', () => {
    const directo = normalizeByRank([lectura('a', 0.2), lectura('b', 0.2), lectura('c', 0.9)])
    const inverso = normalizeByRank([lectura('c', 0.9), lectura('b', 0.2), lectura('a', 0.2)])
    expect(directo.find((x) => x.sector === 'a')!.rank).toBe(
      inverso.find((x) => x.sector === 'a')!.rank,
    )
  })

  it('un valor extremo no arrastra a los demás', () => {
    // Es la razón de usar rangos y no z-scores: con ocho sectores, un extremo
    // movería la media y la desviación de todos.
    const normal = normalizeByRank([lectura('a', 0.1), lectura('b', 0.2), lectura('c', 0.3)])
    const conExtremo = normalizeByRank([lectura('a', 0.1), lectura('b', 0.2), lectura('c', 99)])
    expect(normal.find((x) => x.sector === 'a')!.rank).toBe(
      conExtremo.find((x) => x.sector === 'a')!.rank,
    )
  })

  it('un sector sin valor no se rellena con la media', () => {
    // No está «en el medio»: es que no se sabe.
    const r = normalizeByRank([lectura('a', 0.1), lectura('b', null), lectura('c', 0.3)])
    expect(r.find((x) => x.sector === 'b')!.rank).toBeNull()
  })

  it('sin ningún valor, todos quedan sin rango', () => {
    const r = normalizeByRank([lectura('a', null), lectura('b', null)])
    expect(r.every((x) => x.rank === null)).toBe(true)
  })

  it('con un solo sector, su rango es el punto medio', () => {
    expect(normalizeByRank([lectura('a', 0.5)])[0]!.rank).toBe(0.5)
  })
})

describe('combinación de señales', () => {
  const señal = (modelKey: string, weight: number, valores: Record<string, number | null>) => ({
    modelKey,
    label: modelKey,
    weight,
    readings: Object.entries(valores).map(([sector, value]) => ({ sector, value })),
  })

  it('ordena por la media ponderada de rangos', () => {
    const r = combineSignals([
      señal('mom', 1, { a: 0.1, b: 0.9, c: 0.5 }),
      señal('vol', 1, { a: 0.1, b: 0.9, c: 0.5 }),
    ])
    expect(r.ranking.map((x) => x.sector)).toEqual(['b', 'c', 'a'])
    expect(r.ranking[0]!.position).toBe(1)
  })

  it('el peso de cada señal cuenta', () => {
    const r = combineSignals([
      señal('mom', 9, { a: 0.9, b: 0.1 }),
      señal('vol', 1, { a: 0.1, b: 0.9 }),
    ])
    expect(r.ranking[0]!.sector).toBe('a')
  })

  it('el rango de cada señal se conserva, para poder explicar el puesto', () => {
    const r = combineSignals([señal('mom', 1, { a: 0.1, b: 0.9 })])
    expect(r.ranking[0]!.bySignal['mom']).toBe(1)
  })

  it('una señal que falta no redistribuye su peso: baja la cobertura', () => {
    // Redistribuirlo haría que un sector con una señal pareciera tan informado
    // como uno con tres.
    const r = combineSignals([
      señal('mom', 1, { a: 0.5, b: 0.5 }),
      señal('vol', 1, { a: 0.5, b: null }),
    ])
    const b = r.ranking.find((x) => x.sector === 'b')!
    expect(b.coverage).toBeCloseTo(0.5, 9)
    expect(b.missing).toEqual(['vol'])
  })

  it('por debajo de la cobertura mínima, el sector queda fuera del ranking', () => {
    const r = combineSignals([
      señal('mom', 1, { a: 0.5, b: null }),
      señal('vol', 1, { a: 0.5, b: null }),
      señal('div', 1, { a: 0.5, b: 0.5 }),
    ])
    expect(r.unranked).toContain('b')
    expect(r.ranking.map((x) => x.sector)).not.toContain('b')
  })

  it('la cobertura mínima está declarada como dato', () => {
    expect(MIN_COVERAGE).toBeGreaterThan(0)
    expect(MIN_COVERAGE).toBeLessThanOrEqual(1)
  })

  it('declara que el orden no es una puntuación de calidad', () => {
    const r = combineSignals([señal('mom', 1, { a: 0.5 })])
    expect(r.limitations.some((l) => /no de una puntuación de calidad/.test(l))).toBe(true)
  })

  it('declara que los pesos no están optimizados, y por qué', () => {
    const r = combineSignals([señal('mom', 1, { a: 0.5 })])
    expect(r.limitations.some((l) => /ajustar al ruido/.test(l))).toBe(true)
  })

  it('el empate se rompe por nombre, no por azar', () => {
    const r = combineSignals([señal('mom', 1, { zeta: 0.5, alfa: 0.5 })])
    expect(r.ranking.map((x) => x.sector)).toEqual(['alfa', 'zeta'])
  })

  it('sin señales no rompe', () => {
    const r = combineSignals([])
    expect(r.ranking).toEqual([])
    expect(r.unranked).toEqual([])
  })
})
