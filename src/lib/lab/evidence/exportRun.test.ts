/**
 * Pruebas de la exportación (LAB-907).
 *
 * El criterio: la exportación tiene que ser **correcta y legible sin la
 * aplicación delante**. Un volcado de números es fácil y no sirve para nada.
 */
import { describe, expect, it } from 'vitest'
import type { LabRun } from '../runs/localRuns'
import type { EvidenceItem } from './contracts'
import {
  EXPORT_DISCLAIMER,
  EXPORT_FORMAT_VERSION,
  buildExport,
  suggestedFilename,
  toJson,
  toMarkdown,
} from './exportRun'

const RUN: LabRun = {
  id: 'run-1',
  kind: 'scenario',
  modelVersion: 1,
  asOf: '2026-08-19',
  createdAt: '2026-08-20T09:00:00.000Z',
  inputs: { definitionId: 'recesion', definitionVersion: 1, baseCurrency: 'EUR' },
  summary: { baseValue: 23049.26, finalValue: 20181.47, changePct: -0.124, notCovered: 0 },
}

const EVIDENCIA: EvidenceItem = {
  kind: 'scenario',
  claim: 'Con una corrección de mercado, la cartera pasaría de 23.049,26 € a 20.181,47 €.',
  method: 'shock por clase de activo aplicado sobre la valoración actual',
  modelVersion: 'scenario-deterministic-v1',
  sources: [{ label: 'Twelve Data', asOf: '2026-08-19' }],
  coverage: 1,
  limitations: ['Golpe instantáneo: no hay trayectoria intermedia.'],
}

const exportar = (evidence: readonly EvidenceItem[] = [EVIDENCIA]) =>
  buildExport(RUN, evidence, 'v1.0.0')

describe('el aviso viaja dentro del fichero', () => {
  it('está en el JSON', () => {
    // Un fichero que viaja sin su aviso es un fichero que alguien leerá sin él.
    expect(toJson(exportar())).toContain(EXPORT_DISCLAIMER)
  })

  it('y en el Markdown', () => {
    expect(toMarkdown(exportar())).toContain(EXPORT_DISCLAIMER)
  })

  it('dice que no es asesoramiento y que no hay recomendaciones', () => {
    expect(EXPORT_DISCLAIMER).toMatch(/no es asesoramiento financiero/i)
    expect(EXPORT_DISCLAIMER).toMatch(/no contiene recomendaciones/i)
  })
})

describe('el contexto va pegado al número', () => {
  it('el fichero lleva fecha de los datos y versión del modelo', () => {
    const md = toMarkdown(exportar())
    expect(md).toMatch(/Fecha de los datos:\*\* 2026-08-19/)
    expect(md).toMatch(/Versión del modelo:\*\* 1/)
  })

  it('lleva qué aplicación lo produjo', () => {
    expect(exportar().producedBy).toBe('RiskCalculator v1.0.0')
  })

  it('la evidencia se explica en frases, no en claves', () => {
    const md = toMarkdown(exportar())
    expect(md).toContain('De dónde sale cada número')
    expect(md).toContain('Golpe instantáneo')
  })

  it('sin evidencia no se inventa una sección vacía', () => {
    expect(toMarkdown(exportar([]))).not.toContain('De dónde sale cada número')
  })

  it('un valor nulo se escribe «No disponible», no como celda vacía', () => {
    // Un hueco se lee como cero, y son cosas distintas.
    const conNulo = buildExport(
      { ...RUN, summary: { ...RUN.summary, finalValue: null } },
      [],
      'v1',
    )
    expect(toMarkdown(conNulo)).toMatch(/finalValue:\*\* No disponible/)
  })
})

describe('estabilidad del formato', () => {
  it('va versionado', () => {
    expect(exportar().formatVersion).toBe(EXPORT_FORMAT_VERSION)
  })

  it('el JSON es estable: dos exportaciones iguales dan el mismo texto', () => {
    expect(toJson(exportar())).toBe(toJson(exportar()))
  })

  it('las claves salen ordenadas, así que el orden de entrada no cambia el fichero', () => {
    const a = buildExport({ ...RUN, inputs: { z: 1, a: 2 } }, [], 'v1')
    const b = buildExport({ ...RUN, inputs: { a: 2, z: 1 } }, [], 'v1')
    expect(toJson(a)).toBe(toJson(b))
  })

  it('el JSON se puede volver a leer', () => {
    const leido = JSON.parse(toJson(exportar())) as { run: { id: string } }
    expect(leido.run.id).toBe('run-1')
  })
})

describe('nombre de fichero', () => {
  it('no lleva espacios ni caracteres raros', () => {
    expect(suggestedFilename(RUN, 'json')).toBe('riskcalculator-scenario-2026-08-19-run-1.json')
  })

  it('limpia un identificador con caracteres que no viajan bien', () => {
    const sucio = suggestedFilename({ ...RUN, id: 'run/con espacios:raros' }, 'md')
    expect(sucio).not.toMatch(/[ /:]/)
    expect(sucio.endsWith('.md')).toBe(true)
  })
})

describe('no se exporta nada que la aplicación no tuviera ya', () => {
  it('el fichero no añade identificadores ni marcas de uso', () => {
    // La exportación es una vista de lo guardado, no una recopilación nueva.
    const claves = Object.keys(exportar()).sort()
    expect(claves).toEqual(['disclaimer', 'evidence', 'formatVersion', 'producedBy', 'run'])
  })
})
