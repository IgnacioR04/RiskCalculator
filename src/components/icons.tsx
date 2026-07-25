/**
 * Iconografía lineal (1,5 px, sin relleno, `stroke: currentColor`) según el
 * handoff. Set propio mínimo con la forma de Lucide para no añadir dependencia.
 * El tamaño lo fija el CSS del contenedor (rail 15 px, nav móvil 16 px).
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg(props: IconProps & { children: React.ReactNode }) {
  const { children, ...rest } = props
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  )
}

/** 01 Resumen */
export const IconResumen = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Svg>
)

/** 02 Calculadora */
export const IconCalculadora = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" y1="6" x2="16" y2="6" />
    <line x1="8" y1="11" x2="10" y2="11" />
    <line x1="14" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="10" y2="15" />
    <line x1="14" y1="15" x2="16" y2="15" />
    <line x1="8" y1="19" x2="16" y2="19" />
  </Svg>
)

/** 03 Cartera */
export const IconCartera = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="6" width="20" height="14" rx="2" />
    <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <line x1="2" y1="12" x2="22" y2="12" />
  </Svg>
)

/** 04 Riesgo */
export const IconRiesgo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2 4 5.5v6c0 4.5 3.2 8.6 8 10.5 4.8-1.9 8-6 8-10.5v-6L12 2Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="16.5" x2="12" y2="16.6" />
  </Svg>
)

/** 05 Diversificación */
export const IconDiversificacion = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
    <path d="M15.5 2.5A9 9 0 0 1 21.5 8.5H15.5V2.5Z" />
  </Svg>
)

/** 06 Simular */
export const IconSimular = (p: IconProps) => (
  <Svg {...p}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <circle cx="9" cy="6" r="2.2" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <circle cx="16" cy="12" r="2.2" />
    <line x1="4" y1="18" x2="20" y2="18" />
    <circle cx="11" cy="18" r="2.2" />
  </Svg>
)

/** 07 Importar */
export const IconImportar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 9 12 4 17 9" />
    <line x1="12" y1="4" x2="12" y2="16" />
  </Svg>
)

/** 08 Perfil */
export const IconPerfil = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </Svg>
)

export const IconBuscar = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </Svg>
)
