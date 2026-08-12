import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  /*
   * Tope de concurrencia. Con los 4 workers que Playwright elige por defecto en
   * esta máquina, acciones que aisladas tardan ~1 s agotaban el timeout de 30 s
   * por saturación de CPU, y fallaban las 4 pruebas de escritorio. Medido:
   * 1 worker 10/10 en 24,7 s · 2 workers 10/10 en 20,0 s · 4 workers 6/10.
   * Los runners de CI son igual de modestos (2 vCPU), así que se fija 2 en ambos.
   */
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    /*
     * Se sirve el build, no el servidor de desarrollo: así se prueba el mismo
     * artefacto que se despliega y desaparece la compilación perezosa de las
     * ocho rutas, que en frío tardaba ~30 s y agotaba el timeout de navegación.
     *
     * En CI el job descarga `dist` del job `build`, así que aquí no se
     * reconstruye: se prueba exactamente el bundle ya auditado. En local se
     * construye antes de servir, para no arrastrar un `dist` obsoleto.
     */
    command: process.env.CI
      ? 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort'
      : 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    // El Laboratorio se despliega por capacidades, así que hay que encenderlo
    // para poder ejercitarlo. En CI el build lo hace el job `build`, que lee
    // esta misma variable del workflow.
    //
    // La lista es **exactamente la que publica `deploy-pages.yml`**: probar una
    // combinación distinta de la que se despliega valida un artefacto que nadie
    // va a usar. `deployFlags.test.ts` falla si las tres listas se separan.
    env: { VITE_LAB_FLAGS: 'labShell,labIpsV2,labStabilityV2,labLookThrough' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    // El build local cabe de sobra aquí; el servidor en sí arranca en ~1 s.
    timeout: 180_000,
  },
})
