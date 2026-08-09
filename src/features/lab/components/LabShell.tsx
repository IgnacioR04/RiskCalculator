/**
 * Shell del Laboratorio (LAB-102).
 *
 * Estructura de `01-especificacion-producto-ux.md` §4: cabecera de contexto,
 * selector de área, navegación secundaria y contenido.
 *
 * Las dos áreas y las subpantallas son **rutas**, no pestañas que abren y
 * cierran paneles. Por eso se navegan con enlaces marcados con
 * `aria-current="page"` y no con `role="tab"`: un lector de pantalla debe
 * anunciar «enlace, página actual», no prometer un `tabpanel` que aquí no
 * existe. La apariencia de segmentos la da el CSS.
 */
import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  LAB_ROUTES,
  labBreadcrumbs,
  labPath,
  labRoutesByArea,
  type LabArea,
  type LabRouteId,
} from '../routes/labRoutes'
import { LabContextHeader, type LabContextHeaderProps } from './LabContextHeader'

interface AreaDef {
  readonly id: LabRouteId
  readonly area: LabArea
  readonly titulo: string
  readonly subtitulo: string
}

/** Nombres de cara al usuario, tomados de §4.3. */
const AREAS: readonly AreaDef[] = [
  {
    id: 'lab.stability',
    area: 'estabilidad',
    titulo: 'Estabilidad',
    subtitulo: 'Presente y pasado',
  },
  {
    id: 'lab.future',
    area: 'futuro',
    titulo: 'Escenarios y oportunidades',
    subtitulo: 'Futuros posibles',
  },
]

export interface LabShellProps extends LabContextHeaderProps {
  /** Ruta que se está mostrando. Gobierna migas, área activa y subnavegación. */
  readonly routeId: LabRouteId
  readonly children?: ReactNode
}

export function LabShell(props: LabShellProps) {
  const navigate = useNavigate()
  // El resto de props es exactamente `LabContextHeaderProps`. Se propaga tal
  // cual en vez de campo a campo: con `exactOptionalPropertyTypes` activo,
  // pasar `context={props.context}` inyectaría un `undefined` explícito, que no
  // es lo mismo que omitir la prop.
  const { routeId, children, ...propsDeContexto } = props
  const rutaActual = LAB_ROUTES[routeId]
  const areaActual = rutaActual.area
  const migas = labBreadcrumbs(routeId)
  const subrutas = areaActual === null ? [] : labRoutesByArea(areaActual)

  return (
    <div className="lab-shell">
      <nav className="lab-migas" aria-label="Ruta">
        <ol>
          {migas.map((ruta, indice) => {
            const esUltima = indice === migas.length - 1
            return (
              <li key={ruta.id}>
                {esUltima ? (
                  <span aria-current="page">{ruta.label}</span>
                ) : (
                  <Link to={labPath(ruta.id)}>{ruta.label}</Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <LabContextHeader {...propsDeContexto} />

      <nav className="lab-areas" aria-label="Áreas del Laboratorio">
        {AREAS.map((area) => (
          <NavLink
            key={area.id}
            to={labPath(area.id)}
            className={areaActual === area.area ? 'lab-area lab-area--activa' : 'lab-area'}
            aria-current={areaActual === area.area ? 'page' : undefined}
          >
            <span className="lab-area__titulo">{area.titulo}</span>
            <span className="lab-area__subtitulo">{area.subtitulo}</span>
          </NavLink>
        ))}
      </nav>

      {subrutas.length > 0 && areaActual !== null && (
        <nav className="lab-subnav" aria-label={`Secciones de ${etiquetaArea(areaActual)}`}>
          {/* Escritorio: la tira completa. */}
          <ul className="lab-subnav__lista">
            {subrutas.map((ruta) => (
              <li key={ruta.id}>
                <NavLink
                  to={labPath(ruta.id)}
                  end
                  className={routeId === ruta.id ? 'lab-subnav__enlace activo' : 'lab-subnav__enlace'}
                  aria-current={routeId === ruta.id ? 'page' : undefined}
                >
                  {ruta.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Móvil: un desplegable, no una tira horizontal interminable (§4.3). */}
          <label className="lab-subnav__selector">
            <span className="sr-only">Sección de {etiquetaArea(areaActual)}</span>
            <select
              value={routeId}
              onChange={(evento) => navigate(labPath(evento.target.value as LabRouteId))}
            >
              {subrutas.map((ruta) => (
                <option key={ruta.id} value={ruta.id}>
                  {ruta.label}
                </option>
              ))}
            </select>
          </label>
        </nav>
      )}

      <main className="lab-contenido" aria-label={rutaActual.title}>
        <h1>{rutaActual.title}</h1>
        {children}
      </main>
    </div>
  )
}

function etiquetaArea(area: LabArea): string {
  return AREAS.find((a) => a.area === area)?.titulo ?? area
}
