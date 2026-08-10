/**
 * Asistente de política de inversión (LAB-207).
 *
 * De los nueve pasos que describe la especificación de producto (§8.1), aquí
 * están los dos primeros: objetivos y horizonte. Los siguientes llegan en
 * LAB-208 y LAB-209.
 *
 * Dos decisiones de diseño vienen del plan y conviene no perderlas de vista:
 *
 * - **Se puede guardar y continuar sin completar.** Obligar a rellenarlo todo de
 *   una sentada produce respuestas apresuradas, y una respuesta inventada es
 *   peor que un hueco. Lo que sí se hace es decir en todo momento qué falta.
 * - **El borrador se guarda en cada cambio**, no al final. El store persiste en
 *   `localStorage`, así que recargar la página no cuesta el trabajo hecho: es el
 *   criterio de aceptación de la tarea.
 *
 * Aquí no se calcula nada. No se deduce capacidad, no se estima necesidad y no
 * se toca el riesgo efectivo: este asistente solo recoge y guarda.
 */
import { useMemo, useState } from 'react'
import { Card, Note } from '../../../components/ui'
import { uid } from '../../../lib/domain'
import type {
  CapacityAssessment,
  InvestmentGoal,
  InvestmentPolicy,
} from '../../../lib/lab/domain/investmentPolicy'
import { missingCapacityFacts } from '../../../lib/lab/analytics/policyAssessment'
import { emptyPolicyDraft } from '../../../lib/lab/schemas/investmentPolicy'
import { useAppStore } from '../../../state/store'
import { GoalsStep } from './steps/GoalsStep'
import { HorizonStep } from './steps/HorizonStep'

/** Pasos ya implementados. La numeración es la de la especificación (§8.1). */
export const PASOS = [
  { id: 'objetivos', num: 1, titulo: 'Objetivos' },
  { id: 'horizonte', num: 2, titulo: 'Horizonte' },
] as const

export type PasoId = (typeof PASOS)[number]['id']

/** Total de pasos previstos, para que «paso 1 de 9» no mienta sobre lo que queda. */
export const PASOS_PREVISTOS = 9

/** Cómo se nombra cada hecho de capacidad al decir qué falta. */
const NOMBRE_HECHO: Readonly<Record<keyof CapacityAssessment, string>> = {
  horizonYears: 'el horizonte',
  emergencyFundMonths: 'el colchón de liquidez',
  incomeStability: 'la estabilidad de tus ingresos',
  dependents: 'las personas a tu cargo',
  shareOfNetWorth: 'el peso de esta cartera en tu patrimonio',
  band: 'la banda de capacidad',
  assessedAt: 'la fecha de evaluación',
}

export interface IpsWizardProps {
  /** Paso inicial. Existe para poder montar el asistente donde interese probarlo. */
  readonly pasoInicial?: PasoId
}

export function IpsWizard(props: IpsWizardProps = {}) {
  const draft = useAppStore((s) => s.labPolicyDraft)
  const derivado = useAppStore((s) => s.labPolicyDerivedFromLegacy)
  const setDraft = useAppStore((s) => s.setLabPolicyDraft)
  const confirmarDerivado = useAppStore((s) => s.confirmDerivedLabPolicy)

  const [paso, setPaso] = useState<PasoId>(props.pasoInicial ?? 'objetivos')

  // El reloj se lee una sola vez por montaje: una función que consulta la hora
  // en cada render deja de ser reproducible, y la fecha se usa para sugerir.
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Sin borrador se trabaja sobre uno vacío en memoria, que solo se persiste
  // cuando el usuario escribe algo: entrar a mirar no crea una política. El
  // identificador es un UUID porque las tablas de LAB-205 lo exigen así.
  const plantilla = useMemo(() => emptyPolicyDraft(uid(), hoy), [hoy])
  const politica: InvestmentPolicy = draft ?? plantilla

  function guardar(cambio: Partial<InvestmentPolicy>) {
    setDraft({ ...politica, ...cambio })
  }

  function guardarObjetivos(goals: readonly InvestmentGoal[]) {
    guardar({ goals })
  }

  function guardarHorizonte(horizonYears: number | undefined) {
    const capacity: CapacityAssessment =
      horizonYears === undefined
        ? sinHorizonte(politica.assessment.capacity)
        : { ...politica.assessment.capacity, horizonYears }
    guardar({ assessment: { ...politica.assessment, capacity } })
  }

  const faltan = missingCapacityFacts(politica.assessment.capacity)
  const indice = PASOS.findIndex((p) => p.id === paso)
  const actual = PASOS[indice] ?? PASOS[0]
  const anterior = PASOS[indice - 1]
  const siguiente = PASOS[indice + 1]

  return (
    <section className="ips-wizard" aria-label="Asistente de política de inversión">
      {derivado && (
        <Note kind="warning">
          Este borrador se dedujo de tu perfil de riesgo anterior, que solo preguntaba por tu
          tolerancia. Revísalo antes de darlo por bueno: mientras no lo confirmes, la política no
          puede activarse.{' '}
          <button type="button" className="btn small" onClick={confirmarDerivado}>
            Lo he revisado
          </button>
        </Note>
      )}

      <nav className="ips-pasos" aria-label="Pasos del asistente">
        <ol>
          {PASOS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={p.id === paso ? 'ips-paso actual' : 'ips-paso'}
                aria-current={p.id === paso ? 'step' : undefined}
                onClick={() => setPaso(p.id)}
              >
                <span className="ips-paso__num" aria-hidden="true">
                  {p.num}
                </span>
                <span>{p.titulo}</span>
              </button>
            </li>
          ))}
          <li>
            <span className="ips-paso pendiente">
              <span className="ips-paso__num" aria-hidden="true">
                3–{PASOS_PREVISTOS}
              </span>
              <span>Situación, tolerancia y restricciones (aún no disponibles)</span>
            </span>
          </li>
        </ol>
      </nav>

      <h3 className="ips-paso-titulo">
        Paso {actual.num} de {PASOS_PREVISTOS} · {actual.titulo}
      </h3>

      {paso === 'objetivos' && <GoalsStep goals={politica.goals} onChange={guardarObjetivos} />}
      {paso === 'horizonte' && (
        <HorizonStep
          horizonYears={politica.assessment.capacity.horizonYears}
          goals={politica.goals}
          hoy={hoy}
          onChange={guardarHorizonte}
        />
      )}

      <div className="ips-navegacion">
        {anterior !== undefined && (
          <button type="button" className="btn" onClick={() => setPaso(anterior.id)}>
            Volver a {anterior.titulo.toLowerCase()}
          </button>
        )}
        {siguiente !== undefined && (
          <button type="button" className="btn primary" onClick={() => setPaso(siguiente.id)}>
            Guardar y continuar
          </button>
        )}
      </div>

      {/* El título va como h4 escrito a mano y no como `title` de la tarjeta:
          `Card` emite h2, y aquí eso rompería el orden de encabezados, porque
          el paso actual ya es h3 dentro de la tarjeta que envuelve el
          asistente. */}
      <Card>
        <h4 className="card-title">Qué falta</h4>
        <ul className="ips-pendientes">
          <li>
            {politica.goals.length === 0
              ? 'Ningún objetivo declarado.'
              : `${politica.goals.length} ${politica.goals.length === 1 ? 'objetivo declarado' : 'objetivos declarados'}.`}
          </li>
          {faltan.length > 0 && (
            <li>
              Para medir tu capacidad de asumir pérdidas falta{' '}
              {faltan.map((hecho) => NOMBRE_HECHO[hecho]).join(', ')}.
            </li>
          )}
        </ul>
        <p className="muted tiny mb-0">
          Puedes dejarlo a medias y volver: lo que escribes se guarda en este dispositivo según lo
          rellenas. Mientras falte algo, no se calcula ninguna banda de capacidad ni riesgo
          efectivo.
        </p>
      </Card>
    </section>
  )
}

/** Quita el horizonte sin dejar la clave presente con `undefined`. */
function sinHorizonte(capacity: CapacityAssessment): CapacityAssessment {
  const { horizonYears: _descartado, ...resto } = capacity
  return resto
}
