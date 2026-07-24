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
  },
})
