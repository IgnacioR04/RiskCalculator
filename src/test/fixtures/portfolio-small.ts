/**
 * Cartera pequeña dorada (LAB-002).
 *
 * Cuatro posiciones **long-only** sintéticas, con importes elegidos para que
 * pesos, concentración y escenarios de estrés salgan en racionales exactos y se
 * puedan comprobar a mano. No representan una cartera real ni datos de mercado.
 *
 * Derivaciones completas en `docs/lab/golden-fixtures.md`.
 */
import type { StressPosition, StressShocks } from '../../lib/finance/stress'

/**
 * Importes en divisa de presentación (EUR) que suman 10.000, de modo que los
 * pesos son 0,4 · 0,3 · 0,2 · 0,1 exactos.
 *
 * `ACC-US` cotiza en **USD**: es el activo en otra divisa, el único que sufre
 * el shock de tipo de cambio.
 */
export const CARTERA_PEQUENA: StressPosition[] = [
  {
    assetId: 'ACC-EU',
    symbol: 'EUEQ',
    assetType: 'stock',
    quoteCurrency: 'EUR',
    value: 4000,
  },
  {
    assetId: 'ACC-US',
    symbol: 'USEQ',
    assetType: 'stock',
    quoteCurrency: 'USD',
    value: 3000,
  },
  {
    assetId: 'CRIPTO',
    symbol: 'BTC',
    assetType: 'crypto',
    quoteCurrency: 'EUR',
    value: 2000,
  },
  {
    assetId: 'EFECTIVO',
    symbol: 'CASH',
    assetType: 'cash',
    quoteCurrency: 'EUR',
    value: 1000,
  },
]

/** Suma de los importes: 10.000. */
export const TOTAL_CARTERA = 10_000

/** Pesos exactos, en el mismo orden que `CARTERA_PEQUENA`. */
export const PESOS_CARTERA = [0.4, 0.3, 0.2, 0.1] as const

/** HHI = 0,4² + 0,3² + 0,2² + 0,1² = 0,30 exacto. */
export const HHI_CARTERA = 0.3

/** Número efectivo de posiciones = 1/0,30 = 10/3. */
export const POSICIONES_EFECTIVAS_CARTERA = 10 / 3

/** Peso de la mayor posición. */
export const PESO_MAXIMO_CARTERA = 0.4

/* ── Escenario de estrés dorado ───────────────────────────────────────────── */

/**
 * Shocks multiplicativos: −10 % general, −30 % adicional a cripto y +5 % a lo
 * cotizado en divisa distinta de la de presentación.
 */
export const SHOCKS_DORADOS: StressShocks = {
  general: -0.1,
  byType: { crypto: -0.3 },
  fxForeign: 0.05,
  displayCurrency: 'EUR',
}

/**
 * Importes tras el estrés, en el orden de `CARTERA_PEQUENA`:
 *   ACC-EU   4000 · 0,9              = 3600
 *   ACC-US   3000 · 0,9 · 1,05       = 2835
 *   CRIPTO   2000 · 0,9 · 0,7        = 1260
 *   EFECTIVO 1000 · 0,9              =  900
 */
export const VALORES_TRAS_ESTRES = [3600, 2835, 1260, 900] as const

/** Variación de cada posición: 0,9−1 · 0,945−1 · 0,63−1 · 0,9−1. */
export const CAMBIOS_PCT_TRAS_ESTRES = [-0.1, -0.055, -0.37, -0.1] as const

/** Total tras el estrés: 3600+2835+1260+900. */
export const TOTAL_TRAS_ESTRES = 8595

/** Variación total: (8595 − 10000)/10000. */
export const CAMBIO_PCT_TOTAL = -0.1405

/**
 * HHI tras el estrés, exacto:
 *   (3600² + 2835² + 1260² + 900²) / 8595² = 23.394.825 / 73.874.025 = 11.553/36.481
 * Sube respecto a 0,30 porque la posición más pequeña en riesgo (cripto) encoge
 * más que el resto, concentrando la cartera.
 */
export const HHI_TRAS_ESTRES = 11_553 / 36_481

/* ── Aportación hipotética dorada ─────────────────────────────────────────── */

/** Aportación simulada sobre `ACC-US`. No ejecuta ninguna compra. */
export const APORTACION = 2000

/** Peso de `ACC-US` antes: 3000/10000. */
export const PESO_OBJETIVO_ANTES = 0.3

/** Peso de `ACC-US` después: 5000/12000 = 5/12. */
export const PESO_OBJETIVO_DESPUES = 5 / 12

/**
 * HHI tras la aportación, exacto:
 *   (4000² + 5000² + 2000² + 1000²) / 12000² = 46/144 = 23/72
 */
export const HHI_TRAS_APORTACION = 23 / 72
