/**
 * Escenarios dentro del área Futuro (LAB-107).
 *
 * Aloja la simulación actual —estrés por presets y aportaciones hipotéticas—
 * reutilizando el mismo componente que sirve a `/simular`. Resultados idénticos
 * en ambas rutas porque solo hay una implementación.
 *
 * Los shocks son **escenarios deterministas**: aplican un supuesto y recalculan.
 * No estiman probabilidades ni simulan trayectorias, y esta tarea no añade
 * Monte Carlo.
 */
import { Note } from '../../../components/ui'
import { SimularContenido } from '../../../pages/SimularPage'
import { LabShell } from '../components/LabShell'

export function LabScenariosLegacyPage() {
  return (
    <LabShell routeId="lab.future.scenarios">
      <Note>
        Esta es la versión actual del simulador, ya dentro del Laboratorio. Los shocks son
        escenarios deterministas: aplican un supuesto y recalculan la cartera. No estiman
        probabilidades ni predicen precios.
      </Note>
      <SimularContenido />
    </LabShell>
  )
}
