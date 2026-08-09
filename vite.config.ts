/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // En GitHub Pages la app se sirve bajo /RiskCalculator/. En local y Vercel
  // se mantiene la raíz. El workflow de Pages exporta DEPLOY_TARGET=gh-pages.
  base: process.env.DEPLOY_TARGET === 'gh-pages' ? '/RiskCalculator/' : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
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
