import { expect, test } from '@playwright/test'

/**
 * Rutas del Laboratorio (LAB-103).
 *
 * Comprueba navegación directa y recarga sobre el build real, y que el
 * Laboratorio es accesible **sin cuenta**: es una herramienta de análisis sobre
 * datos locales, así que pedir credenciales para mirarlo contradice el
 * requisito de que las funciones esenciales funcionen sin registro.
 */

const RUTAS = [
  { hash: '/#/laboratorio', titulo: 'Laboratorio' },
  { hash: '/#/laboratorio/estabilidad', titulo: 'Resumen de estabilidad' },
  { hash: '/#/laboratorio/estabilidad/riesgo', titulo: 'Riesgo total y contribuciones' },
  { hash: '/#/laboratorio/estabilidad/estres', titulo: 'Pruebas de estrés' },
  { hash: '/#/laboratorio/futuro', titulo: 'Escenarios y decisiones' },
  { hash: '/#/laboratorio/futuro/escenarios', titulo: 'Constructor y comparación' },
  { hash: '/#/laboratorio/futuro/candidatas', titulo: 'Carteras candidatas' },
] as const

test('el Laboratorio se abre sin pasar por la puerta de acceso', async ({ page }) => {
  await page.goto('/#/laboratorio')

  await expect(page.getByRole('heading', { level: 1, name: 'Laboratorio' })).toBeVisible()
  // No se ha pedido usuario ni contraseña en ningún momento.
  await expect(page.getByLabel('Usuario de prueba')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Probar la aplicación' })).toHaveCount(0)
})

test('cada ruta del Laboratorio responde a la navegación directa', async ({ page }) => {
  for (const ruta of RUTAS) {
    await page.goto(ruta.hash)
    await expect(page.getByRole('heading', { level: 1, name: ruta.titulo })).toBeVisible()
    await expect(page.getByText('Algo ha fallado en la interfaz')).toHaveCount(0)
  }
})

test('una ruta profunda sobrevive a la recarga', async ({ page }) => {
  await page.goto('/#/laboratorio/estabilidad/estres')
  await expect(page.getByRole('heading', { level: 1, name: 'Pruebas de estrés' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Pruebas de estrés' })).toBeVisible()
  expect(page.url()).toContain('#/laboratorio/estabilidad/estres')
})

test('la shell mantiene contexto, áreas y subnavegación', async ({ page }) => {
  await page.goto('/#/laboratorio/estabilidad/riesgo')

  await expect(page.getByRole('navigation', { name: 'Ruta' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Contexto del análisis' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Áreas del Laboratorio' })).toBeVisible()

  // Los huecos sin dato se declaran, no se rellenan.
  await expect(page.getByText('No disponible').first()).toBeVisible()
})

test('una subruta inexistente vuelve a la portada del Laboratorio', async ({ page }) => {
  await page.goto('/#/laboratorio/seccion-que-no-existe')

  await expect(page.getByRole('heading', { level: 1, name: 'Laboratorio' })).toBeVisible()
  expect(page.url()).toContain('#/laboratorio')
})

test('el resto de la aplicación sigue pidiendo acceso', async ({ page }) => {
  await page.goto('/#/cartera')

  // Cartera no es pública: la puerta sigue en su sitio.
  await expect(page.getByRole('button', { name: 'Probar la aplicación' })).toBeVisible()
})
