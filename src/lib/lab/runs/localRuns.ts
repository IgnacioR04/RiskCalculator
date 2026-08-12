/**
 * Registro local de cálculos ejecutados (LAB-311).
 *
 * Guarda un índice acotado de lo que se ha calculado: qué se pidió, con qué
 * versión del modelo, a qué fecha de datos y qué salió. Sirve para poder
 * responder meses después a «¿por qué me salió esto entonces?».
 *
 * **`modelVersion` y `asOf` son obligatorios y no se pierden nunca.** Es el
 * criterio de aceptación de la tarea, y el motivo es que sin ellos un resultado
 * guardado no se puede reproducir ni explicar: no se sabría bajo qué reglas ni
 * sobre qué datos se obtuvo. Un resultado sin esos dos campos no se guarda, y al
 * leer se descarta.
 *
 * Vive en su propia clave de `localStorage`, aparte del store del usuario, por
 * lo mismo que la caché de series: es material reconstruible y no tiene por qué
 * viajar a la nube ni engordar la copia de seguridad.
 */

/** Versión del formato guardado. Se sube al cambiar la forma del registro. */
export const RUNS_SCHEMA_VERSION = 1

/**
 * Cuántos cálculos se conservan. Acotado a propósito: el índice es para
 * explicar lo reciente, no un archivo histórico. Sin tope, `localStorage` se
 * llena y falla lo que de verdad importa, que son los datos del usuario.
 */
export const MAX_RUNS = 50

const CLAVE = 'riskcalculator-v1:lab-runs'

export type RunKind = 'stability' | 'scenario' | 'quality'

export interface StabilityRunSummary {
  /** Métricas ya resumidas. Se guarda el resumen, no la serie entera. */
  readonly [metric: string]: number | string | null
}

export interface LabRun {
  readonly id: string
  readonly kind: RunKind
  /** Versión de las reglas bajo las que se calculó. Obligatoria. */
  readonly modelVersion: number
  /** Fecha de los datos usados, `YYYY-MM-DD`. Obligatoria. */
  readonly asOf: string
  /** Instante de ejecución. */
  readonly createdAt: string
  /** Qué se pidió: ventana, divisa, activos. Permite saber si se repite. */
  readonly inputs: Readonly<Record<string, string | number>>
  readonly summary: StabilityRunSummary
}

interface Almacen {
  readonly schemaVersion: number
  readonly runs: readonly LabRun[]
}

export type SaveOutcome =
  | { readonly ok: true; readonly stored: number }
  /** No cabe: `localStorage` lleno. Se dice, no se traga. */
  | { readonly ok: false; readonly reason: 'quota_exceeded' }
  /** Le faltaba `modelVersion` o `asOf`: sin eso no se puede explicar. */
  | { readonly ok: false; readonly reason: 'not_reproducible' }

/* ── Validación ───────────────────────────────────────────────────────────── */

/**
 * Un registro solo vale si se puede reproducir. Se comprueba al guardar **y** al
 * leer: lo segundo porque el almacenamiento lo puede haber escrito una versión
 * anterior, o alguien a mano.
 */
export function isReproducible(run: unknown): run is LabRun {
  if (run === null || typeof run !== 'object') return false
  const r = run as Partial<LabRun>
  return (
    typeof r.id === 'string' &&
    r.id !== '' &&
    typeof r.modelVersion === 'number' &&
    Number.isFinite(r.modelVersion) &&
    typeof r.asOf === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.asOf) &&
    typeof r.createdAt === 'string' &&
    typeof r.kind === 'string'
  )
}

/* ── Lectura y escritura ──────────────────────────────────────────────────── */

function leerAlmacen(): Almacen {
  try {
    const bruto = localStorage.getItem(CLAVE)
    if (bruto === null) return { schemaVersion: RUNS_SCHEMA_VERSION, runs: [] }
    return migrar(JSON.parse(bruto) as unknown)
  } catch {
    // Contenido ilegible: se empieza de cero en vez de arrastrar basura. Es una
    // caché, no datos del usuario; perderla no cuesta nada.
    return { schemaVersion: RUNS_SCHEMA_VERSION, runs: [] }
  }
}

/**
 * Abre lo guardado por una versión anterior.
 *
 * Un formato del futuro se descarta entero: leerlo a medias sería peor que no
 * leerlo, porque produciría un índice que parece completo y no lo es.
 */
export function migrar(bruto: unknown): Almacen {
  if (bruto === null || typeof bruto !== 'object') {
    return { schemaVersion: RUNS_SCHEMA_VERSION, runs: [] }
  }
  const almacen = bruto as Partial<Almacen>
  const version = typeof almacen.schemaVersion === 'number' ? almacen.schemaVersion : 0

  if (version > RUNS_SCHEMA_VERSION) {
    return { schemaVersion: RUNS_SCHEMA_VERSION, runs: [] }
  }

  const runs = Array.isArray(almacen.runs) ? almacen.runs : []
  // Se filtra al leer: lo que no se puede reproducir no entra, venga de donde
  // venga.
  return { schemaVersion: RUNS_SCHEMA_VERSION, runs: runs.filter(isReproducible) }
}

/** Cálculos guardados, del más reciente al más antiguo. */
export function listRuns(): readonly LabRun[] {
  return leerAlmacen().runs
}

/** Un cálculo concreto, o `null` si ya no está. */
export function getRun(id: string): LabRun | null {
  return listRuns().find((run) => run.id === id) ?? null
}

/**
 * Guarda un cálculo. Devuelve qué pasó en vez de lanzar: quedarse sin espacio
 * es una situación normal en un navegador, no un error de programación.
 */
export function saveRun(run: LabRun): SaveOutcome {
  if (!isReproducible(run)) return { ok: false, reason: 'not_reproducible' }

  const previos = listRuns().filter((r) => r.id !== run.id)
  const runs = [run, ...previos].slice(0, MAX_RUNS)

  try {
    localStorage.setItem(
      CLAVE,
      JSON.stringify({ schemaVersion: RUNS_SCHEMA_VERSION, runs } satisfies Almacen),
    )
    return { ok: true, stored: runs.length }
  } catch {
    // Cuota llena o modo privado. El cálculo ya se ha mostrado; lo único que se
    // pierde es poder consultarlo después, y eso se dice.
    return { ok: false, reason: 'quota_exceeded' }
  }
}

export function clearRuns(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
}
