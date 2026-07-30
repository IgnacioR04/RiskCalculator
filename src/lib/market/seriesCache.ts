/**
 * Caché de series diarias de precios.
 *
 * Las series alimentan volatilidad, covarianzas, contribución al riesgo y TWR.
 * Se descargaban enteras en cada visita a la sección de riesgo y además en
 * paralelo, lo que con el plan gratuito de Twelve Data —8 peticiones por
 * minuto, 800 al día— agota la cuota en unas pocas recargas y deja la sección
 * vacía sin explicar por qué.
 *
 * Dos medidas:
 *
 * 1. Una serie diaria no cambia hasta el cierre siguiente, así que se guarda y
 *    se reutiliza mientras siga siendo del día. En una segunda visita el mismo
 *    día no se pide nada.
 * 2. Las peticiones a Twelve Data van de una en una y separadas, en vez de
 *    todas a la vez. Es más lento pero no se choca con el límite.
 *
 * La caché vive en memoria y en `localStorage`, aparte del store del usuario:
 * son datos de mercado públicos y reproducibles, no datos de su cartera, y no
 * tienen por qué viajar a la nube ni engordar su copia de seguridad.
 */

export interface SeriesPoint {
  date: string
  close: number
}

interface EntradaCache {
  puntos: SeriesPoint[]
  proveedor: string
  /** ISO de la descarga, para decidir si sigue vigente. */
  descargadaEn: string
}

const CLAVE = 'riskcalculator-v1:series'
const MAX_ENTRADAS = 60

let memoria: Record<string, EntradaCache> | null = null

function cargar(): Record<string, EntradaCache> {
  if (memoria !== null) return memoria
  try {
    const raw = localStorage.getItem(CLAVE)
    memoria = raw === null ? {} : (JSON.parse(raw) as Record<string, EntradaCache>)
  } catch {
    memoria = {}
  }
  return memoria
}

function guardar(datos: Record<string, EntradaCache>): void {
  memoria = datos
  try {
    // Se conservan las más recientes: la caché no debe crecer sin límite.
    const entradas = Object.entries(datos)
      .sort((a, b) => b[1].descargadaEn.localeCompare(a[1].descargadaEn))
      .slice(0, MAX_ENTRADAS)
    localStorage.setItem(CLAVE, JSON.stringify(Object.fromEntries(entradas)))
  } catch {
    // Sin localStorage (modo privado, cuota llena) se sigue con la de memoria.
  }
}

function clave(assetId: string, dias: number, divisa: string): string {
  return `${assetId}|${dias}|${divisa}`
}

/**
 * Vigente si se descargó hoy. Una serie diaria solo cambia al cierre, así que
 * volver a pedirla el mismo día no aporta nada.
 */
function sigueVigente(entrada: EntradaCache): boolean {
  return entrada.descargadaEn.slice(0, 10) === new Date().toISOString().slice(0, 10)
}

export function leerSerie(
  assetId: string,
  dias: number,
  divisa: string,
): { puntos: SeriesPoint[]; proveedor: string } | null {
  const entrada = cargar()[clave(assetId, dias, divisa)]
  if (entrada === undefined || !sigueVigente(entrada)) return null
  return { puntos: entrada.puntos, proveedor: entrada.proveedor }
}

export function escribirSerie(
  assetId: string,
  dias: number,
  divisa: string,
  puntos: SeriesPoint[],
  proveedor: string,
): void {
  if (puntos.length === 0) return
  const datos = { ...cargar() }
  datos[clave(assetId, dias, divisa)] = {
    puntos,
    proveedor,
    descargadaEn: new Date().toISOString(),
  }
  guardar(datos)
}

export function vaciarCacheDeSeries(): void {
  memoria = {}
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // sin persistencia: basta con haber vaciado la memoria
  }
}

/**
 * Cola de un solo carril con separación mínima entre peticiones.
 *
 * Twelve Data permite 8 por minuto en el plan gratuito: 8 segundos entre
 * llamadas dejan margen. CoinGecko es más laxo y usa su propia cola, así que
 * cripto y acciones no se estorban.
 */
export function crearCola(separacionMs: number) {
  let ultima = 0
  let cadena: Promise<unknown> = Promise.resolve()

  return function encolar<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = cadena.then(async () => {
      const espera = Math.max(0, ultima + separacionMs - Date.now())
      if (espera > 0) await new Promise((r) => setTimeout(r, espera))
      ultima = Date.now()
      return tarea()
    })
    // La cadena no debe romperse porque una tarea falle.
    cadena = resultado.catch(() => undefined)
    return resultado as Promise<T>
  }
}

/** ~8 por minuto, el límite del plan gratuito de Twelve Data. */
export const colaTwelveData = crearCola(8_000)
/** CoinGecko tolera más ritmo, pero tampoco conviene ráfagas. */
export const colaCoinGecko = crearCola(1_500)
