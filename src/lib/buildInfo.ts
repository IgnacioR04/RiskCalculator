/**
 * Metadatos del build (LAB-005).
 *
 * Sirven para una cosa concreta: cuando alguien reporta un fallo, poder saber
 * **qué versión exacta estaba mirando**. Sin esto, «a mí no me pasa» es una
 * conversación sin salida.
 *
 * Los valores los inyecta Vite en tiempo de compilación (`define` en
 * `vite.config.ts`). En desarrollo no hay commit ni fecha de build, y eso se
 * dice: `desconocido` es una respuesta honesta y `0.0.0` no lo sería.
 *
 * **Nada de esto es un secreto.** Son el SHA público del commit y una fecha; el
 * repositorio es público y el SHA ya viaja en la URL de cada despliegue.
 */

export interface BuildInfo {
  /** SHA corto del commit compilado, o `desconocido` en desarrollo. */
  readonly commit: string
  /** Instante ISO de la compilación, o `desconocido` en desarrollo. */
  readonly builtAt: string
  readonly mode: 'development' | 'production'
}

function leer(valor: string | undefined): string {
  return valor === undefined || valor === '' ? 'desconocido' : valor
}

export const BUILD_INFO: BuildInfo = {
  commit: leer(typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : undefined),
  builtAt: leer(typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : undefined),
  mode: import.meta.env.PROD ? 'production' : 'development',
}

/** Una línea para pegar en un informe de fallo. */
export function buildSignature(info: BuildInfo = BUILD_INFO): string {
  return `RiskCalculator ${info.mode} · ${info.commit} · ${info.builtAt}`
}
