/**
 * Series históricas doradas (LAB-002).
 *
 * Son series **sintéticas**, no datos de mercado. Están construidas para que
 * todas las magnitudes esperadas se puedan derivar a mano en forma cerrada, sin
 * copiar la salida del código que se está probando.
 *
 * Idea central: con precios que alternan entre 100 y 101, el retorno
 * logarítmico diario vale exactamente ±ln(1,01). Sobre un número par de
 * observaciones la media es cero, de modo que la varianza muestral se reduce a
 * Σr²/(n−1) = n·ln(1,01)²/(n−1) y todas las métricas quedan en forma cerrada.
 *
 * Derivaciones completas en `docs/lab/golden-fixtures.md`.
 */
import type { SeriesPoint } from '../../lib/finance/historical'

/** Retorno logarítmico diario en valor absoluto: ln(101/100). */
export const U = Math.log(1.01)

/** Puntos de precio de las series principales (41 cierres ⇒ 40 retornos). */
export const N_PUNTOS = 41

/** Retornos que produce una serie principal completa. */
export const N_RETORNOS = N_PUNTOS - 1

/** Sesiones bursátiles al año que usa el código por defecto. */
export const DIAS_BURSATILES = 252

/**
 * Fechas consecutivas en UTC desde `2025-01-01`. Se usan días naturales, no
 * sesiones reales de mercado: las funciones bajo prueba no interpretan el
 * calendario y así la serie es trivialmente verificable.
 */
export function fechasConsecutivas(inicio: string, cantidad: number): string[] {
  const base = Date.UTC(
    Number(inicio.slice(0, 4)),
    Number(inicio.slice(5, 7)) - 1,
    Number(inicio.slice(8, 10)),
  )
  const salida: string[] = []
  for (let i = 0; i < cantidad; i++) {
    salida.push(new Date(base + i * 86_400_000).toISOString().slice(0, 10))
  }
  return salida
}

/** Rejilla común: 2025-01-01 … 2025-02-10. */
export const FECHAS = fechasConsecutivas('2025-01-01', N_PUNTOS)

function serie(precios: readonly number[], fechas: readonly string[] = FECHAS): SeriesPoint[] {
  return precios.map((close, i) => ({ date: fechas[i]!, close }))
}

/**
 * Activo A — EUR. Precios 100, 101, 100, 101… (índice par ⇒ 100).
 * Retornos: +U, −U, +U… Con 40 retornos hay 20 de cada signo y media exacta 0.
 */
export const SERIE_ALTERNA: SeriesPoint[] = serie(
  Array.from({ length: N_PUNTOS }, (_, i) => (i % 2 === 0 ? 100 : 101)),
)

/**
 * Activo B — **USD** (el caso «otra divisa»). Precios 202, 200, 202, 200…
 *
 * El cociente 202/200 se redondea al mismo double que 101/100, así que los
 * retornos de B son las mismas dos constantes que los de A con las fases
 * intercambiadas: correlación −1 y covarianza opuesta con error relativo ~1e-15.
 * No es cancelación exacta —ln(1,01) y ln(1/1,01) no son opuestos bit a bit—,
 * de ahí que el caso de cobertura perfecta use `COV_ESPEJO_EXACTA`.
 */
export const SERIE_ESPEJO: SeriesPoint[] = serie(
  Array.from({ length: N_PUNTOS }, (_, i) => (i % 2 === 0 ? 202 : 200)),
)

/**
 * Activo C — EUR, **serie constante**. Todos los retornos son exactamente 0:
 * volatilidad 0, y las métricas que dividen por ella deben degradar de forma
 * explícita en lugar de devolver un número sin sentido.
 */
export const SERIE_CONSTANTE: SeriesPoint[] = serie(
  Array.from({ length: N_PUNTOS }, () => 50),
)

/** Índices de la rejilla que se eliminan para construir el caso con huecos. */
export const INDICES_AUSENTES = [10, 11, 12, 13, 14, 15] as const

/**
 * Activo D — EUR, **fechas ausentes**. Es A sin seis días intermedios.
 * Sirve para comprobar que la alineación intersecta fechas y nunca rellena
 * huecos en silencio: al cruzarla con A quedan 34 retornos comunes, no 40.
 */
export const SERIE_CON_HUECOS: SeriesPoint[] = SERIE_ALTERNA.filter(
  (_, i) => !INDICES_AUSENTES.includes(i as (typeof INDICES_AUSENTES)[number]),
)

/**
 * Retornos comunes entre A y D tras intersectar fechas.
 *
 * Sobreviven los índices 0–9 y 16–40, es decir 35 cierres, que generan 34
 * retornos: uno por cada índice superviviente salvo el primero (9 en el tramo
 * 1–9 y 25 en el tramo 16–40). El retorno que salva el hueco está fechado en el
 * índice 16 y ya va incluido en ese segundo tramo, no suma aparte.
 */
export const N_RETORNOS_COMUNES = 34

/**
 * Activo E — EUR, **muestra insuficiente**: 21 cierres ⇒ 20 retornos, por
 * debajo del mínimo de 30 que exige el módulo para publicar una métrica.
 */
export const SERIE_CORTA: SeriesPoint[] = serie(
  Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? 100 : 101)),
  FECHAS.slice(0, 21),
)

/* ── Valores dorados en forma cerrada ─────────────────────────────────────── */

/**
 * Volatilidad anualizada de A y de B.
 * σ = √(Σr²/(n−1))·√252 = ln(1,01)·√(252·n/(n−1)) con n = 40.
 */
export const VOL_ANUAL_ALTERNA = U * Math.sqrt((DIAS_BURSATILES * N_RETORNOS) / (N_RETORNOS - 1))

/** Valor decimal documentado de `VOL_ANUAL_ALTERNA`, para detectar transcripciones erróneas. */
export const VOL_ANUAL_ALTERNA_DOC = 0.1599689

/**
 * Varianza anualizada de A: es exactamente σ², y también el elemento diagonal
 * de la matriz de covarianzas anualizada.
 */
export const VAR_ANUAL_ALTERNA = VOL_ANUAL_ALTERNA * VOL_ANUAL_ALTERNA

/**
 * Drawdown máximo de A: cae de 101 a 100 ⇒ 100/101 − 1 = −1/101.
 * Es exacto y racional, independiente de la longitud de la serie.
 */
export const MAX_DRAWDOWN_ALTERNA = -1 / 101

/* ── Cartera de dos activos usada para riesgo y diversificación ───────────── */

/**
 * Pesos 0,75 en A y 0,25 en B (espejo exacto de A). Con Σ = s·[[1,−1],[−1,1]]:
 *   σ² = w'Σw = (0,75² + 0,25² − 2·0,75·0,25)·s = 0,25·s  ⇒  σ = 0,5·√s
 * Todas las magnitudes derivadas quedan en racionales exactos, independientes
 * del valor concreto de s.
 */
export const PESOS_ESPEJO = [0.75, 0.25] as const

/** σ de la cartera espejo: la mitad de la volatilidad de un activo suelto. */
export const VOL_CARTERA_ESPEJO = 0.5 * VOL_ANUAL_ALTERNA

/** Contribuciones porcentuales al riesgo: +150 % de A y −50 % de B (cobertura). */
export const CONTRIBUCIONES_PCT_ESPEJO = [1.5, -0.5] as const

/** Ratio de diversificación: (0,75+0,25)·√s / (0,5·√s) = 2, exacto. */
export const RATIO_DIVERSIFICACION_ESPEJO = 2

/** Reducción de volatilidad: 1 − 1/2. */
export const REDUCCION_VOL_ESPEJO = 0.5

/** Correlación media implícita despejada: exactamente −1. */
export const CORRELACION_MEDIA_ESPEJO = -1

/**
 * Matriz de covarianzas del par espejo, **construida a mano** en vez de
 * calculada desde los retornos.
 *
 * Importa para el caso de cobertura perfecta (pesos 0,5/0,5): con esta matriz,
 * `s + (−s)` cancela de forma exacta en binario y la varianza sale 0 sin
 * depender del residuo de coma flotante que arrastran las series calculadas
 * (del orden de 1e-17 y de signo arbitrario). Es el fixture el que fija la
 * especificación, no un artefacto del cálculo.
 */
export const COV_ESPEJO_EXACTA: number[][] = [
  [VAR_ANUAL_ALTERNA, -VAR_ANUAL_ALTERNA],
  [-VAR_ANUAL_ALTERNA, VAR_ANUAL_ALTERNA],
]

/**
 * Matriz de dos activos **independientes** con la misma volatilidad, también
 * construida a mano. Sirve de control positivo: aquí todas las contribuciones
 * al riesgo son positivas, así que las métricas que el caso espejo deja sin
 * definir sí deben calcularse.
 */
export const COV_INDEPENDIENTE_EXACTA: number[][] = [
  [VAR_ANUAL_ALTERNA, 0],
  [0, VAR_ANUAL_ALTERNA],
]

/** Pesos iguales para el caso independiente. */
export const PESOS_IGUALES = [0.5, 0.5] as const

/** σ = √(0,5·s) = σ_activo/√2. */
export const VOL_CARTERA_INDEPENDIENTE = VOL_ANUAL_ALTERNA / Math.SQRT2

/** Cada activo aporta exactamente la mitad del riesgo. */
export const CONTRIBUCIONES_PCT_INDEPENDIENTE = [0.5, 0.5] as const

/** DR = (0,5+0,5)·√s / √(0,5·s) = √2. */
export const RATIO_DIVERSIFICACION_INDEPENDIENTE = Math.SQRT2

/** Correlación media implícita: exactamente 0 (los términos cruzados se anulan). */
export const CORRELACION_MEDIA_INDEPENDIENTE = 0

/**
 * Apuestas efectivas: entropía de dos contribuciones iguales,
 * exp(−2·0,5·ln 0,5) = exp(ln 2) = 2 exacto.
 */
export const APUESTAS_EFECTIVAS_INDEPENDIENTE = 2
