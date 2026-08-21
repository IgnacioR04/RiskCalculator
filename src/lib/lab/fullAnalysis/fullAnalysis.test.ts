/**
 * LAB-1201 a LAB-1204. Huella, cola y pipeline.
 *
 * Lo que se comprueba no es que salgan números, sino las cuatro propiedades sin
 * las cuales un análisis automático engaña: que la huella distinga las preguntas
 * distintas y **no se mueva con el precio**, que las cuentas no se mezclen, que
 * una respuesta tardía no pise a una nueva, y que lo local se publique sin
 * esperar a la red.
 */
import { describe, expect, it, vi } from 'vitest'
import { planScopes, runQueue } from './analysisQueue'
import { scopeKey, type AnalysisStage } from './contracts'
import { buildFingerprint, type FingerprintInput } from './fingerprint'
import { runFullAnalysis, type DatedReturn } from './runFullAnalysis'

/* ── Huella ────────────────────────────────────────────────────────────────── */

const HUELLA_BASE: FingerprintInput = {
  scope: { kind: 'portfolio' },
  asOf: '2026-08-21',
  baseCurrency: 'EUR',
  transactions: [
    { id: 't1', assetId: 'a1', accountId: 'c1', kind: 'buy', quantity: '10', date: '2026-01-02' },
    { id: 't2', assetId: 'a2', accountId: 'c2', kind: 'buy', quantity: '5', date: '2026-01-03' },
  ],
  assets: [
    { id: 'a1', symbol: 'AAA', assetType: 'stock', quoteCurrency: 'EUR' },
    { id: 'a2', symbol: 'BBB', assetType: 'etf', quoteCurrency: 'USD' },
  ],
  modelVersion: 'test',
}

describe('buildFingerprint', () => {
  it('la misma cartera da la misma huella', () => {
    expect(buildFingerprint(HUELLA_BASE)).toBe(buildFingerprint(HUELLA_BASE))
  })

  it('no depende del orden de las operaciones ni de los activos', () => {
    // Dos carteras iguales con las listas en otro orden son la misma cartera.
    const revuelta: FingerprintInput = {
      ...HUELLA_BASE,
      transactions: [...HUELLA_BASE.transactions].reverse(),
      assets: [...HUELLA_BASE.assets].reverse(),
    }
    expect(buildFingerprint(revuelta)).toBe(buildFingerprint(HUELLA_BASE))
  })

  it('cambiar una operación cambia la huella', () => {
    const otra: FingerprintInput = {
      ...HUELLA_BASE,
      transactions: [
        { ...HUELLA_BASE.transactions[0]!, quantity: '11' },
        HUELLA_BASE.transactions[1]!,
      ],
    }
    expect(buildFingerprint(otra)).not.toBe(buildFingerprint(HUELLA_BASE))
  })

  it('cambiar divisa, ámbito, fecha, benchmark o política cambia la huella', () => {
    const base = buildFingerprint(HUELLA_BASE)
    expect(buildFingerprint({ ...HUELLA_BASE, baseCurrency: 'USD' })).not.toBe(base)
    expect(
      buildFingerprint({ ...HUELLA_BASE, scope: { kind: 'account', accountId: 'c1' } }),
    ).not.toBe(base)
    expect(buildFingerprint({ ...HUELLA_BASE, asOf: '2026-08-22' })).not.toBe(base)
    expect(buildFingerprint({ ...HUELLA_BASE, benchmarkId: 'world' })).not.toBe(base)
    expect(buildFingerprint({ ...HUELLA_BASE, policyVersion: 'v2' })).not.toBe(base)
    expect(buildFingerprint({ ...HUELLA_BASE, riskFreeRate: 0.03 })).not.toBe(base)
  })

  it('el precio de mercado NO entra en la huella', () => {
    // Es la decisión con más consecuencias del módulo: si entrara, cada tick de
    // precio lanzaría un análisis completo con sus descargas de historial.
    // La entrada ni siquiera admite precios, así que esta prueba comprueba que
    // el contrato no los tiene.
    expect(Object.keys(HUELLA_BASE)).not.toContain('quotes')
    expect(Object.keys(HUELLA_BASE.assets[0]!)).not.toContain('price')
  })
})

/* ── Cola ──────────────────────────────────────────────────────────────────── */

describe('planScopes', () => {
  it('la cartera consolidada va siempre primero', () => {
    const plan = planScopes(['c2', 'c1'])
    expect(plan[0]!.scope.kind).toBe('portfolio')
  })

  it('la cuenta visible va la segunda, no la última', () => {
    const plan = planScopes(['c1', 'c2', 'c3'], 'c3')
    expect(scopeKey(plan[1]!.scope)).toBe('account:c3')
  })

  it('el resto va en orden estable', () => {
    // Dos ejecuciones con las mismas cuentas tienen que dar la misma cola, o el
    // historial de ejecuciones deja de ser comparable.
    expect(planScopes(['c3', 'c1', 'c2'])).toEqual(planScopes(['c1', 'c2', 'c3']))
  })

  it('las cuentas repetidas se encolan una sola vez', () => {
    expect(planScopes(['c1', 'c1', 'c2'])).toHaveLength(3)
  })
})

describe('runQueue', () => {
  it('ejecuta en orden y publica cada resultado', async () => {
    const orden: string[] = []
    const publicados: string[] = []
    await runQueue(
      planScopes(['c1', 'c2']),
      async (scope) => {
        orden.push(scopeKey(scope))
        return scopeKey(scope)
      },
      (_, r) => publicados.push(r),
      () => true,
    )
    expect(orden).toEqual(['portfolio', 'account:c1', 'account:c2'])
    expect(publicados).toEqual(orden)
  })

  it('deja de publicar en cuanto la generación cambia', async () => {
    // La comprobación va **antes de empezar y antes de publicar**: entre las
    // dos puede pasar un segundo entero de descargas.
    let vigente = true
    const publicados: string[] = []
    const r = await runQueue(
      planScopes(['c1', 'c2']),
      async (scope) => {
        if (scopeKey(scope) === 'account:c1') vigente = false
        return scopeKey(scope)
      },
      (_, x) => publicados.push(x),
      () => vigente,
    )
    expect(publicados).toEqual(['portfolio'])
    expect(r.canceladas).toBeGreaterThan(0)
  })

  it('respeta el tope de concurrencia', async () => {
    let enVuelo = 0
    let maximo = 0
    await runQueue(
      planScopes(['c1', 'c2', 'c3', 'c4']),
      async () => {
        enVuelo += 1
        maximo = Math.max(maximo, enVuelo)
        await Promise.resolve()
        enVuelo -= 1
        return null
      },
      () => {},
      () => true,
      { concurrency: 2 },
    )
    expect(maximo).toBeLessThanOrEqual(2)
  })
})

/* ── Pipeline ──────────────────────────────────────────────────────────────── */

const POSICIONES = [
  { assetId: 'a1', symbol: 'AAA', assetType: 'stock', accountId: 'c1', value: 6000, quantity: 10 },
  { assetId: 'a2', symbol: 'BBB', assetType: 'etf', accountId: 'c2', value: 3000, quantity: 5 },
  { assetId: 'a3', symbol: 'CCC', assetType: 'stock', accountId: 'c1', value: 1000, quantity: 2 },
]

const entrada = (extra: Partial<Parameters<typeof runFullAnalysis>[0]> = {}) => ({
  runId: 'r1',
  fingerprint: 'f1',
  scope: { kind: 'portfolio' } as const,
  asOf: '2026-08-21',
  baseCurrency: 'EUR' as const,
  positions: POSICIONES,
  seriesFor: async () => new Map<string, readonly DatedReturn[]>(),
  ...extra,
})

describe('runFullAnalysis · etapas', () => {
  it('publica la concentración antes de tocar la red', async () => {
    // La propiedad que hace útil el análisis progresivo: los pesos ya están en
    // el dispositivo, hacerlos esperar a una descarga es pantalla vacía gratis.
    const etapas: AnalysisStage[] = []
    let concentracionEnLocal: string | undefined

    let resolverRed: () => void = () => {}
    const red = new Promise<void>((r) => {
      resolverRed = r
    })

    const promesa = runFullAnalysis(
      entrada({
        seriesFor: async () => {
          await red
          return new Map()
        },
      }),
      (informe, etapa) => {
        etapas.push(etapa)
        if (etapa === 'localMetrics') concentracionEnLocal = informe.concentration.status
      },
    )

    // Se cede el turno para que corran las dos primeras etapas, que son
    // síncronas, sin haber resuelto todavía la descarga.
    await Promise.resolve()
    await Promise.resolve()
    expect(etapas).toEqual(['snapshot', 'localMetrics'])
    expect(concentracionEnLocal).toBe('available')

    resolverRed()
    await promesa
    expect(etapas).toEqual([
      'snapshot',
      'localMetrics',
      'marketData',
      'quality',
      'riskAndDependence',
      'diagnosis',
    ])
  })

  it('el informe parcial ya es utilizable, con lo pendiente marcado', async () => {
    const parciales: string[] = []
    await runFullAnalysis(entrada(), (informe, etapa) => {
      if (etapa === 'localMetrics') parciales.push(informe.risk.status)
    })
    // Lo que aún no se sabe se marca, no se rellena con un cero.
    expect(parciales).toEqual(['insufficient'])
  })
})

describe('runFullAnalysis · ámbito', () => {
  it('una cuenta no usa posiciones de otra', async () => {
    const informe = await runFullAnalysis(
      entrada({ scope: { kind: 'account', accountId: 'c1' } }),
    )
    expect(informe.snapshot.status).toBe('available')
    if (informe.snapshot.status !== 'available') return

    expect(informe.snapshot.value.positions.map((p) => p.symbol)).toEqual(['AAA', 'CCC'])
    expect(informe.snapshot.value.totalValue).toBe(7000)
  })

  it('el consolidado suma todas las cuentas', async () => {
    const informe = await runFullAnalysis(entrada())
    expect(informe.snapshot.status === 'available' && informe.snapshot.value.totalValue).toBe(10000)
  })

  it('un ámbito vacío se declara insuficiente, no se inventa', async () => {
    const informe = await runFullAnalysis(
      entrada({ scope: { kind: 'account', accountId: 'no-existe' } }),
    )
    expect(informe.status).toBe('insufficient')
    expect(informe.snapshot.status).toBe('insufficient')
  })
})

describe('runFullAnalysis · datos ausentes', () => {
  it('una posición sin precio se nombra, no se cuenta como cero', async () => {
    const informe = await runFullAnalysis(
      entrada({
        positions: [...POSICIONES, { ...POSICIONES[0]!, assetId: 'a4', symbol: 'DDD', value: null }],
      }),
    )
    expect(informe.snapshot.status === 'available' && informe.snapshot.value.unvalued).toEqual([
      'DDD',
    ])
    // Y el total no la incluye: sigue siendo 10000.
    expect(informe.snapshot.status === 'available' && informe.snapshot.value.totalValue).toBe(10000)
  })

  it('sin historial, el riesgo queda insuficiente y la concentración no', async () => {
    // Una etapa bloqueada no puede bloquear a las que no dependen de ella.
    const informe = await runFullAnalysis(entrada())
    expect(informe.risk.status).toBe('insufficient')
    expect(informe.concentration.status).toBe('available')
  })

  it('con poco historial común dice cuántas observaciones faltan', async () => {
    const serie = (n: number): DatedReturn[] =>
      Array.from({ length: n }, (_, i) => ({
        date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        value: 0.001,
      }))
    const informe = await runFullAnalysis(
      entrada({
        seriesFor: async () =>
          new Map<string, readonly DatedReturn[]>([
            ['a1', serie(10)],
            ['a2', serie(10)],
            ['a3', serie(10)],
          ]),
      }),
    )
    expect(informe.risk.status).toBe('insufficient')
    if (informe.risk.status !== 'insufficient') return
    expect(informe.risk.message).toMatch(/hacen falta 60/)
  })
})

describe('runFullAnalysis · hallazgos', () => {
  it('los datos que invalidan cálculos van primero', async () => {
    const informe = await runFullAnalysis(
      entrada({
        positions: [...POSICIONES, { ...POSICIONES[0]!, assetId: 'a4', symbol: 'DDD', value: null }],
      }),
    )
    // Enseñar una conclusión sobre concentración antes de avisar de que faltan
    // precios es dar por buena una cifra que no lo es.
    expect(informe.findings[0]!.actionType).toBe('complete_data')
  })

  it('una posición dominante se señala', async () => {
    const informe = await runFullAnalysis(
      entrada({
        positions: [
          { ...POSICIONES[0]!, value: 9000 },
          { ...POSICIONES[1]!, value: 1000 },
        ],
      }),
    )
    const codigos = informe.findings.map((f) => f.code)
    expect(codigos).toContain('high_single_position')
  })

  it('lo que todavía no se calcula se declara como limitación', async () => {
    const informe = await runFullAnalysis(entrada())
    expect(informe.limitations.map((l) => l.code)).toContain('stages_pending')
  })
})

describe('runFullAnalysis · reproducibilidad', () => {
  it('la misma entrada da el mismo informe, salvo la marca de tiempo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T10:00:00Z'))
    const a = await runFullAnalysis(entrada())
    const b = await runFullAnalysis(entrada())
    vi.useRealTimers()
    expect(a).toEqual(b)
  })

  it('el informe lleva ámbito, huella y versión de modelo', async () => {
    const informe = await runFullAnalysis(entrada({ scope: { kind: 'account', accountId: 'c1' } }))
    expect(informe.fingerprint).toBe('f1')
    expect(informe.scope).toEqual({ kind: 'account', accountId: 'c1' })
    expect(informe.modelVersion).toBe('full-analysis-v1')
  })
})
