/**
 * Redirección de una ruta antigua a su sitio en el Laboratorio (LAB-108).
 *
 * Preserva la cadena de consulta y marca el origen para poder avisar de la
 * mudanza una sola vez. Usa `replace` para no dejar la ruta vieja en el
 * historial: sin eso, volver atrás rebotaría de nuevo a la nueva y el usuario
 * quedaría atrapado en un bucle.
 */
import { Navigate, useLocation } from 'react-router-dom'
import { labPath, type LabRouteId } from '../routes/labRoutes'

/** Clave del estado de navegación que indica que se llegó por una ruta vieja. */
export const ESTADO_RUTA_ANTIGUA = 'desdeRutaAntigua'

export function RedireccionLegacy(props: { destino: LabRouteId }) {
  const location = useLocation()
  return (
    <Navigate
      to={{ pathname: labPath(props.destino), search: location.search }}
      replace
      state={{ [ESTADO_RUTA_ANTIGUA]: location.pathname }}
    />
  )
}
