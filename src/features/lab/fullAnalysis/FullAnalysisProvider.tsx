/**
 * Contexto del análisis automático (LAB-1208).
 *
 * El análisis tiene que **arrancar sin visitar el Laboratorio** y sus resultados
 * tienen que verse **dentro** del Laboratorio. Son dos requisitos que tiran en
 * direcciones opuestas: montar el hook en la portada del Laboratorio incumple el
 * primero, y montarlo en la shell sin más deja los informes fuera del alcance de
 * las pantallas.
 *
 * Un contexto resuelve las dos: el proveedor vive en la shell —así el análisis
 * empieza al abrir la aplicación, esté donde esté el usuario— y cualquier
 * pantalla lee el mismo estado sin volver a calcularlo.
 *
 * Montar el hook dos veces sería la alternativa obvia y la peor: dos colas, dos
 * rondas de descargas y dos informes que pueden discrepar.
 */
import { createContext, useContext, type ReactNode } from 'react'
import type { PortfolioHealthReport } from '../../../lib/lab/fullAnalysis/contracts'
import { useFullAnalysis, type FullAnalysisState } from './useFullAnalysis'

const VACIO: FullAnalysisState = {
  fingerprint: '',
  structuralFingerprint: '',
  valuationVersion: '',
  reports: new Map<string, PortfolioHealthReport>(),
  running: false,
  failures: new Map<string, string>(),
}

const Contexto = createContext<FullAnalysisState>(VACIO)

export function FullAnalysisProvider(props: { children: ReactNode }) {
  const estado = useFullAnalysis()
  return <Contexto.Provider value={estado}>{props.children}</Contexto.Provider>
}

/**
 * Estado del análisis para cualquier pantalla.
 *
 * Fuera del proveedor devuelve el estado vacío en vez de lanzar: una pantalla
 * montada en una prueba aislada no debería reventar por no tener alrededor una
 * pieza que solo existe para orquestar.
 */
export function useFullAnalysisContext(): FullAnalysisState {
  return useContext(Contexto)
}

/** Informe de la cartera consolidada, si ya hay alguno. */
export function useConsolidatedReport(): PortfolioHealthReport | undefined {
  return useFullAnalysisContext().reports.get('portfolio')
}
