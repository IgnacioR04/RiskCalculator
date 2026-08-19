/**
 * Compilador de restricciones (LAB-601).
 *
 * Traduce la política de inversión —escrita en dimensiones humanas: «como mucho
 * un 20 % en tecnología», «nada de tabaco»— a **límites numéricos sobre
 * instrumentos concretos**, que es lo único que un optimizador sabe leer.
 *
 * ## La regla que gobierna el módulo
 *
 * **Una restricción que no se puede resolver no se ignora.** Si el usuario dice
 * «como mucho un 20 % en sector energía» y ninguna de sus posiciones tiene
 * sector declarado, hay tres respuestas posibles y solo una es honesta:
 *
 * - aplicarla sobre un grupo vacío (queda satisfecha siempre) → **mentira**:
 *   la cartera resultante parecería cumplir una regla que nadie ha comprobado;
 * - descartarla en silencio → **mentira peor**: el usuario cree que su límite
 *   rige;
 * - **compilarla y marcarla como no cubierta**, con motivo → lo que se hace.
 *
 * Es el criterio de aceptación de LAB-601: una restricción sin clasificación
 * produce bloqueo o aviso, nunca silencio.
 *
 * ## Duras y blandas
 *
 * Una restricción **dura** no se puede violar: si no hay solución que la
 * cumpla, no hay solución. Una **blanda** es una preferencia: se intenta y se
 * informa de cuánto se ha incumplido. Mezclarlas hace imposible explicar por
 * qué no hay respuesta, así que van separadas desde el principio.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type {
  ExposureDimension,
  PortfolioConstraint,
} from '../domain/investmentPolicy'

/** Versión de las reglas de compilación. Sube si cambia qué produce cada una. */
export const CONSTRAINT_COMPILER_VERSION = 'constraints-v1'

/** Margen de coma flotante al comparar sumas de fracciones. */
const EPS = 1e-9

/* ── Entrada ───────────────────────────────────────────────────────────────── */

/** Lo que el compilador necesita saber de cada instrumento. */
export interface CompilerInstrument {
  readonly id: string
  readonly symbol: string
  /** Valor de cada dimensión, o `undefined` si no se conoce. */
  readonly dimensions: Partial<Record<ExposureDimension, string>>
  /** Peso actual en la cartera, fracción 0–1. */
  readonly currentWeight: number
  /** Si se puede vender. Un plan de solo aportaciones lo pone a `false`. */
  readonly sellable?: boolean
}

/* ── Salida ────────────────────────────────────────────────────────────────── */

export type ConstraintSeverity = 'hard' | 'soft'

/**
 * Un límite ya resuelto a instrumentos.
 *
 * `members` son los índices dentro del universo, no identificadores: un
 * optimizador trabaja con vectores, y resolver la traducción una sola vez aquí
 * evita que cada solver la repita a su manera.
 */
export interface CompiledBound {
  readonly id: string
  /** Qué restricción de la política lo produjo, para poder explicarlo. */
  readonly source: PortfolioConstraint['kind']
  readonly severity: ConstraintSeverity
  /** Instrumentos afectados, por índice en el universo. */
  readonly members: readonly number[]
  readonly min: number
  readonly max: number
  /** Frase para la interfaz. Se escribe aquí, no en cada pantalla. */
  readonly label: string
}

/** Código estable de por qué una restricción no se pudo aplicar del todo. */
export type CoverageReason =
  /** Ningún instrumento tiene esa dimensión declarada. */
  | 'dimension_unknown'
  /** La dimensión existe pero ningún instrumento pertenece a ese grupo. */
  | 'empty_group'
  /** El instrumento nombrado no está en el universo. */
  | 'instrument_not_found'
  /** El universo elegible dejaría fuera posiciones que no se pueden vender. */
  | 'locked_outside_universe'

export interface CoverageIssue {
  readonly reason: CoverageReason
  readonly severity: 'blocking' | 'warning'
  /** Qué restricción quedó afectada. */
  readonly constraint: PortfolioConstraint['kind']
  /** Frase en palabras, con el detalle concreto. */
  readonly detail: string
  /** Qué hacer para resolverlo. Un bloqueo sin salida no es un aviso útil. */
  readonly remediation: string
}

export interface CompiledConstraints {
  readonly version: string
  /** Universo en el orden que usan los índices de `bounds`. */
  readonly universe: readonly CompilerInstrument[]
  readonly bounds: readonly CompiledBound[]
  /** Instrumentos que no se pueden vender, por índice. */
  readonly locked: readonly number[]
  /** `true` si la política prohíbe vender: solo se puede aportar. */
  readonly contributionsOnly: boolean
  /** Límite de rotación, fracción de cartera. `null` si no hay. */
  readonly maxTurnover: number | null
  readonly issues: readonly CoverageIssue[]
}

const REMEDIOS: Readonly<Record<CoverageReason, string>> = {
  dimension_unknown:
    'Rellena esa dimensión en tus activos, o quita la restricción: mientras no se pueda comprobar, no rige.',
  empty_group:
    'No tienes nada de ese grupo. La restricción no se aplica a nada, así que no limita nada.',
  instrument_not_found:
    'Ese activo ya no está en tu cartera. Revisa la política y quita la restricción si sobra.',
  locked_outside_universe:
    'Amplía el universo elegible para incluirlo, o permite venderlo: no se puede exigir las dos cosas.',
}

/* ── Compilación ───────────────────────────────────────────────────────────── */

/**
 * Traduce las restricciones de la política a límites sobre el universo dado.
 *
 * El universo entra ordenado por quien llama y **se conserva ese orden**: los
 * índices de `bounds` se refieren a él, así que reordenarlo aquí rompería
 * cualquier resultado ya calculado.
 */
export function compileConstraints(
  constraints: readonly PortfolioConstraint[],
  universe: readonly CompilerInstrument[],
): CompiledConstraints {
  const bounds: CompiledBound[] = []
  const issues: CoverageIssue[] = []
  const locked = new Set<number>()
  let contributionsOnly = false
  let maxTurnover: number | null = null

  const indicePorId = new Map(universe.map((item, i) => [item.id, i]))
  let universoElegible: Set<number> | null = null

  // Primera pasada: lo que acota el universo o el comportamiento global. Tiene
  // que resolverse antes que los límites por grupo, porque los condiciona.
  for (const restriccion of constraints) {
    switch (restriccion.kind) {
      case 'contributionsOnly':
        contributionsOnly = true
        break
      case 'turnover':
        maxTurnover = clamp(restriccion.max)
        break
      case 'lockedPosition': {
        const i = indicePorId.get(restriccion.instrumentId)
        if (i === undefined) {
          issues.push(problema('instrument_not_found', 'warning', restriccion.kind, restriccion.instrumentId))
          break
        }
        locked.add(i)
        break
      }
      case 'eligibleUniverse':
        universoElegible = new Set(
          restriccion.instrumentIds.flatMap((id) => {
            const i = indicePorId.get(id)
            return i === undefined ? [] : [i]
          }),
        )
        break
      default:
        break
    }
  }

  // Un instrumento que no se puede vender **tiene** que estar en el universo
  // elegible: exigir las dos cosas es pedir algo imposible, y hay que decirlo
  // antes de que el solver falle sin explicar por qué.
  if (universoElegible !== null) {
    for (const i of locked) {
      if (!universoElegible.has(i)) {
        issues.push(
          problema('locked_outside_universe', 'blocking', 'lockedPosition', universe[i]!.symbol),
        )
      }
    }
  }

  // Segunda pasada: los límites propiamente dichos.
  for (const restriccion of constraints) {
    switch (restriccion.kind) {
      case 'assetWeight': {
        const i = indicePorId.get(restriccion.instrumentId)
        if (i === undefined) {
          issues.push(problema('instrument_not_found', 'warning', restriccion.kind, restriccion.instrumentId))
          break
        }
        bounds.push({
          id: `asset:${restriccion.instrumentId}`,
          source: 'assetWeight',
          severity: 'hard',
          members: [i],
          min: clamp(restriccion.min ?? 0),
          max: clamp(restriccion.max ?? 1),
          label: `${universe[i]!.symbol} entre ${pct(restriccion.min ?? 0)} y ${pct(restriccion.max ?? 1)}`,
        })
        break
      }

      case 'groupWeight': {
        const conDimension = universe.filter(
          (item) => item.dimensions[restriccion.dimension] !== undefined,
        )

        if (conDimension.length === 0) {
          // Nadie tiene esa dimensión. Aplicarla sobre el conjunto vacío la
          // dejaría satisfecha siempre, y el usuario creería que rige.
          issues.push(
            problema('dimension_unknown', 'blocking', restriccion.kind, `${restriccion.dimension} = ${restriccion.key}`),
          )
          break
        }

        const members = universe.flatMap((item, i) =>
          item.dimensions[restriccion.dimension] === restriccion.key ? [i] : [],
        )

        if (members.length === 0) {
          issues.push(
            problema('empty_group', 'warning', restriccion.kind, `${restriccion.dimension} = ${restriccion.key}`),
          )
          break
        }

        bounds.push({
          id: `group:${restriccion.dimension}:${restriccion.key}`,
          source: 'groupWeight',
          severity: 'hard',
          members,
          min: clamp(restriccion.min ?? 0),
          max: clamp(restriccion.max ?? 1),
          label: `${restriccion.key} entre ${pct(restriccion.min ?? 0)} y ${pct(restriccion.max ?? 1)}`,
        })
        break
      }

      case 'liquidity': {
        // La liquidez es un suelo sobre lo que se puede vender rápido. Se
        // compila como límite **blando**: es una preferencia de colchón, y
        // tratarla como dura dejaría sin solución a quien tenga poco efectivo.
        const members = universe.flatMap((item, i) =>
          item.dimensions['assetType'] === 'cash' ? [i] : [],
        )
        if (members.length === 0) {
          issues.push(problema('empty_group', 'warning', restriccion.kind, 'efectivo'))
          break
        }
        bounds.push({
          id: 'liquidity',
          source: 'liquidity',
          severity: 'soft',
          members,
          min: clamp(restriccion.minimumLiquidWeight),
          max: 1,
          label: `Al menos ${pct(restriccion.minimumLiquidWeight)} en efectivo`,
        })
        break
      }

      default:
        break
    }
  }

  // Fuera del universo elegible, peso cero. Se compila como límite explícito
  // para que el optimizador no tenga que conocer el concepto.
  if (universoElegible !== null) {
    const fuera = universe.flatMap((_, i) => (universoElegible!.has(i) ? [] : [i]))
    if (fuera.length > 0) {
      bounds.push({
        id: 'universe:excluded',
        source: 'eligibleUniverse',
        severity: 'hard',
        members: fuera,
        min: 0,
        max: 0,
        label: `${fuera.length} ${fuera.length === 1 ? 'activo excluido' : 'activos excluidos'} del universo elegible`,
      })
    }
  }

  return {
    version: CONSTRAINT_COMPILER_VERSION,
    universe,
    bounds,
    locked: [...locked].sort((a, b) => a - b),
    contributionsOnly,
    maxTurnover,
    issues,
  }
}

/* ── Comprobación de una cartera ya construida ────────────────────────────── */

export interface Violation {
  readonly boundId: string
  readonly label: string
  readonly severity: ConstraintSeverity
  /** Peso conjunto del grupo con los pesos dados. */
  readonly actual: number
  readonly min: number
  readonly max: number
}

/**
 * Qué límites incumple un vector de pesos.
 *
 * Existe para comprobar candidatas —incluida la cartera actual— con el mismo
 * código que las produce. Una comprobación escrita aparte se desincroniza.
 */
export function violations(
  compiled: CompiledConstraints,
  weights: readonly number[],
): readonly Violation[] {
  const salida: Violation[] = []

  for (const bound of compiled.bounds) {
    const actual = bound.members.reduce((s, i) => s + (weights[i] ?? 0), 0)
    if (actual < bound.min - EPS || actual > bound.max + EPS) {
      salida.push({
        boundId: bound.id,
        label: bound.label,
        severity: bound.severity,
        actual,
        min: bound.min,
        max: bound.max,
      })
    }
  }

  return salida
}

/** Bloqueos: sin resolverlos, no se puede prometer que la política se cumple. */
export function blockingIssues(compiled: CompiledConstraints): readonly CoverageIssue[] {
  return compiled.issues.filter((i) => i.severity === 'blocking')
}

/* ── Utilidades ────────────────────────────────────────────────────────────── */

function clamp(valor: number): number {
  return Math.min(1, Math.max(0, valor))
}

function pct(fraccion: number): string {
  return `${(fraccion * 100).toFixed(0)} %`
}

function problema(
  reason: CoverageReason,
  severity: 'blocking' | 'warning',
  constraint: PortfolioConstraint['kind'],
  detalle: string,
): CoverageIssue {
  const TEXTO: Readonly<Record<CoverageReason, string>> = {
    dimension_unknown: `No se puede comprobar «${detalle}»: ninguno de tus activos declara esa dimensión.`,
    empty_group: `No tienes nada en «${detalle}».`,
    instrument_not_found: `«${detalle}» no está en tu cartera.`,
    locked_outside_universe: `«${detalle}» no se puede vender pero queda fuera del universo elegible.`,
  }
  return { reason, severity, constraint, detail: TEXTO[reason], remediation: REMEDIOS[reason] }
}
