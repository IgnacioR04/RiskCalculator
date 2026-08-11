/**
 * Sincronización de la política con la nube (LAB-214).
 *
 * **Local primero.** La aplicación funciona entera sin cuenta, y la nube es un
 * añadido: sin sesión no se sube nada, sin red no se pierde nada y el borrador
 * sigue en el dispositivo.
 *
 * La regla que da nombre al criterio de aceptación —«no hay pérdida
 * silenciosa»— se implementa aquí como una decisión **explícita y pura**: esta
 * función no escribe, solo dice qué habría que hacer. Cuando las dos copias han
 * divergido devuelve `conflict` y se para. Nunca gana «la última que escribió»,
 * porque esa regla pierde trabajo sin avisar y el usuario se entera semanas
 * después, si es que se entera.
 */
import type { InvestmentPolicy } from '../domain/investmentPolicy'

export type SyncReason =
  /** No hay nada en ningún lado. */
  | 'nothing_to_sync'
  /** Las dos copias son la misma. */
  | 'in_sync'
  /** Solo hay copia local. */
  | 'remote_absent'
  /** Solo hay copia remota. */
  | 'local_absent'
  /** La local va por delante. */
  | 'local_ahead'
  /** La remota va por delante. */
  | 'remote_ahead'
  /** Misma versión y contenido distinto: alguien editó en dos sitios. */
  | 'diverged'
  /** La copia remota es de otra cuenta. */
  | 'foreign_owner'

export interface SyncDecision {
  readonly action: 'noop' | 'push' | 'pull' | 'conflict'
  readonly reason: SyncReason
  readonly localVersion?: number
  readonly remoteVersion?: number
}

/**
 * Decide qué hacer entre la copia local y la remota.
 *
 * `userId` es el de la sesión abierta. Una política remota de otra cuenta no se
 * descarga jamás, aunque venga con versión más alta: eso sería enseñarle a
 * alguien la cartera de otro.
 */
export function resolveIpsSync(
  local: InvestmentPolicy | null,
  remote: InvestmentPolicy | null,
  userId: string | null,
): SyncDecision {
  if (local === null && remote === null) {
    return { action: 'noop', reason: 'nothing_to_sync' }
  }

  // Sin sesión no hay nube. Lo local se queda donde está, intacto.
  if (userId === null) {
    return { action: 'noop', reason: 'remote_absent', ...versionDe(local, remote) }
  }

  if (remote !== null && remote.userId !== undefined && remote.userId !== userId) {
    return { action: 'conflict', reason: 'foreign_owner', ...versionDe(local, remote) }
  }

  if (remote === null) return { action: 'push', reason: 'remote_absent', ...versionDe(local, null) }
  if (local === null) return { action: 'pull', reason: 'local_absent', ...versionDe(null, remote) }

  const versiones = versionDe(local, remote)

  if (local.version > remote.version) {
    return { action: 'push', reason: 'local_ahead', ...versiones }
  }
  if (remote.version > local.version) {
    return { action: 'pull', reason: 'remote_ahead', ...versiones }
  }

  // Misma versión. Si el contenido coincide no hay nada que hacer; si no
  // coincide, dos dispositivos editaron la misma versión y **no se elige por
  // reloj**: se para y decide el usuario.
  return mismoContenido(local, remote)
    ? { action: 'noop', reason: 'in_sync', ...versiones }
    : { action: 'conflict', reason: 'diverged', ...versiones }
}

/**
 * Compara el contenido que define una política, ignorando lo que no cambia su
 * significado. `id` entra: dos políticas con el mismo número de versión y
 * distinta identidad son cosas distintas, no la misma editada.
 */
function mismoContenido(a: InvestmentPolicy, b: InvestmentPolicy): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b))
}

function normalizar(policy: InvestmentPolicy) {
  return {
    id: policy.id,
    version: policy.version,
    status: policy.status,
    effectiveFrom: policy.effectiveFrom,
    assessment: policy.assessment,
    effectiveRisk: policy.effectiveRisk ?? null,
    goals: policy.goals,
    constraints: policy.constraints,
    rebalancePolicy: policy.rebalancePolicy,
    acknowledgements: policy.acknowledgements,
  }
}

function versionDe(local: InvestmentPolicy | null, remote: InvestmentPolicy | null) {
  return {
    ...(local === null ? {} : { localVersion: local.version }),
    ...(remote === null ? {} : { remoteVersion: remote.version }),
  }
}

/** Un conflicto exige intervención: nada se sube ni se baja mientras dure. */
export function needsUserDecision(decision: SyncDecision): boolean {
  return decision.action === 'conflict'
}

/**
 * Qué se explica al usuario en cada caso. Texto, no código: el código está en
 * `reason` y no cambia aunque se reescriba la frase.
 */
export const SYNC_MESSAGE: Readonly<Record<SyncReason, string>> = {
  nothing_to_sync: 'No hay ninguna política que sincronizar.',
  in_sync: 'La copia de este dispositivo y la de la nube coinciden.',
  remote_absent: 'Tu política vive solo en este dispositivo.',
  local_absent: 'Hay una política en la nube que este dispositivo no tiene.',
  local_ahead: 'Este dispositivo tiene una versión más reciente que la nube.',
  remote_ahead: 'La nube tiene una versión más reciente que este dispositivo.',
  diverged:
    'La misma versión se ha editado en dos sitios. No se sobrescribe ninguna: elige cuál conservar.',
  foreign_owner:
    'La política de la nube pertenece a otra cuenta. No se descarga nada hasta aclararlo.',
}
