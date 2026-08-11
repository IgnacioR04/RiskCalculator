/**
 * Contradicciones entre restricciones de cartera (LAB-209).
 *
 * El esquema de LAB-202 ya rechaza una restricción **imposible por sí sola**
 * —un mínimo mayor que su máximo—. Lo que no puede ver es el conjunto: dos
 * restricciones perfectamente válidas por separado pueden no tener ninguna
 * cartera que las cumpla a la vez. Eso se detecta aquí, antes de guardar, y no
 * en el optimizador, que solo podría decir «no hay solución» sin explicar cuál
 * de las dos sobra.
 *
 * No se resuelve nada ni se elige por el usuario: se nombra el conflicto, se
 * señalan las restricciones implicadas y se deja la decisión donde debe estar.
 *
 * **Esto no es una prueba de factibilidad completa.** Decidir si un sistema de
 * restricciones tiene solución es, en general, un problema de programación
 * lineal, y aquí no hay optimizador. Lo que hay son las contradicciones que se
 * detectan con aritmética simple y se explican en una frase; son las que la
 * gente comete de verdad. Que la lista salga vacía significa «no se ha
 * encontrado ninguna», no «se ha demostrado que es satisfacible».
 */
import type { ExposureDimension, PortfolioConstraint } from '../domain/investmentPolicy'

/** Códigos estables: la interfaz traduce, el código no cambia al reescribir. */
export type ConstraintIssueCode =
  /** Un mínimo por encima de su propio máximo. */
  | 'min_over_max'
  /** Repetida una restricción que solo admite una instancia. */
  | 'duplicate_singleton'
  /** Dos restricciones sobre el mismo objetivo. */
  | 'duplicate_target'
  /** Los mínimos de una misma dimensión ya suman más de la cartera entera. */
  | 'minimums_exceed_whole'
  /** Lo bloqueado más la liquidez mínima no cabe en la cartera. */
  | 'locked_and_liquidity_exceed_whole'
  /** Se limita un instrumento que el universo elegible deja fuera. */
  | 'target_outside_universe'
  /** Un máximo de cero equivale a excluir: conviene decirlo con esas palabras. */
  | 'max_zero_is_exclusion'

export interface ConstraintIssue {
  readonly code: ConstraintIssueCode
  /** Posiciones implicadas en la lista de restricciones, en orden. */
  readonly indices: readonly number[]
  /** Explicación en lenguaje llano, lista para mostrar. */
  readonly message: string
  /**
   * `error` impide activar: no existe cartera que lo cumpla.
   * `warning` es legítimo pero fácil de haber escrito sin querer.
   */
  readonly severity: 'error' | 'warning'
}

/**
 * Margen para las comparaciones de suma. Los pesos son fracciones y sumar tres
 * décimas en coma flotante puede dar 0,30000000000000004: sin margen, una
 * cartera que suma exactamente 1 se declararía imposible.
 */
const EPS = 1e-9

/** Restricciones de las que solo tiene sentido tener una. */
const UNA_SOLA: readonly PortfolioConstraint['kind'][] = [
  'turnover',
  'liquidity',
  'contributionsOnly',
  'eligibleUniverse',
]

const NOMBRE_DIMENSION: Readonly<Record<ExposureDimension, string>> = {
  assetType: 'tipo de activo',
  sector: 'sector',
  region: 'región',
  currency: 'divisa',
  issuer: 'emisor',
}

/**
 * Revisa el conjunto y devuelve lo que no encaja, en orden estable.
 *
 * El orden es el de los apartados de esta función, y dentro de cada uno el de
 * las restricciones: dos ejecuciones sobre la misma lista dan la misma
 * secuencia, que es lo que permite compararla en una prueba.
 */
export function findConstraintIssues(
  constraints: readonly PortfolioConstraint[],
): readonly ConstraintIssue[] {
  return [
    ...minimosSobreMaximos(constraints),
    ...duplicadas(constraints),
    ...minimosQueNoCaben(constraints),
    ...bloqueadoMasLiquidez(constraints),
    ...fueraDelUniverso(constraints),
    ...maximosDeCero(constraints),
  ]
}

/** ¿Hay algo que impida activar? Los avisos no bloquean. */
export function hasBlockingConstraintIssues(
  constraints: readonly PortfolioConstraint[],
): boolean {
  return findConstraintIssues(constraints).some((issue) => issue.severity === 'error')
}

/* ── Comprobaciones ───────────────────────────────────────────────────────── */

function minimosSobreMaximos(
  constraints: readonly PortfolioConstraint[],
): readonly ConstraintIssue[] {
  const issues: ConstraintIssue[] = []
  constraints.forEach((restriccion, indice) => {
    if (!('min' in restriccion)) return
    const { min, max } = restriccion
    if (min === undefined || max === undefined || min <= max) return
    issues.push({
      code: 'min_over_max',
      indices: [indice],
      severity: 'error',
      message: `El mínimo (${porcentaje(min)}) supera al máximo (${porcentaje(max)}): ninguna cartera puede cumplir las dos cosas.`,
    })
  })
  return issues
}

function duplicadas(constraints: readonly PortfolioConstraint[]): readonly ConstraintIssue[] {
  const issues: ConstraintIssue[] = []

  for (const kind of UNA_SOLA) {
    const indices = constraints.flatMap((r, i) => (r.kind === kind ? [i] : []))
    if (indices.length > 1) {
      issues.push({
        code: 'duplicate_singleton',
        indices,
        severity: 'error',
        message: `Hay ${indices.length} restricciones del mismo tipo y solo puede haber una. Quita las que sobren o combínalas.`,
      })
    }
  }

  // Mismo objetivo declarado dos veces: aunque los rangos fueran compatibles,
  // tener dos reglas para lo mismo es una fuente de sorpresas.
  const porObjetivo = new Map<string, number[]>()
  constraints.forEach((restriccion, indice) => {
    const clave =
      restriccion.kind === 'assetWeight'
        ? `activo:${restriccion.instrumentId}`
        : restriccion.kind === 'groupWeight'
          ? `grupo:${restriccion.dimension}:${restriccion.key}`
          : restriccion.kind === 'lockedPosition'
            ? `bloqueado:${restriccion.instrumentId}`
            : null
    if (clave === null) return
    porObjetivo.set(clave, [...(porObjetivo.get(clave) ?? []), indice])
  })

  for (const [clave, indices] of porObjetivo) {
    if (indices.length <= 1) continue
    issues.push({
      code: 'duplicate_target',
      indices,
      severity: 'error',
      message: `Hay ${indices.length} restricciones sobre «${clave.split(':').slice(1).join(' · ')}». Deja una sola con el rango que quieras.`,
    })
  }

  return issues
}

function minimosQueNoCaben(
  constraints: readonly PortfolioConstraint[],
): readonly ConstraintIssue[] {
  const issues: ConstraintIssue[] = []

  // Por dimensión: dentro de una misma dimensión los grupos no se solapan, así
  // que sus mínimos se suman y no pueden pasar de la cartera entera. Entre
  // dimensiones distintas sí se solapan —un fondo tiene sector y divisa a la
  // vez— y sumarlos no significaría nada.
  const porDimension = new Map<ExposureDimension, number[]>()
  constraints.forEach((restriccion, indice) => {
    if (restriccion.kind !== 'groupWeight' || restriccion.min === undefined) return
    porDimension.set(restriccion.dimension, [...(porDimension.get(restriccion.dimension) ?? []), indice])
  })

  for (const [dimension, indices] of porDimension) {
    const suma = indices.reduce((total, indice) => {
      const restriccion = constraints[indice]
      return total + (restriccion !== undefined && 'min' in restriccion ? (restriccion.min ?? 0) : 0)
    }, 0)
    if (suma > 1 + EPS) {
      issues.push({
        code: 'minimums_exceed_whole',
        indices,
        severity: 'error',
        message: `Los mínimos por ${NOMBRE_DIMENSION[dimension]} suman ${porcentaje(suma)}, más que la cartera entera.`,
      })
    }
  }

  // Los mínimos por activo también se suman: cada activo es uno.
  const indicesActivo = constraints.flatMap((r, i) =>
    r.kind === 'assetWeight' && r.min !== undefined ? [i] : [],
  )
  const sumaActivos = indicesActivo.reduce((total, indice) => {
    const restriccion = constraints[indice]
    return total + (restriccion !== undefined && 'min' in restriccion ? (restriccion.min ?? 0) : 0)
  }, 0)
  if (sumaActivos > 1 + EPS) {
    issues.push({
      code: 'minimums_exceed_whole',
      indices: indicesActivo,
      severity: 'error',
      message: `Los mínimos por activo suman ${porcentaje(sumaActivos)}, más que la cartera entera.`,
    })
  }

  return issues
}

function bloqueadoMasLiquidez(
  constraints: readonly PortfolioConstraint[],
): readonly ConstraintIssue[] {
  const bloqueadas = constraints.flatMap((r, i) =>
    r.kind === 'lockedPosition' && r.weight !== undefined ? [{ indice: i, peso: r.weight }] : [],
  )
  const liquidez = constraints.findIndex((r) => r.kind === 'liquidity')
  const restriccionLiquidez = liquidez === -1 ? undefined : constraints[liquidez]
  const minimoLiquido =
    restriccionLiquidez !== undefined && restriccionLiquidez.kind === 'liquidity'
      ? restriccionLiquidez.minimumLiquidWeight
      : 0

  const suma = bloqueadas.reduce((total, b) => total + b.peso, 0) + minimoLiquido
  if (suma <= 1 + EPS) return []

  return [
    {
      code: 'locked_and_liquidity_exceed_whole',
      indices: [...bloqueadas.map((b) => b.indice), ...(liquidez === -1 ? [] : [liquidez])].sort(
        (a, b) => a - b,
      ),
      severity: 'error',
      message: `Lo bloqueado y la liquidez mínima suman ${porcentaje(suma)}: no cabe en la cartera.`,
    },
  ]
}

function fueraDelUniverso(
  constraints: readonly PortfolioConstraint[],
): readonly ConstraintIssue[] {
  const universo = constraints.find((r) => r.kind === 'eligibleUniverse')
  if (universo === undefined || universo.kind !== 'eligibleUniverse') return []
  const permitidos = new Set(universo.instrumentIds)

  const issues: ConstraintIssue[] = []
  constraints.forEach((restriccion, indice) => {
    const instrumento =
      restriccion.kind === 'assetWeight' || restriccion.kind === 'lockedPosition'
        ? restriccion.instrumentId
        : null
    if (instrumento === null || permitidos.has(instrumento)) return
    issues.push({
      code: 'target_outside_universe',
      indices: [indice],
      severity: 'error',
      message: `«${instrumento}» tiene una regla propia pero no está en el universo elegible: la regla nunca se aplicaría.`,
    })
  })
  return issues
}

function maximosDeCero(constraints: readonly PortfolioConstraint[]): readonly ConstraintIssue[] {
  const issues: ConstraintIssue[] = []
  constraints.forEach((restriccion, indice) => {
    if (!('max' in restriccion) || restriccion.max !== 0) return
    issues.push({
      code: 'max_zero_is_exclusion',
      indices: [indice],
      severity: 'warning',
      message:
        'Un máximo del 0 % no es un límite: excluye por completo. Si es lo que quieres, está bien; si no, sube el máximo.',
    })
  })
  return issues
}

/** Los pesos se guardan en fracción y se enseñan en porcentaje. */
function porcentaje(fraccion: number): string {
  return `${Math.round(fraccion * 1000) / 10} %`
}
