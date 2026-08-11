/**
 * Pruebas del adaptador de calidad (LAB-211).
 *
 * El criterio de aceptación es «la misma cartera produce un informe estable», y
 * se comprueba de dos maneras: evaluando dos veces los mismos datos y fijando
 * que la fecha entra como argumento, no del reloj.
 *
 * También se comprueba el paso 4 de la ficha —«no hacer nuevas llamadas de
 * red»— recorriendo el fuente del adaptador, porque una convención sin guardián
 * se rompe sola.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Decimal } from '../../finance/decimal'
import { buildPortfolioView, type PositionView } from '../../portfolio'
import type {
  Asset,
  BrokerAccount,
  Currency,
  FxRate,
  Quote,
  Transaction,
} from '../../domain'
import type { SeriesPoint } from '../../market/seriesCache'
import {
  assessPortfolioQuality,
  diasDesde,
  observacionesAlineadas,
  type PortfolioQualityInput,
} from './portfolioQuality'
import { FRESHNESS_LIMITS } from './thresholds'

const HOY = '2026-08-11T12:00:00Z'

const CUENTA: BrokerAccount = {
  id: 'cuenta-1',
  brokerName: 'Broker',
  accountLabel: 'Principal',
  defaultCurrency: 'EUR',
}

function activo(cambio: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    symbol: 'ACC',
    name: 'Acción de prueba',
    assetType: 'stock',
    quoteCurrency: 'EUR',
    sector: 'Tecnología',
    ...cambio,
  }
}

function compra(assetId: string, cantidad = '10', precio = '100'): Transaction {
  return {
    id: `tx-${assetId}`,
    accountId: CUENTA.id,
    assetId,
    type: 'buy',
    datetime: '2026-01-02T00:00:00Z',
    investedAmount: String(Number(cantidad) * Number(precio)),
    investedCurrency: 'EUR',
    quantity: cantidad,
    executionPrice: precio,
    quoteCurrency: 'EUR',
    fee: null,
    feeCurrency: null,
    sourceType: 'exact',
    confidence: 'exact',
  }
}

function cotizacion(cambio: Partial<Quote> = {}): Quote {
  return {
    assetId: 'a1',
    price: '110',
    currency: 'EUR',
    timestamp: '2026-08-10T17:30:00Z',
    provider: 'twelvedata',
    quality: 'real',
    fetchedAt: '2026-08-10T17:31:00Z',
    ...cambio,
  }
}

function serie(dias: number, ultima = '2026-08-10'): SeriesPoint[] {
  const fin = new Date(`${ultima}T00:00:00Z`).getTime()
  return Array.from({ length: dias }, (_, i) => ({
    date: new Date(fin - (dias - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    close: 100 + i,
  }))
}

/**
 * Posición montada a mano, para los casos que `buildPortfolioView` no deja
 * construir porque falla antes.
 */
function posicionSuelta(cambio: Partial<PositionView> = {}): PositionView {
  return {
    asset: activo(),
    accountIds: [CUENTA.id],
    accountBreakdown: [],
    quantity: new Decimal(10),
    cost: null,
    averagePrice: null,
    value: new Decimal(1100),
    unrealizedPnl: null,
    unrealizedPnlPct: null,
    realizedPnl: null,
    totalInvested: null,
    totalProceeds: null,
    totalFees: null,
    quote: null,
    quality: 'real',
    hasEstimatedTransactions: false,
    warnings: [],
    ...cambio,
  }
}

/** Monta el informe a partir de activos, operaciones y cotizaciones reales. */
function informe(opciones: {
  assets: Asset[]
  quotes?: Record<string, Quote>
  fxRates?: FxRate[]
  series?: Record<string, SeriesPoint[]>
  displayCurrency?: Currency
  asOf?: string
}) {
  const quotes = opciones.quotes ?? {}
  const vista = buildPortfolioView({
    assets: opciones.assets,
    accounts: [CUENTA],
    transactions: opciones.assets.map((a) => compra(a.id)),
    quotes,
    fxRates: opciones.fxRates ?? [],
    displayCurrency: opciones.displayCurrency ?? 'EUR',
  })

  const entrada: PortfolioQualityInput = {
    positions: vista.positions,
    quotes,
    fxRates: opciones.fxRates ?? [],
    displayCurrency: opciones.displayCurrency ?? 'EUR',
    ...(opciones.series === undefined ? {} : { series: opciones.series }),
  }
  return assessPortfolioQuality(entrada, opciones.asOf ?? HOY)
}

/* ── Aceptación: informe estable ──────────────────────────────────────────── */

describe('la misma cartera produce el mismo informe', () => {
  const opciones = {
    assets: [activo(), activo({ id: 'a2', symbol: 'OTR', name: 'Otra' })],
    quotes: { a1: cotizacion(), a2: cotizacion({ assetId: 'a2' }) },
    series: { a1: serie(120), a2: serie(120) },
  }

  it('dos evaluaciones seguidas dan exactamente lo mismo', () => {
    expect(informe(opciones)).toEqual(informe(opciones))
  })

  it('el orden de las filas es el de las posiciones, no uno cualquiera', () => {
    expect(informe(opciones).rows.map((f) => f.assetId)).toEqual(['a1', 'a2'])
  })

  it('la fecha entra como argumento: sin ella el informe cambiaría solo', () => {
    const ayer = informe({ ...opciones, asOf: '2026-08-11T12:00:00Z' })
    const dentroDeUnMes = informe({ ...opciones, asOf: '2026-09-11T12:00:00Z' })

    expect(ayer.asOf).toBe('2026-08-11T12:00:00Z')
    // Un mes después los mismos datos ya están viejos, y se nota.
    expect(ayer.rows[0]?.price).toBe('ok')
    expect(dentroDeUnMes.rows[0]?.price).toBe('stale')
  })

  it('lleva la versión de umbrales bajo la que se evaluó', () => {
    expect(informe(opciones).thresholdsVersion).toBeGreaterThanOrEqual(1)
  })
})

/* ── Paso 4: sin llamadas de red ──────────────────────────────────────────── */

describe('el adaptador no toca la red', () => {
  // Se lee desde la raíz del proyecto y no con `import.meta.url`: bajo jsdom la
  // URL del módulo es `http:`, no `file:`.
  const fuente = readFileSync(
    join(process.cwd(), 'src/lib/lab/data/portfolioQuality.ts'),
    'utf8',
  )

  /** Módulos de los que este archivo depende de verdad, no los que nombra. */
  const importados = [...fuente.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] ?? '')

  it('no importa el servicio de mercado ni nada que haga peticiones', () => {
    const red = importados.filter((ruta) => /market\/(service|http|providers)/.test(ruta))
    expect(red, `importa módulos de red: ${red.join(', ')}`).toEqual([])
  })

  it('lo único que toma de `market` son tipos de la caché ya descargada', () => {
    for (const ruta of importados.filter((r) => r.includes('market/'))) {
      expect(ruta).toBe('../../market/seriesCache')
    }
  })

  it('no usa fetch ni temporizadores', () => {
    expect(fuente).not.toMatch(/\bfetch\s*\(/)
    expect(fuente).not.toMatch(/setTimeout|setInterval/)
  })

  it('no lee el reloj: la fecha siempre viene de fuera', () => {
    expect(fuente).not.toContain('Date.now()')
    expect(fuente).not.toMatch(/new Date\(\)/)
  })
})

/* ── Paso 1: mapear la calidad existente ──────────────────────────────────── */

describe('traducción de la calidad que ya existía', () => {
  it.each([
    ['real', 'ok'],
    ['delayed', 'ok'],
    ['estimated', 'estimated'],
    ['manual', 'manual'],
  ] as const)('un precio %s da un campo %s', (calidad, esperado) => {
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion({ quality: calidad }) },
    })
    expect(r.rows[0]?.price).toBe(esperado)
  })

  it('un precio con retardo sigue siendo un precio: la antigüedad se mide con fechas', () => {
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion({ quality: 'delayed' }) } })
    expect(r.rows[0]?.price).toBe('ok')
    // La única incidencia de la fila es la historia ausente, no el precio.
    expect(r.rows[0]?.issues.map((i) => i.dimension)).toEqual(['temporalCoverage'])
  })

  it('un precio de demostración bloquea: no es un dato real', () => {
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion({ quality: 'demo' }) } })
    expect(r.rows[0]?.price).toBe('demo')
    expect(r.rows[0]?.issues.map((i) => i.code)).toContain('no_data')
    expect(r.rows[0]?.status).toBe('insufficient')
  })

  it('un precio de demostración caducado sigue siendo de demostración, no «antiguo»', () => {
    // Si mandara la antigüedad, la fila diría solo «antiguo» y el dato inventado
    // pasaría por bueno con actualizarlo.
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion({ quality: 'demo', timestamp: '2020-01-01T00:00:00Z' }) },
    })
    expect(r.rows[0]?.price).toBe('demo')
    expect(r.rows[0]?.issues.map((i) => i.code)).toContain('no_data')
    expect(r.rows[0]?.issues.map((i) => i.code)).not.toContain('data_stale')
    expect(r.rows[0]?.status).toBe('insufficient')
  })

  it('sin cotización pero con precio manual, el campo lo dice', () => {
    const r = informe({
      assets: [
        activo({ manualPrice: { price: '110', currency: 'EUR', updatedAt: '2026-08-10T00:00:00Z' } }),
      ],
    })
    expect(r.rows[0]?.price).toBe('manual')
  })

  it('sin cotización ni precio manual, falta el dato y se dice cómo conseguirlo', () => {
    const r = informe({ assets: [activo()] })
    const incidencia = r.rows[0]?.issues.find((i) => i.code === 'value_unknown')
    expect(r.rows[0]?.price).toBe('missing')
    expect(incidencia?.severity).toBe('blocking')
    expect(incidencia?.remediation).toBe('update_prices')
  })
})

/* ── Paso 2: frescura ─────────────────────────────────────────────────────── */

describe('frescura', () => {
  it('un precio del viernes mirado el lunes no está viejo', () => {
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion({ timestamp: '2026-08-07T17:30:00Z' }) },
      asOf: '2026-08-10T09:00:00Z',
    })
    expect(r.rows[0]?.price).toBe('ok')
  })

  it('pasado el límite declarado sí lo está, y avisa sin bloquear', () => {
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion({ timestamp: '2026-08-01T17:30:00Z' }) },
      series: { a1: serie(120) },
    })
    const incidencia = r.rows[0]?.issues.find((i) => i.code === 'data_stale')
    expect(r.rows[0]?.price).toBe('stale')
    expect(incidencia?.severity).toBe('warning')
    expect(r.rows[0]?.status).toBe('stale')
  })

  it('la historia ausente avisa, pero no tiñe de rojo una cartera bien valorada', () => {
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion() } })
    expect(r.rows[0]?.history).toBe('missing')
    expect(r.rows[0]?.status).toBe('partial')
    // Y sin embargo la volatilidad sí queda cortada, que es donde importa.
    expect(r.calculations.find((c) => c.calculation === 'volatility')?.usable).toBe(false)
  })

  it('justo en el límite todavía no está viejo', () => {
    const limite = new Date(
      new Date(HOY).getTime() - FRESHNESS_LIMITS.quoteDays * 86_400_000,
    ).toISOString()
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion({ timestamp: limite }) } })
    expect(r.rows[0]?.price).toBe('ok')
  })

  it('una fecha ilegible no se llama vieja: es otro problema', () => {
    expect(diasDesde('no-es-fecha', HOY)).toBeNull()
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion({ timestamp: 'ayer' }) } })
    expect(r.rows[0]?.issues.map((i) => i.code)).not.toContain('data_stale')
  })

  it('la historia tiene un límite más holgado que el precio', () => {
    expect(FRESHNESS_LIMITS.historyDays).toBeGreaterThan(FRESHNESS_LIMITS.quoteDays)
  })
})

/* ── Paso 3: divisa y ticker inválidos ────────────────────────────────────── */

describe('incoherencias en los datos', () => {
  it('un precio en otra divisa que la del activo bloquea', () => {
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion({ currency: 'USD' }) },
    })
    const incidencia = r.rows[0]?.issues.find((i) => i.code === 'inconsistent_values')
    expect(incidencia?.observed).toBe('USD')
    expect(incidencia?.required).toBe('EUR')
    expect(r.rows[0]?.status).toBe('invalid')
  })

  it('un ticker vacío bloquea', () => {
    const r = informe({ assets: [activo({ symbol: '   ' })], quotes: { a1: cotizacion() } })
    expect(r.rows[0]?.status).toBe('invalid')
  })

  it('un precio que no es un número positivo bloquea', () => {
    for (const precio of ['0', '-5']) {
      const r = informe({ assets: [activo()], quotes: { a1: cotizacion({ price: precio }) } })
      expect(r.rows[0]?.status, precio).toBe('invalid')
    }
  })

  it('un precio que ni siquiera es un número también', () => {
    // No pasa por `buildPortfolioView`, que revienta antes al construir el
    // Decimal. El adaptador lo comprueba igualmente porque el informe puede
    // recibir posiciones montadas por otro camino.
    const r = assessPortfolioQuality(
      {
        positions: [posicionSuelta({ quote: cotizacion({ price: 'no-es-un-numero' }) })],
        quotes: { a1: cotizacion({ price: 'no-es-un-numero' }) },
        fxRates: [],
        displayCurrency: 'EUR',
      },
      HOY,
    )
    expect(r.rows[0]?.status).toBe('invalid')
  })

  it('una incoherencia no se arregla con más datos, y por eso no es «insuficiente»', () => {
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion({ currency: 'USD' }) } })
    expect(r.rows[0]?.status).toBe('invalid')
    expect(r.rows[0]?.status).not.toBe('insufficient')
  })
})

describe('tipos de cambio', () => {
  it('si el activo ya cotiza en la divisa de presentación, no hace falta ninguno', () => {
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion() } })
    expect(r.rows[0]?.fx).toBe('not_applicable')
  })

  it('falta el cambio y se dice', () => {
    const r = informe({
      assets: [activo({ quoteCurrency: 'USD' })],
      quotes: { a1: cotizacion({ currency: 'USD' }) },
      displayCurrency: 'EUR',
    })
    expect(r.rows[0]?.fx).toBe('missing')
    expect(r.rows[0]?.issues.map((i) => i.code)).toContain('value_unknown')
  })

  it('vale en cualquiera de los dos sentidos del par', () => {
    const cambio: FxRate = {
      base: 'EUR',
      quote: 'USD',
      rate: '1.1',
      date: '2026-08-10',
      provider: 'ecb',
      quality: 'real',
      fetchedAt: '2026-08-10T00:00:00Z',
    }
    const r = informe({
      assets: [activo({ quoteCurrency: 'USD' })],
      quotes: { a1: cotizacion({ currency: 'USD' }) },
      fxRates: [cambio],
      displayCurrency: 'EUR',
    })
    expect(r.rows[0]?.fx).toBe('ok')
  })

  it('un cambio viejo avisa', () => {
    const cambio: FxRate = {
      base: 'EUR',
      quote: 'USD',
      rate: '1.1',
      date: '2026-07-01',
      provider: 'ecb',
      quality: 'real',
      fetchedAt: '2026-07-01T00:00:00Z',
    }
    const r = informe({
      assets: [activo({ quoteCurrency: 'USD' })],
      quotes: { a1: cotizacion({ currency: 'USD' }) },
      fxRates: [cambio],
      displayCurrency: 'EUR',
    })
    expect(r.rows[0]?.fx).toBe('stale')
  })
})

/* ── Historia y observaciones alineadas ───────────────────────────────────── */

describe('historia', () => {
  it('sin serie en memoria falta el dato: no es una serie vacía', () => {
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion() } })
    expect(r.rows[0]?.history).toBe('missing')
    expect(r.rows[0]?.issues.map((i) => i.code)).toContain('no_data')
  })

  it('una serie más corta que el mínimo no sirve para volatilidad', () => {
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion() },
      series: { a1: serie(30) },
    })
    expect(r.rows[0]?.history).toBe('missing')
    const incidencia = r.rows[0]?.issues.find((i) => i.code === 'sample_below_minimum')
    expect(incidencia?.observed).toBe(30)
    expect(incidencia?.required).toBe(60)
  })

  it('con historia suficiente y reciente, el campo está bien', () => {
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion() },
      series: { a1: serie(120) },
    })
    expect(r.rows[0]?.history).toBe('ok')
  })

  it('una serie larga pero abandonada avisa', () => {
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion() },
      series: { a1: serie(120, '2026-06-01') },
    })
    expect(r.rows[0]?.history).toBe('stale')
  })
})

describe('observaciones alineadas', () => {
  const base = { positions: [], quotes: {}, fxRates: [], displayCurrency: 'EUR' as const }

  it('es la intersección estricta de fechas, sin rellenar huecos', () => {
    const entrada: PortfolioQualityInput = {
      ...base,
      series: {
        a: [
          { date: '2026-01-01', close: 1 },
          { date: '2026-01-02', close: 1 },
          { date: '2026-01-03', close: 1 },
        ],
        b: [
          { date: '2026-01-02', close: 1 },
          { date: '2026-01-03', close: 1 },
          { date: '2026-01-04', close: 1 },
        ],
      },
    }
    expect(observacionesAlineadas(entrada)).toBe(2)
  })

  it('sin solape no hay observaciones utilizables', () => {
    const entrada: PortfolioQualityInput = {
      ...base,
      series: {
        a: [{ date: '2026-01-01', close: 1 }],
        b: [{ date: '2026-02-01', close: 1 }],
      },
    }
    expect(observacionesAlineadas(entrada)).toBe(0)
  })

  it('sin ninguna serie hay cero observaciones disponibles', () => {
    // Cuánta historia existe en el proveedor es otra pregunta, y la contesta el
    // aviso `no_data` de cada fila, que además dice cómo conseguirla.
    expect(observacionesAlineadas(base)).toBe(0)
    expect(observacionesAlineadas({ ...base, series: {} })).toBe(0)
  })

  it('una sola serie son sus propias fechas', () => {
    expect(observacionesAlineadas({ ...base, series: { a: serie(90) } })).toBe(90)
  })
})

/* ── Cobertura y cálculos ─────────────────────────────────────────────────── */

describe('cobertura y cálculos', () => {
  it('una posición sin precio no cuenta como cero en la cobertura', () => {
    const r = informe({
      assets: [activo(), activo({ id: 'a2', symbol: 'OTR', name: 'Otra' })],
      quotes: { a1: cotizacion() },
    })
    // «a2» no tiene precio, así que su valor es desconocido y se aparta.
    expect(r.coverage.price.unknownValueEntities).toEqual(['a2'])
    expect(r.coverage.price.knownValue).toBeGreaterThan(0)
  })

  it('la exposición directa se bloquea si falta valorar alguna posición', () => {
    const r = informe({
      assets: [activo(), activo({ id: 'a2', symbol: 'OTR', name: 'Otra' })],
      quotes: { a1: cotizacion() },
    })
    const exposicion = r.calculations.find((c) => c.calculation === 'directExposure')
    expect(exposicion?.status).toBe('insufficient')
    expect(exposicion?.issues.map((i) => i.code)).toContain('value_unknown')
  })

  it('con todo valorado y con historia, los cinco cálculos salen adelante', () => {
    const r = informe({
      assets: [activo()],
      quotes: { a1: cotizacion() },
      series: { a1: serie(300) },
    })
    expect(r.calculations.map((c) => c.calculation)).toEqual([
      'directExposure',
      'lookThrough',
      'volatility',
      'correlation',
      'historicalCVaR',
    ])
    for (const evaluacion of r.calculations) {
      expect(evaluacion.usable, evaluacion.calculation).toBe(true)
    }
  })

  it('la señal sectorial no se evalúa: no hay universo ni factores todavía', () => {
    const r = informe({ assets: [activo()], quotes: { a1: cotizacion() } })
    expect(r.calculations.map((c) => c.calculation)).not.toContain('sectorSignal')
  })

  it('solo se piden componentes a los envoltorios', () => {
    const r = informe({
      assets: [
        activo(),
        activo({ id: 'a2', symbol: 'ETF', name: 'Un ETF', assetType: 'etf' }),
      ],
      quotes: { a1: cotizacion(), a2: cotizacion({ assetId: 'a2' }) },
    })
    expect(r.rows[0]?.lookThrough).toBe('not_applicable')
    expect(r.rows[1]?.lookThrough).toBe('missing')
  })

  it('la clasificación falta cuando el activo no declara sector', () => {
    // Se quita la clave en vez de ponerla a `undefined`: con
    // `exactOptionalPropertyTypes` no son lo mismo, y «sin declarar» es la
    // ausencia de la clave.
    const { sector: _sinSector, ...sinClasificar } = activo()
    const r = informe({ assets: [sinClasificar], quotes: { a1: cotizacion() } })
    expect(r.rows[0]?.classification).toBe('missing')
  })
})
