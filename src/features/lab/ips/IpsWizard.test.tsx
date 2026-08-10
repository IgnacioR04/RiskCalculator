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
import type { InvestmentPolicy } from '../../../lib/lab/domain/investmentPolicy'
import { GUEST_CACHE_NAME, useAppStore } from '../../../state/store'
import { initialLabProfileState } from '../../../state/slices/labProfileSlice'
import { PerfilPage } from '../../../pages/PerfilPage'
import { IpsWizard } from './IpsWizard'
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

    expect(within(pasos).getAllByRole('button')).toHaveLength(2)
    expect(within(pasos).getByText(/Situación, tolerancia y restricciones/)).toBeInTheDocument()
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
    const pendiente = screen.getByText(/Para medir tu capacidad/)
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

    const pendiente = screen.getByText(/Para medir tu capacidad/)
    expect(pendiente).not.toHaveTextContent('el horizonte')
    expect(pendiente).toHaveTextContent('el colchón de liquidez')
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
