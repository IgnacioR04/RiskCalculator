/**
 * Puerta de acceso de DEMO para el piloto.
 *
 * ⚠️ ESTO NO ES SEGURIDAD REAL. La app es de solo-navegador (GitHub Pages):
 * cualquier credencial embebida es visible en el bundle. Sirve únicamente
 * como pantalla de acceso para el piloto y para simular la experiencia de
 * "entrar con usuario y contraseña". La autenticación real es el enlace
 * mágico de Supabase (ver src/lib/supabase.ts), que protege los datos con RLS.
 *
 * Las credenciales de demo pueden configurarse por variables de entorno
 * (VITE_DEMO_USER / VITE_DEMO_PASSWORD). Si no se definen, se usa el
 * usuario de pruebas documentado en el README: admin1 / 1234.
 */

const DEMO_USER = (import.meta.env.VITE_DEMO_USER as string | undefined) ?? 'admin1'
const DEMO_PASSWORD = (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) ?? '1234'

const SESSION_KEY = 'riskcalculator-demo-session'

export function checkDemoCredentials(user: string, password: string): boolean {
  return user.trim() === DEMO_USER && password === DEMO_PASSWORD
}

export function startDemoSession(user: string): void {
  sessionStorage.setItem(SESSION_KEY, user.trim())
}

export function getDemoSession(): string | null {
  return sessionStorage.getItem(SESSION_KEY)
}

export function endDemoSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

/** Etiqueta del usuario de demo (para mostrar en ayudas de la pantalla). */
export const DEMO_HINT = { user: DEMO_USER, password: DEMO_PASSWORD }
