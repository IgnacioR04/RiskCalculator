/**
 * Contratos de ruta del Laboratorio (LAB-101).
 *
 * Única fuente de verdad de paths, etiquetas, jerarquía y migas. Ninguna
 * pantalla debe escribir `/laboratorio/...` a mano: se pide el path por su
 * identificador, de modo que renombrar un segmento sea un cambio de una línea
 * y no una cacería de cadenas por todo el código.
 *
 * El mapa procede de `01-especificacion-producto-ux.md` §3.2 y §3.3.
 *
 * Los paths **se derivan** de la jerarquía en vez de escribirse enteros: así es
 * imposible que el path de una ruta y su padre se contradigan.
 */
import type { LabFeature } from '../../../lib/features/flags'

/** Identificadores estables. Sobreviven a cualquier cambio de segmento. */
export type LabRouteId =
  | 'lab.home'
  | 'lab.stability'
  | 'lab.stability.data'
  | 'lab.stability.exposure'
  | 'lab.stability.dependence'
  | 'lab.stability.risk'
  | 'lab.stability.history'
  | 'lab.stability.stress'
  | 'lab.future'
  | 'lab.future.repair'
  | 'lab.future.scenarios'
  | 'lab.future.candidates'
  | 'lab.future.sectors'
  | 'lab.future.companies'
  | 'lab.run'
  | 'lab.comparison'

/** Las dos áreas del Laboratorio. `null` en las rutas estructurales. */
export type LabArea = 'estabilidad' | 'futuro'

interface LabRouteDef {
  readonly segment: string
  readonly parent: LabRouteId | null
  /** Etiqueta corta para navegación y migas. */
  readonly label: string
  /** Título de la pantalla. */
  readonly title: string
  readonly area: LabArea | null
  /**
   * Capacidad **adicional** a `labShell` que gobierna la ruta. Todo el
   * Laboratorio está tras `labShell`; esto es lo que se exige además.
   * Ausente = basta con `labShell`.
   */
  readonly feature?: LabFeature
  /** Nombre del parámetro dinámico, si el segmento lo es. */
  readonly param?: string
}

const DEFS = {
  'lab.home': {
    segment: 'laboratorio',
    parent: null,
    label: 'Laboratorio',
    title: 'Laboratorio',
    area: null,
  },

  'lab.stability': {
    segment: 'estabilidad',
    parent: 'lab.home',
    label: 'Estabilidad',
    title: 'Resumen de estabilidad',
    area: 'estabilidad',
  },
  'lab.stability.data': {
    segment: 'datos',
    parent: 'lab.stability',
    label: 'Datos',
    title: 'Calidad y cobertura',
    area: 'estabilidad',
    feature: 'labIpsV2',
  },
  'lab.stability.exposure': {
    segment: 'exposicion',
    parent: 'lab.stability',
    label: 'Exposición',
    title: 'Exposición y concentración',
    area: 'estabilidad',
    feature: 'labLookThrough',
  },
  'lab.stability.dependence': {
    segment: 'dependencia',
    parent: 'lab.stability',
    label: 'Dependencia',
    title: 'Correlaciones, clusters y factores',
    area: 'estabilidad',
    feature: 'labStabilityV2',
  },
  'lab.stability.risk': {
    segment: 'riesgo',
    parent: 'lab.stability',
    label: 'Riesgo',
    title: 'Riesgo total y contribuciones',
    area: 'estabilidad',
    feature: 'labStabilityV2',
  },
  'lab.stability.history': {
    segment: 'historico',
    parent: 'lab.stability',
    label: 'Histórico',
    title: 'Comportamiento por ventanas y regímenes',
    area: 'estabilidad',
    feature: 'labStabilityV2',
  },
  'lab.stability.stress': {
    segment: 'estres',
    parent: 'lab.stability',
    label: 'Estrés',
    title: 'Pruebas de estrés',
    area: 'estabilidad',
    feature: 'labStabilityV2',
  },

  'lab.future': {
    segment: 'futuro',
    parent: 'lab.home',
    label: 'Futuro',
    title: 'Escenarios y decisiones',
    area: 'futuro',
  },
  'lab.future.repair': {
    segment: 'reparar',
    parent: 'lab.future',
    label: 'Reparar',
    title: 'Brechas y acciones de estructura',
    area: 'futuro',
    feature: 'labScenarioEngine',
  },
  'lab.future.scenarios': {
    segment: 'escenarios',
    parent: 'lab.future',
    label: 'Escenarios',
    title: 'Constructor y comparación',
    area: 'futuro',
    feature: 'labScenarioEngine',
  },
  'lab.future.candidates': {
    segment: 'candidatas',
    parent: 'lab.future',
    label: 'Candidatas',
    title: 'Carteras candidatas',
    area: 'futuro',
    feature: 'labCandidates',
  },
  'lab.future.sectors': {
    segment: 'sectores',
    parent: 'lab.future',
    label: 'Sectores',
    title: 'Sectores para investigar',
    area: 'futuro',
    feature: 'labSectorResearch',
  },
  'lab.future.companies': {
    segment: 'empresas',
    parent: 'lab.future',
    label: 'Empresas',
    title: 'Empresas para investigar',
    area: 'futuro',
    feature: 'labCompanyResearch',
  },

  'lab.run': {
    segment: ':runId',
    parent: 'lab.home',
    label: 'Run',
    title: 'Resultado histórico reproducible',
    area: null,
    param: 'runId',
  },
  'lab.comparison': {
    segment: ':id',
    parent: 'lab.home',
    label: 'Comparación',
    title: 'Comparación guardada',
    area: null,
    param: 'id',
  },
} as const satisfies Record<LabRouteId, LabRouteDef>

/**
 * Las rutas de run y comparación cuelgan de la portada, pero llevan un tramo
 * intermedio propio que no es navegable por sí solo.
 */
const TRAMO_INTERMEDIO: Partial<Record<LabRouteId, string>> = {
  'lab.run': 'runs',
  'lab.comparison': 'comparaciones',
}

export interface LabRoute extends LabRouteDef {
  readonly id: LabRouteId
  /** Path absoluto, derivado de la cadena de padres. */
  readonly path: string
}

function construirPath(id: LabRouteId): string {
  const def: LabRouteDef = DEFS[id]
  const intermedio = TRAMO_INTERMEDIO[id]
  const propio = intermedio === undefined ? def.segment : `${intermedio}/${def.segment}`
  if (def.parent === null) return `/${propio}`
  return `${construirPath(def.parent)}/${propio}`
}

export const LAB_ROUTE_IDS = Object.keys(DEFS) as LabRouteId[]

/** Catálogo completo, con el path ya resuelto. */
export const LAB_ROUTES: Readonly<Record<LabRouteId, LabRoute>> = Object.fromEntries(
  LAB_ROUTE_IDS.map((id) => [id, { ...DEFS[id], id, path: construirPath(id) }]),
) as Record<LabRouteId, LabRoute>

/** Raíz del Laboratorio. */
export const LAB_ROOT_ID: LabRouteId = 'lab.home'

/**
 * Path de una ruta. Los parámetros dinámicos son obligatorios: pedir el path de
 * un run sin su identificador es un error de programación, no un caso a
 * degradar en silencio.
 */
export function labPath(id: LabRouteId, params?: Readonly<Record<string, string>>): string {
  const ruta = LAB_ROUTES[id]
  if (ruta.param === undefined) return ruta.path
  const valor = params?.[ruta.param]
  if (valor === undefined || valor === '') {
    throw new Error(`La ruta ${id} necesita el parámetro «${ruta.param}»`)
  }
  return ruta.path.replace(`:${ruta.param}`, encodeURIComponent(valor))
}

/** Cadena de migas desde la portada hasta la ruta, ambas incluidas. */
export function labBreadcrumbs(id: LabRouteId): LabRoute[] {
  const cadena: LabRoute[] = []
  let actual: LabRouteId | null = id
  while (actual !== null) {
    const ruta: LabRoute = LAB_ROUTES[actual]
    cadena.unshift(ruta)
    actual = ruta.parent
  }
  return cadena
}

/** Hijos directos de una ruta, en el orden del catálogo. */
export function labChildren(id: LabRouteId): LabRoute[] {
  return LAB_ROUTE_IDS.map((hijo) => LAB_ROUTES[hijo]).filter((ruta) => ruta.parent === id)
}

/** Rutas de un área, para la subnavegación. */
export function labRoutesByArea(area: LabArea): LabRoute[] {
  return LAB_ROUTE_IDS.map((id) => LAB_ROUTES[id]).filter((ruta) => ruta.area === area)
}

/**
 * Redirecciones desde las rutas actuales (§3.3). Se conservan indefinidamente
 * mientras haya enlaces guardados: romperlas es romper marcadores de usuarios.
 */
export const LAB_LEGACY_REDIRECTS: Readonly<Record<string, LabRouteId>> = {
  '/riesgo': 'lab.stability.risk',
  '/diversificacion': 'lab.stability.exposure',
  '/simular': 'lab.future.scenarios',
}

/** Destino de una ruta antigua, o `null` si no es una ruta migrada. */
export function labRedirectFor(path: string): string | null {
  const destino = LAB_LEGACY_REDIRECTS[path]
  return destino === undefined ? null : labPath(destino)
}
