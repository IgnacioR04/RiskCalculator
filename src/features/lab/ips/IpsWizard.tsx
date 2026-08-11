/**
 * Asistente de política de inversión (LAB-207, LAB-208, LAB-209).
 *
 * Cubre los nueve pasos de la especificación de producto (§8.1). El 6,
 * «necesidad de rentabilidad», llegó en LAB-215 y cierra D17: sin él la
 * maquinaria de conflicto de ADR-002 §4 no podía dispararse nunca.
 *
 * Dos decisiones de diseño vienen del plan y conviene no perderlas de vista:
 *
 * - **Se puede guardar y continuar sin completar.** Obligar a rellenarlo todo de
 *   una sentada produce respuestas apresuradas, y una respuesta inventada es
 *   peor que un hueco. Lo que sí se hace es decir en todo momento qué falta.
 * - **El borrador se guarda en cada cambio**, no al final. El store persiste en
 *   `localStorage`, así que recargar la página no cuesta el trabajo hecho: es el
 *   criterio de aceptación de LAB-207.
 *
 * Lo que se calcula aquí sale **solo** de lo declarado: las bandas se derivan en
 * `withDerivedBands`, que es puro y vive fuera de React. Este componente recoge,
 * guarda y explica; no decide nada por su cuenta.
 */
import { Fragment, useMemo, useState } from 'react'
import { Card, Note } from '../../../components/ui'
import { uid } from '../../../lib/domain'
import {
  RISK_BAND_INFO,
  type CapacityAssessment,
  type CapacityFactsUpdate,
  type InvestmentGoal,
  type InvestmentPolicy,
} from '../../../lib/lab/domain/investmentPolicy'
import { bindingCapacityFacts } from '../../../lib/lab/analytics/capacityBand'
import { activationBlockers } from '../../../lib/lab/analytics/policyActivation'
import { missingCapacityFacts } from '../../../lib/lab/analytics/policyAssessment'
import { withDerivedBands } from '../../../lib/lab/analytics/policyDerivation'
import { missingToleranceAnswers } from '../../../lib/lab/analytics/toleranceBand'
import { emptyPolicyDraft } from '../../../lib/lab/schemas/investmentPolicy'
import { useAppStore } from '../../../state/store'
import { ConstraintsStep, describir } from './steps/ConstraintsStep'
import { GoalsStep } from './steps/GoalsStep'
import { HorizonStep } from './steps/HorizonStep'
import { KnowledgeStep } from './steps/KnowledgeStep'
import { NeedStep } from './steps/NeedStep'
import { MaintenanceStep } from './steps/MaintenanceStep'
import { ReviewStep } from './steps/ReviewStep'
import { SituationStep } from './steps/SituationStep'
import { ToleranceStep } from './steps/ToleranceStep'

/** Los nueve pasos de la especificación (§8.1), con su numeración. */
export const PASOS = [
  { id: 'objetivos', num: 1, titulo: 'Objetivos' },
  { id: 'horizonte', num: 2, titulo: 'Horizonte' },
  { id: 'situacion', num: 3, titulo: 'Situación y liquidez' },
  { id: 'tolerancia', num: 4, titulo: 'Tolerancia' },
  { id: 'conocimientos', num: 5, titulo: 'Conocimientos' },
  { id: 'necesidad', num: 6, titulo: 'Necesidad' },
  { id: 'restricciones', num: 7, titulo: 'Restricciones' },
  { id: 'mantenimiento', num: 8, titulo: 'Mantenimiento' },
  { id: 'revision', num: 9, titulo: 'Revisión' },
] as const

export type PasoId = (typeof PASOS)[number]['id']

/** Total de pasos previstos, para que «paso 1 de 9» no mienta sobre lo que queda. */
export const PASOS_PREVISTOS = 9

/** Cómo se nombra cada hecho de capacidad al decir qué falta o qué limita. */
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
  const activa = useAppStore((s) => s.labPolicyActive)
  const retiradas = useAppStore((s) => s.labPolicySuperseded)
  const derivado = useAppStore((s) => s.labPolicyDerivedFromLegacy)
  const setDraft = useAppStore((s) => s.setLabPolicyDraft)
  const confirmarDerivado = useAppStore((s) => s.confirmDerivedLabPolicy)
  const confirmarPolitica = useAppStore((s) => s.acknowledgeLabPolicy)
  const activar = useAppStore((s) => s.activateLabPolicy)
  const nuevaVersion = useAppStore((s) => s.startNewLabPolicyVersion)
  const descartarBorrador = useAppStore((s) => s.discardLabPolicyDraft)

  const [paso, setPaso] = useState<PasoId>(props.pasoInicial ?? 'objetivos')

  // El reloj se lee una sola vez por montaje: una función que consulta la hora
  // en cada render deja de ser reproducible, y la fecha se usa para sugerir.
  const ahora = useMemo(() => new Date().toISOString(), [])
  const hoy = ahora.slice(0, 10)

  // Sin borrador se trabaja sobre uno vacío en memoria, que solo se persiste
  // cuando el usuario escribe algo: entrar a mirar no crea una política. El
  // identificador es un UUID porque las tablas de LAB-205 lo exigen así.
  const plantilla = useMemo(() => emptyPolicyDraft(uid(), hoy), [hoy])
  const politica: InvestmentPolicy = draft ?? plantilla

  /** Guarda y recalcula lo derivado. Los dos pasos van siempre juntos. */
  function guardar(cambio: Partial<InvestmentPolicy>) {
    reemplazar({ ...politica, ...cambio })
  }

  /** Igual, pero sustituyendo la política entera: permite **quitar** claves. */
  function reemplazar(nueva: InvestmentPolicy) {
    setDraft(withDerivedBands(nueva, ahora))
  }

  function guardarObjetivos(goals: readonly InvestmentGoal[]) {
    guardar({ goals })
  }

  function guardarCapacidad(cambio: CapacityFactsUpdate) {
    // Las claves con valor `undefined` se retiran en vez de quedarse presentes:
    // «sin declarar» es la ausencia de la clave, no una clave con hueco.
    const capacity = limpiar({ ...politica.assessment.capacity, ...cambio })
    guardar({ assessment: { ...politica.assessment, capacity } })
  }

  function guardarTolerancia(answers: Readonly<Record<string, string>>) {
    const tolerance = { ...politica.assessment.tolerance, answers }
    guardar({ assessment: { ...politica.assessment, tolerance } })
  }

  function guardarConocimientos(answers: Readonly<Record<string, string>>) {
    const knowledge = { ...(politica.assessment.knowledge ?? {}), answers }
    guardar({ assessment: { ...politica.assessment, knowledge } })
  }

  function firmar(confirmado: boolean) {
    if (!confirmado) {
      guardar({ acknowledgements: [] })
      return
    }
    // El borrador tiene que existir en el store antes de poder confirmarlo: si
    // se ha llegado aquí sin escribir nada, primero se guarda tal cual.
    if (draft === null) setDraft(withDerivedBands(politica, ahora))
    confirmarPolitica({ kind: 'perfil-confirmado', acknowledgedAt: ahora })
  }

  const bloqueos = activationBlockers(politica, { derivedFromLegacy: derivado })
  const faltanHechos = missingCapacityFacts(politica.assessment.capacity)
  const faltanRespuestas = missingToleranceAnswers(politica.assessment.tolerance.answers)
  const limitan = bindingCapacityFacts(politica.assessment.capacity)
  const capacidad = politica.assessment.capacity.band
  const tolerancia = politica.assessment.tolerance.band
  const efectivo = politica.effectiveRisk

  const indice = PASOS.findIndex((p) => p.id === paso)
  const actual = PASOS[indice] ?? PASOS[0]
  const anterior = PASOS[indice - 1]
  const siguiente = PASOS[indice + 1]

  // Con una política vigente y sin borrador abierto, el asistente no se enseña:
  // la vigente no se edita. Lo que se ofrece es abrir la versión siguiente.
  if (activa !== null && draft === null) {
    return (
      <PoliticaVigente
        activa={activa}
        retiradas={retiradas}
        onNuevaVersion={() => nuevaVersion(uid(), hoy)}
      />
    )
  }

  return (
    <section className="ips-wizard" aria-label="Asistente de política de inversión">
      {activa !== null && (
        <Note kind="info">
          Estás editando la <strong>versión {politica.version}</strong>. La versión{' '}
          {activa.version} sigue vigente y no se toca hasta que actives esta.{' '}
          <button type="button" className="btn small" onClick={descartarBorrador}>
            Descartar los cambios
          </button>
        </Note>
      )}

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
            // El hueco del paso 6 se dibuja en su sitio, entre el 5 y el 7: al
            // final de la lista parecería un extra y no lo que es, un paso que
            // falta en medio.
            <Fragment key={p.id}>
              <li>
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
            </Fragment>
          ))}
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
          onChange={(horizonYears) => guardarCapacidad({ horizonYears })}
        />
      )}
      {paso === 'situacion' && (
        <SituationStep capacity={politica.assessment.capacity} onChange={guardarCapacidad} />
      )}
      {paso === 'tolerancia' && (
        <ToleranceStep
          answers={politica.assessment.tolerance.answers}
          onChange={guardarTolerancia}
        />
      )}
      {paso === 'conocimientos' && (
        <KnowledgeStep
          answers={politica.assessment.knowledge?.answers ?? {}}
          onChange={guardarConocimientos}
        />
      )}
      {paso === 'necesidad' && <NeedStep policy={politica} hoy={hoy} />}
      {paso === 'restricciones' && (
        <ConstraintsStep
          constraints={politica.constraints}
          onChange={(constraints) => guardar({ constraints })}
        />
      )}
      {paso === 'mantenimiento' && (
        <MaintenanceStep
          rebalancePolicy={politica.rebalancePolicy}
          liquidityReserveMonths={politica.liquidityReserveMonths}
          contributionPlan={politica.contributionPlan}
          baseCurrency={politica.baseCurrency}
          onRebalanceChange={(rebalancePolicy) => guardar({ rebalancePolicy })}
          onReserveChange={(meses) => {
            // Retirar un dato es quitar la clave, no ponerla a `undefined`.
            const { liquidityReserveMonths: _fuera, ...resto } = politica
            reemplazar(meses === undefined ? resto : { ...resto, liquidityReserveMonths: meses })
          }}
          onContributionChange={(plan) => {
            const { contributionPlan: _fuera, ...resto } = politica
            reemplazar(plan === undefined ? resto : { ...resto, contributionPlan: plan })
          }}
        />
      )}
      {paso === 'revision' && (
        <ReviewStep
          policy={politica}
          blockers={bloqueos}
          acknowledged={politica.acknowledgements.length > 0}
          onAcknowledge={firmar}
          onActivate={() => activar(hoy)}
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

      {/* En el paso de revisión no se repite: ese paso ya es el resumen entero,
          y dos versiones del mismo dato invitan a compararlas.

          El título va como h4 escrito a mano y no como `title` de la tarjeta:
          `Card` emite h2, y aquí eso rompería el orden de encabezados, porque
          el paso actual ya es h3 dentro de la tarjeta que envuelve el
          asistente. */}
      {paso !== 'revision' && (
      <Card>
        <h4 className="card-title">Dónde estás</h4>
        <ul className="ips-pendientes">
          <li>
            {politica.goals.length === 0
              ? 'Ningún objetivo declarado.'
              : `${politica.goals.length} ${politica.goals.length === 1 ? 'objetivo declarado' : 'objetivos declarados'}.`}
          </li>
          <li>
            {capacidad === undefined ? (
              <>
                Capacidad de asumir pérdidas: <strong>sin medir</strong>. Falta{' '}
                {enumerar(faltanHechos.map((hecho) => NOMBRE_HECHO[hecho]))}.
              </>
            ) : (
              <>
                Capacidad de asumir pérdidas: <strong>{RISK_BAND_INFO[capacidad].nombre}</strong>.{' '}
                {capacidad === 5
                  ? 'Ninguno de los cinco datos la limita.'
                  : `La limita ${enumerar(limitan.map((hecho) => NOMBRE_HECHO[hecho]))}.`}
              </>
            )}
          </li>
          <li>
            {tolerancia === undefined ? (
              <>
                Tolerancia declarada: <strong>sin declarar</strong>.{' '}
                {faltanRespuestas.length === 1
                  ? 'Falta 1 respuesta.'
                  : `Faltan ${faltanRespuestas.length} respuestas.`}
              </>
            ) : (
              <>
                Tolerancia declarada: <strong>{RISK_BAND_INFO[tolerancia].nombre}</strong>.
                {politica.assessment.tolerance.source === 'perfil-anterior' &&
                  ' Viene de tu cuestionario anterior, que preguntaba otras cosas: al contestar el paso 4 se sustituye.'}
              </>
            )}
          </li>
          <li>
            {efectivo === undefined ? (
              <>
                Riesgo efectivo: <strong>no se puede calcular todavía</strong>. Hacen falta las dos
                cosas, y ninguna se deduce de la otra.
              </>
            ) : (
              <>
                Riesgo efectivo: <strong>{RISK_BAND_INFO[efectivo].nombre}</strong>, el menor de
                los dos. {RISK_BAND_INFO[efectivo].lectura}
              </>
            )}
          </li>
        </ul>
        <p className="muted tiny mb-0">
          Puedes dejarlo a medias y volver: lo que escribes se guarda en este dispositivo según lo
          rellenas. Ningún hueco se rellena con un valor medio.
        </p>
      </Card>
      )}
    </section>
  )
}

/**
 * Vista de la política vigente. **No es un formulario**: la activa no se edita,
 * y por eso aquí no hay ni un solo campo. Para cambiar algo se abre una versión
 * nueva, que nace como borrador y deja la vigente intacta hasta que se active.
 */
function PoliticaVigente(props: {
  readonly activa: InvestmentPolicy
  readonly retiradas: readonly InvestmentPolicy[]
  readonly onNuevaVersion: () => void
}) {
  const { activa } = props
  return (
    <section className="ips-wizard" aria-label="Política de inversión vigente">
      <Note kind="info">
        Tienes una política <strong>vigente</strong> (versión {activa.version}, en vigor desde el{' '}
        {activa.effectiveFrom}). No se edita: los resultados que ya has visto se calcularon con
        ella, y cambiarla por debajo los dejaría sin explicación.
      </Note>

      <Card>
        <h4 className="card-title">Resumen</h4>
        <ul className="ips-pendientes">
          <li>
            Riesgo efectivo:{' '}
            <strong>
              {activa.effectiveRisk === undefined
                ? 'sin calcular'
                : RISK_BAND_INFO[activa.effectiveRisk].nombre}
            </strong>
          </li>
          <li>
            {activa.goals.length} {activa.goals.length === 1 ? 'objetivo' : 'objetivos'}:{' '}
            {activa.goals.map((goal) => goal.name).join(', ')}
          </li>
          <li>
            {activa.constraints.length === 0
              ? 'Sin restricciones declaradas.'
              : `Restricciones: ${activa.constraints.map(describir).join(' · ')}`}
          </li>
          <li>Próxima revisión: {activa.nextReviewAt ?? 'sin fijar'}</li>
        </ul>
      </Card>

      <div className="ips-navegacion">
        <button type="button" className="btn primary" onClick={props.onNuevaVersion}>
          Crear una versión nueva
        </button>
      </div>

      {props.retiradas.length > 0 && (
        <Card>
          <h4 className="card-title">Versiones anteriores</h4>
          <ul className="ips-pendientes">
            {props.retiradas.map((politica) => (
              <li key={politica.id}>
                Versión {politica.version}, vigente desde el {politica.effectiveFrom}. Se conserva
                tal como estaba.
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

/** «a, b y c». Encadenar cinco «y» seguidas se lee fatal. */
function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Quita las claves cuyo valor es `undefined`, sin dejarlas presentes. */
function limpiar(capacity: Record<string, unknown>): CapacityAssessment {
  const entradas = Object.entries(capacity).filter(([, valor]) => valor !== undefined)
  return Object.fromEntries(entradas) as CapacityAssessment
}
