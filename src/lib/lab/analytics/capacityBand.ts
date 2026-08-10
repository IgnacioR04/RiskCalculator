/**
 * Derivación de la banda de capacidad a partir de los hechos declarados (LAB-208).
 *
 * ADR-002 §2 dice de dónde sale `lossCapacity` —horizonte, colchón de liquidez,
 * estabilidad de ingresos, personas a cargo y peso de la cartera en el
 * patrimonio— pero no fija los umbrales. Aquí se fijan, de forma explícita y
 * comprobable, con tres reglas de diseño:
 *
 * 1. **Cada hecho pone un techo, y manda el más bajo.** No se promedia. Un
 *    horizonte de veinte años no compensa no tener colchón de liquidez: si hace
 *    falta vender en el peor momento, el horizonte largo no evita la pérdida.
 *    Es el mismo razonamiento del `min()` de ADR-002 §3, aplicado un nivel más
 *    abajo.
 * 2. **Sin los cinco hechos no hay banda.** Devuelve `null`, no una estimación.
 *    Un hecho ausente no vale «el del medio»: eso es inventar una restricción
 *    material que nadie ha declarado.
 * 3. **El mejor caso de cada hecho no limita** (techo 5). Un techo de 4 en el
 *    caso más favorable haría imposible la banda 5 por construcción, y estaría
 *    limitando por un motivo que no existe.
 *
 * **Los umbrales son convenciones declaradas de esta herramienta, no medidas
 * empíricas.** No salen de un estudio ni de una calibración sobre datos: son
 * cortes redondos y conservadores, elegidos para que el resultado sea explicable
 * a quien responde. Cambiarlos cambia el resultado de una política ya guardada,
 * así que van atados a `EFFECTIVE_RISK_RULE_VERSION`: modificarlos obliga a
 * subir esa versión, que es lo que permite reproducir un resultado antiguo.
 *
 * Nada de esto se deduce de la tolerancia. La tolerancia no entra en este
 * archivo, y esa ausencia es el criterio de aceptación de la tarea.
 */
import type { CapacityAssessment, RiskBand } from '../domain/investmentPolicy'
import { missingCapacityFacts } from './policyAssessment'

/** Hecho de capacidad que puede poner techo, con su techo y por qué. */
export interface CapacityCap {
  readonly fact: 'horizonYears' | 'emergencyFundMonths' | 'incomeStability' | 'dependents' | 'shareOfNetWorth'
  readonly cap: RiskBand
}

/**
 * Horizonte: cuánto tiempo hay para recuperarse de una caída antes de necesitar
 * el dinero. Los tramos siguen la idea de que una caída grande necesita años,
 * no meses, para deshacerse, y que a menos de dos años no hay margen ninguno.
 */
function techoPorHorizonte(anos: number): RiskBand {
  if (anos < 2) return 1
  if (anos < 5) return 2
  if (anos < 8) return 3
  if (anos < 15) return 4
  return 5
}

/**
 * Colchón de liquidez, en meses de gasto cubiertos. Es el hecho que decide si
 * un imprevisto obliga a vender en mal momento. Sin colchón, cualquier caída se
 * convierte en pérdida realizada.
 */
function techoPorColchon(meses: number): RiskBand {
  if (meses < 1) return 1
  if (meses < 3) return 2
  if (meses < 6) return 3
  if (meses < 12) return 4
  return 5
}

/**
 * Estabilidad de los ingresos. Tres respuestas sobre cinco bandas: el mejor
 * caso no limita, y el peor se queda en 2 y no en 1, porque «incierta» no
 * significa «sin ingresos» y afirmarlo sería decir más de lo que se preguntó.
 */
function techoPorIngresos(estabilidad: 'estable' | 'variable' | 'incierta'): RiskBand {
  if (estabilidad === 'estable') return 5
  if (estabilidad === 'variable') return 3
  return 2
}

/**
 * Personas a cargo. Sube el coste de equivocarse, pero no lo determina: por eso
 * los tramos son suaves y no bajan de 2.
 */
function techoPorDependientes(personas: number): RiskBand {
  if (personas === 0) return 5
  if (personas <= 2) return 4
  if (personas <= 4) return 3
  return 2
}

/**
 * Qué fracción del patrimonio total representa esta cartera. Es el hecho más
 * duro de los cinco: si aquí está casi todo, no hay nada detrás que absorba una
 * caída, y ningún otro hecho lo compensa.
 */
function techoPorPesoEnPatrimonio(fraccion: number): RiskBand {
  if (fraccion > 0.75) return 1
  if (fraccion > 0.5) return 2
  if (fraccion > 0.25) return 3
  if (fraccion > 0.1) return 4
  return 5
}

/**
 * Techo que pone cada hecho por separado, en orden estable.
 *
 * Se expone además de la banda porque la interfaz tiene que poder decir **qué**
 * está limitando. «Tu capacidad es baja» sin decir por qué no es explicable, y
 * una restricción que no se entiende se ignora.
 *
 * Devuelve `[]` si falta cualquier hecho: los techos parciales invitarían a
 * leerlos como un resultado.
 */
export function capacityCaps(capacity: CapacityAssessment): readonly CapacityCap[] {
  if (missingCapacityFacts(capacity).length > 0) return []

  // Las cinco lecturas son seguras: `missingCapacityFacts` acaba de comprobar
  // que ninguno de los cinco hechos está ausente.
  return [
    { fact: 'horizonYears', cap: techoPorHorizonte(capacity.horizonYears as number) },
    { fact: 'emergencyFundMonths', cap: techoPorColchon(capacity.emergencyFundMonths as number) },
    {
      fact: 'incomeStability',
      cap: techoPorIngresos(capacity.incomeStability as 'estable' | 'variable' | 'incierta'),
    },
    { fact: 'dependents', cap: techoPorDependientes(capacity.dependents as number) },
    { fact: 'shareOfNetWorth', cap: techoPorPesoEnPatrimonio(capacity.shareOfNetWorth as number) },
  ]
}

/**
 * Banda de capacidad: el techo más bajo de los cinco hechos.
 *
 * `null` mientras falte alguno. No se estima, no se rellena con la tolerancia y
 * no se asume un valor por defecto.
 */
export function deriveCapacityBand(capacity: CapacityAssessment): RiskBand | null {
  const techos = capacityCaps(capacity)
  if (techos.length === 0) return null
  return techos.reduce<RiskBand>((minimo, techo) => (techo.cap < minimo ? techo.cap : minimo), 5)
}

/**
 * Hechos que están imponiendo la banda, es decir, los que empatan en el mínimo.
 * Puede haber más de uno, y decirlos todos evita la falsa impresión de que basta
 * con arreglar uno.
 */
export function bindingCapacityFacts(
  capacity: CapacityAssessment,
): readonly CapacityCap['fact'][] {
  const banda = deriveCapacityBand(capacity)
  if (banda === null) return []
  return capacityCaps(capacity)
    .filter((techo) => techo.cap === banda)
    .map((techo) => techo.fact)
}
