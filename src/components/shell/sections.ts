/**
 * Las ocho secciones del producto, con su numeración fija (01–08).
 * El orden y los números son parte del sistema visual: el encabezado numerado
 * aparece al principio de cada pantalla.
 */
import type { ComponentType, SVGProps } from 'react'
import type { LabFeature } from '../../lib/features/flags'
import {
  IconCalculadora,
  IconCartera,
  IconDiversificacion,
  IconImportar,
  IconLaboratorio,
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
  /**
   * Capacidad que debe estar activa para mostrar el destino. Ausente ⇒ siempre
   * visible. Es visibilidad, no permiso.
   */
  feature?: LabFeature
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
  /*
   * El Laboratorio entra al final y no tras Cartera, aunque el documento de
   * producto lo situé ahí: renumerar 04–08 ahora rompería el encabezado
   * numerado de cinco pantallas por un orden que va a cambiar igualmente.
   * Cuando LAB-105 a LAB-107 absorban Riesgo, Diversificación y Simular dentro
   * del Laboratorio, la numeración se rehace de una vez y sin churn.
   */
  {
    num: '09',
    path: '/laboratorio',
    title: 'Laboratorio',
    short: 'Lab',
    desc: 'Estabilidad de la cartera, escenarios y oportunidades.',
    icon: IconLaboratorio,
    feature: 'labShell',
  },
]

/**
 * Secciones de la navegación inferior del móvil (5 máximo), según §3.1 del
 * documento de producto. El Laboratorio sustituye a Riesgo, que pasa a vivir
 * dentro de él; Riesgo sigue accesible desde el rail, el menú «Más» y su URL.
 */
export const MOBILE_SECTIONS = ['/resumen', '/calculadora', '/cartera', '/laboratorio', '/perfil']

export function sectionByPath(pathname: string): SectionDef | undefined {
  return SECTIONS.find((s) => pathname.startsWith(s.path))
}
