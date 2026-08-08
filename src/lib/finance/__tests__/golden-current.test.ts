/**
 * Paridad numérica dorada (LAB-002).
 *
 * Congela el comportamiento numérico actual antes de refactorizar
 * `HistoricalRiskSection.tsx` y de ampliar el Laboratorio. Si un refactor
 * cambia un resultado, esta prueba lo detecta.
 *
 * Regla de la tarea: **ningún valor esperado procede de ejecutar el código bajo
 * prueba**. Todos se derivan analíticamente de la definición de cada métrica
 * sobre series construidas a propósito. Las derivaciones están en
 * `docs/lab/golden-fixtures.md`.
 */
import { describe, expect, it } from 'vitest'
import {
  CAMBIOS_PCT_TRAS_ESTRES,
  CAMBIO_PCT_TOTAL,
  CARTERA_PEQUENA,
  HHI_CARTERA,
  HHI_TRAS_APORTACION,
  HHI_TRAS_ESTRES,
  PESOS_CARTERA,
  PESO_MAXIMO_CARTERA,
  PESO_OBJETIVO_ANTES,
  PESO_OBJETIVO_DESPUES,
  POSICIONES_EFECTIVAS_CARTERA,
  SHOCKS_DORADOS,
  TOTAL_CARTERA,
  TOTAL_TRAS_ESTRES,
  VALORES_TRAS_ESTRES,
  APORTACION,
} from '../../../test/fixtures/portfolio-small'
import {
  APUESTAS_EFECTIVAS_INDEPENDIENTE,
  CONTRIBUCIONES_PCT_ESPEJO,
  CONTRIBUCIONES_PCT_INDEPENDIENTE,
  CORRELACION_MEDIA_ESPEJO,
  CORRELACION_MEDIA_INDEPENDIENTE,
  COV_ESPEJO_EXACTA,
  COV_INDEPENDIENTE_EXACTA,
  DIAS_BURSATILES,
  FECHAS,
  MAX_DRAWDOWN_ALTERNA,
  N_RETORNOS,
  N_RETORNOS_COMUNES,
  PESOS_ESPEJO,
  PESOS_IGUALES,
  RATIO_DIVERSIFICACION_ESPEJO,
  RATIO_DIVERSIFICACION_INDEPENDIENTE,
  REDUCCION_VOL_ESPEJO,
  SERIE_ALTERNA,
  SERIE_CONSTANTE,
  SERIE_CON_HUECOS,
  SERIE_CORTA,
  SERIE_ESPEJO,
  U,
  VAR_ANUAL_ALTERNA,
  VOL_ANUAL_ALTERNA,
  VOL_ANUAL_ALTERNA_DOC,
  VOL_CARTERA_ESPEJO,
  VOL_CARTERA_INDEPENDIENTE,
} from '../../../test/fixtures/historical-series'
import { diversificationMetrics } from '../diversification'
import {
  annualizedVolatility,
  correlation,
  dailyReturns,
  maxDrawdown,
  sharpeRatio,
} from '../historical'
import { concentration, weights } from '../metrics'
import { alignManyReturns, covarianceMatrix, portfolioRisk } from '../portfolioRisk'
import { applyStress, contributionImpact } from '../stress'

/**
 * Tolerancias explícitas (criterio de aceptación de LAB-002).
 *
 * - `TOL_ABS` / `TOL_REL`: para magnitudes que salen de una derivación exacta.
 *   Solo debe absorber el error de coma flotante acumulado, del orden de 1e-16
 *   por operación; 1e-12 deja tres órdenes de margen.
 * - `TOL_DOC`: para contrastar el valor decimal transcrito en la documentación
 *   contra su forma cerrada. Es más laxa porque el documento redondea a 7
 *   decimales.
 */
const TOL_ABS = 1e-12
const TOL_REL = 1e-12
const TOL_DOC = 5e-8

/**
 * Criterio combinado: el error debe caer bajo la tolerancia absoluta **o** bajo
 * la relativa, `|error| ≤ max(tolAbs, |esperado|·tolRel)`.
 *
 * Ambas cotas son necesarias y ninguna basta sola. La absoluta es la que manda
 * cerca de cero, donde la relativa no está definida. La relativa es la que manda
 * en magnitudes grandes: `ulp(8595) ≈ 1,8e-12`, mayor que `TOL_ABS`, de modo que
 * exigir solo la absoluta impondría igualdad bit a bit en los importes y haría
 * la prueba frágil por una razón ajena a la métrica.
 */
function esperarCerca(actual: number, esperado: number, tolAbs = TOL_ABS, tolRel = TOL_REL): void {
  const errorAbsoluto = Math.abs(actual - esperado)
  const tolerancia = Math.max(tolAbs, Math.abs(esperado) * tolRel)
  expect(errorAbsoluto).toBeLessThanOrEqual(tolerancia)
}

const retornosA = dailyReturns(SERIE_ALTERNA).map((punto) => punto.value)
const retornosB = dailyReturns(SERIE_ESPEJO).map((punto) => punto.value)
const retornosC = dailyReturns(SERIE_CONSTANTE).map((punto) => punto.value)

describe('LAB-002 · retornos diarios', () => {
  it('produce n−1 retornos logarítmicos que alternan ±ln(1,01)', () => {
    expect(retornosA).toHaveLength(N_RETORNOS)
    esperarCerca(retornosA[0]!, U)
    esperarCerca(retornosA[1]!, -U)
    // La media es exactamente 0: hay tantos retornos positivos como negativos.
    esperarCerca(retornosA.reduce((suma, r) => suma + r, 0), 0)
  })

  it('el espejo en otra divisa produce los retornos opuestos', () => {
    expect(retornosB).toHaveLength(N_RETORNOS)
    esperarCerca(retornosB[0]!, -U)
    esperarCerca(retornosB[1]!, U)
  })

  it('la serie constante produce retornos exactamente nulos', () => {
    expect(retornosC).toHaveLength(N_RETORNOS)
    expect(retornosC.every((r) => r === 0)).toBe(true)
  })
})

describe('LAB-002 · volatilidad', () => {
  it('anualiza con ln(1,01)·√(252·n/(n−1))', () => {
    const resultado = annualizedVolatility(retornosA)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.observations).toBe(N_RETORNOS)
    esperarCerca(resultado.value, VOL_ANUAL_ALTERNA)
  })

  it('coincide con el valor decimal documentado', () => {
    esperarCerca(VOL_ANUAL_ALTERNA, VOL_ANUAL_ALTERNA_DOC, TOL_DOC, TOL_DOC)
  })

  it('la serie constante tiene volatilidad exactamente 0', () => {
    const resultado = annualizedVolatility(retornosC)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.value).toBe(0)
  })

  it('degrada de forma explícita con muestra insuficiente', () => {
    const resultado = annualizedVolatility(dailyReturns(SERIE_CORTA).map((p) => p.value))
    expect(resultado.ok).toBe(false)
    if (resultado.ok) return
    expect(resultado.reason).toBe('insufficient_data')
    expect(resultado.observations).toBe(20)
    expect(resultado.required).toBe(30)
  })

  it('no publica Sharpe cuando la volatilidad es nula', () => {
    const resultado = sharpeRatio(retornosC, 0)
    expect(resultado.ok).toBe(false)
  })
})

describe('LAB-002 · drawdown', () => {
  it('mide la caída de 101 a 100 como −1/101 y sitúa pico y valle', () => {
    const resultado = maxDrawdown(SERIE_ALTERNA)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    esperarCerca(resultado.value.maxDrawdown, MAX_DRAWDOWN_ALTERNA)
    expect(resultado.value.peakDate).toBe(FECHAS[1])
    expect(resultado.value.troughDate).toBe(FECHAS[2])
  })

  it('una serie constante no tiene caída', () => {
    const resultado = maxDrawdown(SERIE_CONSTANTE)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.value.maxDrawdown).toBe(0)
  })
})

describe('LAB-002 · correlación', () => {
  it('vale exactamente 1 consigo misma y −1 con su espejo', () => {
    const consigoMisma = correlation(retornosA, retornosA)
    expect(consigoMisma.ok).toBe(true)
    if (consigoMisma.ok) esperarCerca(consigoMisma.value, 1)

    const conEspejo = correlation(retornosA, retornosB)
    expect(conEspejo.ok).toBe(true)
    if (conEspejo.ok) esperarCerca(conEspejo.value, -1)
  })

  it('no es interpretable frente a una serie constante', () => {
    const resultado = correlation(retornosA, retornosC)
    expect(resultado.ok).toBe(false)
  })
})

describe('LAB-002 · alineación con fechas ausentes', () => {
  it('intersecta fechas y nunca rellena huecos en silencio', () => {
    const alineado = alignManyReturns([dailyReturns(SERIE_ALTERNA), dailyReturns(SERIE_CON_HUECOS)])
    expect(alineado.dates).toHaveLength(N_RETORNOS_COMUNES)
    expect(alineado.dates.length).toBeLessThan(N_RETORNOS)
    expect(alineado.columns[0]).toHaveLength(N_RETORNOS_COMUNES)
    expect(alineado.columns[1]).toHaveLength(N_RETORNOS_COMUNES)
    // Las fechas quedan ordenadas ascendentemente.
    expect([...alineado.dates].sort()).toEqual(alineado.dates)
  })

  it('la muestra reducida sigue bastando para la covarianza', () => {
    const alineado = alignManyReturns([dailyReturns(SERIE_ALTERNA), dailyReturns(SERIE_CON_HUECOS)])
    const matriz = covarianceMatrix(alineado.columns, DIAS_BURSATILES)
    expect(matriz.ok).toBe(true)
    if (matriz.ok) expect(matriz.observations).toBe(N_RETORNOS_COMUNES)
  })
})

describe('LAB-002 · covarianza y riesgo de cartera', () => {
  const matriz = covarianceMatrix([retornosA, retornosB], DIAS_BURSATILES)

  it('la diagonal es la varianza anualizada y la cruzada su opuesta', () => {
    expect(matriz.ok).toBe(true)
    if (!matriz.ok) return
    esperarCerca(matriz.value[0]![0]!, VAR_ANUAL_ALTERNA)
    esperarCerca(matriz.value[1]![1]!, VAR_ANUAL_ALTERNA)
    esperarCerca(matriz.value[0]![1]!, -VAR_ANUAL_ALTERNA)
    // La matriz es simétrica.
    expect(matriz.value[0]![1]).toBe(matriz.value[1]![0])
  })

  it('σ = 0,5·σ_activo y las contribuciones Euler son +150 % y −50 %', () => {
    expect(matriz.ok).toBe(true)
    if (!matriz.ok) return
    const riesgo = portfolioRisk([...PESOS_ESPEJO], matriz.value)
    expect(riesgo).not.toBeNull()
    if (riesgo === null) return

    expect(riesgo.percentageContributions).toHaveLength(2)
    esperarCerca(riesgo.volatility, VOL_CARTERA_ESPEJO)
    esperarCerca(riesgo.percentageContributions[0]!, CONTRIBUCIONES_PCT_ESPEJO[0])
    esperarCerca(riesgo.percentageContributions[1]!, CONTRIBUCIONES_PCT_ESPEJO[1])
    // Identidad de Euler: las contribuciones porcentuales suman 1.
    esperarCerca(riesgo.percentageContributions.reduce((s, v) => s + v, 0), 1)
    // Las contribuciones absolutas suman la volatilidad total.
    esperarCerca(riesgo.componentContributions.reduce((s, v) => s + v, 0), riesgo.volatility)
  })

  it('una cobertura perfecta no tiene volatilidad definida', () => {
    // Se usa la matriz exacta del fixture, no la calculada desde los retornos:
    // la cancelación w'Σw = 0 debe ser una propiedad de la especificación, no
    // depender del signo del residuo de coma flotante de la muestra.
    expect(portfolioRisk([...PESOS_IGUALES], COV_ESPEJO_EXACTA)).toBeNull()
  })
})

describe('LAB-002 · diversificación', () => {
  it('da ratio 2, reducción 0,5 y correlación media −1', () => {
    const matriz = covarianceMatrix([retornosA, retornosB], DIAS_BURSATILES)
    expect(matriz.ok).toBe(true)
    if (!matriz.ok) return
    const riesgo = portfolioRisk([...PESOS_ESPEJO], matriz.value)
    expect(riesgo).not.toBeNull()
    if (riesgo === null) return

    const metricas = diversificationMetrics(
      [...PESOS_ESPEJO],
      matriz.value,
      riesgo.percentageContributions,
    )
    expect(metricas).not.toBeNull()
    if (metricas === null) return

    esperarCerca(metricas.diversificationRatio, RATIO_DIVERSIFICACION_ESPEJO)
    esperarCerca(metricas.volatilityReduction, REDUCCION_VOL_ESPEJO)
    esperarCerca(metricas.averageCorrelation!, CORRELACION_MEDIA_ESPEJO)
    esperarCerca(metricas.portfolioVolatility, VOL_CARTERA_ESPEJO)
    esperarCerca(metricas.weightedAverageVolatility, VOL_ANUAL_ALTERNA)
    // Con una contribución negativa la entropía no está definida: no se inventa.
    expect(metricas.effectiveBets).toBeNull()
  })

  it('control positivo: dos activos independientes dan √2, correlación 0 y 2 apuestas', () => {
    // Contrapunto del caso espejo: aquí todas las contribuciones son positivas,
    // así que las métricas que allí quedan indefinidas sí deben calcularse.
    // Sin este control, `effectiveBets: null` pasaría también con la función rota.
    const riesgo = portfolioRisk([...PESOS_IGUALES], COV_INDEPENDIENTE_EXACTA)
    expect(riesgo).not.toBeNull()
    if (riesgo === null) return

    esperarCerca(riesgo.volatility, VOL_CARTERA_INDEPENDIENTE)
    esperarCerca(riesgo.percentageContributions[0]!, CONTRIBUCIONES_PCT_INDEPENDIENTE[0])
    esperarCerca(riesgo.percentageContributions[1]!, CONTRIBUCIONES_PCT_INDEPENDIENTE[1])

    const metricas = diversificationMetrics(
      [...PESOS_IGUALES],
      COV_INDEPENDIENTE_EXACTA,
      riesgo.percentageContributions,
    )
    expect(metricas).not.toBeNull()
    if (metricas === null) return

    esperarCerca(metricas.diversificationRatio, RATIO_DIVERSIFICACION_INDEPENDIENTE)
    esperarCerca(metricas.averageCorrelation!, CORRELACION_MEDIA_INDEPENDIENTE)
    expect(metricas.effectiveBets).not.toBeNull()
    esperarCerca(metricas.effectiveBets!, APUESTAS_EFECTIVAS_INDEPENDIENTE)
  })
})

describe('LAB-002 · pesos y concentración', () => {
  it('reparte 0,4 · 0,3 · 0,2 · 0,1 sobre un total de 10.000', () => {
    const calculados = weights(
      CARTERA_PEQUENA.map((posicion) => ({ key: posicion.assetId, value: posicion.value })),
    )
    // Fijar la longitud primero: si no, un resultado vacío pasaría el forEach.
    expect(calculados).toHaveLength(PESOS_CARTERA.length)
    calculados.forEach((item, indice) => {
      esperarCerca(item.weight!.toNumber(), PESOS_CARTERA[indice]!)
    })
    const total = CARTERA_PEQUENA.reduce((suma, p) => suma + Number(p.value), 0)
    expect(total).toBe(TOTAL_CARTERA)
  })

  it('el HHI es 0,30 y equivale a 10/3 posiciones efectivas', () => {
    const resultado = concentration(CARTERA_PEQUENA.map((posicion) => posicion.value))
    esperarCerca(resultado.hhi!.toNumber(), HHI_CARTERA)
    esperarCerca(resultado.effectivePositions!.toNumber(), POSICIONES_EFECTIVAS_CARTERA)
    esperarCerca(resultado.maxWeight!.toNumber(), PESO_MAXIMO_CARTERA)
  })
})

describe('LAB-002 · estrés', () => {
  const resultado = applyStress(CARTERA_PEQUENA, SHOCKS_DORADOS)

  it('aplica los shocks de forma multiplicativa posición a posición', () => {
    expect(resultado.positions).toHaveLength(VALORES_TRAS_ESTRES.length)
    resultado.positions.forEach((posicion, indice) => {
      esperarCerca(posicion.stressedValue.toNumber(), VALORES_TRAS_ESTRES[indice]!)
      esperarCerca(posicion.changePct!.toNumber(), CAMBIOS_PCT_TRAS_ESTRES[indice]!)
    })
  })

  it('solo la posición en otra divisa recibe el shock de tipo de cambio', () => {
    // ACC-EU y EFECTIVO cotizan en EUR: se quedan en el −10 % general.
    esperarCerca(resultado.positions[0]!.changePct!.toNumber(), -0.1)
    esperarCerca(resultado.positions[3]!.changePct!.toNumber(), -0.1)
    // ACC-US cotiza en USD: 0,9 · 1,05 − 1.
    esperarCerca(resultado.positions[1]!.changePct!.toNumber(), -0.055)
  })

  it('totaliza 8.595 y una caída del 14,05 %', () => {
    esperarCerca(resultado.totalBefore.toNumber(), TOTAL_CARTERA)
    esperarCerca(resultado.totalAfter.toNumber(), TOTAL_TRAS_ESTRES)
    esperarCerca(resultado.totalChangePct!.toNumber(), CAMBIO_PCT_TOTAL)
  })

  it('concentra la cartera: el HHI sube de 0,30 a 11.553/36.481', () => {
    esperarCerca(resultado.concentrationBefore.hhi!.toNumber(), HHI_CARTERA)
    esperarCerca(resultado.concentrationAfter.hhi!.toNumber(), HHI_TRAS_ESTRES)
    expect(resultado.concentrationAfter.hhi!.toNumber()).toBeGreaterThan(HHI_CARTERA)
  })

  it('un shock general uniforme no altera la concentración', () => {
    const uniforme = applyStress(CARTERA_PEQUENA, { general: -0.2, displayCurrency: 'EUR' })
    esperarCerca(uniforme.totalAfter.toNumber(), 8000)
    esperarCerca(uniforme.concentrationAfter.hhi!.toNumber(), HHI_CARTERA)
  })
})

describe('LAB-002 · aportación hipotética', () => {
  it('recalcula peso y concentración sin ejecutar ninguna compra', () => {
    const impacto = contributionImpact(CARTERA_PEQUENA, 'ACC-US', APORTACION)
    esperarCerca(impacto.before.weight!.toNumber(), PESO_OBJETIVO_ANTES)
    esperarCerca(impacto.after.weight!.toNumber(), PESO_OBJETIVO_DESPUES)
    esperarCerca(impacto.before.concentration.hhi!.toNumber(), HHI_CARTERA)
    esperarCerca(impacto.after.concentration.hhi!.toNumber(), HHI_TRAS_APORTACION)
  })
})
