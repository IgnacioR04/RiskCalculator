/**
 * Pruebas del contrato de evidencia y del catálogo de razones (LAB-901, 902).
 *
 * Los dos criterios de aceptación: la evidencia **soporta las cinco clases de
 * afirmación**, y **un código desconocido se muestra de forma segura y se
 * monitoriza**.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  EVIDENCE_ERROR_TEXT,
  EVIDENCE_KIND_LABEL,
  EVIDENCE_KIND_MEANING,
  buildEvidence,
  isDemo,
  needsContext,
  oldestAsOf,
  type EvidenceItem,
  type EvidenceKind,
} from './contracts'
import {
  REASON_CODES,
  UNKNOWN_REASON,
  describeReason,
  isKnownReason,
  reasonsBySeverity,
  resetUnknownReasons,
  unknownReasonsSeen,
} from './reasonCodes'

const evidencia = (cambios: Partial<EvidenceItem> = {}): EvidenceItem => ({
  kind: 'estimate',
  claim: 'Tu volatilidad anualizada ha sido del 14,9 %.',
  method: 'Desviación típica de los retornos diarios del último año, anualizada.',
  modelVersion: 'stability-v1',
  sources: [{ label: 'Twelve Data', asOf: '2026-08-19', observations: 252 }],
  coverage: 0.85,
  limitations: ['La volatilidad mide oscilación, no probabilidad de ruina.'],
  ...cambios,
})

/* ── LAB-901 ──────────────────────────────────────────────────────────────── */

describe('las cinco clases de afirmación', () => {
  const clases: EvidenceKind[] = ['fact', 'estimate', 'scenario', 'signal', 'candidate']

  it('el contrato soporta las cinco', () => {
    for (const kind of clases) {
      expect(buildEvidence(evidencia({ kind })).ok).toBe(true)
    }
  })

  it('cada una tiene etiqueta y significado propios', () => {
    for (const kind of clases) {
      expect(EVIDENCE_KIND_LABEL[kind].length).toBeGreaterThan(0)
      expect(EVIDENCE_KIND_MEANING[kind].length).toBeGreaterThan(20)
    }
  })

  it('un escenario declara que no dice que vaya a ocurrir', () => {
    expect(EVIDENCE_KIND_MEANING.scenario).toMatch(/No dice que vaya a ocurrir/)
  })

  it('una señal declara que falla durante años', () => {
    expect(EVIDENCE_KIND_MEANING.signal).toMatch(/Falla durante años/)
  })

  it('una candidata declara que no es un consejo de compra', () => {
    expect(EVIDENCE_KIND_MEANING.candidate).toMatch(/no es un consejo/i)
  })
})

describe('lo que no puede faltar', () => {
  it('sin afirmación no se construye', () => {
    const r = buildEvidence(evidencia({ claim: '   ' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('missing_claim')
  })

  it('sin método tampoco: sería una opinión con formato de dato', () => {
    const r = buildEvidence(evidencia({ method: '' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(EVIDENCE_ERROR_TEXT[r.reason]).toMatch(/opinión con formato de dato/)
  })

  it('sin fuente no se puede comprobar', () => {
    const r = buildEvidence(evidencia({ sources: [] }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('missing_source')
  })

  it('una cobertura fuera de 0–1 se rechaza', () => {
    for (const coverage of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildEvidence(evidencia({ coverage })).ok).toBe(false)
    }
  })

  it('una cobertura nula sí vale: significa que no aplica', () => {
    expect(buildEvidence(evidencia({ kind: 'fact', coverage: null })).ok).toBe(true)
  })

  it('las limitaciones son obligatorias como campo, aunque estén vacías', () => {
    // Un array vacío es una decisión declarada; que falte el campo no compila.
    expect(buildEvidence(evidencia({ limitations: [] })).ok).toBe(true)
  })
})

describe('lecturas sobre la evidencia', () => {
  it('la fecha del conjunto es la de la fuente más antigua', () => {
    const item = evidencia({
      sources: [
        { label: 'A', asOf: '2026-08-19' },
        { label: 'B', asOf: '2026-03-01' },
      ],
    })
    // Un conjunto es tan viejo como su pieza más vieja.
    expect(oldestAsOf(item)).toBe('2026-03-01')
  })

  it('detecta datos de demostración', () => {
    expect(isDemo(evidencia({ sources: [{ label: 'Datos de demostración', asOf: '2026-01-01' }] }))).toBe(
      true,
    )
    expect(isDemo(evidencia())).toBe(false)
  })

  it('un hecho con cobertura completa se puede enseñar sin adornos', () => {
    expect(needsContext(evidencia({ kind: 'fact', coverage: 1 }))).toBe(false)
    expect(needsContext(evidencia({ kind: 'fact', coverage: null }))).toBe(false)
  })

  it('todo lo demás necesita su contexto al lado', () => {
    expect(needsContext(evidencia({ kind: 'estimate', coverage: 1 }))).toBe(true)
    expect(needsContext(evidencia({ kind: 'fact', coverage: 0.6 }))).toBe(true)
    expect(needsContext(evidencia({ kind: 'signal', coverage: null }))).toBe(true)
  })
})

/* ── LAB-902 ──────────────────────────────────────────────────────────────── */

describe('un código desconocido se muestra de forma segura', () => {
  beforeEach(() => {
    resetUnknownReasons()
  })

  it('devuelve algo que enseñar, nunca null ni una excepción', () => {
    const r = describeReason('esto_no_existe')
    expect(r).toEqual(UNKNOWN_REASON)
    expect(r.text.length).toBeGreaterThan(0)
  })

  it('no imprime el código en crudo en la cara del usuario', () => {
    expect(describeReason('insufficient_downside_sample_v2').text).not.toMatch(/_/)
  })

  it('dice que es un fallo de la aplicación, no de los datos del usuario', () => {
    expect(UNKNOWN_REASON.remediation).toMatch(/fallo de la aplicación, no de tus datos/)
  })

  it('se monitoriza: el código desconocido queda registrado', () => {
    describeReason('codigo_raro')
    describeReason('otro_raro')
    expect(unknownReasonsSeen()).toEqual(['codigo_raro', 'otro_raro'])
  })

  it('un código conocido no ensucia el registro de desconocidos', () => {
    describeReason('insufficient_sample')
    expect(unknownReasonsSeen()).toEqual([])
  })
})

describe('el catálogo', () => {
  it('no tiene códigos repetidos', () => {
    const codigos = REASON_CODES.map((r) => r.code)
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it('cada entrada dice de dónde viene, para poder rastrearla', () => {
    for (const r of REASON_CODES) expect(r.origin.length).toBeGreaterThan(0)
  })

  it('cada bloqueo trae qué hacer, o declara que no hay nada que hacer', () => {
    for (const r of reasonsBySeverity('blocking')) {
      // Un bloqueo sin salida es aceptable si el texto ya explica que no la hay,
      // pero nunca puede quedarse sin explicación.
      expect(r.text.length).toBeGreaterThan(20)
    }
  })

  it('ningún texto contiene guiones bajos: son códigos, no mensajes', () => {
    for (const r of REASON_CODES) expect(r.text).not.toMatch(/[a-z]_[a-z]/)
  })

  it('las tres severidades están representadas', () => {
    for (const s of ['blocking', 'warning', 'info'] as const) {
      expect(reasonsBySeverity(s).length).toBeGreaterThan(0)
    }
  })
})

describe('ningún motivo llega al usuario sin traducción', () => {
  /**
   * Criterio de aceptación de LAB-902, comprobado recorriendo el fuente.
   *
   * Un motivo es presentable si **o bien** está en el catálogo central, **o
   * bien** su propio módulo trae un mapa de texto que lo cubre. Lo que no vale
   * es que no esté en ninguno de los dos sitios: entonces la pantalla recibiría
   * «no se sabe explicar» para algo que sí se sabe.
   *
   * Este guardián encontró once motivos en esa situación cuando se escribió.
   */
  function ficherosDe(dir: string): string[] {
    return readdirSync(dir).flatMap((entrada) => {
      const ruta = join(dir, entrada)
      if (statSync(ruta).isDirectory()) return ficherosDe(ruta)
      return ruta.endsWith('.ts') && !ruta.endsWith('.test.ts') ? [ruta] : []
    })
  }

  it('todos los motivos que devuelven los motores son presentables', () => {
    const sinTraducir: string[] = []

    for (const fichero of ficherosDe(join(process.cwd(), 'src/lib/lab'))) {
      const fuente = readFileSync(fichero, 'utf8')
      const motivos = [
        ...new Set([...fuente.matchAll(/reason:\s*'([a-zA-Z_]+)'/g)].map((m) => m[1]!)),
      ]
      if (motivos.length === 0) continue

      // Claves de cualquier mapa de texto del propio módulo. Se buscan por
      // sangrado y no por comilla inmediata: varios textos empiezan en la línea
      // siguiente. El `readonly` de las interfaces queda fuera del patrón.
      const claves = new Set(
        [...fuente.matchAll(/^ {2}([a-zA-Z_]+):/gm)].map((m) => m[1]!),
      )

      for (const motivo of motivos) {
        if (!isKnownReason(motivo) && !claves.has(motivo)) sinTraducir.push(motivo)
      }
    }

    expect([...new Set(sinTraducir)].sort()).toEqual([])
  })
})
