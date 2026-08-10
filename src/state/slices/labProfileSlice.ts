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
} from '../../lib/lab/domain/investmentPolicy'

export interface LabProfileState {
  /** Política en edición. Puede existir sin estar activa. */
  labPolicyDraft: InvestmentPolicy | null
  /** Política vigente. Solo se llena cuando el borrador cumple sus requisitos. */
  labPolicyActive: InvestmentPolicy | null
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
      labPolicyDerivedFromLegacy: state.labPolicyDerivedFromLegacy ?? false,
    }
  }

  const derivado = deriveLabPolicyFromLegacy(state.riskProfile ?? null)
  return {
    ...state,
    labPolicyDraft: derivado,
    labPolicyActive: null,
    labPolicyDerivedFromLegacy: derivado !== null,
  }
}

export interface LabProfileActions {
  setLabPolicyDraft: (policy: InvestmentPolicy | null) => void
  /** Marca el borrador derivado como revisado por el usuario. */
  confirmDerivedLabPolicy: () => void
  /**
   * Promueve el borrador a vigente. Se niega si procede del perfil antiguo y
   * no se ha confirmado, o si no está listo para estarlo.
   */
  activateLabPolicy: () => void
  clearLabProfile: () => void
}

/** Una política solo puede activarse si trae lo que ADR-002 §6 exige. */
export function canActivate(state: LabProfileState): boolean {
  const borrador = state.labPolicyDraft
  if (borrador === null) return false
  if (state.labPolicyDerivedFromLegacy) return false
  return (
    borrador.assessment.capacity.band !== undefined &&
    borrador.effectiveRisk !== undefined &&
    borrador.goals.length > 0 &&
    borrador.acknowledgements.length > 0
  )
}

export function createLabProfileActions(
  set: (updater: (state: LabProfileState) => Partial<LabProfileState>) => void,
): LabProfileActions {
  return {
    setLabPolicyDraft: (policy) =>
      set(() => ({ labPolicyDraft: policy, labPolicyDerivedFromLegacy: false })),

    confirmDerivedLabPolicy: () => set(() => ({ labPolicyDerivedFromLegacy: false })),

    activateLabPolicy: () =>
      set((state) => {
        if (!canActivate(state)) return {}
        const borrador = state.labPolicyDraft as InvestmentPolicy
        return {
          labPolicyActive: { ...borrador, status: 'active' },
          labPolicyDraft: null,
        }
      }),

    clearLabProfile: () => set(() => ({ ...initialLabProfileState })),
  }
}
