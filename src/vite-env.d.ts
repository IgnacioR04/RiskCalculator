/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del proyecto Supabase. Pública. */
  readonly VITE_SUPABASE_URL?: string
  /** Anon key de Supabase. Pública por diseño; los datos se protegen con RLS. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Credenciales de la puerta de demostración. No son un secreto real. */
  readonly VITE_DEMO_USER?: string
  readonly VITE_DEMO_PASSWORD?: string
  /**
   * Capacidades del Laboratorio activas, separadas por comas. Decide qué se
   * muestra, nunca qué se permite: ver `src/lib/features/flags.ts`.
   */
  readonly VITE_LAB_FLAGS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
