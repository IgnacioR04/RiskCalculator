/**
 * Estado local de la política de inversión (LAB-204).
 *
 * Vive en su propio módulo para no seguir engordando el store monolítico, que
 * el baseline de LAB-001 ya señalaba como deuda.
 *
 * Dos ideas gobiernan el diseño:
 *
 * - **El perfil antiguo no se toca.** `riskProfile` se conserva tal cual y la
 *   pantalla de Perfil sigue funcionando. La política nueva convive con él
 *   hasta que el usuario confirme; migrar no es motivo para perder lo que ya
 *   había.
 * - **No se inventa nada.** Del perfil antiguo solo puede salir una banda de
 *   tolerancia y una fecha, porque es lo único que ese cuestionario preguntó.
 *   Capacidad, objetivos y restricciones nacen vacíos.
 */
import type { RiskProfile } from '../../lib/domain'
import {
  BAND_FROM_LEGACY_CATEGORY,
  EFFECTIVE_RISK_RULE_VERSION,
  IPS_SCHEMA_VERSION,
  type InvestmentPolicy,
  type PolicyAcknowledgement,
} from '../../lib/lab/domain/investmentPolicy'
import {
  activatePolicy,
  activationBlockers,
  canActivatePolicy,
  nextDraftFrom,
  supersedePolicy,
  type ActivationBlocker,
} from '../../lib/lab/analytics/policyActivation'

export interface LabProfileState {
  /** Política en edición. Puede existir sin estar activa. */
  labPolicyDraft: InvestmentPolicy | null
  /** Política vigente. Solo se llena cuando el borrador cumple sus requisitos. */
  labPolicyActive: InvestmentPolicy | null
  /**
   * Versiones retiradas, de la más reciente a la más antigua.
   *
   * No se borran (ADR-002 §7): son el contexto bajo el que se calcularon los
   * resultados que ya existen. Una política vieja no se corrige a posteriori,
   * se conserva tal como estaba.
   */
  labPolicySuperseded: InvestmentPolicy[]
  /**
   * El borrador se dedujo del perfil antiguo y **nadie lo ha confirmado**.
   * Mientras sea `true`, la política no puede activarse: ADR-002 exige
   * confirmación explícita de un perfil derivado.
   */
  labPolicyDerivedFromLegacy: boolean
}

export const initialLabProfileState: LabProfileState = {
  labPolicyDraft: null,
  labPolicyActive: null,
  labPolicySuperseded: [],
  labPolicyDerivedFromLegacy: false,
}

/**
 * Construye un borrador a partir del perfil de riesgo antiguo.
 *
 * La fecha sale de `completedAt`, que es un dato real del perfil, y no del
 * reloj: así la derivación es reproducible y no finge que la política se creó
 * hoy.
 *
 * Devuelve `null` si no hay perfil o si su categoría no está en el mapa; nunca
 * un borrador a medias.
 */
export function deriveLabPolicyFromLegacy(profile: RiskProfile | null): InvestmentPolicy | null {
  if (profile === null) return null
  const band = BAND_FROM_LEGACY_CATEGORY[profile.category]
  if (band === undefined) return null

  const effectiveFrom = profile.completedAt.slice(0, 10)

  return {
    schemaVersion: IPS_SCHEMA_VERSION,
    id: `ips-legacy-${profile.version}`,
    version: 1,
    status: 'draft',
    effectiveFrom,
    baseCurrency: 'EUR',
    assessment: {
      // Lo único que el cuestionario antiguo llegó a preguntar.
      tolerance: {
        answers: profile.answers,
        band,
        assessedAt: profile.completedAt,
        // La procedencia importa: esta banda no sale del cuestionario nuevo y
        // no puede recalcularse desde estas respuestas, así que el motor de
        // derivación la respeta en vez de borrarla (LAB-208).
        source: 'perfil-anterior',
      },
      // Capacidad vacía a propósito: el perfil antiguo nunca la midió, y
      // deducirla de la tolerancia es justo lo que ADR-002 prohíbe.
      capacity: {},
    },
    effectiveRiskRuleVersion: EFFECTIVE_RISK_RULE_VERSION,
    goals: [],
    constraints: [],
    rebalancePolicy: { kind: 'none' },
    assumptions: {},
    acknowledgements: [],
  }
}

/**
 * Paso de migración del estado persistido: si había perfil antiguo y todavía no
 * hay política, se deriva un borrador. **Nada se sobrescribe**: si ya existe un
 * borrador, se respeta.
 */
export function migrateLabProfile<T extends Partial<LabProfileState> & { riskProfile?: RiskProfile | null }>(
  state: T,
): T & LabProfileState {
  const yaTienePolitica = state.labPolicyDraft != null || state.labPolicyActive != null
  if (yaTienePolitica) {
    return {
      ...state,
      labPolicyDraft: state.labPolicyDraft ?? null,
      labPolicyActive: state.labPolicyActive ?? null,
      labPolicySuperseded: state.labPolicySuperseded ?? [],
      labPolicyDerivedFromLegacy: state.labPolicyDerivedFromLegacy ?? false,
    }
  }

  const derivado = deriveLabPolicyFromLegacy(state.riskProfile ?? null)
  return {
    ...state,
    labPolicyDraft: derivado,
    labPolicyActive: null,
    labPolicySuperseded: state.labPolicySuperseded ?? [],
    labPolicyDerivedFromLegacy: derivado !== null,
  }
}

export interface LabProfileActions {
  setLabPolicyDraft: (policy: InvestmentPolicy | null) => void
  /** Marca el borrador derivado como revisado por el usuario. */
  confirmDerivedLabPolicy: () => void
  /** Añade una confirmación explícita al borrador (ADR-002 §6). */
  acknowledgeLabPolicy: (acknowledgement: PolicyAcknowledgement) => void
  /**
   * Promueve el borrador a vigente. Se niega si procede del perfil antiguo y no
   * se ha confirmado, o si le falta cualquier requisito de ADR-002 §6.
   *
   * La vigente anterior **no se pierde**: pasa a `superseded` y se guarda.
   */
  activateLabPolicy: (hoy: string) => void
  /**
   * Abre la versión siguiente a partir de la vigente. La vigente sigue vigente
   * y sin tocar hasta que la nueva se active: es el criterio de aceptación de
   * LAB-209.
   */
  startNewLabPolicyVersion: (nuevoId: string, hoy: string) => void
  /** Descarta el borrador en curso. La vigente no se toca. */
  discardLabPolicyDraft: () => void
  clearLabProfile: () => void
}

/**
 * Una política solo puede activarse si trae lo que ADR-002 §6 exige.
 *
 * La lista de requisitos vive en `policyActivation.ts`, que es puro y está
 * probado aparte; aquí solo se le da el contexto que el store conoce. Tener dos
 * copias de la regla sería tener dos reglas.
 */
export function canActivate(state: LabProfileState): boolean {
  const borrador = state.labPolicyDraft
  if (borrador === null) return false
  return canActivatePolicy(borrador, { derivedFromLegacy: state.labPolicyDerivedFromLegacy })
}

/** Qué falta para poder activar, para poder decirlo en pantalla. */
export function labActivationBlockers(state: LabProfileState): readonly ActivationBlocker[] {
  const borrador = state.labPolicyDraft
  if (borrador === null) return []
  return activationBlockers(borrador, { derivedFromLegacy: state.labPolicyDerivedFromLegacy })
}

export function createLabProfileActions(
  set: (updater: (state: LabProfileState) => Partial<LabProfileState>) => void,
): LabProfileActions {
  return {
    setLabPolicyDraft: (policy) =>
      set(() => ({ labPolicyDraft: policy, labPolicyDerivedFromLegacy: false })),

    confirmDerivedLabPolicy: () => set(() => ({ labPolicyDerivedFromLegacy: false })),

    acknowledgeLabPolicy: (acknowledgement) =>
      set((state) => {
        const borrador = state.labPolicyDraft
        if (borrador === null) return {}
        // Una confirmación por tipo: repetirla no la hace más explícita.
        const previas = borrador.acknowledgements.filter((a) => a.kind !== acknowledgement.kind)
        return {
          labPolicyDraft: { ...borrador, acknowledgements: [...previas, acknowledgement] },
        }
      }),

    activateLabPolicy: (hoy) =>
      set((state) => {
        if (!canActivate(state)) return {}
        const borrador = state.labPolicyDraft as InvestmentPolicy
        const anterior = state.labPolicyActive
        return {
          labPolicyActive: activatePolicy(borrador, hoy),
          labPolicyDraft: null,
          // La más reciente primero: es la que alguien querría mirar.
          labPolicySuperseded:
            anterior === null
              ? state.labPolicySuperseded
              : [supersedePolicy(anterior), ...state.labPolicySuperseded],
        }
      }),

    startNewLabPolicyVersion: (nuevoId, hoy) =>
      set((state) => {
        const vigente = state.labPolicyActive
        // Si ya hay un borrador abierto se respeta: abrir otro perdería lo
        // escrito, y eso no lo decide un botón.
        if (vigente === null || state.labPolicyDraft !== null) return {}
        return {
          labPolicyDraft: nextDraftFrom(vigente, nuevoId, hoy),
          labPolicyDerivedFromLegacy: false,
        }
      }),

    discardLabPolicyDraft: () => set(() => ({ labPolicyDraft: null })),

    clearLabProfile: () => set(() => ({ ...initialLabProfileState })),
  }
}
