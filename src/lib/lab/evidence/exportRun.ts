/**
 * Exportación de análisis (LAB-907).
 *
 * Saca un cálculo guardado del navegador en un formato que **otra persona pueda
 * leer sin la aplicación delante**.
 *
 * ## Qué hace útil a una exportación
 *
 * Un volcado de JSON con los números es fácil y no sirve para nada: quien lo
 * reciba no sabrá de cuándo son los datos, qué versión los produjo ni qué no
 * cubren. Una exportación útil lleva **el contexto pegado al número**, que es
 * exactamente lo que el contrato de evidencia de `LAB-901` formaliza.
 *
 * Se ofrecen dos formatos porque sirven a dos cosas distintas:
 *
 * - **JSON**, para volver a cargarlo o procesarlo. Lleva todo.
 * - **Markdown**, para leerlo, pegarlo en un correo o guardarlo. Lleva lo mismo
 *   en frases.
 *
 * ## Lo que NO se exporta
 *
 * Nada que la aplicación no tenga ya. La exportación es una vista de lo
 * guardado, no una recopilación nueva: no añade identificadores, ni marcas de
 * tiempo de uso, ni nada que convierta un fichero de análisis en un rastro.
 *
 * Función pura: no toca red, ni almacenamiento, ni reloj.
 */
import type { LabRun } from '../runs/localRuns'
import type { EvidenceItem } from './contracts'
import { EVIDENCE_KIND_LABEL } from './contracts'
import { explain } from './explanations'

export const EXPORT_FORMAT_VERSION = 1

export interface ExportPayload {
  readonly formatVersion: number
  /** Qué aplicación y qué versión lo produjo. */
  readonly producedBy: string
  readonly run: LabRun
  readonly evidence: readonly EvidenceItem[]
  /**
   * Aviso obligatorio.
   *
   * Va **dentro** del fichero, no en la pantalla que lo descarga: un fichero
   * que viaja sin su aviso es un fichero que alguien leerá sin él.
   */
  readonly disclaimer: string
}

export const EXPORT_DISCLAIMER =
  'Este fichero describe un cálculo hecho con los datos que había en la fecha indicada. No es asesoramiento financiero, no contiene recomendaciones de compra o venta, y sus cifras dependen de los supuestos que se detallan en cada evidencia.'

export function buildExport(
  run: LabRun,
  evidence: readonly EvidenceItem[],
  appVersion: string,
): ExportPayload {
  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    producedBy: `RiskCalculator ${appVersion}`,
    run,
    evidence,
    disclaimer: EXPORT_DISCLAIMER,
  }
}

/** JSON estable: las claves salen ordenadas para que dos exportaciones iguales lo sean. */
export function toJson(payload: ExportPayload): string {
  return JSON.stringify(payload, ordenarClaves, 2)
}

function ordenarClaves(_clave: string, valor: unknown): unknown {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return valor
  const objeto = valor as Record<string, unknown>
  return Object.keys(objeto)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = objeto[k]
      return acc
    }, {})
}

/** Markdown para leer. Mismo contenido, en frases. */
export function toMarkdown(payload: ExportPayload): string {
  const { run } = payload
  const lineas: string[] = [
    `# Análisis — ${run.kind}`,
    '',
    `- **Identificador:** ${run.id}`,
    `- **Fecha de los datos:** ${run.asOf}`,
    `- **Calculado:** ${run.createdAt}`,
    `- **Versión del modelo:** ${run.modelVersion}`,
    `- **Producido por:** ${payload.producedBy}`,
    '',
    '## Entradas',
    '',
  ]

  for (const [clave, valor] of Object.entries(run.inputs).sort()) {
    lineas.push(`- **${clave}:** ${String(valor)}`)
  }

  lineas.push('', '## Resultado', '')
  for (const [clave, valor] of Object.entries(run.summary).sort()) {
    // Un `null` se escribe como «no disponible», no como una celda vacía: un
    // hueco se lee como cero y son cosas distintas.
    lineas.push(`- **${clave}:** ${valor === null ? 'No disponible' : String(valor)}`)
  }

  if (payload.evidence.length > 0) {
    lineas.push('', '## De dónde sale cada número', '')
    for (const item of payload.evidence) {
      lineas.push(`### ${EVIDENCE_KIND_LABEL[item.kind]}`, '')
      for (const linea of explain(item).lines) lineas.push(`- ${linea.text}`)
      lineas.push('')
    }
  }

  lineas.push('---', '', payload.disclaimer, '')
  return lineas.join('\n')
}

/** Nombre de fichero sugerido. Sin espacios ni acentos, para que viaje bien. */
export function suggestedFilename(run: LabRun, extension: 'json' | 'md'): string {
  const limpio = run.id.replace(/[^a-zA-Z0-9-]/g, '-')
  return `riskcalculator-${run.kind}-${run.asOf}-${limpio}.${extension}`
}
