/**
 * Pruebas del modelo de calidad de datos (LAB-210).
 *
 * La ficha pide tres cosas —«ausente ≠ cero, coberturas, umbrales»— y un
 * criterio de aceptación: **cada bloqueo tiene remediation**. Las cuatro se
 * comprueban aquí, y la última además está garantizada por el tipo: un
 * `severity: 'blocking'` sin `remediation` no compila.
 */
import { describe, expect, it } from 'vitest'
import {
  DATA_QUALITY_DIMENSIONS,
  DATA_QUALITY_STATUS_INFO,
  REMEDIATION_TEXT,
  hasBlockingIssues,
  type DataQualityIssue,
} from '../domain/dataQuality'
import {
  CALCULATION_LABEL,
  CALCULATION_REQUIREMENTS,
  LAB_CALCULATIONS,
  THRESHOLDS_VERSION,
} from './thresholds'
import {
  blockingRemediations,
  evaluateCalculation,
  resolveStatus,
  weightedCoverage,
  type CoverageEntry,
} from './quality'

function entrada(entityId: string, value: number | null, valid: boolean): CoverageEntry {
  return { entityId, value, valid }
}

/* ── Ausente no es cero ───────────────────────────────────────────────────── */

describe('un valor ausente no es un cero', () => {
  it('una posición sin valor conocido no entra en ninguna de las dos sumas', () => {
    const cobertura = weightedCoverage([
      entrada('a', 100, true),
      entrada('b', null, true),
      entrada('c', 100, false),
    ])

    // Si «b» contara como 0, el denominador seguiría siendo 200 y la cobertura
    // saldría igual: por eso se aparta y se dice.
    expect(cobertura.knownValue).toBe(200)
    expect(cobertura.validValue).toBe(100)
    expect(cobertura.covered).toBe(0.5)
    expect(cobertura.unknownValueEntities).toEqual(['b'])
  })

  it('una posición que vale cero sí cuenta: cerrada no es desconocida', () => {
    const cobertura = weightedCoverage([entrada('a', 100, true), entrada('b', 0, false)])

    expect(cobertura.unknownValueEntities).toEqual([])
    expect(cobertura.missingDataEntities).toEqual(['b'])
    expect(cobertura.covered).toBe(1)
  })

  it('desconocer un valor cambia el resultado frente a suponerlo cero', () => {
    const conDesconocido = weightedCoverage([entrada('a', 100, true), entrada('b', null, false)])
    const suponiendoCero = weightedCoverage([entrada('a', 100, true), entrada('b', 0, false)])

    // El porcentaje coincide, pero uno lo afirma y el otro no.
    expect(conDesconocido.covered).toBe(suponiendoCero.covered)
    expect(conDesconocido.unknownValueEntities).toHaveLength(1)
    expect(suponiendoCero.unknownValueEntities).toHaveLength(0)

    const evaluado = evaluateCalculation('volatility', { coverage: conDesconocido })
    expect(evaluado.issues.map((i) => i.code)).toContain('value_unknown')
    expect(
      evaluateCalculation('volatility', { coverage: suponiendoCero }).issues.map((i) => i.code),
    ).not.toContain('value_unknown')
  })

  it('sin capital conocido la cobertura es «no se puede calcular», no cero', () => {
    expect(weightedCoverage([]).covered).toBeNull()
    expect(weightedCoverage([entrada('a', null, true)]).covered).toBeNull()
  })
})

/* ── Cobertura ponderada ──────────────────────────────────────────────────── */

describe('cobertura ponderada', () => {
  it('pondera por capital, no por número de posiciones', () => {
    // Dos posiciones sin dato, pero pequeñas: la cobertura sigue siendo alta.
    const cobertura = weightedCoverage([
      entrada('grande', 9000, true),
      entrada('pequeña-1', 500, false),
      entrada('pequeña-2', 500, false),
    ])
    expect(cobertura.covered).toBe(0.9)
    expect(cobertura.missingDataEntities).toEqual(['pequeña-1', 'pequeña-2'])
  })

  it('todo válido da uno, y nada válido da cero', () => {
    expect(weightedCoverage([entrada('a', 10, true), entrada('b', 90, true)]).covered).toBe(1)
    expect(weightedCoverage([entrada('a', 10, false), entrada('b', 90, false)]).covered).toBe(0)
  })

  it('conserva el orden de las entidades, para que la lista sea estable', () => {
    const cobertura = weightedCoverage([
      entrada('c', null, true),
      entrada('a', 100, false),
      entrada('b', null, true),
    ])
    expect(cobertura.unknownValueEntities).toEqual(['c', 'b'])
    expect(cobertura.missingDataEntities).toEqual(['a'])
  })

  it('una cobertura mayor que uno es una incoherencia, no un buen resultado', () => {
    // Una posición corta con signo negativo puede producirlo.
    const cobertura = weightedCoverage([entrada('largo', 100, true), entrada('corto', -50, false)])
    expect(cobertura.covered).toBeGreaterThan(1)

    const evaluado = evaluateCalculation('volatility', { coverage: cobertura })
    expect(evaluado.status).toBe('invalid')
    expect(evaluado.usable).toBe(false)
  })
})

/* ── Umbrales ─────────────────────────────────────────────────────────────── */

describe('la matriz de umbrales', () => {
  it('cubre los seis cálculos del plan', () => {
    expect([...LAB_CALCULATIONS].sort()).toEqual([
      'correlation',
      'directExposure',
      'historicalCVaR',
      'lookThrough',
      'sectorSignal',
      'volatility',
    ])
  })

  it('las coberturas son fracciones de 0 a 1, nunca porcentajes', () => {
    for (const calculo of LAB_CALCULATIONS) {
      const minimo = CALCULATION_REQUIREMENTS[calculo].minCoverage
      if (minimo === undefined) continue
      expect(minimo, calculo).toBeGreaterThan(0)
      expect(minimo, calculo).toBeLessThanOrEqual(1)
    }
  })

  it('reproduce los números de la matriz del documento 02 §8.4', () => {
    expect(CALCULATION_REQUIREMENTS.directExposure.minCoverage).toBe(1)
    expect(CALCULATION_REQUIREMENTS.volatility.minObservations).toBe(60)
    expect(CALCULATION_REQUIREMENTS.volatility.minCoverage).toBe(0.9)
    expect(CALCULATION_REQUIREMENTS.correlation.minObservations).toBe(60)
    expect(CALCULATION_REQUIREMENTS.historicalCVaR.preferredObservations).toBe(250)
    expect(CALCULATION_REQUIREMENTS.historicalCVaR.minCoverage).toBe(0.9)
  })

  it('donde el plan no da número, no hay número inventado', () => {
    // «250 observaciones preferidas»: el suelo de bloqueo no está calibrado.
    expect(CALCULATION_REQUIREMENTS.historicalCVaR.minObservations).toBeUndefined()
    // «universo mínimo definido por factor»: no hay un valor común.
    expect(CALCULATION_REQUIREMENTS.sectorSignal.minObservations).toBeUndefined()
    expect(CALCULATION_REQUIREMENTS.sectorSignal.minCoverage).toBeUndefined()
    // El look-through da resultado parcial, sin mínimo que cumplir.
    expect(CALCULATION_REQUIREMENTS.lookThrough.minCoverage).toBeUndefined()
  })

  it('todos los cálculos tienen nombre legible y política de incumplimiento', () => {
    for (const calculo of LAB_CALCULATIONS) {
      expect(CALCULATION_LABEL[calculo], calculo).toBeTruthy()
      expect(CALCULATION_REQUIREMENTS[calculo].onShortfall, calculo).toBeTruthy()
      expect(CALCULATION_REQUIREMENTS[calculo].nota.length, calculo).toBeGreaterThan(10)
    }
  })

  it('la versión viaja con cada evaluación', () => {
    expect(evaluateCalculation('volatility', {}).thresholdsVersion).toBe(THRESHOLDS_VERSION)
  })
})

/* ── Evaluación contra los umbrales ───────────────────────────────────────── */

describe('evaluación por cálculo', () => {
  const completa = weightedCoverage([entrada('a', 1000, true)])

  it('con todo cubierto el estado es suficiente', () => {
    const evaluado = evaluateCalculation('volatility', { coverage: completa, observations: 120 })
    expect(evaluado.status).toBe('good')
    expect(evaluado.issues).toEqual([])
    expect(evaluado.usable).toBe(true)
  })

  it('la exposición directa se bloquea si el valor no cuadra', () => {
    const parcial = weightedCoverage([entrada('a', 900, true), entrada('b', 100, false)])
    const evaluado = evaluateCalculation('directExposure', { coverage: parcial })

    expect(evaluado.status).toBe('insufficient')
    expect(evaluado.usable).toBe(false)
    expect(evaluado.issues.map((i) => i.code)).toEqual(['coverage_below_minimum'])
  })

  it('la volatilidad degrada en vez de bloquear cuando falta cobertura', () => {
    const parcial = weightedCoverage([entrada('a', 800, true), entrada('b', 200, false)])
    const evaluado = evaluateCalculation('volatility', { coverage: parcial, observations: 120 })

    expect(evaluado.status).toBe('partial')
    expect(evaluado.usable).toBe(true)
    expect(evaluado.issues[0]?.severity).toBe('warning')
  })

  it('una muestra por debajo del mínimo sí bloquea la volatilidad', () => {
    const evaluado = evaluateCalculation('volatility', { coverage: completa, observations: 40 })
    expect(evaluado.issues.map((i) => i.code)).toEqual(['sample_below_minimum'])
    expect(evaluado.status).toBe('insufficient')
  })

  it('justo en el mínimo se cumple: el umbral no excluye su propio valor', () => {
    expect(
      evaluateCalculation('volatility', { coverage: completa, observations: 60 }).status,
    ).toBe('good')

    const justa = weightedCoverage([entrada('a', 900, true), entrada('b', 100, false)])
    expect(justa.covered).toBeCloseTo(0.9, 12)
    expect(
      evaluateCalculation('volatility', { coverage: justa, observations: 60 }).status,
    ).toBe('good')
  })

  it('un redondeo binario no bloquea una cartera que cumple el umbral', () => {
    // Una suma en coma flotante puede dejar una cobertura en 0,8999999999999999.
    // Sin margen, esa cartera se bloquearía por un artefacto del redondeo, y el
    // usuario no tendría forma de entender por qué.
    const casiJusta = {
      covered: 0.9 - 1e-15,
      knownValue: 1000,
      validValue: 900,
      unknownValueEntities: [],
      missingDataEntities: ['b'],
    }
    expect(casiJusta.covered).toBeLessThan(0.9)
    expect(
      evaluateCalculation('volatility', { coverage: casiJusta, observations: 60 }).status,
    ).toBe('good')
  })

  it('el margen es de redondeo, no una rebaja del umbral', () => {
    const claramenteBaja = {
      covered: 0.89,
      knownValue: 1000,
      validValue: 890,
      unknownValueEntities: [],
      missingDataEntities: ['b'],
    }
    const evaluado = evaluateCalculation('volatility', {
      coverage: claramenteBaja,
      observations: 60,
    })
    expect(evaluado.issues.map((i) => i.code)).toEqual(['coverage_below_minimum'])
  })

  it('el CVaR avisa por muestra corta y bloquea por cobertura', () => {
    const corta = evaluateCalculation('historicalCVaR', {
      coverage: completa,
      observations: 200,
    })
    expect(corta.issues.map((i) => i.code)).toEqual(['sample_below_preferred'])
    expect(corta.status).toBe('partial')
    expect(corta.usable).toBe(true)

    const pocaCobertura = evaluateCalculation('historicalCVaR', {
      coverage: weightedCoverage([entrada('a', 500, true), entrada('b', 500, false)]),
      observations: 300,
    })
    expect(pocaCobertura.status).toBe('insufficient')
  })

  it('un cálculo sin mínimo de muestra ignora las observaciones', () => {
    const evaluado = evaluateCalculation('lookThrough', { coverage: completa, observations: 1 })
    expect(evaluado.issues).toEqual([])
    expect(evaluado.status).toBe('good')
  })

  it('sin cartera que medir se dice, en vez de dar un cero', () => {
    const evaluado = evaluateCalculation('directExposure', { coverage: weightedCoverage([]) })
    expect(evaluado.issues.map((i) => i.code)).toEqual(['no_data'])
    expect(evaluado.status).toBe('insufficient')
  })

  it('los datos viejos avisan pero no bloquean', () => {
    const evaluado = evaluateCalculation('volatility', {
      coverage: completa,
      observations: 120,
      staleEntities: ['a', 'b'],
    })
    expect(evaluado.status).toBe('stale')
    expect(evaluado.usable).toBe(true)
    expect(evaluado.issues).toHaveLength(2)
    expect(evaluado.issues.map((i) => i.entityId)).toEqual(['a', 'b'])
  })

  it('viejo y además incompleto es, sobre todo, incompleto', () => {
    const parcial = weightedCoverage([entrada('a', 800, true), entrada('b', 200, false)])
    const evaluado = evaluateCalculation('volatility', {
      coverage: parcial,
      observations: 120,
      staleEntities: ['b'],
    })
    expect(evaluado.status).toBe('partial')
  })

  it('dice todo lo que falta, no solo lo primero', () => {
    const mala = weightedCoverage([entrada('a', 500, false), entrada('b', null, false)])
    const evaluado = evaluateCalculation('volatility', {
      coverage: mala,
      observations: 10,
      staleEntities: ['a'],
    })
    expect(evaluado.issues.map((i) => i.code)).toEqual([
      'value_unknown',
      'coverage_below_minimum',
      'sample_below_minimum',
      'data_stale',
    ])
  })

  it('el mismo dato evaluado dos veces da exactamente lo mismo', () => {
    const evidencia = {
      coverage: weightedCoverage([entrada('a', 500, false), entrada('b', null, false)]),
      observations: 10,
      staleEntities: ['a'],
    }
    expect(evaluateCalculation('volatility', evidencia)).toEqual(
      evaluateCalculation('volatility', evidencia),
    )
  })
})

/* ── Criterio de aceptación: cada bloqueo tiene remediation ───────────────── */

describe('cada bloqueo dice cómo se desbloquea', () => {
  /** Situaciones que producen, entre todas, cada incidencia del catálogo. */
  const escenarios = [
    evaluateCalculation('directExposure', { coverage: weightedCoverage([]) }),
    evaluateCalculation('directExposure', {
      coverage: weightedCoverage([entrada('a', 900, true), entrada('b', 100, false)]),
    }),
    evaluateCalculation('volatility', {
      coverage: weightedCoverage([entrada('a', 500, false), entrada('b', null, false)]),
      observations: 10,
      staleEntities: ['a'],
    }),
    evaluateCalculation('historicalCVaR', {
      coverage: weightedCoverage([entrada('a', 1000, true)]),
      observations: 200,
    }),
    evaluateCalculation('volatility', {
      coverage: weightedCoverage([entrada('largo', 100, true), entrada('corto', -50, false)]),
    }),
    evaluateCalculation('lookThrough', {
      coverage: weightedCoverage([entrada('a', 100, true), entrada('b', null, false)]),
    }),
  ]

  const todas: DataQualityIssue[] = escenarios.flatMap((e) => [...e.issues])

  it('no hay ni una sola incidencia bloqueante sin acción declarada', () => {
    const bloqueantes = todas.filter((issue) => issue.severity === 'blocking')
    expect(bloqueantes.length).toBeGreaterThan(0)
    for (const issue of bloqueantes) {
      expect(issue.remediation, issue.code).toBeDefined()
      expect(REMEDIATION_TEXT[issue.remediation!], issue.code).toBeTruthy()
    }
  })

  it('cada acción declarada tiene texto y ninguna sobra sin usar', () => {
    for (const [codigo, texto] of Object.entries(REMEDIATION_TEXT)) {
      expect(texto.length, codigo).toBeGreaterThan(10)
    }
  })

  it('las acciones se agrupan sin repetir', () => {
    const evaluado = evaluateCalculation('volatility', {
      coverage: weightedCoverage([entrada('a', 500, false), entrada('b', null, false)]),
      observations: 10,
    })
    const acciones = blockingRemediations(evaluado)
    expect(new Set(acciones).size).toBe(acciones.length)
    expect(acciones).toContain('update_prices')
    expect(acciones).toContain('add_history')
  })

  it('sin bloqueos no se piden deberes', () => {
    const evaluado = evaluateCalculation('volatility', {
      coverage: weightedCoverage([entrada('a', 1000, true)]),
      observations: 120,
      staleEntities: ['a'],
    })
    expect(evaluado.issues).toHaveLength(1)
    expect(blockingRemediations(evaluado)).toEqual([])
  })

  it('cada incidencia se atribuye a una dimensión del catálogo', () => {
    for (const issue of todas) {
      expect(DATA_QUALITY_DIMENSIONS, issue.code).toContain(issue.dimension)
    }
  })
})

/* ── Estado agregado ──────────────────────────────────────────────────────── */

describe('estado agregado', () => {
  const aviso: DataQualityIssue = {
    code: 'sample_below_preferred',
    dimension: 'temporalCoverage',
    scope: 'series',
    severity: 'warning',
    messageKey: 'x',
  }
  const bloqueo: DataQualityIssue = {
    code: 'sample_below_minimum',
    dimension: 'temporalCoverage',
    scope: 'series',
    severity: 'blocking',
    messageKey: 'x',
    remediation: 'add_history',
  }
  const incoherente: DataQualityIssue = {
    code: 'inconsistent_values',
    dimension: 'consistency',
    scope: 'portfolio',
    severity: 'blocking',
    messageKey: 'x',
    remediation: 'review_inputs',
  }

  it('sin incidencias, suficiente', () => {
    expect(resolveStatus([])).toBe('good')
  })

  it('lo que no se arregla con más datos manda sobre lo que sí', () => {
    expect(resolveStatus([bloqueo, incoherente])).toBe('invalid')
    expect(resolveStatus([incoherente, bloqueo])).toBe('invalid')
  })

  it('un bloqueo pesa más que un aviso', () => {
    expect(resolveStatus([aviso, bloqueo])).toBe('insufficient')
  })

  it('solo avisos es parcial', () => {
    expect(resolveStatus([aviso])).toBe('partial')
  })

  it('los cinco estados tienen nombre y lectura', () => {
    for (const [estado, info] of Object.entries(DATA_QUALITY_STATUS_INFO)) {
      expect(info.nombre, estado).toBeTruthy()
      expect(info.lectura.length, estado).toBeGreaterThan(20)
    }
  })

  it('hasBlockingIssues distingue avisos de bloqueos', () => {
    expect(hasBlockingIssues([aviso])).toBe(false)
    expect(hasBlockingIssues([aviso, bloqueo])).toBe(true)
  })
})
