/**
 * Pruebas del cuestionario de conocimientos (LAB-208).
 *
 * Lo importante no es solo que el nivel salga bien, sino que **no toque nada**:
 * ADR-002 deja la experiencia fuera del riesgo efectivo, y esa ausencia se
 * comprueba en `policyDerivation.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import type { KnowledgeLevel } from '../domain/investmentPolicy'
import {
  KNOWLEDGE_QUESTIONS,
  deriveKnowledgeLevel,
  missingKnowledgeAnswers,
} from './knowledgeLevel'
import { SIN_RESPUESTA } from './toleranceBand'

function respuestas(niveles: readonly KnowledgeLevel[]): Record<string, string> {
  const answers: Record<string, string> = {}
  niveles.forEach((nivel, indice) => {
    const pregunta = KNOWLEDGE_QUESTIONS[indice]
    if (pregunta === undefined) throw new Error(`No hay pregunta en la posición ${indice}`)
    const opcion = pregunta.options.find((o) => o.level === nivel)
    if (opcion === undefined) throw new Error(`La pregunta ${pregunta.id} no ofrece ${nivel}`)
    answers[pregunta.id] = opcion.value
  })
  return answers
}

describe('forma del cuestionario', () => {
  it('son tres preguntas y cada una ofrece los tres niveles', () => {
    expect(KNOWLEDGE_QUESTIONS).toHaveLength(3)
    for (const pregunta of KNOWLEDGE_QUESTIONS) {
      expect(pregunta.options.map((o) => o.level).sort()).toEqual(['avanzado', 'basico', 'medio'])
    }
  })

  it('los identificadores son únicos', () => {
    const ids = KNOWLEDGE_QUESTIONS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('el nivel es la mediana', () => {
  it.each([
    [['basico', 'basico', 'basico'], 'basico'],
    [['avanzado', 'avanzado', 'avanzado'], 'avanzado'],
    [['basico', 'medio', 'avanzado'], 'medio'],
    [['basico', 'basico', 'avanzado'], 'basico'],
    [['basico', 'avanzado', 'avanzado'], 'avanzado'],
  ] as const)('%j da el nivel %s', (niveles, esperado) => {
    expect(deriveKnowledgeLevel(respuestas(niveles as readonly KnowledgeLevel[]))).toBe(esperado)
  })

  it('haber pasado por una caída no basta si lo demás es de recién llegado', () => {
    expect(deriveKnowledgeLevel(respuestas(['basico', 'basico', 'avanzado']))).toBe('basico')
  })
})

describe('sin las tres respuestas no hay nivel', () => {
  it('vacío devuelve null', () => {
    expect(deriveKnowledgeLevel({})).toBeNull()
    expect(missingKnowledgeAnswers({})).toHaveLength(3)
  })

  it('«prefiero no responder» deja la pregunta sin contestar', () => {
    const answers = { ...respuestas(['medio', 'medio', 'medio']) }
    answers[KNOWLEDGE_QUESTIONS[1]!.id] = SIN_RESPUESTA
    expect(deriveKnowledgeLevel(answers)).toBeNull()
    expect(missingKnowledgeAnswers(answers)).toEqual([KNOWLEDGE_QUESTIONS[1]!.id])
  })

  it('una opción desconocida invalida el resultado', () => {
    const answers = { ...respuestas(['medio', 'medio', 'medio']) }
    answers[KNOWLEDGE_QUESTIONS[0]!.id] = 'de-otra-version'
    expect(deriveKnowledgeLevel(answers)).toBeNull()
  })
})
