/**
 * Pruebas de la biblioteca de escenarios (LAB-507).
 *
 * Las dos reglas que la sostienen: un escenario de fábrica no se edita —se
 * deriva— y editar uno propio sube su versión. Sin ellas, dos resultados con el
 * mismo identificador y la misma versión podrían venir de definiciones
 * distintas, y compararlos sería mentir.
 */
import { describe, expect, it } from 'vitest'
import { parseScenarioDefinition } from './schema'
import {
  addScenario,
  builtinScenarios,
  deriveScenario,
  findScenario,
  isUserScenario,
  removeScenario,
  scenarioLibrary,
  updateScenario,
} from './library'

const FABRICA = builtinScenarios()
const RECESION = FABRICA.find((d) => d.id === 'recesion')!

describe('el catálogo de fábrica', () => {
  it('trae los deterministas y los históricos', () => {
    expect(FABRICA.some((d) => d.params.kind === 'deterministic')).toBe(true)
    expect(FABRICA.some((d) => d.params.kind === 'historical')).toBe(true)
  })

  it('todos son definiciones válidas', () => {
    for (const d of FABRICA) {
      const r = parseScenarioDefinition(d)
      expect(r.ok, `${d.id}: ${r.ok ? '' : r.error}`).toBe(true)
    }
  })

  it('no hay identificadores repetidos', () => {
    const ids = FABRICA.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ninguno se declara del usuario', () => {
    expect(FABRICA.every((d) => !isUserScenario(d))).toBe(true)
  })
})

describe('derivar en vez de editar lo de fábrica', () => {
  const copia = deriveScenario(RECESION, { name: 'Mi recesión' }, 'a1')

  it('la copia es del usuario y tiene identificador propio', () => {
    expect(isUserScenario(copia)).toBe(true)
    expect(copia.id).not.toBe(RECESION.id)
    expect(copia.id).toMatch(/^user:recesion:/)
  })

  it('la copia arranca en la versión 1, no hereda la del origen', () => {
    // Heredarla mezclaría dos historias distintas bajo el mismo número.
    expect(copia.version).toBe(1)
  })

  it('conserva lo que no se cambia', () => {
    expect(copia.params).toEqual(RECESION.params)
    expect(copia.assumptions).toEqual(RECESION.assumptions)
  })

  it('sin nombre nuevo se marca como copia, para no confundirla', () => {
    expect(deriveScenario(RECESION, {}, 'a2').name).toBe(`${RECESION.name} (copia)`)
  })

  it('la copia sigue siendo una definición válida', () => {
    expect(parseScenarioDefinition(copia).ok).toBe(true)
  })

  it('un escenario de fábrica no se puede editar en su sitio', () => {
    const r = updateScenario([], RECESION.id, { name: 'Otro nombre' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('builtin_not_editable')
  })

  it('ni borrar', () => {
    const r = removeScenario([], RECESION.id)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('builtin_not_editable')
  })
})

describe('alta, edición y baja de los propios', () => {
  const mio = deriveScenario(RECESION, { name: 'Mi recesión' }, 'a1')

  it('se añade al catálogo del usuario', () => {
    const r = addScenario([], mio)
    expect(r.ok && r.scenarios).toHaveLength(1)
  })

  it('un identificador repetido se rechaza', () => {
    const primero = addScenario([], mio)
    expect(primero.ok).toBe(true)
    if (!primero.ok) return

    const segundo = addScenario(primero.scenarios, mio)
    expect(segundo.ok).toBe(false)
    if (segundo.ok) return
    expect(segundo.reason).toBe('duplicate_id')
  })

  it('no se puede pisar un identificador de fábrica', () => {
    const r = addScenario([], { ...mio, id: RECESION.id })
    expect(r.ok).toBe(false)
  })

  it('editar sube la versión', () => {
    const r = updateScenario([mio], mio.id, { name: 'Cambiado' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scenarios[0]!.version).toBe(mio.version + 1)
    expect(r.scenarios[0]!.name).toBe('Cambiado')
  })

  it('editar dos veces sube dos veces', () => {
    const uno = updateScenario([mio], mio.id, { name: 'A' })
    expect(uno.ok).toBe(true)
    if (!uno.ok) return
    const dos = updateScenario(uno.scenarios, mio.id, { name: 'B' })
    expect(dos.ok && dos.scenarios[0]!.version).toBe(3)
  })

  it('editar uno que no existe se dice, no se crea', () => {
    const r = updateScenario([], 'user:no-existe', { name: 'X' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not_found')
  })

  it('borrar quita solo el pedido', () => {
    const otro = deriveScenario(RECESION, {}, 'a2')
    const r = removeScenario([mio, otro], mio.id)
    expect(r.ok && r.scenarios.map((d) => d.id)).toEqual([otro.id])
  })
})

describe('el catálogo mixto', () => {
  const mio = deriveScenario(RECESION, { name: 'Mío' }, 'a1')

  it('junta fábrica y usuario, con la fábrica primero', () => {
    const todos = scenarioLibrary([mio])
    expect(todos).toHaveLength(FABRICA.length + 1)
    expect(todos.at(-1)!.id).toBe(mio.id)
  })

  it('ante una colisión importada a mano, gana la de fábrica', () => {
    // La que se puede reproducir es la que viene versionada con la aplicación.
    const impostor = { ...mio, id: RECESION.id }
    const todos = scenarioLibrary([impostor])
    expect(todos.filter((d) => d.id === RECESION.id)).toHaveLength(1)
    expect(todos.find((d) => d.id === RECESION.id)!.source).toBe('builtin')
  })

  it('se busca por identificador en todo el catálogo', () => {
    expect(findScenario([mio], mio.id)?.name).toBe('Mío')
    expect(findScenario([mio], RECESION.id)?.id).toBe(RECESION.id)
    expect(findScenario([mio], 'no-existe')).toBeNull()
  })

  it('sin escenarios del usuario, el catálogo es el de fábrica', () => {
    expect(scenarioLibrary([])).toEqual(FABRICA)
  })
})
