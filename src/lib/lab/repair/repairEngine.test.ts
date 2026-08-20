/**
 * Pruebas del motor de brechas (LAB-613).
 *
 * El criterio de aceptación es un caso concreto: **la cartera cripto/tech
 * enseña el riesgo estructural primero**. Si lo táctico ganara, el usuario
 * actuaría sobre el ruido e ignoraría cómo está construida su cartera, que es
 * exactamente cómo se arruina una.
 */
import { describe, expect, it } from 'vitest'
import { MAX_VISIBLE, assessRepair, sortFindings } from './repairEngine'
import { REPAIR_ENGINE_VERSION } from './repairEngine'
import { THRESHOLDS, type Finding, type RepairContext } from './rules'

/** El caso del plan: mucha cripto, mucha tecnología y dos ETF casi gemelos. */
const CRIPTO_TECH: RepairContext = {
  totalValue: 20_000,
  baseCurrency: 'EUR',
  maxWeight: 0.4,
  maxWeightSymbol: 'BTC',
  effectivePositions: 3.2,
  positions: [
    { symbol: 'BTC', weight: 0.4, assetType: 'crypto' },
    { symbol: 'IWDA', weight: 0.2, assetType: 'etf' },
    { symbol: 'SXR8', weight: 0.15, assetType: 'etf' },
    { symbol: 'AAPL', weight: 0.15, assetType: 'stock' },
    { symbol: 'TSLA', weight: 0.1, assetType: 'stock' },
  ],
  distinctBets: 2,
  nearDuplicates: [{ a: 'IWDA', b: 'SXR8', correlation: 1.0 }],
  violations: [],
  priceCoverage: 0.7,
}

const contexto = (cambios: Partial<RepairContext> = {}): RepairContext => ({
  ...CRIPTO_TECH,
  ...cambios,
})

/* ── El criterio de aceptación ────────────────────────────────────────────── */

describe('el caso cripto/tech enseña el riesgo estructural primero', () => {
  const r = assessRepair(CRIPTO_TECH)

  it('el primer hallazgo es estructural, no táctico', () => {
    expect(r.findings[0]!.nature).toBe('structural')
  })

  it('todo lo estructural va antes que cualquier cosa táctica', () => {
    const naturalezas = r.findings.map((f) => f.nature)
    const primerTactico = naturalezas.indexOf('tactical')
    if (primerTactico === -1) return
    expect(naturalezas.slice(primerTactico).every((n) => n === 'tactical')).toBe(true)
  })

  it('detecta que cinco posiciones son dos apuestas', () => {
    expect(r.findings.some((f) => f.ruleId === 'fake_diversification')).toBe(true)
  })

  it('detecta que IWDA y SXR8 son casi la misma posición', () => {
    const dup = r.findings.find((f) => f.ruleId === 'duplication')!
    expect(dup.title).toMatch(/IWDA y SXR8/)
  })

  it('la evidencia cita el umbral real, no uno ajustado al caso', () => {
    // Decir «1,00 por encima de 0,99» sonaría más contundente y falsearía la
    // regla que de verdad se está aplicando.
    const dup = r.findings.find((f) => f.ruleId === 'duplication')!
    expect(dup.evidence[0]).toMatch(/umbral de 0,90/)
  })

  it('detecta que BTC decide el resultado', () => {
    const conc = r.findings.find((f) => f.ruleId === 'concentration')!
    expect(conc.title).toMatch(/BTC/)
    expect(conc.detail).toMatch(/40 %/)
  })

  it('la cobertura de precios, que es táctica, no adelanta a lo estructural', () => {
    const posicionCobertura = r.findings.findIndex((f) => f.ruleId === 'coverage')
    const posicionConcentracion = r.findings.findIndex((f) => f.ruleId === 'concentration')
    if (posicionCobertura === -1 || posicionConcentracion === -1) return
    expect(posicionConcentracion).toBeLessThan(posicionCobertura)
  })
})

/* ── El orden no se puede subvertir ───────────────────────────────────────── */

describe('lo táctico no puede adelantar a lo estructural', () => {
  const estructuralLeve: Finding = {
    id: 'e',
    ruleId: 'concentration',
    nature: 'structural',
    severity: 'baja',
    title: 'Estructural leve',
    detail: '',
    evidence: [],
    materiality: { weight: 0.06, value: 600 },
    explore: [],
  }
  const tacticoGrave: Finding = {
    id: 't',
    ruleId: 'coverage',
    nature: 'tactical',
    severity: 'alta',
    title: 'Táctico grave',
    detail: '',
    evidence: [],
    materiality: { weight: 0.9, value: 9000 },
    explore: [],
  }

  it('un táctico grave y material sigue yendo detrás de un estructural leve', () => {
    // Es el caso que define la regla: lo urgente no es lo importante.
    const orden = sortFindings([tacticoGrave, estructuralLeve])
    expect(orden[0]!.id).toBe('e')
  })

  it('dentro de la misma naturaleza manda la severidad', () => {
    const grave: Finding = { ...estructuralLeve, id: 'grave', severity: 'alta' }
    expect(sortFindings([estructuralLeve, grave])[0]!.id).toBe('grave')
  })

  it('con la misma severidad manda la materialidad', () => {
    const pequeno: Finding = { ...estructuralLeve, id: 'pequeno', materiality: { weight: 0.06, value: 600 } }
    const grande: Finding = { ...estructuralLeve, id: 'grande', materiality: { weight: 0.5, value: 5000 } }
    expect(sortFindings([pequeno, grande])[0]!.id).toBe('grande')
  })

  it('el orden es estable ante permutaciones', () => {
    const lista = [tacticoGrave, estructuralLeve]
    expect(sortFindings(lista).map((f) => f.id)).toEqual(
      sortFindings([...lista].reverse()).map((f) => f.id),
    )
  })
})

/* ── Materialidad y tope ──────────────────────────────────────────────────── */

describe('lo que no es material no es un aviso', () => {
  it('una duplicación sobre el 3 % de la cartera se descarta y se cuenta', () => {
    const r = assessRepair(
      contexto({
        positions: [
          { symbol: 'A', weight: 0.015, assetType: 'stock' },
          { symbol: 'B', weight: 0.015, assetType: 'stock' },
          { symbol: 'C', weight: 0.97, assetType: 'etf' },
        ],
        maxWeight: 0.97,
        maxWeightSymbol: 'C',
        nearDuplicates: [{ a: 'A', b: 'B', correlation: 0.98 }],
        distinctBets: null,
        priceCoverage: 1,
      }),
    )
    expect(r.findings.some((f) => f.ruleId === 'duplication')).toBe(false)
    expect(r.immaterial).toBeGreaterThan(0)
  })

  it('el umbral de materialidad está declarado como dato', () => {
    expect(THRESHOLDS.materiality).toBeGreaterThan(0)
    expect(THRESHOLDS.materiality).toBeLessThan(1)
  })

  it('no se enseñan más de cuatro, y se dice cuántos quedan fuera', () => {
    const r = assessRepair(
      contexto({
        violations: ['tech entre 0 % y 20 %', 'cripto entre 0 % y 10 %'],
        nearDuplicates: [
          { a: 'IWDA', b: 'SXR8', correlation: 1 },
          { a: 'AAPL', b: 'TSLA', correlation: 0.95 },
        ],
      }),
    )
    expect(r.findings.length).toBeLessThanOrEqual(MAX_VISIBLE)
    expect(r.hidden).toBeGreaterThan(0)
  })
})

/* ── Evidencia y exploración ──────────────────────────────────────────────── */

describe('cada hallazgo se puede comprobar y explorar', () => {
  const r = assessRepair(CRIPTO_TECH)

  it('todos traen la evidencia que los dispara', () => {
    // Sin esto un hallazgo es una opinión.
    for (const f of r.findings) expect(f.evidence.length).toBeGreaterThan(0)
  })

  it('todos enlazan a una herramienta donde mirarlo', () => {
    for (const f of r.findings) expect(f.explore.length).toBeGreaterThan(0)
  })

  it('los enlaces apuntan a rutas del Laboratorio', () => {
    for (const f of r.findings) {
      for (const opcion of f.explore) expect(opcion.routeId).toMatch(/^lab\./)
    }
  })

  it('el aviso de que no es un consejo viaja con el informe', () => {
    expect(r.disclaimer).toMatch(/No dice qué comprar ni qué vender/)
  })

  it('va versionado', () => {
    expect(r.version).toBe(REPAIR_ENGINE_VERSION)
  })
})

/* ── Casos límite ─────────────────────────────────────────────────────────── */

describe('cuando no hay nada que decir, no se dice nada', () => {
  const SANA: RepairContext = {
    totalValue: 20_000,
    baseCurrency: 'EUR',
    maxWeight: 0.2,
    maxWeightSymbol: 'IWDA',
    effectivePositions: 5,
    positions: [
      { symbol: 'IWDA', weight: 0.2, assetType: 'etf' },
      { symbol: 'AGGH', weight: 0.2, assetType: 'etf' },
      { symbol: 'GLD', weight: 0.2, assetType: 'commodity' },
      { symbol: 'EIMI', weight: 0.2, assetType: 'etf' },
      { symbol: 'EUR', weight: 0.2, assetType: 'cash' },
    ],
    distinctBets: 5,
    nearDuplicates: [],
    violations: [],
    priceCoverage: 1,
  }

  it('una cartera repartida no genera hallazgos', () => {
    const r = assessRepair(SANA)
    expect(r.findings).toEqual([])
    expect(r.hidden).toBe(0)
  })

  it('sin datos de dependencia no se inventa una conclusión sobre ella', () => {
    const r = assessRepair({ ...SANA, distinctBets: null, nearDuplicates: [] })
    expect(r.findings.some((f) => f.ruleId === 'fake_diversification')).toBe(false)
  })

  it('sin cobertura evaluada no se avisa de la cobertura', () => {
    const r = assessRepair({ ...SANA, priceCoverage: null })
    expect(r.findings.some((f) => f.ruleId === 'coverage')).toBe(false)
  })

  it('incumplir la propia política siempre es estructural y material', () => {
    const r = assessRepair({ ...SANA, violations: ['tech entre 0 % y 20 %'] })
    const v = r.findings.find((f) => f.ruleId === 'policy_violation')!
    expect(v.nature).toBe('structural')
    expect(v.severity).toBe('alta')
    expect(v.detail).toMatch(/lo que tú decidiste/)
  })

  it('sin posiciones no rompe', () => {
    const r = assessRepair({
      ...SANA,
      positions: [],
      totalValue: 0,
      maxWeight: 0,
      effectivePositions: 0,
      distinctBets: 0,
    })
    expect(r.findings).toEqual([])
  })
})

describe('determinismo', () => {
  it('el mismo contexto da exactamente el mismo informe', () => {
    expect(assessRepair(CRIPTO_TECH)).toEqual(assessRepair(CRIPTO_TECH))
  })
})
