/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * SHA corto del commit que se está compilando (LAB-005).
 *
 * Si git no está disponible —un tarball, un contenedor sin `.git`— se devuelve
 * cadena vacía y la aplicación lo mostrará como «desconocido». Fallar el build
 * por no poder etiquetarlo sería peor que no etiquetarlo.
 */
function commitActual(): string {
  if (process.env.GITHUB_SHA !== undefined) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  // En GitHub Pages la app se sirve bajo /RiskCalculator/. En local y Vercel
  // se mantiene la raíz. El workflow de Pages exporta DEPLOY_TARGET=gh-pages.
  base: process.env.DEPLOY_TARGET === 'gh-pages' ? '/RiskCalculator/' : '/',
  plugins: [react()],
  define: {
    // Metadatos del build. Son públicos: el SHA de un repositorio público y una
    // fecha. Aquí no entra nada que no pueda leerse en GitHub.
    __BUILD_COMMIT__: JSON.stringify(commitActual()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    /*
     * Las pruebas de componente ejercitan **la combinación que se publica**.
     *
     * Antes de LAB-1013 daba igual, porque nadie leía el campo `feature` de las
     * rutas: la suite corría sin esta variable y aun así veía todas las
     * pantallas. Ahora que apagar una capacidad la oculta de verdad, correr sin
     * variable significaría probar una aplicación que nadie usa.
     *
     * La lista es la misma que `deploy-pages.yml`, `ci.yml` y
     * `playwright.config.ts`, y `src/lib/features/deployFlags.test.ts` falla si
     * este archivo se separa de los otros tres. Una prueba concreta que quiera
     * la capacidad apagada usa `vi.stubEnv`, que es lo correcto: lo declara.
     */
    env: {
      VITE_LAB_FLAGS:
        'labShell,labIpsV2,labStabilityV2,labLookThrough,labScenarioEngine,labCandidates,labSectorResearch,labNarrativeExplanation',
    },
    /*
     * El umbral por defecto de Vitest son 5 s, pensados para pruebas de lógica
     * pura. Esta suite incluye pruebas de componente, y la primera de cada
     * archivo absorbe un coste único de arranque: el primer render de React y
     * la primera pasada por los esquemas de validación e importación.
     *
     * Ese arranque es trabajo legítimo, no una espera mal hecha. Medido sobre
     * `ImportarPage > nada se escribe hasta que se confirma`, que es una prueba
     * enteramente síncrona —sin await, temporizadores, waitFor ni mocks—:
     * máquina ociosa 148-190 ms · con 8 procesos de carga 4434 ms · con 16
     * procesos 7499 ms, y ahí superaba los 5 s. La prueba siguiente del mismo
     * archivo hace estrictamente más trabajo (valida, confirma y comprueba la
     * escritura) y tarda 41-55 ms bajo esa misma carga: el coste no está en lo
     * que la prueba comprueba, sino en calentar el módulo.
     *
     * 20 s dejan margen frente al peor caso medido sin dejar de detectar un
     * cuelgue real, que nunca terminaría. No se relaja ninguna aserción.
     */
    testTimeout: 20_000,
  },
})
