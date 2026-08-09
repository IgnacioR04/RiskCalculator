import { expect, test, type Page } from '@playwright/test'
import {
  SECCIONES,
  TEXTO_ERROR_FATAL,
  cargarDatosDemo,
  entrarEnDemo,
} from './helpers'

/**
 * Baseline de navegación de las ocho superficies actuales (LAB-007).
 *
 * Existe para que la migración de navegación de la Fase 1 no rompa ninguna
 * pantalla en silencio: aquí se congela lo que hoy funciona. No comprueba
 * reglas de negocio —de eso se ocupa `core-flows.spec.ts`—, sino que cada ruta
 * carga, se identifica con su encabezado y no revienta.
 *
 * Se ejecuta contra el build servido con `vite preview` y **sin variables de
 * Supabase**, de modo que se ejercita el modo local/demo sin cuenta.
 */

/** Registra las excepciones no capturadas que lance la página. */
function vigilarErrores(page: Page): string[] {
  const errores: string[] = []
  page.on('pageerror', (error) => errores.push(error.message))
  return errores
}

test('las ocho rutas cargan con su encabezado numerado y sin error fatal', async ({ page }) => {
  const errores = vigilarErrores(page)
  await entrarEnDemo(page)
  await cargarDatosDemo(page)

  for (const seccion of SECCIONES) {
    await test.step(`${seccion.num} ${seccion.titulo}`, async () => {
      // Navegación directa por URL con hash: es lo que hace un enlace guardado.
      await page.goto(seccion.ruta)
      await expect(page.getByRole('heading', { name: seccion.titulo, level: 1 })).toBeVisible()
      await expect(page.getByText(TEXTO_ERROR_FATAL)).toHaveCount(0)
    })
  }

  expect(errores, `excepciones no capturadas: ${errores.join(' | ')}`).toEqual([])
})

test('la shell mantiene el landmark de navegación en todas las rutas', async ({
  page,
  isMobile,
}) => {
  await entrarEnDemo(page)

  // La shell expone dos landmarks distintos según el ancho: el rail lateral en
  // escritorio y la barra inferior en móvil. Solo uno está en el árbol de
  // accesibilidad a la vez, porque el otro queda oculto por CSS.
  const landmark = isMobile ? 'Navegacion principal' : 'Secciones'

  for (const seccion of SECCIONES) {
    await page.goto(seccion.ruta)
    await expect(page.getByRole('navigation', { name: landmark })).toBeVisible()
  }
})

test('las rutas antiguas siguen redirigiendo a su sección actual', async ({ page }) => {
  await entrarEnDemo(page)

  // Enlaces guardados de la versión anterior. La Fase 1 no debe romperlos.
  await page.goto('/#/portfolio')
  await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible()
  expect(page.url()).toContain('#/cartera')

  await page.goto('/#/escenarios')
  await expect(page.getByRole('heading', { name: 'Simular', level: 1 })).toBeVisible()
  expect(page.url()).toContain('#/simular')

  // Una ruta inexistente aterriza en el resumen en lugar de dejar la app vacía.
  await page.goto('/#/ruta-que-no-existe')
  await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible()
  expect(page.url()).toContain('#/resumen')
})

test('sin Supabase configurado la aplicación entra en modo local sin cuenta', async ({ page }) => {
  await page.goto('/')

  // El build de pruebas no lleva VITE_SUPABASE_*, así que `LoginGate` no ofrece
  // registro ni inicio de sesión: solo la puerta de demostración.
  await expect(page.getByRole('tab', { name: 'Crear cuenta' })).toHaveCount(0)
  await expect(page.getByLabel('Usuario de prueba')).toBeVisible()

  await entrarEnDemo(page)
  await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible()
})

test('la navegación inferior del móvil abre sus cinco secciones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Solo aplica al proyecto móvil: en escritorio hay rail lateral')

  await entrarEnDemo(page)

  for (const seccion of SECCIONES.filter((s) => 'movil' in s)) {
    const etiqueta = (seccion as { movil: string }).movil
    await page.getByRole('link', { name: etiqueta, exact: true }).click()
    await expect(page.getByRole('heading', { name: seccion.titulo, level: 1 })).toBeVisible()
  }
})

test('el rail de escritorio abre las ocho secciones', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Solo aplica al proyecto de escritorio: en móvil no hay rail')

  await entrarEnDemo(page)

  for (const seccion of SECCIONES) {
    await page
      .getByRole('link', { name: `${seccion.num} ${seccion.titulo}`, exact: true })
      .click()
    await expect(page.getByRole('heading', { name: seccion.titulo, level: 1 })).toBeVisible()
  }
})
