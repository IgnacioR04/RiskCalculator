/**
 * Catálogo de códigos de razón (LAB-902).
 *
 * Siete fases han ido acumulando motivos por los que la aplicación **no puede
 * decir algo**: sin muestra, sin cobertura, sin solución, ambiguo, no
 * convergido, sin licencia. Cada motor tiene los suyos y cada uno los llamaba a
 * su manera.
 *
 * Este catálogo los reúne para que la interfaz no tenga que traducir cada uno
 * en cada pantalla, y sobre todo para que **ninguno se muestre en crudo**.
 *
 * ## La regla que gobierna el módulo
 *
 * **Un código desconocido se muestra de forma segura y se monitoriza.** Es el
 * criterio de aceptación de LAB-902.
 *
 * «De forma segura» no significa esconderlo: significa decir que ha pasado algo
 * que no se sabe explicar, en vez de imprimir `insufficient_downside_sample` en
 * la cara del usuario o —peor— de no mostrar nada y dejar el hueco.
 *
 * ## Por qué son estables
 *
 * Un código es parte del contrato: viaja en resultados guardados y en registros.
 * Cambiar `insufficient_sample` por `sin_muestra` rompería la lectura de todo lo
 * guardado antes. El texto en español sí puede cambiar; el código, no.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */

export const REASON_CATALOG_VERSION = 'reason-codes-v1'

/** En qué familia cae el motivo. Determina cómo se presenta. */
export type ReasonSeverity =
  /** No se puede continuar. Hay que cambiar algo. */
  | 'blocking'
  /** Se puede continuar, pero el resultado está incompleto. */
  | 'warning'
  /** Solo informa. */
  | 'info'

export interface ReasonEntry {
  readonly code: string
  readonly severity: ReasonSeverity
  /** Qué ha pasado, en lenguaje llano. */
  readonly text: string
  /** Qué hacer, cuando hay algo que hacer. */
  readonly remediation?: string
  /** De qué parte del Laboratorio viene. Para poder rastrearlo. */
  readonly origin: string
}

/**
 * El catálogo.
 *
 * Se escribe a mano y no se genera: eso obliga a que añadir un motivo nuevo sea
 * un acto consciente, y la prueba de exhaustividad avisa cuando un motor
 * introduce uno que no está aquí.
 */
export const REASON_CODES: readonly ReasonEntry[] = [
  /* ── Muestra y datos ────────────────────────────────────────────────── */
  {
    code: 'insufficient_sample',
    severity: 'blocking',
    text: 'No hay bastantes observaciones para calcular esto sin inventar.',
    remediation: 'Espera a acumular más historial, o amplía el periodo si la aplicación lo permite.',
    origin: 'estabilidad, dependencia, sectores',
  },
  {
    code: 'insufficient_history',
    severity: 'blocking',
    text: 'La serie no llega a cubrir el periodo que exige el cálculo.',
    remediation: 'Hace falta más historial del que hay disponible.',
    origin: 'señales sectoriales',
  },
  {
    code: 'insufficient_downside_sample',
    severity: 'warning',
    text: 'Hay datos de sobra en total, pero no bastantes días de caída para medir qué pasa en ellos.',
    remediation: 'Prueba con un periodo más largo.',
    origin: 'dependencia',
  },
  {
    code: 'no_overlap',
    severity: 'warning',
    text: 'Las dos series no tienen ni un día en común, así que no se pueden comparar.',
    origin: 'dependencia',
  },
  {
    code: 'constant_series',
    severity: 'warning',
    text: 'La serie no oscila, así que no se puede dividir por su volatilidad.',
    origin: 'dependencia, señales sectoriales',
  },
  {
    code: 'invalid_price',
    severity: 'warning',
    text: 'Alguno de los precios usados no es utilizable, así que el cálculo no se hace.',
    origin: 'señales sectoriales',
  },
  {
    code: 'empty_history',
    severity: 'blocking',
    text: 'No hay historial sobre el que simular.',
    origin: 'escenarios',
  },

  /* ── Cobertura y clasificación ──────────────────────────────────────── */
  {
    code: 'dimension_unknown',
    severity: 'blocking',
    text: 'Ninguno de tus activos declara esa dimensión, así que la regla no se puede comprobar.',
    remediation: 'Rellena esa dimensión en tus activos, o quita la restricción: mientras no se pueda comprobar, no rige.',
    origin: 'restricciones',
  },
  {
    code: 'empty_group',
    severity: 'warning',
    text: 'No tienes nada de ese grupo, así que la regla no limita nada.',
    origin: 'restricciones',
  },
  {
    code: 'instrument_not_found',
    severity: 'warning',
    text: 'Ese activo ya no está en tu cartera.',
    remediation: 'Revisa la política y quita la restricción si sobra.',
    origin: 'restricciones',
  },
  {
    code: 'ambiguous_symbol',
    severity: 'warning',
    text: 'Ese símbolo coincide con más de un instrumento de tu cartera, así que no se ha asignado a ninguno.',
    remediation: 'Añade el ISIN o el mercado a esos activos y el reparto se resolverá solo.',
    origin: 'exposición',
  },
  {
    code: 'no_composition',
    severity: 'warning',
    text: 'Ese fondo no declara qué lleva dentro, así que su valor cuenta como no mirado.',
    remediation: 'Anota sus mayores posiciones desde la web del emisor.',
    origin: 'exposición',
  },

  /* ── Restricciones y optimización ───────────────────────────────────── */
  {
    code: 'LAB_CONSTRAINTS_INFEASIBLE',
    severity: 'blocking',
    text: 'Tus reglas no admiten ninguna cartera. No es que no se encuentre: es que no existe.',
    remediation: 'Afloja alguna de las reglas que se contradicen.',
    origin: 'candidatas',
  },
  {
    code: 'LAB_EMPTY_UNIVERSE',
    severity: 'blocking',
    text: 'No hay instrumentos sobre los que construir una cartera.',
    origin: 'candidatas',
  },
  {
    code: 'LAB_COVARIANCE_UNAVAILABLE',
    severity: 'warning',
    text: 'Falta historial para estimar el riesgo. Solo se puede repartir a partes iguales.',
    origin: 'candidatas',
  },
  {
    code: 'max_iterations',
    severity: 'blocking',
    text: 'El optimizador no ha convergido, así que no se devuelven pesos a medio calcular.',
    origin: 'candidatas',
  },
  {
    code: 'infeasible',
    severity: 'blocking',
    text: 'Los límites no admiten ninguna cartera que sume el 100 %.',
    origin: 'candidatas',
  },
  {
    code: 'invalid_input',
    severity: 'blocking',
    text: 'Los datos de entrada no permiten ni empezar el cálculo.',
    origin: 'candidatas, escenarios',
  },

  /* ── Comparación y reproducibilidad ─────────────────────────────────── */
  {
    code: 'different_definition',
    severity: 'blocking',
    text: 'Son escenarios distintos: no miden lo mismo, así que no se comparan.',
    origin: 'escenarios',
  },
  {
    code: 'different_version',
    severity: 'blocking',
    text: 'Es el mismo escenario pero la definición cambió entre las dos ejecuciones. La diferencia sería de los supuestos, no del mercado.',
    origin: 'escenarios',
  },
  {
    code: 'not_reproducible',
    severity: 'blocking',
    text: 'A ese resultado le falta la versión del modelo o la fecha de los datos, así que no se puede explicar.',
    origin: 'registro de cálculos',
  },
  {
    code: 'quota_exceeded',
    severity: 'warning',
    text: 'No cabe más en el almacenamiento del navegador.',
    remediation: 'Borra cálculos antiguos.',
    origin: 'registro de cálculos',
  },

  /* ── Gobierno de modelos ────────────────────────────────────────────── */
  {
    code: 'model_not_published',
    severity: 'info',
    text: 'Esa señal está construida pero no publicada: su hipótesis no se ha podido validar con los datos disponibles.',
    origin: 'sectores',
  },
  {
    code: 'excluded_instrument',
    severity: 'warning',
    text: 'Ese instrumento no puede representar un sector: los apalancados, los inversos y lo que no sea un vehículo diversificado quedan fuera.',
    origin: 'sectores',
  },

  /* ── Añadidos por el guardián de exhaustividad ──────────────────────── */
  // Estos once llegaban a la interfaz sin traducción: sus módulos no tienen
  // mapa de texto propio. Los encontró la prueba de LAB-902, no una revisión.
  {
    code: 'insufficient_data',
    severity: 'blocking',
    text: 'No hay bastantes observaciones para publicar esta métrica.',
    origin: 'riesgo bajista',
  },
  {
    code: 'no_losses',
    severity: 'info',
    text: 'En el periodo mirado no hubo ni un día de pérdida, así que no hay caídas que medir.',
    origin: 'riesgo bajista',
  },
  {
    code: 'duplicate_asOf',
    severity: 'warning',
    text: 'Ya hay una composición anotada con esa fecha.',
    remediation: 'Quítala antes si quieres corregirla: sobrescribirla en silencio perdería el historial.',
    origin: 'composiciones',
  },
  {
    code: 'invalid_asOf',
    severity: 'warning',
    text: 'Esa fecha no tiene el formato esperado o no existe en el calendario.',
    origin: 'composiciones',
  },
  {
    code: 'invalid_block',
    severity: 'blocking',
    text: 'El tamaño de bloque no vale: uno de un solo día destruiría las rachas que el método existe para conservar.',
    origin: 'escenarios',
  },
  {
    code: 'invalid_horizon',
    severity: 'blocking',
    text: 'Un horizonte de cero días no es un escenario.',
    origin: 'escenarios',
  },
  {
    code: 'block_longer_than_history',
    severity: 'blocking',
    text: 'El bloque es más largo que el historial disponible, así que no hay de dónde recortarlo.',
    remediation: 'Reduce el tamaño de bloque o amplía el periodo.',
    origin: 'escenarios',
  },
  {
    code: 'too_many_paths',
    severity: 'blocking',
    text: 'Se han pedido más trayectorias de las que se pueden calcular sin bloquear el navegador.',
    origin: 'escenarios',
  },
  {
    code: 'duplicate_id',
    severity: 'warning',
    text: 'Ya existe un escenario con ese identificador.',
    origin: 'biblioteca de escenarios',
  },
  {
    code: 'builtin_not_editable',
    severity: 'info',
    text: 'Los escenarios que trae la aplicación no se editan: al cambiarlos se crea una copia tuya.',
    remediation: 'Deriva una copia y edítala.',
    origin: 'biblioteca de escenarios',
  },
  {
    code: 'not_found',
    severity: 'warning',
    text: 'No se ha encontrado lo que se buscaba.',
    origin: 'biblioteca de escenarios, registro de modelos',
  },
  {
    code: 'no_usable_periods',
    severity: 'blocking',
    text: 'No hay ni un periodo con datos suficientes para evaluar la señal.',
    remediation: 'Hace falta más historial del que hay disponible.',
    origin: 'sectores',
  },
]

const POR_CODIGO = new Map(REASON_CODES.map((r) => [r.code, r]))

/**
 * Lo que se muestra cuando llega un código que no está en el catálogo.
 *
 * No esconde el problema ni imprime el código en crudo: dice que ha pasado algo
 * que no se sabe explicar. Un hueco silencioso sería peor que las dos cosas.
 */
export const UNKNOWN_REASON: ReasonEntry = {
  code: 'unknown',
  severity: 'warning',
  text: 'Este cálculo no se ha podido completar y la aplicación no sabe explicar por qué.',
  remediation: 'Si vuelve a pasar, merece la pena informarlo: es un fallo de la aplicación, no de tus datos.',
  origin: 'desconocido',
}

/** Códigos desconocidos vistos. Se acumulan para poder detectarlos. */
const desconocidosVistos = new Set<string>()

/**
 * Traduce un código a algo que se puede enseñar.
 *
 * **Nunca lanza y nunca devuelve `null`.** Una pantalla que pide la traducción
 * de un motivo siempre recibe algo que enseñar, porque la alternativa es que
 * decida por su cuenta y cada una lo haga distinto.
 */
export function describeReason(code: string): ReasonEntry {
  const encontrado = POR_CODIGO.get(code)
  if (encontrado !== undefined) return encontrado

  // Monitorización: se registra para poder detectarlo, sin romper la pantalla.
  desconocidosVistos.add(code)
  return UNKNOWN_REASON
}

/** Códigos desconocidos vistos en esta sesión. Para diagnóstico. */
export function unknownReasonsSeen(): readonly string[] {
  return [...desconocidosVistos].sort()
}

/** Limpia el registro. Existe para las pruebas. */
export function resetUnknownReasons(): void {
  desconocidosVistos.clear()
}

/** ¿Está este código en el catálogo? */
export function isKnownReason(code: string): boolean {
  return POR_CODIGO.has(code)
}

/** Todos los códigos de una severidad. */
export function reasonsBySeverity(severity: ReasonSeverity): readonly ReasonEntry[] {
  return REASON_CODES.filter((r) => r.severity === severity)
}
