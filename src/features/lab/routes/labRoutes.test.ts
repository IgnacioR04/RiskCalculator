import { describe, expect, it } from 'vitest'
import { LAB_FEATURES } from '../../../lib/features/flags'
import {
  LAB_LEGACY_REDIRECTS,
  LAB_ROOT_ID,
  LAB_ROUTES,
  LAB_ROUTE_IDS,
  labBreadcrumbs,
  labChildren,
  labPath,
  labRedirectFor,
  labRelativePath,
  labRoutesByArea,
  type LabRouteId,
} from './labRoutes'

/** Tabla de `01-especificacion-producto-ux.md` §3.2, transcrita literalmente. */
const RUTAS_DEL_DOCUMENTO: Readonly<Record<LabRouteId, string>> = {
  'lab.home': '/laboratorio',
  'lab.stability': '/laboratorio/estabilidad',
  'lab.stability.data': '/laboratorio/estabilidad/datos',
  'lab.stability.exposure': '/laboratorio/estabilidad/exposicion',
  'lab.stability.dependence': '/laboratorio/estabilidad/dependencia',
  'lab.stability.risk': '/laboratorio/estabilidad/riesgo',
  'lab.stability.history': '/laboratorio/estabilidad/historico',
  'lab.stability.stress': '/laboratorio/estabilidad/estres',
  'lab.future': '/laboratorio/futuro',
  'lab.future.repair': '/laboratorio/futuro/reparar',
  'lab.future.scenarios': '/laboratorio/futuro/escenarios',
  'lab.future.candidates': '/laboratorio/futuro/candidatas',
  'lab.future.sectors': '/laboratorio/futuro/sectores',
  'lab.future.companies': '/laboratorio/futuro/empresas',
  'lab.runs': '/laboratorio/runs',
  'lab.run': '/laboratorio/runs/:runId',
  'lab.comparison': '/laboratorio/comparaciones/:id',
}

describe('catálogo de rutas', () => {
  it('reproduce exactamente el mapa del documento de producto', () => {
    expect(LAB_ROUTE_IDS).toHaveLength(17)
    for (const id of LAB_ROUTE_IDS) {
      expect(LAB_ROUTES[id].path).toBe(RUTAS_DEL_DOCUMENTO[id])
    }
  })

  it('toda ruta tiene identificador estable y padre, salvo la portada', () => {
    for (const id of LAB_ROUTE_IDS) {
      const ruta = LAB_ROUTES[id]
      expect(ruta.id).toBe(id)
      expect(ruta.label.length).toBeGreaterThan(0)
      expect(ruta.title.length).toBeGreaterThan(0)
      if (id === LAB_ROOT_ID) {
        expect(ruta.parent).toBeNull()
      } else {
        expect(ruta.parent).not.toBeNull()
        expect(LAB_ROUTE_IDS).toContain(ruta.parent)
      }
    }
  })

  it('no hay dos rutas con el mismo path', () => {
    const paths = LAB_ROUTE_IDS.map((id) => LAB_ROUTES[id].path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('el path de cada ruta empieza por el de su padre', () => {
    for (const id of LAB_ROUTE_IDS) {
      const ruta = LAB_ROUTES[id]
      if (ruta.parent === null) continue
      expect(ruta.path.startsWith(`${LAB_ROUTES[ruta.parent].path}/`)).toBe(true)
    }
  })

  it('la capacidad declarada existe en el catálogo de flags', () => {
    for (const id of LAB_ROUTE_IDS) {
      const feature = LAB_ROUTES[id].feature
      if (feature !== undefined) expect(LAB_FEATURES).toHaveProperty(feature)
    }
  })
})

describe('generación de paths', () => {
  it('devuelve el path de una ruta estática', () => {
    expect(labPath('lab.stability.risk')).toBe('/laboratorio/estabilidad/riesgo')
  })

  it('sustituye el parámetro de una ruta dinámica', () => {
    expect(labPath('lab.run', { runId: 'abc123' })).toBe('/laboratorio/runs/abc123')
    expect(labPath('lab.comparison', { id: '42' })).toBe('/laboratorio/comparaciones/42')
  })

  it('escapa un parámetro con caracteres especiales', () => {
    expect(labPath('lab.run', { runId: 'a b/c' })).toBe('/laboratorio/runs/a%20b%2Fc')
  })

  it('falla si falta el parámetro en vez de generar una ruta rota', () => {
    expect(() => labPath('lab.run')).toThrow(/runId/)
    expect(() => labPath('lab.run', { runId: '' })).toThrow(/runId/)
    expect(() => labPath('lab.run', { otro: 'x' })).toThrow(/runId/)
  })

  it('ignora parámetros sobrantes en una ruta estática', () => {
    expect(labPath('lab.home', { runId: 'x' })).toBe('/laboratorio')
  })
})

describe('paths relativos', () => {
  it('la portada es la ruta índice', () => {
    expect(labRelativePath('lab.home')).toBe('')
  })

  it('quitan el prefijo del Laboratorio sin dejar barra inicial', () => {
    expect(labRelativePath('lab.stability')).toBe('estabilidad')
    expect(labRelativePath('lab.stability.risk')).toBe('estabilidad/riesgo')
    expect(labRelativePath('lab.run')).toBe('runs/:runId')
  })

  it('recomponen el path absoluto al anteponer la raíz', () => {
    const raiz = LAB_ROUTES['lab.home'].path
    for (const id of LAB_ROUTE_IDS) {
      const relativo = labRelativePath(id)
      const recompuesto = relativo === '' ? raiz : `${raiz}/${relativo}`
      expect(recompuesto).toBe(LAB_ROUTES[id].path)
    }
  })
})

describe('migas', () => {
  it('van de la portada a la ruta, ambas incluidas', () => {
    expect(labBreadcrumbs('lab.stability.risk').map((r) => r.id)).toEqual([
      'lab.home',
      'lab.stability',
      'lab.stability.risk',
    ])
  })

  it('la portada es una sola miga', () => {
    expect(labBreadcrumbs('lab.home').map((r) => r.id)).toEqual(['lab.home'])
  })

  it('toda ruta produce una cadena que arranca en la portada', () => {
    for (const id of LAB_ROUTE_IDS) {
      const migas = labBreadcrumbs(id)
      expect(migas[0]!.id).toBe(LAB_ROOT_ID)
      expect(migas[migas.length - 1]!.id).toBe(id)
    }
  })
})

describe('jerarquía y áreas', () => {
  it('la portada tiene como hijos las dos áreas y las rutas de resultado', () => {
    expect(labChildren('lab.home').map((r) => r.id)).toEqual([
      'lab.stability',
      'lab.future',
      'lab.runs',
      'lab.run',
      'lab.comparison',
    ])
  })

  it('cada área agrupa su resumen y sus subpantallas', () => {
    expect(labRoutesByArea('estabilidad')).toHaveLength(7)
    expect(labRoutesByArea('futuro')).toHaveLength(6)
    for (const ruta of labRoutesByArea('estabilidad')) {
      expect(ruta.path.startsWith('/laboratorio/estabilidad')).toBe(true)
    }
  })

  it('las rutas de resultado no pertenecen a ningún área', () => {
    expect(LAB_ROUTES['lab.run'].area).toBeNull()
    expect(LAB_ROUTES['lab.comparison'].area).toBeNull()
  })
})

describe('redirecciones de rutas antiguas', () => {
  it('traduce las tres rutas migradas del documento', () => {
    expect(labRedirectFor('/riesgo')).toBe('/laboratorio/estabilidad/riesgo')
    expect(labRedirectFor('/diversificacion')).toBe('/laboratorio/estabilidad/exposicion')
    expect(labRedirectFor('/simular')).toBe('/laboratorio/futuro/escenarios')
  })

  it('devuelve null para una ruta que no se migra', () => {
    for (const path of ['/resumen', '/cartera', '/perfil', '/laboratorio', '/desconocida']) {
      expect(labRedirectFor(path)).toBeNull()
    }
  })

  it('todo destino declarado apunta a una ruta real y estática', () => {
    for (const destino of Object.values(LAB_LEGACY_REDIRECTS)) {
      expect(LAB_ROUTE_IDS).toContain(destino)
      expect(LAB_ROUTES[destino].param).toBeUndefined()
    }
  })
})
