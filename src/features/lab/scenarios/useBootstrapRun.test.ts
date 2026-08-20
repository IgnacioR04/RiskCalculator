/**
 * LAB-1014. Lo que se comprueba es la promesa de ADR-006: **cancelación y
 * progreso**. jsdom no trae `Worker`, así que se inyecta un doble; lo que se
 * prueba aquí es el ciclo de vida, no la aritmética, que ya cubre
 * `bootstrapOutcome.test.ts`.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBootstrapRun, type WorkerLike } from './useBootstrapRun'
import type {
  BootstrapWorkerIn,
  BootstrapWorkerOut,
} from '../../../lib/lab/scenarios/bootstrapWorkerContract'
import type { BootstrapOutcomeInput } from '../../../lib/lab/scenarios/bootstrapOutcome'
import { describeReason } from '../../../lib/lab/evidence/reasonCodes'

class WorkerDoble implements WorkerLike {
  onmessage: ((evento: MessageEvent<BootstrapWorkerOut>) => void) | null = null
  recibidos: BootstrapWorkerIn[] = []
  terminado = false

  postMessage(mensaje: BootstrapWorkerIn) {
    this.recibidos.push(mensaje)
  }

  terminate() {
    this.terminado = true
  }

  /** Simula un mensaje del worker al hilo principal. */
  emitir(mensaje: BootstrapWorkerOut) {
    this.onmessage?.({ data: mensaje } as MessageEvent<BootstrapWorkerOut>)
  }
}

const ENTRADA: BootstrapOutcomeInput = {
  history: [
    [0.01, 0.02],
    [-0.01, 0.0],
    [0.005, -0.02],
    [0.0, 0.01],
  ],
  values: [1000, 1000],
  blockDays: 2,
  horizonDays: 4,
  paths: 500,
  seed: 1,
}

function montar() {
  const creados: WorkerDoble[] = []
  const hook = renderHook(() =>
    useBootstrapRun(() => {
      const w = new WorkerDoble()
      creados.push(w)
      return w
    }),
  )
  return { hook, creados, ultimo: () => creados[creados.length - 1]! }
}

describe('useBootstrapRun', () => {
  it('empieza sin calcular y sin resultado', () => {
    const { hook, creados } = montar()
    expect(hook.result.current.state).toEqual({ estado: 'inactivo' })
    // No se crea el worker hasta que hay algo que calcular.
    expect(creados).toHaveLength(0)
  })

  it('publica el progreso que envía el worker', () => {
    const { hook, ultimo } = montar()
    act(() => hook.result.current.run(ENTRADA))
    expect(hook.result.current.state).toEqual({ estado: 'calculando', hechas: 0, total: 500 })

    act(() => ultimo().emitir({ type: 'progress', done: 250, total: 500 }))
    expect(hook.result.current.state).toEqual({ estado: 'calculando', hechas: 250, total: 500 })
  })

  it('cancelar termina el worker y deja de aceptar su resultado', () => {
    const { hook, ultimo } = montar()
    act(() => hook.result.current.run(ENTRADA))
    const worker = ultimo()

    act(() => hook.result.current.cancel())
    expect(worker.terminado).toBe(true)
    expect(hook.result.current.state).toEqual({ estado: 'cancelado' })

    // Un worker terminado todavía puede tener un mensaje en vuelo. Publicarlo
    // pondría en pantalla el resultado de una pregunta que el usuario retiró.
    act(() =>
      worker.emitir({
        type: 'done',
        result: { ok: false, reason: 'no_value' },
      }),
    )
    expect(hook.result.current.state).toEqual({ estado: 'cancelado' })
  })

  it('cancelar sin nada en curso no cambia el estado', () => {
    const { hook } = montar()
    act(() => hook.result.current.cancel())
    expect(hook.result.current.state).toEqual({ estado: 'inactivo' })
  })

  it('una segunda ejecución termina la primera', () => {
    const { hook, creados } = montar()
    act(() => hook.result.current.run(ENTRADA))
    act(() => hook.result.current.run(ENTRADA))
    expect(creados).toHaveLength(2)
    expect(creados[0]!.terminado).toBe(true)
    expect(creados[1]!.terminado).toBe(false)
  })

  it('el resultado de la ejecución vieja no pisa a la nueva', () => {
    const { hook, creados } = montar()
    act(() => hook.result.current.run(ENTRADA))
    act(() => hook.result.current.run(ENTRADA))

    act(() => creados[0]!.emitir({ type: 'progress', done: 500, total: 500 }))
    expect(hook.result.current.state).toEqual({ estado: 'calculando', hechas: 0, total: 500 })
  })

  it('traduce el motivo de un resultado imposible', () => {
    const { hook, ultimo } = montar()
    act(() => hook.result.current.run(ENTRADA))
    act(() => ultimo().emitir({ type: 'done', result: { ok: false, reason: 'empty_history' } }))
    expect(hook.result.current.state).toEqual({
      estado: 'error',
      // El texto sale del catálogo central de LAB-902, no de un mapa propio.
      motivo: describeReason('empty_history').text,
    })
  })

  it('un fallo dentro del worker no deja la barra a medias', () => {
    const { hook, ultimo } = montar()
    act(() => hook.result.current.run(ENTRADA))
    act(() => ultimo().emitir({ type: 'error', message: 'se rompió' }))
    expect(hook.result.current.state).toEqual({ estado: 'error', motivo: 'se rompió' })
  })

  it('salir de la pantalla mientras calcula termina el worker', () => {
    const { hook, ultimo } = montar()
    act(() => hook.result.current.run(ENTRADA))
    const worker = ultimo()
    hook.unmount()
    expect(worker.terminado).toBe(true)
  })

  it('un navegador sin Worker lo dice, y no calcula en el hilo principal', () => {
    // Calcularlo aquí congelaría la pestaña 3,8 s, que es justo lo que ADR-006
    // prohíbe. Se prefiere no dar el número.
    const hook = renderHook(() =>
      useBootstrapRun(() => {
        throw new Error('sin Worker')
      }),
    )
    act(() => hook.result.current.run(ENTRADA))
    expect(hook.result.current.state).toEqual({
      estado: 'error',
      motivo: 'Este navegador no permite calcularlo en segundo plano.',
    })
  })
})
