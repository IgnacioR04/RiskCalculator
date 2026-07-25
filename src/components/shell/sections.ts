/**
 * Las ocho secciones del producto, con su numeración fija (01–08).
 * El orden y los números son parte del sistema visual: el encabezado numerado
 * aparece al principio de cada pantalla.
 */
import type { ComponentType, SVGProps } from 'react'
import {
  IconCalculadora,
  IconCartera,
  IconDiversificacion,
  IconImportar,
  IconPerfil,
  IconResumen,
  IconRiesgo,
  IconSimular,
} from '../icons'

export interface SectionDef {
  num: string
  path: string
  /** Título del encabezado numerado y de la miga. */
  title: string
  /** Etiqueta corta para el rail y la navegación móvil. */
  short: string
  /** Descripción del tooltip del rail. */
  desc: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const SECTIONS: SectionDef[] = [
  {
    num: '01',
    path: '/resumen',
    title: 'Resumen',
    short: 'Resumen',
    desc: 'Cuánto tienes, cómo va y qué conviene revisar.',
    icon: IconResumen,
  },
  {
    num: '02',
    path: '/calculadora',
    title: 'Calculadora',
    short: 'Calcular',
    desc: 'Cuánto aportar para recuperar una posición.',
    icon: IconCalculadora,
  },
  {
    num: '03',
    path: '/cartera',
    title: 'Cartera',
    short: 'Cartera',
    desc: 'Posiciones, operaciones y cuentas.',
    icon: IconCartera,
  },
  {
    num: '04',
    path: '/riesgo',
    title: 'Riesgo',
    short: 'Riesgo',
    desc: 'Volatilidad, correlaciones y contribución al riesgo.',
    icon: IconRiesgo,
  },
  {
    num: '05',
    path: '/diversificacion',
    title: 'Diversificación',
    short: 'Reparto',
    desc: 'Distribución, exposición real y concentración.',
    icon: IconDiversificacion,
  },
  {
    num: '06',
    path: '/simular',
    title: 'Simular',
    short: 'Simular',
    desc: 'Escenarios de estrés y rebalanceo.',
    icon: IconSimular,
  },
  {
    num: '07',
    path: '/importar',
    title: 'Importar',
    short: 'Importar',
    desc: 'Crear o actualizar la cartera con ayuda de una IA.',
    icon: IconImportar,
  },
  {
    num: '08',
    path: '/perfil',
    title: 'Perfil',
    short: 'Perfil',
    desc: 'Perfil de riesgo, preferencias y tus datos.',
    icon: IconPerfil,
  },
]

/** Secciones que aparecen en la navegación inferior del móvil (5 máximo). */
export const MOBILE_SECTIONS = ['/resumen', '/calculadora', '/cartera', '/riesgo', '/perfil']

export function sectionByPath(pathname: string): SectionDef | undefined {
  return SECTIONS.find((s) => pathname.startsWith(s.path))
}
