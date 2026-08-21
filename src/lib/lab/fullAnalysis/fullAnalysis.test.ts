/**
 * LAB-1201 a LAB-1212. Identidad, cola y pipeline.
 *
 * Lo que se comprueba no es que salgan números, sino las propiedades sin las
 * cuales un análisis automático engaña: que la identidad distinga las preguntas
 * distintas, que las cuentas no se mezclen, que una respuesta tardía no pise a
 * una nueva, que lo local se publique sin esperar a la red y —lo que más código
 * ocupa— que **no aparezca ni un cero inventado**.
 */
import { describe, expect, it, vi } from 'vitest'
import { planScopes, runQueue } from './analysisQueue'
import { scopeKey, type AnalysisStage } from './contracts'
import {
  analysisIdentity,
  marketDataCacheKey,
  modelConfigFingerprint,
  structuralFingerprint,
  valuationVersion,
  type StructuralFingerprintInput,
  type ValuationSnapshotInput,
} from './fingerprint'
import { runFullAnalysis, MODULOS_PENDIENTES, type DatedReturn } from './runFullAnalysis'

/* ── Huella estructural ────────────────────────────────────────────────────── */

const OPERACION = {
  id: 't1',
  assetId: 'a1',
  accountId: 'c1',
  type: 'buy',
  datetime: '2026-01-02T10:00:00Z',
  quantity: '10',
  investedAmount: '1000',
  investedCurrency: 'EUR',
  executionPrice: '100',
  quoteCurrency: 'EUR',
  fee: '1.5',
  feeCurrency: 'EUR',
}

const ESTRUCTURA: StructuralFingerprintInput = {
  scope: { kind: 'portfolio' },
  transactions: [OPERACION, { ...OPERACION, id: 't2', assetId: 'a2', accountId: 'c2' }],
  assets: [
    { id: 'a1', symbol: 'AAA', assetType: 'stock', quoteCurrency: 'EUR' },
    { id: 'a2', symbol: 'BBB', assetType: 'etf', quoteCurrency: 'USD' },
  ],
  accountIds: ['c1', 'c2'],
}

describe('huella estructural', () => {
  it('la misma cartera da la misma huella', () => {
    expect(structuralFingerprint(ESTRUCTURA)).toBe(structuralFingerprint(ESTRUCTURA))
  })

  it('no depende del orden de las listas', () => {
    const revuelta: StructuralFingerprintInput = {
      ...ESTRUCTURA,
      transactions: [...ESTRUCTURA.transactions].reverse(),
      assets: [...ESTRUCTURA.assets].reverse(),
      accountIds: ['c2', 'c1'],
    }
    expect(structuralFingerprint(revuelta)).toBe(structuralFingerprint(ESTRUCTURA))
  })

  it('todos los campos de la operación que afectan al resultado cuentan', () => {
    // TWR, XIRR y costes dependen de importe, precio, comisión y divisas. Dos
    // carteras que solo se diferencien en una comisión no son la misma pregunta.
    const base = structuralFingerprint(ESTRUCTURA)
    const cambios: Partial<typeof OPERACION>[] = [
      { quantity: '11' },
      { investedAmount: '1001' },
      { executionPrice: '101' },
      { fee: '2' },
      { feeCurrency: 'USD' },
      { investedCurrency: 'USD' },
      { quoteCurrency: 'USD' },
      { type: 'sell' },
      { datetime: '2026-01-03T10:00:00Z' },
      { accountId: 'c9' },
    ]
    for (const cambio of cambios) {
      const otra: StructuralFingerprintInput = {
        ...ESTRUCTURA,
        transactions: [{ ...OPERACION, ...cambio }, ESTRUCTURA.transactions[1]!],
      }
      expect(structuralFingerprint(otra), JSON.stringify(cambio)).not.toBe(base)
    }
  })

  it('borrar una cuenta cambia la huella', () => {
    expect(structuralFingerprint({ ...ESTRUCTURA, accountIds: ['c1'] })).not.toBe(
      structuralFingerprint(ESTRUCTURA),
    )
  })

  it('la política, el objetivo y la clase económica cuentan', () => {
    const base = structuralFingerprint(ESTRUCTURA)
    expect(structuralFingerprint({ ...ESTRUCTURA, policyVersion: 'v2' })).not.toBe(base)
    expect(structuralFingerprint({ ...ESTRUCTURA, goalVersion: 'g1' })).not.toBe(base)
    expect(
      structuralFingerprint({
        ...ESTRUCTURA,
        assets: [{ ...ESTRUCTURA.assets[0]!, economicClass: 'bond' }, ESTRUCTURA.assets[1]!],
      }),
    ).not.toBe(base)
  })

  it('el efectivo cuenta cuando forma parte de la cartera', () => {
    expect(
      structuralFingerprint({
        ...ESTRUCTURA,
        cashBalances: [{ accountId: 'c1', amount: '500', currency: 'EUR' }],
      }),
    ).not.toBe(structuralFingerprint(ESTRUCTURA))
  })

  it('el precio de mercado no forma parte de la estructura', () => {
    // La estructura es «qué tienes», no «cuánto vale». El contrato ni siquiera
    // admite precios.
    expect(Object.keys(ESTRUCTURA.assets[0]!)).not.toContain('price')
  })
})

/* ── Valoración ────────────────────────────────────────────────────────────── */

const VALORACION: ValuationSnapshotInput = {
  asOf: '2026-08-21',
  baseCurrency: 'EUR',
  prices: [{ assetId: 'a1', price: '100', currency: 'EUR', asOf: '2026-08-21T10:00:00Z' }],
  fx: [{ pair: 'EUR/USD', rate: '1.08' }],
}

describe('versión de valoración', () => {
  it('los mismos precios dan la misma versión', () => {
    expect(valuationVersion(VALORACION)).toBe(valuationVersion(VALORACION))
  })

  it('un cambio de cotización intradía cambia la versión', () => {
    // Aquí está la propiedad que cierra la contradicción: aunque un tick no
    // dispare un análisis nuevo, si por cualquier motivo se recalcula, el
    // informe resultante **no puede** compartir identidad con el anterior.
    const otra = valuationVersion({
      ...VALORACION,
      prices: [{ ...VALORACION.prices[0]!, price: '101' }],
    })
    expect(otra).not.toBe(valuationVersion(VALORACION))
  })

  it('un cambio de FX cambia la versión', () => {
    expect(
      valuationVersion({ ...VALORACION, fx: [{ pair: 'EUR/USD', rate: '1.09' }] }),
    ).not.toBe(valuationVersion(VALORACION))
  })

  it('cambiar de día cambia la versión', () => {
    expect(valuationVersion({ ...VALORACION, asOf: '2026-08-22' })).not.toBe(
      valuationVersion(VALORACION),
    )
  })

  it('cambiar la divisa base cambia la versión', () => {
    expect(valuationVersion({ ...VALORACION, baseCurrency: 'USD' })).not.toBe(
      valuationVersion(VALORACION),
    )
  })
})

describe('configuración de modelo', () => {
  const base = modelConfigFingerprint({ modelVersions: { analysis: 'v1' } })

  it('benchmark, tasa sin riesgo y versiones cambian la huella', () => {
    expect(modelConfigFingerprint({ modelVersions: { analysis: 'v1' }, benchmarkId: 'w' })).not.toBe(base)
    expect(modelConfigFingerprint({ modelVersions: { analysis: 'v1' }, riskFreeRate: 0.03 })).not.toBe(base)
    expect(modelConfigFingerprint({ modelVersions: { analysis: 'v2' } })).not.toBe(base)
    expect(
      modelConfigFingerprint({ modelVersions: { analysis: 'v1' }, optimizationConfig: 'o1' }),
    ).not.toBe(base)
    expect(
      modelConfigFingerprint({ modelVersions: { analysis: 'v1' }, simulationConfig: 's1' }),
    ).not.toBe(base)
  })
})

describe('identidad completa', () => {
  it('dos valoraciones distintas nunca comparten identidad', () => {
    const a = analysisIdentity('e1', 'v1', 'm1')
    const b = analysisIdentity('e1', 'v2', 'm1')
    expect(a.full).not.toBe(b.full)
  })

  it('la clave de caché de mercado no depende del ámbito', () => {
    // La serie diaria de un instrumento es la misma para la cartera consolidada
    // y para cada cuenta: meterle el ámbito multiplicaría las llamadas sin traer
    // un solo dato nuevo.
    expect(marketDataCacheKey('a1', 'EUR', 'td', 365)).toBe(
      marketDataCacheKey('a1', 'EUR', 'td', 365),
    )
    expect(marketDataCacheKey('a1', 'USD', 'td', 365)).not.toBe(
      marketDataCacheKey('a1', 'EUR', 'td', 365),
    )
  })
})

/* ── Cola ──────────────────────────────────────────────────────────────────── */

describe('planScopes', () => {
  it('la cartera consolidada va siempre primero', () => {
    expect(planScopes(['c2', 'c1'])[0]!.scope.kind).toBe('portfolio')
  })

  it('la cuenta visible va la segunda, no la última', () => {
    expect(scopeKey(planScopes(['c1', 'c2', 'c3'], 'c3')[1]!.scope)).toBe('account:c3')
  })

  it('el resto va en orden estable', () => {
    expect(planScopes(['c3', 'c1', 'c2'])).toEqual(planScopes(['c1', 'c2', 'c3']))
  })
})

describe('runQueue', () => {
  it('ejecuta en orden y publica cada resultado', async () => {
    const publicados: string[] = []
    await runQueue(
      planScopes(['c1', 'c2']),
      async (scope) => scopeKey(scope),
      (_, r) => publicados.push(r),
      () => true,
    )
    expect(publicados).toEqual(['portfolio', 'account:c1', 'account:c2'])
  })

  it('deja de publicar en cuanto la generación cambia', async () => {
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

type Entrada = Parameters<typeof runFullAnalysis>[0]

const entrada = (extra: Partial<Entrada> = {}): Entrada => ({
  runId: 'r1',
  fingerprint: 'e1.v1.m1',
  structuralFingerprint: 'e1',
  valuationVersion: 'v1',
  modelConfigFingerprint: 'm1',
  scope: { kind: 'portfolio' },
  asOf: '2026-08-21',
  baseCurrency: 'EUR',
  positions: POSICIONES,
  seriesFor: async () => new Map<string, readonly DatedReturn[]>(),
  ...extra,
})

describe('runFullAnalysis · etapas', () => {
  it('publica la concentración antes de tocar la red', async () => {
    const etapas: AnalysisStage[] = []
    let estadoEnLocal: string | undefined
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
        if (etapa === 'localMetrics') estadoEnLocal = informe.concentration.status
      },
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(etapas).toEqual(['snapshot', 'localMetrics'])
    expect(estadoEnLocal).toBe('available')

    resolverRed()
    await promesa
    expect(etapas).toHaveLength(6)
  })
})

describe('runFullAnalysis · ámbito', () => {
  it('una cuenta no usa posiciones de otra', async () => {
    const informe = await runFullAnalysis(entrada({ scope: { kind: 'account', accountId: 'c1' } }))
    expect(informe.snapshot.status).toBe('available')
    if (informe.snapshot.status !== 'available') return
    expect(informe.snapshot.value.positions.map((p) => p.symbol)).toEqual(['AAA', 'CCC'])
    expect(informe.snapshot.value.knownValue).toBe(7000)
  })

  it('un ámbito vacío se declara insuficiente', async () => {
    const informe = await runFullAnalysis(entrada({ scope: { kind: 'account', accountId: 'no' } }))
    expect(informe.status).toBe('insufficient')
  })

  it('el informe lleva las tres huellas', async () => {
    const informe = await runFullAnalysis(entrada())
    expect(informe.structuralFingerprint).toBe('e1')
    expect(informe.valuationVersion).toBe('v1')
    expect(informe.modelConfigFingerprint).toBe('m1')
  })
})

describe('runFullAnalysis · ni un cero inventado', () => {
  it('sin valores positivos, la concentración es insuficiente y no cero', async () => {
    // Un HHI de 0 significaría «reparto infinitamente diversificado», que es lo
    // contrario de «no se sabe».
    const informe = await runFullAnalysis(
      entrada({ positions: POSICIONES.map((p) => ({ ...p, value: null })) }),
    )
    expect(informe.concentration.status).toBe('insufficient')
  })

  it('una posición sin precio tiene peso null, no cero', async () => {
    // Un peso de 0 invita a ignorarla; «no se sabe» invita a completarla.
    const informe = await runFullAnalysis(
      entrada({ positions: [...POSICIONES, { ...POSICIONES[0]!, assetId: 'a4', symbol: 'DDD', value: null }] }),
    )
    expect(informe.snapshot.status).toBe('available')
    if (informe.snapshot.status !== 'available') return
    expect(informe.snapshot.value.weights.at(-1)).toBeNull()
    expect(informe.snapshot.value.unvalued).toEqual(['DDD'])
  })

  it('sin historial, el drawdown no aparece como cero', async () => {
    // Un 0 diría que la cartera nunca ha caído: una afirmación fuerte y falsa.
    const informe = await runFullAnalysis(entrada())
    expect(informe.risk.status).toBe('insufficient')
  })

  it('la cobertura por valor no afirma 100 % si falta un precio', async () => {
    // El denominador correcto sería el valor total, que es justo el que no se
    // conoce. Dividir el valor conocido entre sí mismo daba 100 % con media
    // cartera sin precio.
    const informe = await runFullAnalysis(
      entrada({ positions: [...POSICIONES, { ...POSICIONES[0]!, assetId: 'a4', symbol: 'DDD', value: null }] }),
    )
    expect(informe.quality.status).toBe('available')
    if (informe.quality.status !== 'available') return
    expect(informe.quality.value.pricedCoverage).toBeNull()
    expect(informe.quality.value.pricedCoverageByCount).toBeCloseTo(0.75, 6)
  })

  it('con todo valorado, la cobertura por valor sí es 100 %', async () => {
    const informe = await runFullAnalysis(entrada())
    expect(informe.quality.status === 'available' && informe.quality.value.pricedCoverage).toBe(1)
  })
})

describe('runFullAnalysis · fallos de series', () => {
  it('los instrumentos que no llegaron se nombran con su motivo', async () => {
    const informe = await runFullAnalysis(
      entrada({ seriesFailures: new Map([['a2', 'Límite del proveedor.']]) }),
    )
    expect(informe.quality.status).toBe('available')
    if (informe.quality.status !== 'available') return
    expect(informe.quality.value.failures).toEqual([
      { symbol: 'BBB', reason: 'Límite del proveedor.' },
    ])
    expect(informe.findings.map((f) => f.code)).toContain('series_failures')
  })
})

describe('runFullAnalysis · alcance declarado', () => {
  it('declara pieza a pieza lo que todavía no calcula', async () => {
    // Una limitación concreta se puede comprobar y tachar; una genérica se queda
    // para siempre.
    const informe = await runFullAnalysis(entrada())
    const limitacion = informe.limitations.find((l) => l.code === 'modules_pending')
    expect(limitacion).toBeDefined()
    expect(limitacion!.affects).toEqual([...MODULOS_PENDIENTES])
    expect(limitacion!.message).toMatch(/No es un diagnóstico completo/)
  })

  it('los datos que invalidan cálculos van primero', async () => {
    const informe = await runFullAnalysis(
      entrada({ positions: [...POSICIONES, { ...POSICIONES[0]!, assetId: 'a4', symbol: 'DDD', value: null }] }),
    )
    expect(informe.findings[0]!.actionType).toBe('complete_data')
  })
})

describe('runFullAnalysis · reproducibilidad', () => {
  it('la misma entrada da el mismo informe', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T10:00:00Z'))
    const a = await runFullAnalysis(entrada())
    const b = await runFullAnalysis(entrada())
    vi.useRealTimers()
    expect(a).toEqual(b)
  })
})
