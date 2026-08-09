/**
 * Riesgo dentro de Estabilidad (LAB-105).
 *
 * Reutiliza el contenido de la pantalla 04 **sin copiar nada**: importa el
 * mismo componente que sigue sirviendo a `/riesgo`. La paridad numérica es por
 * construcción, no por comparación, porque solo existe una implementación.
 *
 * Se etiqueta como versión actual: es la pantalla de hoy vista desde su sitio
 * definitivo, no la reescritura que traerá la Fase 3.
 */
import { Note } from '../../../components/ui'
import { RiesgoContenido } from '../../../pages/RiesgoPage'
import { LabShell } from '../components/LabShell'

export function LabRiskLegacyPage() {
  return (
    <LabShell routeId="lab.stability.risk">
      <Note>
        Esta es la versión actual del análisis de riesgo, ya dentro del Laboratorio. Sus
        cifras son exactamente las mismas que en la sección Riesgo: no hay dos cálculos.
      </Note>
      <RiesgoContenido />
    </LabShell>
  )
}
