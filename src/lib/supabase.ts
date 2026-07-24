/**
 * Cliente Supabase. Solo usa valores públicos (URL + anon key); los datos se
 * protegen con RLS en el servidor. Si el entorno no está configurado, la app
 * funciona íntegramente en modo local/invitado.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url === undefined || url === '' || anonKey === undefined || anonKey === '') {
    client = null
    return client
  }
  client = createClient(url, anonKey)
  return client
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null
}

/** URL válida tanto en raíz como bajo /RiskCalculator/ de GitHub Pages. */
export function authRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
