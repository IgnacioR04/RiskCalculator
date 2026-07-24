/**
 * Escenarios de estrés preconfigurados, coherentes por clase de activo.
 * Son shocks deterministas y realistas (no predicciones): la magnitud se
 * ajusta a cada clase — un índice amplio difícilmente cae como el bitcoin.
 *
 * Los valores son órdenes de magnitud basados en episodios históricos
 * (2008, marzo 2020, inviernos cripto). Editables por el usuario después.
 */
import type { AssetType } from '../domain'

export interface StressPreset {
  id: string
  name: string
  description: string
  /** Shock general aplicado a todo (fracción). */
  general?: number
  /** Shocks por clase (fracción). Se combinan con el general. */
  byType?: Partial<Record<AssetType, number>>
  /** Movimiento de la divisa extranjera frente a la de presentación. */
  fxForeign?: number
}

export const STRESS_PRESETS: StressPreset[] = [
  {
    id: 'correccion',
    name: 'Corrección de mercado',
    description: 'Caída amplia y moderada, como una corrección típica de bolsa (~−10 %).',
    byType: { stock: -0.1, etf: -0.1, index: -0.1, crypto: -0.18, commodity: -0.06 },
  },
  {
    id: 'recesion',
    name: 'Recesión (estilo 2008)',
    description:
      'Recesión profunda: renta variable ~−40 %, cripto ~−65 %, materias primas ~−25 %, efectivo intacto.',
    byType: { stock: -0.4, etf: -0.38, index: -0.38, crypto: -0.65, commodity: -0.25 },
  },
  {
    id: 'covid',
    name: 'Shock rápido (estilo marzo 2020)',
    description: 'Desplome brusco y generalizado en semanas: bolsa ~−30 %, cripto ~−50 %.',
    byType: { stock: -0.3, etf: -0.3, index: -0.3, crypto: -0.5, commodity: -0.2 },
  },
  {
    id: 'cripto-invierno',
    name: 'Invierno cripto',
    description: 'Golpe específico a cripto (~−70 %) con el resto de la cartera casi intacto.',
    byType: { crypto: -0.7, stock: -0.03, etf: -0.03, index: -0.03 },
  },
  {
    id: 'tipos',
    name: 'Subida de tipos',
    description:
      'Subida de tipos de interés: presiona bolsa (~−12 %) y sobre todo activos de larga duración; oro ~−8 %.',
    byType: { stock: -0.12, etf: -0.12, index: -0.12, commodity: -0.08, crypto: -0.2 },
  },
  {
    id: 'euro-fuerte',
    name: 'Euro se fortalece (+10 %)',
    description:
      'El euro sube frente al dólar: tus activos cotizados en USD valen menos al convertirlos.',
    fxForeign: -0.1,
  },
  {
    id: 'rally',
    name: 'Rally alcista',
    description: 'Escenario favorable amplio: bolsa ~+15 %, cripto ~+40 %.',
    byType: { stock: 0.15, etf: 0.15, index: 0.15, crypto: 0.4, commodity: 0.08 },
  },
]
