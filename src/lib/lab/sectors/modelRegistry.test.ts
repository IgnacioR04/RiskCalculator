/**
 * Pruebas del registro de modelos (LAB-702).
 *
 * El criterio de aceptación: **solo una versión activa por señal**. Dos activas
 * significan que dos resultados con la misma etiqueta vienen de fórmulas
 * distintas, y compararlos sería mentir.
 */
import { describe, expect, it } from 'vitest'
import {
  REGISTRY_ERROR_TEXT,
  activeModel,
  canTransition,
  historyFor,
  isPublishable,
  registerModel,
  transitionModel,
  type ModelVersion,
  type Registry,
} from './modelRegistry'

const MOMENTUM: Omit<ModelVersion, 'state'> = {
  modelKey: 'sector.momentum',
  version: 1,
  hypothesis:
    'Los sectores que más han subido en doce meses, excluido el último, tienden a seguir subiendo tres meses más.',
  falsification:
    'Si el quintil superior no bate al inferior tras costes en el walk-forward, se retira.',
  commitSha: 'abc1234',
  createdAt: '2026-08-20',
}

/** Registra y activa una señal, que es el camino normal. */
function activa(): Registry {
  const r1 = registerModel([], MOMENTUM)
  if (!r1.ok) throw new Error('alta rechazada')
  const r2 = transitionModel(r1.registry, 'sector.momentum', 1, 'validated', { on: '2026-08-21' })
  if (!r2.ok) throw new Error('validación rechazada')
  const r3 = transitionModel(r2.registry, 'sector.momentum', 1, 'active', { on: '2026-08-22' })
  if (!r3.ok) throw new Error('activación rechazada')
  return r3.registry
}

describe('una señal sin hipótesis falsable no se registra', () => {
  it('sin hipótesis se rechaza', () => {
    const r = registerModel([], { ...MOMENTUM, hypothesis: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('missing_hypothesis')
  })

  it('sin forma de falsarla, tampoco', () => {
    // Una señal que no se puede invalidar no es una señal: es una decoración.
    const r = registerModel([], { ...MOMENTUM, falsification: '' })
    expect(r.ok).toBe(false)
  })

  it('con las dos cosas entra, y nace en borrador', () => {
    const r = registerModel([], MOMENTUM)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.registry[0]!.state).toBe('draft')
  })

  it('el motivo del rechazo está en palabras, no solo en código', () => {
    expect(REGISTRY_ERROR_TEXT.missing_hypothesis).toMatch(/no se puede invalidar/)
  })
})

describe('solo una versión activa por señal', () => {
  it('activar una segunda se rechaza', () => {
    const registro = activa()
    const conSegunda = registerModel(registro, { ...MOMENTUM, version: 2 })
    expect(conSegunda.ok).toBe(true)
    if (!conSegunda.ok) return

    const validada = transitionModel(conSegunda.registry, 'sector.momentum', 2, 'validated', {
      on: '2026-09-01',
    })
    expect(validada.ok).toBe(true)
    if (!validada.ok) return

    const r = transitionModel(validada.registry, 'sector.momentum', 2, 'active', { on: '2026-09-02' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('already_active')
  })

  it('la otra no se retira automáticamente: retirar lleva motivo', () => {
    // Hacerlo de tapadillo dejaría un modelo retirado sin explicación.
    expect(REGISTRY_ERROR_TEXT.already_active).toMatch(/Retírala primero/)
  })

  it('retirando la primera, la segunda ya puede activarse', () => {
    const registro = activa()
    const retirada = transitionModel(registro, 'sector.momentum', 1, 'retired', {
      on: '2026-09-01',
      reason: 'La validación dejó de sostener la hipótesis.',
    })
    expect(retirada.ok).toBe(true)
    if (!retirada.ok) return

    const conSegunda = registerModel(retirada.registry, { ...MOMENTUM, version: 2 })
    if (!conSegunda.ok) throw new Error('alta rechazada')
    const validada = transitionModel(conSegunda.registry, 'sector.momentum', 2, 'validated', {
      on: '2026-09-02',
    })
    if (!validada.ok) throw new Error('validación rechazada')

    const r = transitionModel(validada.registry, 'sector.momentum', 2, 'active', { on: '2026-09-03' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(activeModel(r.registry, 'sector.momentum')?.version).toBe(2)
  })

  it('dos señales distintas pueden estar activas a la vez', () => {
    const registro = activa()
    const otra = registerModel(registro, {
      ...MOMENTUM,
      modelKey: 'sector.volAdjusted',
      version: 1,
    })
    if (!otra.ok) throw new Error('alta rechazada')
    const validada = transitionModel(otra.registry, 'sector.volAdjusted', 1, 'validated', {
      on: '2026-09-01',
    })
    if (!validada.ok) throw new Error('validación rechazada')
    const r = transitionModel(validada.registry, 'sector.volAdjusted', 1, 'active', {
      on: '2026-09-02',
    })
    expect(r.ok).toBe(true)
  })
})

describe('el ciclo de vida solo avanza', () => {
  it('de borrador se puede validar o retirar, no activar directamente', () => {
    expect(canTransition('draft', 'validated')).toBe(true)
    expect(canTransition('draft', 'retired')).toBe(true)
    expect(canTransition('draft', 'active')).toBe(false)
  })

  it('un modelo retirado no vuelve', () => {
    // Si hace falta reintentarlo, se registra una versión nueva: así queda
    // constancia de que hubo dos intentos.
    for (const destino of ['draft', 'validated', 'active'] as const) {
      expect(canTransition('retired', destino)).toBe(false)
    }
  })

  it('intentar una transición prohibida se rechaza con motivo', () => {
    const r1 = registerModel([], MOMENTUM)
    if (!r1.ok) throw new Error('alta rechazada')
    const r = transitionModel(r1.registry, 'sector.momentum', 1, 'active', { on: '2026-08-21' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('invalid_transition')
  })

  it('una versión que no existe se dice, no se crea', () => {
    const r = transitionModel([], 'sector.momentum', 9, 'validated', { on: '2026-08-21' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not_found')
  })
})

describe('retirar no es borrar', () => {
  const registro = activa()
  const retirada = transitionModel(registro, 'sector.momentum', 1, 'retired', {
    on: '2026-09-01',
    reason: 'Sin evidencia suficiente en el walk-forward.',
  })

  it('la versión retirada sigue en el registro', () => {
    expect(retirada.ok).toBe(true)
    if (!retirada.ok) return
    expect(retirada.registry).toHaveLength(1)
  })

  it('conserva su hipótesis y las fechas en que rigió', () => {
    if (!retirada.ok) return
    const m = retirada.registry[0]!
    expect(m.hypothesis.length).toBeGreaterThan(0)
    expect(m.activatedAt).toBe('2026-08-22')
    expect(m.retiredAt).toBe('2026-09-01')
  })

  it('conserva el motivo, para que los resultados antiguos se puedan explicar', () => {
    if (!retirada.ok) return
    expect(retirada.registry[0]!.retiredReason).toMatch(/Sin evidencia suficiente/)
  })

  it('sin motivo declarado, se deja constancia de que no lo hubo', () => {
    const r = transitionModel(registro, 'sector.momentum', 1, 'retired', { on: '2026-09-01' })
    if (!r.ok) return
    expect(r.registry[0]!.retiredReason).toBe('Sin motivo declarado')
  })
})

describe('qué se puede publicar', () => {
  it('solo lo que tiene una versión activa', () => {
    expect(isPublishable(activa(), 'sector.momentum')).toBe(true)
  })

  it('un borrador se puede calcular pero no publicar', () => {
    // La diferencia entre probar algo y publicarlo es justo lo que protege
    // este registro.
    const r = registerModel([], MOMENTUM)
    if (!r.ok) throw new Error('alta rechazada')
    expect(isPublishable(r.registry, 'sector.momentum')).toBe(false)
  })

  it('una señal retirada deja de publicarse', () => {
    const retirada = transitionModel(activa(), 'sector.momentum', 1, 'retired', {
      on: '2026-09-01',
      reason: 'x',
    })
    if (!retirada.ok) return
    expect(isPublishable(retirada.registry, 'sector.momentum')).toBe(false)
  })

  it('una señal que no existe no es publicable', () => {
    expect(isPublishable([], 'sector.inventada')).toBe(false)
  })
})

describe('historial', () => {
  it('devuelve las versiones de más reciente a más antigua', () => {
    const r1 = registerModel([], MOMENTUM)
    if (!r1.ok) throw new Error('alta rechazada')
    const r2 = registerModel(r1.registry, { ...MOMENTUM, version: 2 })
    if (!r2.ok) throw new Error('alta rechazada')
    expect(historyFor(r2.registry, 'sector.momentum').map((m) => m.version)).toEqual([2, 1])
  })

  it('no mezcla señales distintas', () => {
    const r1 = registerModel([], MOMENTUM)
    if (!r1.ok) throw new Error('alta rechazada')
    const r2 = registerModel(r1.registry, { ...MOMENTUM, modelKey: 'sector.otra' })
    if (!r2.ok) throw new Error('alta rechazada')
    expect(historyFor(r2.registry, 'sector.momentum')).toHaveLength(1)
  })

  it('una versión repetida se rechaza', () => {
    const r1 = registerModel([], MOMENTUM)
    if (!r1.ok) throw new Error('alta rechazada')
    const r = registerModel(r1.registry, MOMENTUM)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('duplicate_version')
  })
})
