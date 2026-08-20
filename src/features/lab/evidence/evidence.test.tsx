/**
 * Pruebas del generador de explicaciones y del cajón de evidencia
 * (LAB-903, LAB-904).
 *
 * Los criterios de aceptación: **una explicación no puede cambiar el
 * resultado**, y **desde toda métrica principal se accede a la evidencia**.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { EvidenceItem } from '../../../lib/lab/evidence/contracts'
import {
  EXPLANATION_VERSION,
  explain,
  explainAsText,
  explainMissing,
} from '../../../lib/lab/evidence/explanations'
import { EvidenceDrawer, MethodologyPanel } from './EvidenceDrawer'

const item = (cambios: Partial<EvidenceItem> = {}): EvidenceItem => ({
  kind: 'estimate',
  claim: 'Tu volatilidad anualizada ha sido del 14,9 %.',
  method: 'desviación típica de los retornos diarios del último año, anualizada',
  modelVersion: 'stability-v1',
  sources: [{ label: 'Twelve Data', asOf: '2026-08-19', observations: 252 }],
  coverage: 0.85,
  limitations: ['La volatilidad mide oscilación, no probabilidad de ruina.'],
  ...cambios,
})

/* ── LAB-903 ──────────────────────────────────────────────────────────────── */

describe('la explicación no puede cambiar el resultado', () => {
  it('es determinista: el mismo dato da la misma frase, siempre', () => {
    // Con un modelo de lenguaje en medio, dos ejecuciones del mismo cálculo
    // podrían describirse distinto y nadie sabría si cambió el número o la
    // redacción.
    expect(explain(item())).toEqual(explain(item()))
    expect(explainAsText(item())).toBe(explainAsText(item()))
  })

  it('se declara cómo se generó, y siempre es lo mismo', () => {
    expect(explain(item()).generator).toBe('deterministic-template')
    expect(explain(item()).version).toBe(EXPLANATION_VERSION)
  })

  it('no contiene ningún número que no venga ya en la evidencia', () => {
    // Es la garantía de fondo: la explicación **deriva** del resultado, no lo
    // amplía. Cualquier cifra nueva sería una que nadie ha calculado.
    const evidencia = item({ limitations: [] })
    const origen = JSON.stringify(evidencia)
    const numeros = explainAsText(evidencia).match(/\d+/g) ?? []

    for (const n of numeros) {
      // El 85 sale de multiplicar coverage 0,85 por cien, así que se acepta
      // tanto el número como su fracción de origen.
      const enOrigen = origen.includes(n) || origen.includes(`0.${n}`)
      expect(enOrigen, `«${n}» no aparece en la evidencia`).toBe(true)
    }
  })
})

describe('el orden pone el contexto antes del número', () => {
  it('una estimación empieza declarando que lo es', () => {
    // El orden en que se leen las cosas decide qué se recuerda.
    expect(explain(item()).lines[0]!.role).toBe('warning')
    expect(explain(item()).lines[0]!.text).toMatch(/Estimación/)
  })

  it('un hecho no gasta una línea en decir que es un hecho', () => {
    const r = explain(item({ kind: 'fact', coverage: null, limitations: [] }))
    expect(r.lines[0]!.role).toBe('claim')
  })

  it('los datos de demostración se avisan antes que nada más', () => {
    const r = explain(
      item({ kind: 'fact', sources: [{ label: 'Datos de demostración', asOf: '2026-01-01' }] }),
    )
    expect(r.lines[0]!.text).toMatch(/No son tus cifras/)
  })

  it('una cobertura parcial se convierte en limitación explícita', () => {
    const r = explain(item({ coverage: 0.6 }))
    expect(r.lines.some((l) => l.role === 'limitation' && /60 %/.test(l.text))).toBe(true)
  })

  it('sin cobertura declarada no se inventa una línea sobre ella', () => {
    const r = explain(item({ coverage: null, limitations: [] }))
    expect(r.lines.some((l) => /debería cubrir/.test(l.text))).toBe(false)
  })

  it('la fecha que se enseña es la de la fuente más antigua', () => {
    const r = explain(
      item({
        sources: [
          { label: 'A', asOf: '2026-08-19' },
          { label: 'B', asOf: '2026-02-01' },
        ],
      }),
    )
    expect(r.lines.find((l) => l.role === 'source')!.text).toMatch(/2026-02-01/)
  })
})

describe('explicar lo que no se ha podido calcular', () => {
  it('traduce el código a algo legible y añade qué hacer', () => {
    const r = explainMissing(['dimension_unknown'])
    expect(r.lines[0]!.text).toMatch(/no se puede comprobar/)
    expect(r.lines[1]!.text).toMatch(/Rellena esa dimensión/)
  })

  it('un código desconocido no rompe: se explica de forma segura', () => {
    const r = explainMissing(['esto_no_existe'])
    expect(r.lines[0]!.text).toMatch(/no sabe explicar por qué/)
  })

  it('sin códigos, no hay líneas que enseñar', () => {
    expect(explainMissing([]).lines).toEqual([])
  })
})

/* ── LAB-904 ──────────────────────────────────────────────────────────────── */

describe('el cajón de evidencia', () => {
  it('arranca cerrado y se abre al pulsar', async () => {
    const user = userEvent.setup()
    render(<EvidenceDrawer evidence={item()} />)

    const boton = screen.getByRole('button', { name: 'De dónde sale este número' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')

    await user.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(item().claim)).toBeInTheDocument()
  })

  it('se cierra con Escape: no atrapa a quien usa teclado', async () => {
    const user = userEvent.setup()
    render(<EvidenceDrawer evidence={item()} />)

    const boton = screen.getByRole('button', { name: 'De dónde sale este número' })
    await user.click(boton)
    await user.keyboard('{Escape}')

    expect(boton).toHaveAttribute('aria-expanded', 'false')
  })

  it('el disparador es un botón de verdad, alcanzable con tabulador', async () => {
    const user = userEvent.setup()
    render(<EvidenceDrawer evidence={item()} />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'De dónde sale este número' })).toHaveFocus()
  })

  it('el contenido va en una región etiquetada', async () => {
    const user = userEvent.setup()
    render(<EvidenceDrawer evidence={item()} />)
    await user.click(screen.getByRole('button', { name: 'De dónde sale este número' }))
    expect(screen.getByRole('region', { name: /Evidencia: Estimación/ })).toBeInTheDocument()
  })

  it('enseña la versión del modelo, para poder reproducirlo', async () => {
    const user = userEvent.setup()
    render(<EvidenceDrawer evidence={item()} />)
    await user.click(screen.getByRole('button', { name: 'De dónde sale este número' }))
    expect(screen.getByText(/Modelo stability-v1/)).toBeInTheDocument()
  })

  it('declara que la explicación no puede cambiar el resultado', async () => {
    const user = userEvent.setup()
    render(<EvidenceDrawer evidence={item()} />)
    await user.click(screen.getByRole('button', { name: 'De dónde sale este número' }))
    expect(screen.getByText(/no puede cambiar el resultado/)).toBeInTheDocument()
  })

  it('acepta una etiqueta propia', () => {
    render(<EvidenceDrawer evidence={item()} label="Ver metodología" />)
    expect(screen.getByRole('button', { name: 'Ver metodología' })).toBeInTheDocument()
  })
})

describe('el panel de metodología', () => {
  it('reúne todas las evidencias de una pantalla', () => {
    render(<MethodologyPanel items={[item(), item({ kind: 'scenario' })]} />)
    expect(screen.getByText('Estimación')).toBeInTheDocument()
    expect(screen.getByText('Escenario')).toBeInTheDocument()
  })

  it('sin evidencias no enseña un panel vacío', () => {
    const { container } = render(<MethodologyPanel items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('declara que ninguna explicación la escribe un modelo de lenguaje', () => {
    render(<MethodologyPanel items={[item()]} />)
    expect(screen.getByText(/Ninguna las escribe un modelo de lenguaje/)).toBeInTheDocument()
  })
})
