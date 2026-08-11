/**
 * Pruebas del asistente de política de inversión (LAB-207).
 *
 * La ficha de la tarea pide tres cosas: teclado, validación y resumen; y como
 * criterio de aceptación, que **recargar conserve el borrador local**. Esa
 * última se prueba de verdad: se escribe, se tira el estado en memoria y se
 * rehidrata desde `localStorage`, que es lo que hace un F5.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentPolicy, RiskBand } from '../../../lib/lab/domain/investmentPolicy'
import { KNOWLEDGE_QUESTIONS } from '../../../lib/lab/analytics/knowledgeLevel'
import { TOLERANCE_QUESTIONS } from '../../../lib/lab/analytics/toleranceBand'
import { isSupabaseConfigured } from '../../../lib/supabase'
import { GUEST_CACHE_NAME, useAppStore } from '../../../state/store'
import { initialLabProfileState } from '../../../state/slices/labProfileSlice'
import { PerfilPage } from '../../../pages/PerfilPage'
import { IpsWizard, PASOS } from './IpsWizard'
import { horizonteSugerido } from './steps/HorizonStep'

function reiniciarEstado() {
  localStorage.clear()
  useAppStore.persist.setOptions({ name: GUEST_CACHE_NAME })
  useAppStore.setState({ ...initialLabProfileState })
}

beforeEach(reiniciarEstado)
afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

function borrador() {
  return useAppStore.getState().labPolicyDraft
}

/** Lo que el store tiene escrito en `localStorage` ahora mismo. */
function enDisco(): { state?: { labPolicyDraft?: InvestmentPolicy | null } } | null {
  return JSON.parse(localStorage.getItem(GUEST_CACHE_NAME) ?? 'null')
}

/** Rellena y añade un objetivo. La fecha se pone con `fireEvent`: un `input` de
 *  tipo `date` no se escribe carácter a carácter. */
async function anadirObjetivo(
  user: ReturnType<typeof userEvent.setup>,
  datos: { nombre: string; importe: string; fecha: string; prioridad?: RegExp },
) {
  await user.type(screen.getByLabelText('Nombre'), datos.nombre)
  await user.type(screen.getByLabelText('Importe objetivo'), datos.importe)
  fireEvent.change(screen.getByLabelText('¿Para cuándo?'), { target: { value: datos.fecha } })
  if (datos.prioridad !== undefined) {
    await user.click(screen.getByRole('radio', { name: datos.prioridad }))
  }
  await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
}

/* ── Navegación por pasos ─────────────────────────────────────────────────── */

describe('IpsWizard · navegación por pasos', () => {
  it('empieza en objetivos y marca el paso actual', () => {
    render(<IpsWizard />)

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Paso 1 de 9 · Objetivos')
    const pasos = screen.getByRole('navigation', { name: 'Pasos del asistente' })
    expect(within(pasos).getByRole('button', { name: /Objetivos/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(within(pasos).getByRole('button', { name: /Horizonte/ })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('avanza y retrocede solo con el teclado', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    const continuar = screen.getByRole('button', { name: 'Guardar y continuar' })
    continuar.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Paso 2 de 9 · Horizonte')
    expect(screen.getByLabelText('Años hasta necesitar el dinero')).toBeInTheDocument()

    const volver = screen.getByRole('button', { name: 'Volver a objetivos' })
    volver.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Paso 1 de 9 · Objetivos')
  })

  it('deja saltar a un paso concreto desde la lista', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    const pasos = screen.getByRole('navigation', { name: 'Pasos del asistente' })
    await user.click(within(pasos).getByRole('button', { name: /Horizonte/ }))

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Paso 2 de 9 · Horizonte')
  })

  it('anuncia los pasos que todavía no existen sin ofrecerlos como botón', () => {
    render(<IpsWizard />)
    const pasos = screen.getByRole('navigation', { name: 'Pasos del asistente' })

    expect(within(pasos).getAllByRole('button')).toHaveLength(PASOS.length)
    // El paso 6 se salta a propósito y se dice: renumerar fingiría que el
    // asistente está completo.
    expect(within(pasos).getByText(/Necesidad de rentabilidad/)).toBeInTheDocument()
    expect(PASOS.map((p) => p.num)).toEqual([1, 2, 3, 4, 5, 7, 8, 9])
  })

  it('no crea ninguna política por el mero hecho de abrirlo', () => {
    render(<IpsWizard />)
    expect(borrador()).toBeNull()
    expect(enDisco()?.state?.labPolicyDraft).toBeNull()
  })
})

/* ── Objetivos: alta, prioridad y borrado ─────────────────────────────────── */

describe('IpsWizard · objetivos', () => {
  it('admite varios objetivos con prioridades distintas', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await anadirObjetivo(user, {
      nombre: 'Entrada de una casa',
      importe: '40000',
      fecha: '2032-06-01',
      prioridad: /Esencial/,
    })
    await anadirObjetivo(user, {
      nombre: 'Viaje a Japón',
      importe: '6000',
      fecha: '2029-04-15',
      prioridad: /Deseable/,
    })

    const guardados = borrador()?.goals ?? []
    expect(guardados.map((g) => [g.name, g.priority, g.targetAmount, g.currency])).toEqual([
      ['Entrada de una casa', 'esencial', '40000', 'EUR'],
      ['Viaje a Japón', 'deseable', '6000', 'EUR'],
    ])
    // Cada objetivo lleva identificador propio: los hijos viajan a su tabla.
    expect(new Set(guardados.map((g) => g.id)).size).toBe(2)
  })

  it('deja elegir la divisa de cada objetivo', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await user.selectOptions(screen.getByLabelText('Divisa'), 'USD')
    await anadirObjetivo(user, { nombre: 'Fondo en dólares', importe: '1000', fecha: '2030-01-01' })

    expect(borrador()?.goals[0]?.currency).toBe('USD')
  })

  it('guarda las banderas de flexibilidad, que son salidas del conflicto', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await user.click(screen.getByLabelText('La fecha puede moverse'))
    await anadirObjetivo(user, { nombre: 'Coche', importe: '15000', fecha: '2031-03-01' })

    expect(borrador()?.goals[0]?.dateFlexible).toBe(true)
    expect(borrador()?.goals[0]?.amountFlexible).toBe(false)
  })

  it('permite quitar un objetivo ya declarado', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await anadirObjetivo(user, { nombre: 'Coche', importe: '15000', fecha: '2031-03-01' })
    await user.click(screen.getByRole('button', { name: 'Quitar Coche' }))

    expect(borrador()?.goals).toEqual([])
  })

  it('recorta los espacios del nombre', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await anadirObjetivo(user, { nombre: '   Coche   ', importe: '15000', fecha: '2031-03-01' })
    expect(borrador()?.goals[0]?.name).toBe('Coche')
  })
})

/* ── Validación ───────────────────────────────────────────────────────────── */

describe('IpsWizard · validación de objetivos', () => {
  it('no marca nada antes del primer intento', () => {
    render(<IpsWizard />)
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'false')
  })

  it('al intentar añadir un objetivo vacío señala los tres campos y no guarda nada', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))

    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Importe objetivo')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('¿Para cuándo?')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByRole('alert')).toHaveLength(3)
    expect(borrador()).toBeNull()
  })

  it('lleva el foco al primer campo que falla', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
    expect(screen.getByLabelText('Nombre')).toHaveFocus()

    await user.type(screen.getByLabelText('Nombre'), 'Coche')
    await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
    expect(screen.getByLabelText('Importe objetivo')).toHaveFocus()
  })

  it('rechaza importes que no son cifras positivas', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)
    const importe = screen.getByLabelText('Importe objetivo')

    await user.type(screen.getByLabelText('Nombre'), 'Coche')
    await user.type(importe, '-100')
    await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
    expect(screen.getByText('Escribe solo cifras, con punto decimal si hace falta.')).toBeVisible()

    await user.clear(importe)
    await user.type(importe, '0')
    await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
    expect(screen.getByText('El importe debe ser mayor que cero.')).toBeVisible()

    expect(borrador()).toBeNull()
  })

  it('enlaza cada error con su campo para que se anuncie al llegar a él', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))

    const nombre = screen.getByLabelText('Nombre')
    const descrito = nombre.getAttribute('aria-describedby')?.split(' ') ?? []
    const textos = descrito.map((id) => document.getElementById(id)?.textContent)
    expect(textos).toContain('Ponle un nombre para poder reconocerlo.')
  })

  it('limpia el formulario y devuelve el foco tras un alta correcta', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await anadirObjetivo(user, { nombre: 'Coche', importe: '15000', fecha: '2031-03-01' })

    expect(screen.getByLabelText('Nombre')).toHaveValue('')
    expect(screen.getByLabelText('Importe objetivo')).toHaveValue('')
    expect(screen.getByLabelText('Nombre')).toHaveFocus()
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })
})

/* ── Horizonte ────────────────────────────────────────────────────────────── */

describe('horizonteSugerido', () => {
  it('cuenta los años hasta el objetivo más cercano por delante', () => {
    // 2026-08-10 → 2029-08-10 son 1096 días (2028 es bisiesto): 3,0007 años.
    expect(
      horizonteSugerido(
        [
          goal('lejano', '2035-01-01'),
          goal('cercano', '2029-08-10'),
          goal('pasado', '2020-01-01'),
        ],
        '2026-08-10',
      ),
    ).toBe(3)
  })

  it('trunca hacia abajo: un año y once meses son un año, no dos', () => {
    expect(horizonteSugerido([goal('a', '2028-07-10')], '2026-08-10')).toBe(1)
  })

  it('ignora las fechas ya pasadas y las de hoy', () => {
    expect(horizonteSugerido([goal('a', '2020-01-01'), goal('b', '2026-08-10')], '2026-08-10')).toBe(
      undefined,
    )
  })

  it('sin objetivos no sugiere nada, en vez de sugerir cero', () => {
    expect(horizonteSugerido([], '2026-08-10')).toBe(undefined)
  })
})

describe('IpsWizard · horizonte', () => {
  it('guarda un horizonte entero como hecho de capacidad', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="horizonte" />)

    await user.type(screen.getByLabelText('Años hasta necesitar el dinero'), '12')

    expect(borrador()?.assessment.capacity.horizonYears).toBe(12)
  })

  it('no guarda un valor que el contrato rechazaría, y lo dice', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="horizonte" />)
    const campo = screen.getByLabelText('Años hasta necesitar el dinero')

    await user.type(campo, '5.5')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toBeVisible()
    expect(borrador()?.assessment.capacity.horizonYears).toBeUndefined()

    await user.clear(campo)
    await user.type(campo, '200')
    expect(borrador()?.assessment.capacity.horizonYears).toBeUndefined()
  })

  it('rellenar el horizonte no produce ninguna banda de capacidad', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="horizonte" />)

    await user.type(screen.getByLabelText('Años hasta necesitar el dinero'), '10')

    expect(borrador()?.assessment.capacity.band).toBeUndefined()
    expect(borrador()?.effectiveRisk).toBeUndefined()
  })

  it('ofrece el horizonte que se deduce de las fechas, sin aplicarlo solo', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await anadirObjetivo(user, { nombre: 'Coche', importe: '15000', fecha: '2040-03-01' })
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }))

    const sugerencia = screen.getByRole('button', { name: /^Usar \d+$/ })
    expect(borrador()?.assessment.capacity.horizonYears).toBeUndefined()

    const anos = Number(sugerencia.textContent?.replace('Usar ', ''))
    await user.click(sugerencia)
    expect(borrador()?.assessment.capacity.horizonYears).toBe(anos)
  })

  it('sin objetivos no hay nada que sugerir', () => {
    render(<IpsWizard pasoInicial="horizonte" />)
    expect(screen.queryByRole('button', { name: /^Usar \d+$/ })).not.toBeInTheDocument()
  })
})

/* ── Resumen de lo que falta ──────────────────────────────────────────────── */

describe('IpsWizard · resumen del estado incompleto', () => {
  it('enumera los cinco hechos de capacidad mientras no haya ninguno', () => {
    render(<IpsWizard />)

    expect(screen.getByText('Ningún objetivo declarado.')).toBeInTheDocument()
    const pendiente = screen.getByText(/Capacidad de asumir pérdidas/)
    for (const hecho of [
      'el horizonte',
      'el colchón de liquidez',
      'la estabilidad de tus ingresos',
      'las personas a tu cargo',
      'el peso de esta cartera en tu patrimonio',
    ]) {
      expect(pendiente).toHaveTextContent(hecho)
    }
  })

  it('descuenta lo ya declarado', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await anadirObjetivo(user, { nombre: 'Coche', importe: '15000', fecha: '2031-03-01' })
    expect(screen.getByText('1 objetivo declarado.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }))
    await user.type(screen.getByLabelText('Años hasta necesitar el dinero'), '9')

    const pendiente = screen.getByText(/Capacidad de asumir pérdidas/)
    expect(pendiente).not.toHaveTextContent('el horizonte')
    expect(pendiente).toHaveTextContent('el colchón de liquidez')
    // «a, b, c y d», no cuatro «y» encadenadas.
    expect(pendiente.textContent).toContain(
      'el colchón de liquidez, la estabilidad de tus ingresos, las personas a tu cargo y el peso',
    )
  })
})

/* ── Criterio de aceptación: recargar conserva el borrador ────────────────── */

describe('IpsWizard · el borrador sobrevive a una recarga', () => {
  it('se escribe en disco y se recupera al rehidratar', async () => {
    const user = userEvent.setup()
    render(<IpsWizard />)

    await anadirObjetivo(user, {
      nombre: 'Entrada de una casa',
      importe: '40000',
      fecha: '2032-06-01',
    })
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }))
    await user.type(screen.getByLabelText('Años hasta necesitar el dinero'), '6')

    const guardado = enDisco()?.state?.labPolicyDraft
    expect(guardado?.goals[0]?.name).toBe('Entrada de una casa')
    expect(guardado?.assessment.capacity.horizonYears).toBe(6)

    // Un F5: la memoria se pierde y el estado vuelve del almacenamiento. El
    // `setState` de vaciado también escribe en disco —el store persiste cada
    // cambio—, así que se restituye la copia previa antes de rehidratar: lo que
    // sobrevive a una recarga es lo que había escrito, no lo que la prueba hizo
    // para simularla.
    const copia = localStorage.getItem(GUEST_CACHE_NAME) ?? ''
    cleanup()
    useAppStore.setState({ ...initialLabProfileState })
    expect(borrador()).toBeNull()
    localStorage.setItem(GUEST_CACHE_NAME, copia)
    await useAppStore.persist.rehydrate()

    render(<IpsWizard pasoInicial="horizonte" />)
    expect(screen.getByLabelText('Años hasta necesitar el dinero')).toHaveValue('6')
    expect(borrador()?.goals[0]?.name).toBe('Entrada de una casa')
  })
})

/* ── Situación y liquidez (paso 3) ────────────────────────────────────────── */

describe('IpsWizard · situación y liquidez', () => {
  it('guarda los cuatro hechos que faltaban, y el porcentaje como fracción', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="situacion" />)

    await user.type(screen.getByLabelText('Meses de gastos cubiertos por tu colchón'), '6')
    await user.click(screen.getByRole('radio', { name: /Estables/ }))
    await user.type(screen.getByLabelText('Personas que dependen económicamente de ti'), '2')
    await user.type(
      screen.getByLabelText('Porcentaje de tu patrimonio que representa esta cartera'),
      '20',
    )

    const capacidad = borrador()?.assessment.capacity
    expect(capacidad?.emergencyFundMonths).toBe(6)
    expect(capacidad?.incomeStability).toBe('estable')
    expect(capacidad?.dependents).toBe(2)
    // Se pregunta en %, se guarda en fracción: el error de dos órdenes es el
    // clásico de este campo.
    expect(capacidad?.shareOfNetWorth).toBe(0.2)
  })

  it('«no lo sé» retira el dato en vez de dejar un valor medio', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="situacion" />)

    await user.click(screen.getByRole('radio', { name: /Variables/ }))
    expect(borrador()?.assessment.capacity.incomeStability).toBe('variable')

    await user.click(screen.getByRole('radio', { name: 'No lo sé todavía' }))
    expect(borrador()?.assessment.capacity.incomeStability).toBeUndefined()
    expect('incomeStability' in (borrador()?.assessment.capacity ?? {})).toBe(false)
  })

  it('un valor fuera de rango deja el dato sin declarar y lo dice', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="situacion" />)
    const campo = screen.getByLabelText('Personas que dependen económicamente de ti')

    await user.type(campo, '2')
    expect(borrador()?.assessment.capacity.dependents).toBe(2)

    await user.clear(campo)
    await user.type(campo, '99')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toBeVisible()
    expect(borrador()?.assessment.capacity.dependents).toBeUndefined()
  })

  it('cada pregunta explica para qué se usa', () => {
    render(<IpsWizard pasoInicial="situacion" />)
    expect(screen.getAllByText('¿Por qué se pregunta esto?').length).toBeGreaterThanOrEqual(4)
  })
})

/* ── Tolerancia (paso 4) ──────────────────────────────────────────────────── */

/** Contesta las cinco preguntas eligiendo siempre la opción de esa banda. */
async function contestarTolerancia(
  user: ReturnType<typeof userEvent.setup>,
  bandas: readonly RiskBand[],
) {
  for (const [indice, pregunta] of TOLERANCE_QUESTIONS.entries()) {
    const opcion = pregunta.options.find((o) => o.band === bandas[indice])
    const grupo = screen.getByRole('group', { name: new RegExp(escapar(pregunta.text)) })
    await user.click(within(grupo).getByRole('radio', { name: opcion!.label }))
  }
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('IpsWizard · tolerancia', () => {
  it('no trae ninguna opción marcada: un valor por defecto sería una sugerencia', () => {
    render(<IpsWizard pasoInicial="tolerancia" />)
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
  })

  it('cada pregunta es un grupo con su enunciado y su explicación', () => {
    render(<IpsWizard pasoInicial="tolerancia" />)
    for (const pregunta of TOLERANCE_QUESTIONS) {
      expect(
        screen.getByRole('group', { name: new RegExp(escapar(pregunta.text)) }),
      ).toBeInTheDocument()
    }
    expect(screen.getAllByText('¿Por qué se pregunta esto?')).toHaveLength(
      TOLERANCE_QUESTIONS.length,
    )
  })

  it('con las cinco contestadas guarda la mediana, no la media', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="tolerancia" />)

    // Media 2,6 · mediana 1. Si apareciera un 3, sería una media redondeada.
    await contestarTolerancia(user, [1, 1, 1, 5, 5])

    expect(borrador()?.assessment.tolerance.band).toBe(1)
  })

  it('con cuatro de cinco no hay banda todavía', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="tolerancia" />)

    for (const pregunta of TOLERANCE_QUESTIONS.slice(0, 4)) {
      const grupo = screen.getByRole('group', { name: new RegExp(escapar(pregunta.text)) })
      await user.click(within(grupo).getByRole('radio', { name: pregunta.options[2]!.label }))
    }

    expect(borrador()?.assessment.tolerance.band).toBeUndefined()
    expect(screen.getByText(/Falta 1 pregunta por contestar/)).toBeInTheDocument()
  })

  it('«prefiero no responder» deja la pregunta sin contestar', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="tolerancia" />)

    await contestarTolerancia(user, [3, 3, 3, 3, 3])
    expect(borrador()?.assessment.tolerance.band).toBe(3)

    const primera = TOLERANCE_QUESTIONS[0]!
    const grupo = screen.getByRole('group', { name: new RegExp(escapar(primera.text)) })
    await user.click(within(grupo).getByRole('radio', { name: 'Prefiero no responder' }))

    expect(borrador()?.assessment.tolerance.band).toBeUndefined()
    expect(borrador()?.effectiveRisk).toBeUndefined()
  })
})

/* ── Conocimientos (paso 5) ───────────────────────────────────────────────── */

describe('IpsWizard · conocimientos', () => {
  it('guarda el nivel sin tocar ninguna banda de riesgo', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="conocimientos" />)

    for (const pregunta of KNOWLEDGE_QUESTIONS) {
      const grupo = screen.getByRole('group', { name: new RegExp(escapar(pregunta.text)) })
      const opcion = pregunta.options.find((o) => o.level === 'medio')!
      await user.click(within(grupo).getByRole('radio', { name: opcion.label }))
    }

    expect(borrador()?.assessment.knowledge?.level).toBe('medio')
    expect(borrador()?.assessment.tolerance.band).toBeUndefined()
    expect(borrador()?.assessment.capacity.band).toBeUndefined()
    expect(borrador()?.effectiveRisk).toBeUndefined()
  })

  it('dice en pantalla que no cambia el riesgo efectivo', () => {
    render(<IpsWizard pasoInicial="conocimientos" />)
    expect(screen.getByText(/Saber más no permite perder más/)).toBeInTheDocument()
  })
})

/* ── Criterio de aceptación: la capacidad no se autocompleta ──────────────── */

describe('IpsWizard · la capacidad no se autocompleta', () => {
  it('declarar una tolerancia alta no produce ninguna banda de capacidad', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="tolerancia" />)

    await contestarTolerancia(user, [5, 5, 5, 5, 5])

    expect(borrador()?.assessment.tolerance.band).toBe(5)
    expect(borrador()?.assessment.capacity.band).toBeUndefined()
    expect(borrador()?.effectiveRisk).toBeUndefined()
    expect(screen.getByText(/no se puede calcular todavía/)).toBeInTheDocument()
  })

  it('con los cinco hechos y las cinco respuestas, el riesgo efectivo es el menor', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="horizonte" />)

    await user.type(screen.getByLabelText('Años hasta necesitar el dinero'), '20')

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }))
    await user.type(screen.getByLabelText('Meses de gastos cubiertos por tu colchón'), '12')
    await user.click(screen.getByRole('radio', { name: /Estables/ }))
    await user.type(screen.getByLabelText('Personas que dependen económicamente de ti'), '0')
    await user.type(
      screen.getByLabelText('Porcentaje de tu patrimonio que representa esta cartera'),
      '5',
    )
    // Todos los hechos en su mejor caso: capacidad 5 y ninguno limitando.
    expect(borrador()?.assessment.capacity.band).toBe(5)
    expect(borrador()?.effectiveRisk).toBeUndefined()
    expect(screen.getByText(/Ninguno de los cinco datos la limita/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }))
    await contestarTolerancia(user, [2, 2, 2, 2, 2])

    expect(borrador()?.assessment.tolerance.band).toBe(2)
    expect(borrador()?.effectiveRisk).toBe(2)
  })

  it('retirar un hecho borra la banda de capacidad y el riesgo efectivo', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="situacion" />)

    useAppStore.setState({
      labPolicyDraft: null,
    })
    cleanup()

    render(<IpsWizard pasoInicial="tolerancia" />)
    await contestarTolerancia(user, [4, 4, 4, 4, 4])
    cleanup()

    render(<IpsWizard pasoInicial="horizonte" />)
    await user.type(screen.getByLabelText('Años hasta necesitar el dinero'), '20')
    cleanup()

    render(<IpsWizard pasoInicial="situacion" />)
    await user.type(screen.getByLabelText('Meses de gastos cubiertos por tu colchón'), '12')
    await user.click(screen.getByRole('radio', { name: /Estables/ }))
    await user.type(screen.getByLabelText('Personas que dependen económicamente de ti'), '0')
    const peso = screen.getByLabelText('Porcentaje de tu patrimonio que representa esta cartera')
    await user.type(peso, '5')

    expect(borrador()?.assessment.capacity.band).toBe(5)
    expect(borrador()?.effectiveRisk).toBe(4)

    await user.clear(peso)

    expect(borrador()?.assessment.capacity.band).toBeUndefined()
    expect(borrador()?.effectiveRisk).toBeUndefined()
  })
})

/* ── Restricciones (paso 7) ───────────────────────────────────────────────── */

describe('IpsWizard · restricciones', () => {
  it('guarda un límite por grupo con los pesos en fracción, no en porcentaje', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="restricciones" />)

    await user.type(screen.getByLabelText('Grupo concreto'), 'tecnología')
    await user.type(screen.getByLabelText('Máximo'), '30')
    await user.click(screen.getByRole('button', { name: 'Añadir restricción' }))

    expect(borrador()?.constraints).toEqual([
      { kind: 'groupWeight', dimension: 'sector', key: 'tecnología', max: 0.3 },
    ])
  })

  it('no añade nada si falta el grupo o el rango', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="restricciones" />)

    await user.click(screen.getByRole('button', { name: 'Añadir restricción' }))
    expect(screen.getByRole('alert')).toBeVisible()
    expect(borrador()).toBeNull()

    await user.type(screen.getByLabelText('Grupo concreto'), 'banca')
    await user.click(screen.getByRole('button', { name: 'Añadir restricción' }))
    expect(screen.getByText('Pon al menos un mínimo o un máximo.')).toBeVisible()
    expect(borrador()).toBeNull()
  })

  it('señala dos límites que ninguna cartera puede cumplir a la vez', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="restricciones" />)

    await user.type(screen.getByLabelText('Grupo concreto'), 'europa')
    await user.type(screen.getByLabelText('Mínimo'), '60')
    await user.click(screen.getByRole('button', { name: 'Añadir restricción' }))

    await user.type(screen.getByLabelText('Grupo concreto'), 'américa')
    await user.type(screen.getByLabelText('Mínimo'), '50')
    await user.click(screen.getByRole('button', { name: 'Añadir restricción' }))

    // El aviso se pinta en las dos restricciones implicadas: la contradicción
    // no es de una sola, y señalar solo la última haría creer que la otra vale.
    expect(screen.getAllByText(/suman 110 %/)).toHaveLength(2)
    expect(screen.getByText(/la política no puede activarse/)).toBeInTheDocument()
  })

  it('permite quitar una restricción ya declarada', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="restricciones" />)

    await user.type(screen.getByLabelText('Grupo concreto'), 'banca')
    await user.type(screen.getByLabelText('Máximo'), '20')
    await user.click(screen.getByRole('button', { name: 'Añadir restricción' }))
    expect(borrador()?.constraints).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /^Quitar Sector «banca»/ }))
    expect(borrador()?.constraints).toEqual([])
  })

  it('un máximo del 0 % avisa pero no bloquea', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="restricciones" />)

    await user.type(screen.getByLabelText('Grupo concreto'), 'tabaco')
    await user.type(screen.getByLabelText('Máximo'), '0')
    await user.click(screen.getByRole('button', { name: 'Añadir restricción' }))

    expect(screen.getByText(/no es un límite: excluye por completo/)).toBeInTheDocument()
    expect(screen.getByText(/no impiden activar la política/)).toBeInTheDocument()
  })
})

/* ── Mantenimiento (paso 8) ───────────────────────────────────────────────── */

describe('IpsWizard · reglas de mantenimiento', () => {
  it('«no reequilibrar» viene marcado y es una elección declarada, no un hueco', () => {
    render(<IpsWizard pasoInicial="mantenimiento" />)
    expect(
      screen.getByRole('radio', { name: /No reequilibrar. Es una elección, no un olvido./ }),
    ).toBeChecked()
  })

  it('elegir calendario guarda los meses', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="mantenimiento" />)

    await user.click(screen.getByRole('radio', { name: /Por calendario/ }))
    expect(borrador()?.rebalancePolicy).toEqual({ kind: 'calendar', everyMonths: 12 })
  })

  it('la banda de desviación se pregunta en porcentaje y se guarda en fracción', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="mantenimiento" />)

    await user.click(screen.getByRole('radio', { name: /Por desviación/ }))
    expect(borrador()?.rebalancePolicy).toEqual({ kind: 'bands', toleranceBand: 0.05 })
  })

  it('un plan de aportaciones sin importe no se guarda a medias', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="mantenimiento" />)

    await user.selectOptions(screen.getByLabelText('Cada cuánto'), 'anual')
    expect(borrador()?.contributionPlan).toBeUndefined()

    await user.type(screen.getByLabelText('Importe'), '250')
    expect(borrador()?.contributionPlan).toEqual({
      amount: '250',
      currency: 'EUR',
      frequency: 'anual',
    })
  })

  it('borrar el importe retira el plan en vez de dejarlo vacío', async () => {
    const user = userEvent.setup()
    render(<IpsWizard pasoInicial="mantenimiento" />)

    await user.type(screen.getByLabelText('Importe'), '250')
    await user.clear(screen.getByLabelText('Importe'))

    expect(borrador()?.contributionPlan).toBeUndefined()
    expect('contributionPlan' in (borrador() ?? {})).toBe(false)
  })
})

/* ── Revisión, activación y versionado (paso 9) ───────────────────────────── */

/** Rellena el asistente hasta dejarlo listo para activar. */
async function completarAsistente(user: ReturnType<typeof userEvent.setup>) {
  render(<IpsWizard />)
  await anadirObjetivo(user, {
    nombre: 'Entrada de una casa',
    importe: '40000',
    fecha: '2032-06-01',
  })
  cleanup()

  render(<IpsWizard pasoInicial="horizonte" />)
  await user.type(screen.getByLabelText('Años hasta necesitar el dinero'), '20')
  cleanup()

  render(<IpsWizard pasoInicial="situacion" />)
  await user.type(screen.getByLabelText('Meses de gastos cubiertos por tu colchón'), '12')
  await user.click(screen.getByRole('radio', { name: /Estables/ }))
  await user.type(screen.getByLabelText('Personas que dependen económicamente de ti'), '0')
  await user.type(
    screen.getByLabelText('Porcentaje de tu patrimonio que representa esta cartera'),
    '10',
  )
  cleanup()

  render(<IpsWizard pasoInicial="tolerancia" />)
  await contestarTolerancia(user, [3, 3, 3, 3, 3])
  cleanup()
}

describe('IpsWizard · revisión y activación', () => {
  it('resume lo declarado en una sola pantalla', async () => {
    const user = userEvent.setup()
    await completarAsistente(user)
    render(<IpsWizard pasoInicial="revision" />)

    expect(screen.getByText('Entrada de una casa · 40.000,00 € · 2032-06-01')).toBeInTheDocument()
    expect(screen.getByText('20 años')).toBeInTheDocument()
    expect(screen.getByText('Hasta un 20 %.')).toBeInTheDocument()
    expect(screen.getByText('No reequilibrar (elección declarada)')).toBeInTheDocument()
    expect(screen.getByText(/el menor de los dos/)).toBeInTheDocument()
  })

  it('sin confirmar explícitamente no se puede activar', async () => {
    const user = userEvent.setup()
    await completarAsistente(user)
    render(<IpsWizard pasoInicial="revision" />)

    expect(screen.getByRole('button', { name: 'Activar esta política' })).toBeDisabled()
    expect(screen.getByText('Marca la confirmación de aquí abajo.')).toBeInTheDocument()
  })

  it('confirmar desbloquea la activación, y desmarcar la vuelve a bloquear', async () => {
    const user = userEvent.setup()
    await completarAsistente(user)
    render(<IpsWizard pasoInicial="revision" />)
    const firma = screen.getByRole('checkbox')

    await user.click(firma)
    expect(borrador()?.acknowledgements).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Activar esta política' })).toBeEnabled()

    await user.click(firma)
    expect(borrador()?.acknowledgements).toEqual([])
    expect(screen.getByRole('button', { name: 'Activar esta política' })).toBeDisabled()
  })

  it('un borrador incompleto dice todo lo que le falta, no solo lo primero', () => {
    render(<IpsWizard pasoInicial="revision" />)

    expect(screen.getByText('Declara al menos un objetivo en el paso 1.')).toBeInTheDocument()
    expect(
      screen.getByText('Contesta las cinco preguntas de tolerancia en el paso 4.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Completa los cinco datos de situación en los pasos 2 y 3.'),
    ).toBeInTheDocument()
  })

  it('activar deja la política vigente y cierra el asistente', async () => {
    const user = userEvent.setup()
    await completarAsistente(user)
    render(<IpsWizard pasoInicial="revision" />)

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Activar esta política' }))

    const estado = useAppStore.getState()
    expect(estado.labPolicyActive?.status).toBe('active')
    expect(estado.labPolicyDraft).toBeNull()
    // Ya no hay formulario: la vigente no se edita.
    expect(
      screen.getByRole('region', { name: 'Política de inversión vigente' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pasos del asistente' })).toBeNull()
  })

  it('la vigente es inmutable: editar abre una versión nueva y no la toca', async () => {
    const user = userEvent.setup()
    await completarAsistente(user)
    render(<IpsWizard pasoInicial="revision" />)
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Activar esta política' }))

    const vigente = useAppStore.getState().labPolicyActive!
    await user.click(screen.getByRole('button', { name: 'Crear una versión nueva' }))

    expect(useAppStore.getState().labPolicyActive).toEqual(vigente)
    expect(useAppStore.getState().labPolicyDraft?.version).toBe(vigente.version + 1)
    expect(screen.getByText(/sigue vigente y no se toca/)).toBeInTheDocument()
  })

  it('descartar la versión nueva deja la vigente donde estaba', async () => {
    const user = userEvent.setup()
    await completarAsistente(user)
    render(<IpsWizard pasoInicial="revision" />)
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Activar esta política' }))
    const vigente = useAppStore.getState().labPolicyActive!

    await user.click(screen.getByRole('button', { name: 'Crear una versión nueva' }))
    await user.click(screen.getByRole('button', { name: 'Descartar los cambios' }))

    expect(useAppStore.getState().labPolicyDraft).toBeNull()
    expect(useAppStore.getState().labPolicyActive).toEqual(vigente)
    expect(
      screen.getByRole('region', { name: 'Política de inversión vigente' }),
    ).toBeInTheDocument()
  })

  it('todo esto funciona sin cuenta ni backend: el modo local no se rompe', async () => {
    const user = userEvent.setup()
    await completarAsistente(user)
    render(<IpsWizard pasoInicial="revision" />)
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Activar esta política' }))

    // Sin Supabase configurado, y la política vive en el almacenamiento local.
    expect(isSupabaseConfigured()).toBe(false)
    const enDiscoAhora = enDisco()?.state as { labPolicyActive?: InvestmentPolicy } | undefined
    expect(enDiscoAhora?.labPolicyActive?.status).toBe('active')
  })
})

/* ── Perfil derivado del cuestionario antiguo ─────────────────────────────── */

describe('IpsWizard · borrador derivado del perfil antiguo', () => {
  it('avisa de que hay que revisarlo y deja confirmarlo', async () => {
    const user = userEvent.setup()
    useAppStore.setState({
      labPolicyDraft: {
        schemaVersion: 1,
        id: '3f1c0f0e-0000-4000-8000-000000000001',
        version: 1,
        status: 'draft',
        effectiveFrom: '2026-01-01',
        baseCurrency: 'EUR',
        assessment: {
          tolerance: { answers: {}, band: 3, assessedAt: '2026-01-01T00:00:00Z' },
          capacity: {},
        },
        effectiveRiskRuleVersion: 1,
        goals: [],
        constraints: [],
        rebalancePolicy: { kind: 'none' },
        assumptions: {},
        acknowledgements: [],
      },
      labPolicyDerivedFromLegacy: true,
    })

    render(<IpsWizard />)
    expect(screen.getByText(/se dedujo de tu perfil de riesgo anterior/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lo he revisado' }))

    expect(useAppStore.getState().labPolicyDerivedFromLegacy).toBe(false)
    expect(screen.queryByText(/se dedujo de tu perfil de riesgo anterior/)).not.toBeInTheDocument()
  })
})

/* ── Visibilidad por capacidad ────────────────────────────────────────────── */

describe('Perfil · el asistente está detrás de labIpsV2', () => {
  it('no aparece con la capacidad apagada', () => {
    vi.stubEnv('VITE_LAB_FLAGS', '')
    render(<PerfilPage />)
    expect(screen.queryByRole('region', { name: 'Asistente de política de inversión' })).toBeNull()
  })

  it('aparece con la capacidad encendida', () => {
    vi.stubEnv('VITE_LAB_FLAGS', 'labIpsV2')
    render(<PerfilPage />)
    expect(
      screen.getByRole('region', { name: 'Asistente de política de inversión' }),
    ).toBeInTheDocument()
  })
})

function goal(id: string, targetDate: string) {
  return {
    id,
    name: id,
    priority: 'importante' as const,
    currency: 'EUR' as const,
    targetAmount: '1000',
    targetDate,
    dateFlexible: false,
    amountFlexible: false,
  }
}
