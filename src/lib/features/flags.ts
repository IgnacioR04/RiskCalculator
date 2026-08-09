/**
 * Feature flags del Laboratorio (LAB-006).
 *
 * Permiten fusionar capacidades a `main` sin exponerlas todavía, que es lo que
 * hace posible avanzar por fases sin ramas de larga vida.
 *
 * **Esto no es un control de acceso.** Una flag decide si se *muestra* algo,
 * nunca si se *permite*. Vive en el bundle, así que cualquiera puede activarla
 * en su navegador. Todo lo que necesite autorización real —datos privados,
 * proxies con clave, escrituras— debe verificarse otra vez en Supabase con RLS
 * o dentro de la Edge Function. Ver `docs/adr/ADR-001-lab-architecture.md`.
 */

export interface LabFeatureMeta {
  /** Fase del plan que introduce la capacidad. */
  readonly phase: number
  /**
   * Puerta tras la cual la flag deja de tener sentido y debe retirarse.
   * Se ata a una puerta en vez de a una fecha porque el plan avanza por
   * puertas: una fecha inventada solo generaría deuda silenciosa.
   */
  readonly retireAfter: string
  readonly description: string
}

/**
 * Catálogo cerrado de flags, tomado de `03-arquitectura-sistema-infraestructura-ci-cd.md` §15.
 * Añadir una capacidad nueva exige añadirla aquí: no hay flags implícitas.
 */
export const LAB_FEATURES = {
  labShell: {
    phase: 1,
    retireAfter: 'G1',
    description: 'Shell y navegación del Laboratorio.',
  },
  labIpsV2: {
    phase: 2,
    retireAfter: 'G2',
    description: 'Política de inversión versionada: objetivos, horizonte, capacidad y restricciones.',
  },
  labStabilityV2: {
    phase: 3,
    retireAfter: 'G3',
    description: 'Motor de estabilidad refactorizado, con paridad demostrada.',
  },
  labLookThrough: {
    phase: 4,
    retireAfter: 'G4',
    description: 'Exposición real mirando dentro de los fondos.',
  },
  labScenarioEngine: {
    phase: 5,
    retireAfter: 'G5',
    description: 'Escenarios históricos e hipotéticos.',
  },
  labCandidates: {
    phase: 6,
    retireAfter: 'G6',
    description: 'Carteras candidatas bajo restricciones.',
  },
  labSectorResearch: {
    phase: 7,
    retireAfter: 'G7',
    description: 'Sectores priorizados para investigar.',
  },
  labCompanyResearch: {
    phase: 8,
    retireAfter: 'G8',
    description: 'Empresas para investigar. Bloqueada por defecto en el plan.',
  },
  labNarrativeExplanation: {
    phase: 9,
    retireAfter: 'G9',
    description: 'Explicaciones en lenguaje llano sobre resultados ya calculados.',
  },
} as const satisfies Record<string, LabFeatureMeta>

export type LabFeature = keyof typeof LAB_FEATURES

/** Variable pública que activa flags. Lista separada por comas. */
export const FLAGS_ENV_VAR = 'VITE_LAB_FLAGS'

export interface FlagResolution {
  /** Flags reconocidas y activadas. */
  readonly enabled: ReadonlySet<LabFeature>
  /**
   * Entradas que no corresponden a ninguna flag del catálogo. Se conservan para
   * poder avisar de una errata, nunca para activar nada.
   */
  readonly unknown: readonly string[]
}

/** Comprueba si un texto arbitrario nombra una flag del catálogo. */
export function isLabFeature(value: string): value is LabFeature {
  return Object.prototype.hasOwnProperty.call(LAB_FEATURES, value)
}

/**
 * Interpreta el valor de la variable de entorno.
 *
 * El default es **todo desactivado**: ausencia, cadena vacía o valor ilegible
 * dejan el Laboratorio oculto. Una entrada desconocida no activa nada; se
 * devuelve en `unknown` para poder señalarla.
 *
 * La comparación es exacta y sensible a mayúsculas: `LABSHELL` no activa
 * `labShell`. Adivinar la intención sería justo lo contrario de un default
 * seguro.
 */
export function parseLabFlags(raw: string | undefined | null): FlagResolution {
  const enabled = new Set<LabFeature>()
  const unknown: string[] = []

  if (typeof raw !== 'string') return { enabled, unknown }

  for (const entrada of raw.split(',')) {
    const nombre = entrada.trim()
    if (nombre === '') continue
    if (isLabFeature(nombre)) {
      enabled.add(nombre)
    } else if (!unknown.includes(nombre)) {
      unknown.push(nombre)
    }
  }

  return { enabled, unknown }
}

/**
 * ¿Debe mostrarse esta capacidad?
 *
 * `raw` existe para poder probar la función sin tocar el entorno; en la
 * aplicación se omite y se lee la variable pública.
 */
export function isFeatureEnabled(feature: LabFeature, raw?: string | undefined): boolean {
  const valor = raw === undefined ? import.meta.env.VITE_LAB_FLAGS : raw
  return parseLabFlags(valor).enabled.has(feature)
}
