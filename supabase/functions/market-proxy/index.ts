/**
 * Edge Function: proxy seguro hacia Twelve Data.
 *
 * - La clave TWELVE_DATA_API_KEY vive SOLO en los secretos de la funcion
 *   (supabase secrets set TWELVE_DATA_API_KEY=...); jamas en el navegador.
 * - Lista blanca de endpoints y parametros: nada mas se reenvia.
 * - Rate limiting por usuario y, para quien no tiene sesion, por IP.
 * - Cache HTTP corta para abaratar el plan gratuito.
 *
 * ## Por que se admiten peticiones sin sesion
 *
 * Hasta aqui la funcion exigia `Authorization` y `verify_jwt = true`. La
 * consecuencia practica no se veia desde aqui: la aplicacion funciona **sin
 * cuenta** por diseno, asi que en el modo local ninguna accion, ETF ni metal
 * podia cotizarse jamas. Una cartera real se quedaba con once posiciones a
 * precio manual de hacia tres semanas y con todas las metricas historicas
 * bloqueadas por falta de observaciones. Exigir cuenta para ver el precio de
 * Microsoft contradice el principio de no exigir registro para lo esencial.
 *
 * El coste esta asumido y es acotado: la clave sigue sin salir de aqui, la
 * lista blanca sigue igual, y quien llama sin sesion tiene un cupo mas
 * estrecho. Autorizado explicitamente por el propietario el 2026-08-21.
 *
 * Despliegue: supabase functions deploy market-proxy
 */
// @ts-nocheck - codigo Deno; el tsconfig del frontend no lo compila.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? ''
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ??
    'https://ignacior04.github.io,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173')
    .split(',')
    .map((value) => value.trim())
  const allowedOrigin = configuredOrigins.includes(origin) ? origin : configuredOrigins[0]!
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'GET') {
    return json({ error: 'Metodo no permitido' }, 405, cors)
  }
  const apiKey = Deno.env.get('TWELVE_DATA_API_KEY')
  if (!apiKey) {
    return json({ error: 'TWELVE_DATA_API_KEY no configurada en el servidor' }, 503, cors)
  }

  if (!allowRequest(req)) {
    return json({ error: 'Demasiadas peticiones; espera un minuto' }, 429, cors)
  }

  const url = new URL(req.url)
  const endpoint = url.searchParams.get('endpoint') ?? ''

  // Lista blanca de endpoints y de parametros permitidos por endpoint.
  const ALLOWED: Record<string, string[]> = {
    symbol_search: ['symbol'],
    quote: ['symbol'],
    time_series: ['symbol', 'interval', 'outputsize', 'start_date', 'end_date'],
    exchange_rate: ['symbol'],
  }
  const allowedParams = ALLOWED[endpoint]
  if (!allowedParams) {
    return json({ error: `Endpoint no permitido: ${endpoint}` }, 400, cors)
  }

  const upstream = new URL(`https://api.twelvedata.com/${endpoint}`)
  for (const p of allowedParams) {
    const v = url.searchParams.get(p)
    if (v !== null && v.length <= 64) upstream.searchParams.set(p, v)
  }
  // Limite defensivo para series temporales.
  if (endpoint === 'time_series') {
    const size = Number(upstream.searchParams.get('outputsize') ?? '365')
    upstream.searchParams.set('outputsize', String(Math.min(Math.max(size, 1), 5000)))
    const interval = upstream.searchParams.get('interval') ?? '1day'
    if (!['1day', '1week', '1month', '1h', '15min'].includes(interval)) {
      return json({ error: `Intervalo no permitido: ${interval}` }, 400, cors)
    }
  }
  upstream.searchParams.set('apikey', apiKey)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9000)
    const resp = await fetch(upstream, { signal: controller.signal })
    clearTimeout(timer)
    const body = await resp.text()
    return new Response(body, {
      status: resp.status,
      headers: {
        ...cors,
        'content-type': 'application/json',
        // Cache corta en el edge para deduplicar rafagas.
        'cache-control': 'public, max-age=60',
      },
    })
  } catch (_e) {
    return json({ error: 'Timeout o error de red hacia Twelve Data' }, 502, cors)
  }
})

// utilidades

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

const buckets = new Map<string, { count: number; resetAt: number }>()

/**
 * Cupos por minuto.
 *
 * Con sesion se identifica a una persona, asi que el cupo puede ser generoso.
 * Sin sesion la unica identidad es la IP, que se comparte y se cambia, de modo
 * que el cupo se ajusta a lo que de verdad necesita una cartera normal: una
 * ronda completa son ~15 peticiones, y se refresca una vez por hora.
 *
 * El cliente ya se frena solo: espacia 8 s las llamadas a Twelve Data para no
 * pasarse del limite del plan gratuito (8 por minuto). Este cupo es la red de
 * seguridad para quien no use ese cliente, no el regulador del ritmo normal.
 *
 * Aviso honesto sobre el alcance: estos contadores viven en la memoria de la
 * instancia. Un arranque en frio los reinicia y varias instancias no comparten
 * cuenta, asi que esto **frena el abuso casual, no a un atacante decidido**. La
 * proteccion dura sigue siendo que la clave no sale de aqui y que la lista
 * blanca no deja pasar nada mas.
 */
const LIMIT_CON_SESION = 30
const LIMIT_SIN_SESION = 20

function allowRequest(req: Request): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  let subject = ''
  try {
    subject = JSON.parse(atob(bearer.split('.')[1] ?? '')).sub ?? ''
  } catch {
    // Sin sesion, o con un token que no es un JWT: se cuenta por IP.
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const key = subject || `ip:${ip}`
  const limite = subject ? LIMIT_CON_SESION : LIMIT_SIN_SESION
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }
  bucket.count += 1
  return bucket.count <= limite
}
