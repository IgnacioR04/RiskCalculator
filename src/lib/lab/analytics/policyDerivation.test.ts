/**
 * Pruebas del rellenado de campos derivados (LAB-208).
 *
 * Aquí vive el criterio de aceptación de la tarea: **la capacidad no se
 * autocompleta**. Ni con la tolerancia, ni con un valor por defecto, ni
 * conservando lo que hubiera cuando su origen desaparece.
 */
import { describe, expect, it } from 'vitest'
import type { InvestmentPolicy, RiskBand } from '../domain/investmentPolicy'
import { emptyPolicyDraft, parseInvestmentPolicy } from '../schemas/investmentPolicy'
import { TOLERANCE_QUESTIONS } from './toleranceBand'
import { KNOWLEDGE_QUESTIONS } from './knowledgeLevel'
import { withDerivedBands } from './policyDerivation'

const AHORA = '2026-08-10T09:00:00Z'

/** Hechos que dan capacidad 4: el colchón y el peso son los que limitan. */
const CAPACIDAD_4 = {
  horizonYears: 20,
  emergencyFundMonths: 6,
  incomeStability: 'estable',
  dependents: 0,
  shareOfNetWorth: 0.2,
} as const

function respuestasTolerancia(banda: RiskBand): Record<string, string> {
  const answers: Record<string, string> = {}
  for (const pregunta of TOLERANCE_QUESTIONS) {
    answers[pregunta.id] = pregunta.options.find((o) => o.band === banda)!.value
  }
  return answers
}

function respuestasConocimientos(): Record<string, string> {
  const answers: Record<string, string> = {}
  for (const pregunta of KNOWLEDGE_QUESTIONS) {
    answers[pregunta.id] = pregunta.options.find((o) => o.level === 'medio')!.value
  }
  return answers
}

function borrador(cambio: Partial<InvestmentPolicy> = {}): InvestmentPolicy {
  return { ...emptyPolicyDraft('borrador', '2026-08-10'), ...cambio }
}

describe('la capacidad no se autocompleta', () => {
  it('una tolerancia declarada no produce banda de capacidad', () => {
    const resultado = withDerivedBands(
      borrador({
        assessment: {
          tolerance: { answers: respuestasTolerancia(5) },
          capacity: {},
        },
      }),
      AHORA,
    )

    expect(resultado.assessment.tolerance.band).toBe(5)
    expect(resultado.assessment.capacity.band).toBeUndefined()
    expect(resultado.effectiveRisk).toBeUndefined()
  })

  it('tampoco al revés: unos hechos de capacidad no declaran tolerancia', () => {
    const resultado = withDerivedBands(
      borrador({
        assessment: { tolerance: { answers: {} }, capacity: { ...CAPACIDAD_4 } },
      }),
      AHORA,
    )

    expect(resultado.assessment.capacity.band).toBe(4)
    expect(resultado.assessment.tolerance.band).toBeUndefined()
    expect(resultado.effectiveRisk).toBeUndefined()
  })

  it('un borrador recién creado no trae ninguna banda', () => {
    const resultado = withDerivedBands(borrador(), AHORA)
    expect(resultado.assessment.capacity.band).toBeUndefined()
    expect(resultado.assessment.tolerance.band).toBeUndefined()
    expect(resultado.effectiveRisk).toBeUndefined()
  })
})

describe('el riesgo efectivo es el menor de los dos', () => {
  it.each([
    [1, 4, 1],
    [4, 4, 4],
    [5, 4, 4],
    [3, 5, 3],
  ] as const)(
    'tolerancia %i y capacidad %i dan riesgo efectivo %i',
    (tolerancia, capacidad, esperado) => {
      // Se elige el juego de hechos que produce cada capacidad por su cuenta.
      const hechos =
        capacidad === 4
          ? { ...CAPACIDAD_4 }
          : { ...CAPACIDAD_4, emergencyFundMonths: 12, shareOfNetWorth: 0.05 }

      const resultado = withDerivedBands(
        borrador({
          assessment: {
            tolerance: { answers: respuestasTolerancia(tolerancia) },
            capacity: hechos,
          },
        }),
        AHORA,
      )

      expect(resultado.assessment.capacity.band).toBe(capacidad)
      expect(resultado.effectiveRisk).toBe(esperado)
    },
  )
})

describe('lo derivado desaparece cuando desaparece su origen', () => {
  const completa = borrador({
    assessment: {
      tolerance: { answers: respuestasTolerancia(3) },
      capacity: { ...CAPACIDAD_4 },
    },
  })

  it('retirar un hecho borra la banda de capacidad y el riesgo efectivo', () => {
    const antes = withDerivedBands(completa, AHORA)
    expect(antes.effectiveRisk).toBe(3)

    const { shareOfNetWorth: _fuera, ...cuatroHechos } = CAPACIDAD_4
    const despues = withDerivedBands(
      { ...antes, assessment: { ...antes.assessment, capacity: cuatroHechos } },
      AHORA,
    )

    expect(despues.assessment.capacity.band).toBeUndefined()
    expect(despues.assessment.capacity.assessedAt).toBeUndefined()
    expect(despues.effectiveRisk).toBeUndefined()
  })

  it('retirar una respuesta borra la banda de tolerancia y el riesgo efectivo', () => {
    const antes = withDerivedBands(completa, AHORA)
    const answers = { ...antes.assessment.tolerance.answers }
    delete answers[TOLERANCE_QUESTIONS[0]!.id]

    const despues = withDerivedBands(
      { ...antes, assessment: { ...antes.assessment, tolerance: { answers } } },
      AHORA,
    )

    expect(despues.assessment.tolerance.band).toBeUndefined()
    expect(despues.effectiveRisk).toBeUndefined()
  })

  it('una banda pegada a mano no sobrevive al recálculo', () => {
    const manipulada = borrador({
      assessment: {
        tolerance: { answers: {}, band: 5, assessedAt: AHORA },
        capacity: { band: 5, assessedAt: AHORA },
      },
      effectiveRisk: 5,
    })

    const resultado = withDerivedBands(manipulada, AHORA)
    expect(resultado.assessment.tolerance.band).toBeUndefined()
    expect(resultado.assessment.capacity.band).toBeUndefined()
    expect(resultado.effectiveRisk).toBeUndefined()
  })
})

describe('la banda traída del perfil anterior', () => {
  const migrada = borrador({
    assessment: {
      tolerance: {
        answers: { horizonte: '2', caida: '1' },
        band: 3,
        assessedAt: '2026-01-01T00:00:00Z',
        source: 'perfil-anterior',
      },
      capacity: {},
    },
  })

  it('sobrevive al recálculo: sus preguntas eran otras y no hay nada que rehacer', () => {
    const resultado = withDerivedBands(migrada, AHORA)
    expect(resultado.assessment.tolerance.band).toBe(3)
    expect(resultado.assessment.tolerance.source).toBe('perfil-anterior')
    // Ni siquiera se refresca la fecha: no se ha vuelto a evaluar nada.
    expect(resultado.assessment.tolerance.assessedAt).toBe('2026-01-01T00:00:00Z')
  })

  it('la sustituye el cuestionario nuevo en cuanto está completo', () => {
    const contestada = {
      ...migrada,
      assessment: {
        ...migrada.assessment,
        tolerance: {
          ...migrada.assessment.tolerance,
          answers: { ...migrada.assessment.tolerance.answers, ...respuestasTolerancia(5) },
        },
      },
    }
    const resultado = withDerivedBands(contestada, AHORA)
    expect(resultado.assessment.tolerance.band).toBe(5)
    expect(resultado.assessment.tolerance.source).toBe('cuestionario')
    expect(resultado.assessment.tolerance.assessedAt).toBe(AHORA)
  })

  it('una banda sin procedencia declarada sí se borra', () => {
    const sinProcedencia = borrador({
      assessment: {
        tolerance: { answers: {}, band: 3, assessedAt: '2026-01-01T00:00:00Z' },
        capacity: {},
      },
    })
    expect(withDerivedBands(sinProcedencia, AHORA).assessment.tolerance.band).toBeUndefined()
  })

  it('junto a una capacidad medida produce riesgo efectivo', () => {
    const conCapacidad = {
      ...migrada,
      assessment: { ...migrada.assessment, capacity: { ...CAPACIDAD_4 } },
    }
    expect(withDerivedBands(conCapacidad, AHORA).effectiveRisk).toBe(3)
  })
})

describe('fechas de evaluación', () => {
  it('solo aparecen junto a su resultado', () => {
    const sinNada = withDerivedBands(borrador(), AHORA)
    expect(sinNada.assessment.tolerance.assessedAt).toBeUndefined()
    expect(sinNada.assessment.capacity.assessedAt).toBeUndefined()

    const conTodo = withDerivedBands(
      borrador({
        assessment: {
          tolerance: { answers: respuestasTolerancia(3) },
          capacity: { ...CAPACIDAD_4 },
        },
      }),
      AHORA,
    )
    expect(conTodo.assessment.tolerance.assessedAt).toBe(AHORA)
    expect(conTodo.assessment.capacity.assessedAt).toBe(AHORA)
  })
})

describe('los conocimientos no tocan el riesgo', () => {
  it('rellenarlos no cambia ninguna banda ni el riesgo efectivo', () => {
    const base = borrador({
      assessment: {
        tolerance: { answers: respuestasTolerancia(3) },
        capacity: { ...CAPACIDAD_4 },
      },
    })
    const sinConocimientos = withDerivedBands(base, AHORA)
    const conConocimientos = withDerivedBands(
      {
        ...base,
        assessment: { ...base.assessment, knowledge: { answers: respuestasConocimientos() } },
      },
      AHORA,
    )

    expect(conConocimientos.assessment.knowledge?.level).toBe('medio')
    expect(conConocimientos.effectiveRisk).toBe(sinConocimientos.effectiveRisk)
    expect(conConocimientos.assessment.capacity.band).toBe(
      sinConocimientos.assessment.capacity.band,
    )
    expect(conConocimientos.assessment.tolerance.band).toBe(
      sinConocimientos.assessment.tolerance.band,
    )
  })

  it('si no se preguntan, no aparece el bloque', () => {
    expect(withDerivedBands(borrador(), AHORA).assessment.knowledge).toBeUndefined()
  })
})

describe('el resultado sigue cumpliendo el contrato', () => {
  it('una política completa pasa la validación de frontera', () => {
    const resultado = withDerivedBands(
      borrador({
        assessment: {
          tolerance: { answers: respuestasTolerancia(3) },
          capacity: { ...CAPACIDAD_4 },
          knowledge: { answers: respuestasConocimientos() },
        },
      }),
      AHORA,
    )
    expect(parseInvestmentPolicy(resultado).success).toBe(true)
  })

  it('y una a medias también, porque estar incompleta es un estado legítimo', () => {
    expect(parseInvestmentPolicy(withDerivedBands(borrador(), AHORA)).success).toBe(true)
  })
})
