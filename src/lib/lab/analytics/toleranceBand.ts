/**
 * Cuestionario de tolerancia y su banda (LAB-208).
 *
 * Las preguntas viven aquí y no en el componente por dos motivos: el mapa de
 * respuesta a banda es una regla, no una decoración, y una regla debe poder
 * probarse sin montar React.
 *
 * Tres decisiones de redacción, que la tarea pide explícitamente:
 *
 * - **Ninguna opción es la recomendada.** No hay opción marcada por defecto, no
 *   se destaca ninguna y el orden es siempre el mismo —de la más conservadora a
 *   la que más oscilación acepta— para que la posición no se lea como consejo.
 * - **Ninguna opción promete rentabilidad.** Se describe la oscilación que hay
 *   que soportar, no lo que se ganaría: prometer retorno en el enunciado
 *   induciría la respuesta.
 * - **«Prefiero no responder» es una respuesta válida y deja la pregunta sin
 *   contestar.** No es un valor intermedio: se guarda para poder mostrarla
 *   seleccionada, y el cálculo la trata como ausente.
 *
 * La agregación es la **mediana**, no la media. Las bandas son ordinales: la
 * distancia entre 1 y 2 no es comparable a la que hay entre 4 y 5, así que
 * sumarlas y dividir inventa una escala que no existe. La mediana de cinco
 * respuestas es siempre una de las respuestas dadas.
 */
import type { RiskBand } from '../domain/investmentPolicy'

/** Valor que guarda una pregunta contestada con «prefiero no responder». */
export const SIN_RESPUESTA = 'sin-respuesta'

export interface OpcionCuestionario {
  /** Identificador estable. No cambia aunque se reescriba el texto. */
  readonly value: string
  readonly label: string
  readonly band: RiskBand
}

export interface PreguntaTolerancia {
  readonly id: string
  readonly text: string
  /** Para qué se pregunta. La tarea exige poder explicarlo en pantalla. */
  readonly porQue: string
  readonly options: readonly OpcionCuestionario[]
}

export const TOLERANCE_QUESTIONS: readonly PreguntaTolerancia[] = [
  {
    id: 'caida-20',
    text: 'Tu cartera pierde un 20 % en tres meses. ¿Qué harías?',
    porQue:
      'Distingue lo que alguien cree que aguantaría de lo que haría de verdad. Es la pregunta que mejor anticipa una venta en el peor momento.',
    options: [
      { value: 'vender-todo', label: 'Vender todo para no perder más.', band: 1 },
      { value: 'vender-parte', label: 'Vender una parte.', band: 2 },
      { value: 'esperar', label: 'No hacer nada y esperar.', band: 3 },
      { value: 'seguir-plan', label: 'Mantener y seguir aportando lo previsto.', band: 4 },
      { value: 'aportar-mas', label: 'Aportar más de lo previsto a esos precios.', band: 5 },
    ],
  },
  {
    id: 'perdida-anual',
    text: '¿Qué pérdida a un año llegarías a aceptar sin cambiar de plan?',
    porQue:
      'Fija un número concreto con el que contrastar después lo que la cartera puede llegar a oscilar.',
    options: [
      { value: 'ninguna', label: 'Ninguna.', band: 1 },
      { value: 'hasta-10', label: 'Hasta un 10 %.', band: 2 },
      { value: 'hasta-20', label: 'Hasta un 20 %.', band: 3 },
      { value: 'hasta-35', label: 'Hasta un 35 %.', band: 4 },
      { value: 'mas-35', label: 'Más de un 35 %.', band: 5 },
    ],
  },
  {
    id: 'dos-carteras',
    text: 'A diez años, ¿con cuál de estas carteras estarías más cómodo?',
    porQue:
      'Pregunta por la oscilación que se está dispuesto a convivir, sin hablar de cuánto se ganaría.',
    options: [
      { value: 'casi-plana', label: 'Una que apenas se mueve, ni arriba ni abajo.', band: 1 },
      { value: 'poco-movida', label: 'Una que se mueve poco.', band: 2 },
      { value: 'algunos-anos-malos', label: 'Una con algunos años claramente malos.', band: 3 },
      { value: 'muy-movida', label: 'Una con años muy malos y años muy buenos.', band: 4 },
      {
        value: 'extremos',
        label: 'Una que puede llegar a extremos en ambos sentidos.',
        band: 5,
      },
    ],
  },
  {
    id: 'dos-anos-malos',
    text: 'Si la cartera perdiera valor dos años seguidos, ¿qué harías?',
    porQue:
      'Una caída corta se aguanta casi siempre; lo que rompe los planes es que se alargue.',
    options: [
      { value: 'abandonar', label: 'Abandonar el plan.', band: 1 },
      { value: 'reducir-mucho', label: 'Reducir mucho el riesgo.', band: 2 },
      { value: 'reducir-algo', label: 'Reducir algo el riesgo.', band: 3 },
      { value: 'mantener', label: 'Mantener el plan.', band: 4 },
      { value: 'revisar-aportar', label: 'Mantener el plan y revisar si conviene aportar.', band: 5 },
    ],
  },
  {
    id: 'que-incomoda',
    text: '¿Qué te incomodaría más?',
    porQue:
      'Separa a quien le pesa más una pérdida de quien le pesa más una ocasión perdida. Las dos son legítimas y llevan a carteras distintas.',
    options: [
      { value: 'numeros-rojos', label: 'Ver números rojos en cualquier momento.', band: 1 },
      { value: 'caida-grande', label: 'Una caída grande, aunque luego se recupere.', band: 2 },
      { value: 'por-igual', label: 'Las dos cosas por igual.', band: 3 },
      { value: 'quedarme-atras', label: 'Quedarme atrás cuando otros ganan.', band: 4 },
      { value: 'no-aprovechar', label: 'No aprovechar una ocasión por miedo a una caída.', band: 5 },
    ],
  },
]

/** Preguntas sin contestar, o contestadas con «prefiero no responder». */
export function missingToleranceAnswers(
  answers: Readonly<Record<string, string>>,
): readonly string[] {
  return TOLERANCE_QUESTIONS.filter((pregunta) => {
    const respuesta = answers[pregunta.id]
    return respuesta === undefined || respuesta === SIN_RESPUESTA
  }).map((pregunta) => pregunta.id)
}

/**
 * Banda de tolerancia: la **mediana** de las cinco respuestas.
 *
 * `null` mientras falte cualquiera. Con cuatro de cinco no se devuelve una banda
 * provisional: la que falta puede ser justamente la que decide.
 */
export function deriveToleranceBand(answers: Readonly<Record<string, string>>): RiskBand | null {
  if (missingToleranceAnswers(answers).length > 0) return null

  const bandas = TOLERANCE_QUESTIONS.map((pregunta) => {
    const elegida = pregunta.options.find((opcion) => opcion.value === answers[pregunta.id])
    return elegida?.band
  })

  // Una respuesta que no está entre las opciones no es una respuesta: puede
  // venir de una versión anterior del cuestionario o de un dato manipulado.
  if (bandas.some((banda) => banda === undefined)) return null

  const ordenadas = (bandas as RiskBand[]).slice().sort((a, b) => a - b)
  return ordenadas[Math.floor(ordenadas.length / 2)] as RiskBand
}
