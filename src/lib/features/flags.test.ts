import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FLAGS_ENV_VAR,
  LAB_FEATURES,
  isFeatureEnabled,
  isLabFeature,
  parseLabFlags,
  type LabFeature,
} from './flags'

// `vi.stubEnv` es estado global: se restaura siempre, incluso si la prueba
// falla antes de llegar al final.
afterEach(() => {
  vi.unstubAllEnvs()
})

const TODAS = Object.keys(LAB_FEATURES) as LabFeature[]

describe('catálogo de flags', () => {
  it('contiene exactamente las nueve capacidades del plan', () => {
    expect(TODAS).toEqual([
      'labShell',
      'labIpsV2',
      'labStabilityV2',
      'labLookThrough',
      'labScenarioEngine',
      'labCandidates',
      'labSectorResearch',
      'labCompanyResearch',
      'labNarrativeExplanation',
    ])
  })

  it('cada flag declara fase, puerta de retirada y descripción', () => {
    for (const nombre of TODAS) {
      const meta = LAB_FEATURES[nombre]
      expect(meta.phase).toBeGreaterThanOrEqual(1)
      expect(meta.retireAfter).toMatch(/^G\d+$/)
      expect(meta.description.length).toBeGreaterThan(0)
    }
  })
})

describe('default seguro', () => {
  it('sin variable definida no hay ninguna capacidad activa', () => {
    const resolucion = parseLabFlags(undefined)
    expect(resolucion.enabled.size).toBe(0)
    expect(resolucion.unknown).toEqual([])
  })

  it('una cadena vacía o solo separadores no activa nada', () => {
    for (const raw of ['', '   ', ',', ',,,', ' , , ']) {
      expect(parseLabFlags(raw).enabled.size).toBe(0)
    }
  })

  it('un valor no textual no activa nada', () => {
    expect(parseLabFlags(null).enabled.size).toBe(0)
  })

  it('ninguna capacidad está activa por defecto', () => {
    // La variable se declara vacía a propósito. Antes esta prueba se apoyaba en
    // que el entorno de la suite no la definiera, y eso dejó de ser cierto al
    // pasar las pruebas a correr con la lista que se publica: comprobaba el
    // entorno en vez de la regla. La regla es que **la ausencia no activa
    // nada**, y para comprobarla hay que provocar la ausencia.
    vi.stubEnv(FLAGS_ENV_VAR, '')
    for (const nombre of TODAS) {
      expect(isFeatureEnabled(nombre)).toBe(false)
    }
  })
})

describe('overrides válidos', () => {
  it('activa una sola capacidad', () => {
    const resolucion = parseLabFlags('labShell')
    expect(resolucion.enabled.has('labShell')).toBe(true)
    expect(resolucion.enabled.size).toBe(1)
  })

  it('activa varias y tolera espacios alrededor', () => {
    const resolucion = parseLabFlags(' labShell , labStabilityV2 ')
    expect([...resolucion.enabled].sort()).toEqual(['labShell', 'labStabilityV2'])
  })

  it('una capacidad repetida se cuenta una vez', () => {
    expect(parseLabFlags('labShell,labShell').enabled.size).toBe(1)
  })

  it('activar una capacidad no activa las demás', () => {
    const raw = 'labShell'
    for (const nombre of TODAS) {
      expect(isFeatureEnabled(nombre, raw)).toBe(nombre === 'labShell')
    }
  })
})

describe('overrides inválidos: nada desconocido habilita funcionalidad', () => {
  it('un nombre que no existe no activa nada y se reporta', () => {
    const resolucion = parseLabFlags('labInventada')
    expect(resolucion.enabled.size).toBe(0)
    expect(resolucion.unknown).toEqual(['labInventada'])
  })

  it('la comparación distingue mayúsculas: no se adivina la intención', () => {
    for (const raw of ['LABSHELL', 'LabShell', 'labshell']) {
      const resolucion = parseLabFlags(raw)
      expect(resolucion.enabled.size).toBe(0)
      expect(resolucion.unknown).toEqual([raw])
    }
  })

  it('un valor genérico no funciona como comodín', () => {
    for (const raw of ['true', '1', '*', 'all', 'on']) {
      expect(parseLabFlags(raw).enabled.size).toBe(0)
    }
  })

  it('una entrada inválida no invalida a las válidas que la acompañan', () => {
    const resolucion = parseLabFlags('labShell,noExiste,labCandidates')
    expect([...resolucion.enabled].sort()).toEqual(['labCandidates', 'labShell'])
    expect(resolucion.unknown).toEqual(['noExiste'])
  })

  it('un nombre heredado de Object.prototype no se toma por capacidad', () => {
    for (const raw of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(isLabFeature(raw)).toBe(false)
      expect(parseLabFlags(raw).enabled.size).toBe(0)
    }
  })
})

describe('lectura desde el entorno', () => {
  it('lee la variable pública cuando no se pasa un valor explícito', () => {
    vi.stubEnv(FLAGS_ENV_VAR, 'labShell')
    expect(isFeatureEnabled('labShell')).toBe(true)
    expect(isFeatureEnabled('labCandidates')).toBe(false)
  })

  it('sin la variable, todo sigue oculto', () => {
    vi.stubEnv(FLAGS_ENV_VAR, '')
    for (const nombre of TODAS) {
      expect(isFeatureEnabled(nombre)).toBe(false)
    }
  })
})
