/**
 * Aviso de que una herramienta se ha mudado al Laboratorio (LAB-108).
 *
 * Solo aparece cuando se ha llegado desde la ruta antigua, y se puede cerrar.
 * Es temporal por diseño: acompaña la mudanza, no se queda para siempre.
 */
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ESTADO_RUTA_ANTIGUA } from './RedireccionLegacy'

export function AvisoMigracion() {
  const location = useLocation()
  const estado = location.state as Record<string, unknown> | null
  const origen = typeof estado?.[ESTADO_RUTA_ANTIGUA] === 'string'
    ? (estado[ESTADO_RUTA_ANTIGUA] as string)
    : null
  const [cerrado, setCerrado] = useState(false)

  if (origen === null || cerrado) return null

  return (
    <div className="note info lab-aviso-migracion" role="status">
      <span>
        Esta herramienta ahora está dentro de Laboratorio. Tu enlace a{' '}
        <code>{origen}</code> sigue funcionando.
      </span>
      <button type="button" className="btn" onClick={() => setCerrado(true)}>
        Entendido
      </button>
    </div>
  )
}
