/**
 * Edge Function: proxy seguro hacia Twelve Data.
 *
 * - La clave TWELVE_DATA_API_KEY vive SOLO en los secretos de la función
 *   (supabase secrets set TWELVE_DATA_API_KEY=...); jamás en el navegador.
 * - Lista blanca de endpoints y parámetros: nada más se reenvía.
 * - Rate limiting simple por IP (memoria de la instancia; suficiente para el
 *   piloto — para producción usar una tabla o KV compartido).
 * - Caché HTTP corta para abaratar el plan gratuito.
 *
 * Despliegue: supabase functions deploy market-proxy --no-verify-jwt
 * (la anon key sigue siendo necesaria si el proyecto exige Authorization).
 */
// @ts-nocheck — código Deno; el tsconfig del frontend no lo compila.
Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'GET') {
    return json({ error: 'Método no permitido' }, 405, cors)
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

  // Lista blanca de endpoints y de parámetros permitidos por endpoint.
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
  // Límite defensivo para series temporales.
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
        // Caché corta en el edge para deduplicar ráfagas.
        'cache-control': 'public, max-age=60',
      },
    })
  } catch (_e) {
    return json({ error: 'Timeout o error de red hacia Twelve Data' }, 502, cors)
  }
})

// ── utilidades ──

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

const buckets = new Map<string, { count: number; resetAt: number }>()
const LIMIT_PER_MINUTE = 30

function allowRequest(req: Request): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const bucket = buckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  bucket.count += 1
  return bucket.count <= LIMIT_PER_MINUTE
}
