/**
 * Pruebas del cuestionario de tolerancia (LAB-208).
 *
 * Dos cosas se prueban aquí y no en el componente: que la mediana es la mediana
 * —y no una media disfrazada— y que una respuesta que falta deja el resultado en
 * `null` en vez de en el punto medio.
 */
import { describe, expect, it } from 'vitest'
import type { RiskBand } from '../domain/investmentPolicy'
import {
  SIN_RESPUESTA,
  TOLERANCE_QUESTIONS,
  deriveToleranceBand,
  missingToleranceAnswers,
} from './toleranceBand'

/** Respuestas que dan exactamente esas bandas, en el orden de las preguntas. */
function respuestas(bandas: readonly RiskBand[]): Record<string, string> {
  const answers: Record<string, string> = {}
  bandas.forEach((banda, indice) => {
    const pregunta = TOLERANCE_QUESTIONS[indice]
    if (pregunta === undefined) throw new Error(`No hay pregunta en la posición ${indice}`)
    const opcion = pregunta.options.find((o) => o.band === banda)
    if (opcion === undefined) throw new Error(`La pregunta ${pregunta.id} no ofrece la banda ${banda}`)
    answers[pregunta.id] = opcion.value
  })
  return answers
}

describe('forma del cuestionario', () => {
  it('son cinco preguntas: un número impar hace que la mediana sea una respuesta real', () => {
    expect(TOLERANCE_QUESTIONS).toHaveLength(5)
    expect(TOLERANCE_QUESTIONS.length % 2).toBe(1)
  })

  it('cada pregunta ofrece las cinco bandas, una sola vez', () => {
    for (const pregunta of TOLERANCE_QUESTIONS) {
      expect(pregunta.options.map((o) => o.band).sort()).toEqual([1, 2, 3, 4, 5])
    }
  })

  it('los identificadores de pregunta y de opción son únicos', () => {
    const ids = TOLERANCE_QUESTIONS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const pregunta of TOLERANCE_QUESTIONS) {
      const valores = pregunta.options.map((o) => o.value)
      expect(new Set(valores).size).toBe(valores.length)
    }
  })

  it('ninguna opción usa el valor reservado de «prefiero no responder»', () => {
    for (const pregunta of TOLERANCE_QUESTIONS) {
      expect(pregunta.options.map((o) => o.value)).not.toContain(SIN_RESPUESTA)
    }
  })

  it('todas explican para qué se preguntan', () => {
    for (const pregunta of TOLERANCE_QUESTIONS) {
      expect(pregunta.porQue.length).toBeGreaterThan(20)
    }
  })
})

describe('la banda es la mediana', () => {
  it.each([
    [[1, 1, 1, 1, 1], 1],
    [[5, 5, 5, 5, 5], 5],
    [[1, 2, 3, 4, 5], 3],
    [[1, 1, 3, 5, 5], 3],
    [[1, 1, 1, 5, 5], 1],
    [[1, 1, 5, 5, 5], 5],
    [[2, 4, 4, 4, 5], 4],
  ] as const)('%j da la banda %i', (bandas, esperada) => {
    expect(deriveToleranceBand(respuestas(bandas as readonly RiskBand[]))).toBe(esperada)
  })

  it('no es la media: [1,1,1,5,5] promedia 2,6 y la mediana es 1', () => {
    expect(deriveToleranceBand(respuestas([1, 1, 1, 5, 5]))).toBe(1)
  })

  it('el orden de las respuestas no cambia el resultado', () => {
    expect(deriveToleranceBand(respuestas([5, 1, 3, 1, 5]))).toBe(
      deriveToleranceBand(respuestas([1, 1, 3, 5, 5])),
    )
  })

  it('siempre devuelve una banda que alguien ha elegido', () => {
    const answers = respuestas([2, 2, 4, 4, 4])
    const elegidas = TOLERANCE_QUESTIONS.map(
      (p) => p.options.find((o) => o.value === answers[p.id])?.band,
    )
    expect(elegidas).toContain(deriveToleranceBand(answers))
  })
})

describe('sin las cinco respuestas no hay banda', () => {
  it('un cuestionario vacío no vale la banda del medio', () => {
    expect(deriveToleranceBand({})).toBeNull()
    expect(missingToleranceAnswers({})).toHaveLength(5)
  })

  it('con cuatro de cinco no se adelanta un resultado', () => {
    const answers = respuestas([3, 3, 3, 3, 3])
    delete answers[TOLERANCE_QUESTIONS[0]!.id]
    expect(deriveToleranceBand(answers)).toBeNull()
    expect(missingToleranceAnswers(answers)).toEqual([TOLERANCE_QUESTIONS[0]!.id])
  })

  it('«prefiero no responder» cuenta como sin contestar, no como punto medio', () => {
    const answers = { ...respuestas([1, 1, 1, 1, 1]) }
    answers[TOLERANCE_QUESTIONS[2]!.id] = SIN_RESPUESTA
    expect(deriveToleranceBand(answers)).toBeNull()
    expect(missingToleranceAnswers(answers)).toEqual([TOLERANCE_QUESTIONS[2]!.id])
  })

  it('una respuesta que no está entre las opciones invalida el resultado', () => {
    const answers = { ...respuestas([3, 3, 3, 3, 3]) }
    answers[TOLERANCE_QUESTIONS[1]!.id] = 'opcion-de-otra-version'
    expect(deriveToleranceBand(answers)).toBeNull()
  })

  it('respuestas de preguntas que ya no existen no completan el cuestionario', () => {
    expect(deriveToleranceBand({ 'pregunta-retirada': 'algo' })).toBeNull()
  })
})
