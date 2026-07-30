/**
 * Edge Function: self-service account deletion.
 *
 * The browser only sends the authenticated user's JWT. The service role key
 * stays in Supabase secrets and is used here to delete the auth user, which
 * cascades public user data through the foreign keys in the migrations.
 *
 * Deploy: supabase functions deploy delete-user
 */
// @ts-nocheck - Deno function; the frontend tsconfig does not compile this file.
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
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405, cors)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurada' }, 503, cors)
  }

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (bearer === '') return json({ error: 'Sesion requerida' }, 401, cors)

  const userId = readSubjectFromJwt(bearer)
  if (userId === null) return json({ error: 'JWT sin usuario valido' }, 401, cors)

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    return json({ error: text || 'No se pudo eliminar el usuario' }, response.status, cors)
  }

  return json({ ok: true }, 200, cors)
})

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

function readSubjectFromJwt(token: string): string | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const payload = JSON.parse(atob(padded))
    const sub = payload?.sub
    if (typeof sub !== 'string') return null
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sub)
      ? sub
      : null
  } catch (_error) {
    return null
  }
}
