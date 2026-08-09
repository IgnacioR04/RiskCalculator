/**
 * Exposición dentro de Estabilidad (LAB-106).
 *
 * Reutiliza el contenido de la pantalla 05 Diversificación **sin copiar nada**:
 * importa el mismo componente que sirve a `/diversificacion`. Ningún cálculo
 * queda duplicado, así que distribución, concentración y solapamientos no
 * pueden divergir entre las dos rutas.
 *
 * El documento de producto mapea Diversificación a **Exposición** dentro del
 * área de Estabilidad; el nombre de la ruta ya lo refleja.
 */
import { Note } from '../../../components/ui'
import { DiversificacionContenido } from '../../../pages/DiversificacionPage'
import { LabShell } from '../components/LabShell'

export function LabExposureLegacyPage() {
  return (
    <LabShell routeId="lab.stability.exposure">
      <Note>
        Esta es la versión actual del reparto de la cartera, ya dentro del Laboratorio. Sus
        cifras son exactamente las mismas que en la sección Diversificación: no hay dos
        cálculos.
      </Note>
      <DiversificacionContenido />
    </LabShell>
  )
}
