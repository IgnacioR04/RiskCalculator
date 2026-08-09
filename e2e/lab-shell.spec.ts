import { expect, test } from '@playwright/test'
import { SECCIONES, cargarDatosDemo, entrarEnDemo } from './helpers'

/**
 * E2E de migración (LAB-110). Cierra la puerta G1.
 *
 * Recorre los siete casos de la ficha —ruta nueva, cambio de área, vistas
 * heredadas, redirecciones, móvil, demo y sin backend— sobre el build real.
 * Su función es proteger la migración: si la Fase 1 rompiera un recorrido que
 * hoy funciona, esto debe ponerse en rojo.
 */

test('G1 · abrir una ruta nueva del Laboratorio', async ({ page }) => {
  await page.goto('/#/laboratorio')
  await expect(page.getByRole('heading', { level: 1, name: 'Laboratorio' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Áreas del Laboratorio' })).toBeVisible()
})

test('G1 · cambiar de área conserva la shell y cambia la subnavegación', async ({ page }) => {
  await page.goto('/#/laboratorio/estabilidad')
  await expect(
    page.getByRole('navigation', { name: 'Secciones de Estabilidad', exact: true }),
  ).toBeVisible()

  await page.getByRole('link', { name: /Escenarios y oportunidades/ }).first().click()
  await expect(page).toHaveURL(/#\/laboratorio\/futuro/)
  await expect(
    page.getByRole('navigation', { name: 'Secciones de Escenarios y oportunidades', exact: true }),
  ).toBeVisible()
})

test('G1 · las vistas heredadas siguen funcionando dentro del Laboratorio', async ({ page }) => {
  await entrarEnDemo(page)
  await cargarDatosDemo(page)

  const heredadas = [
    { ruta: '/#/laboratorio/estabilidad/riesgo', ancla: 'Dependencia de un activo' },
    { ruta: '/#/laboratorio/estabilidad/exposicion', ancla: 'Sector' },
  ]

  for (const { ruta, ancla } of heredadas) {
    await page.goto(ruta)
    await expect(page.getByText(ancla).first()).toBeVisible()
    await expect(page.getByText('Algo ha fallado en la interfaz')).toHaveCount(0)
  }
})

test('G1 · las URL antiguas siguen llevando a su herramienta', async ({ page }) => {
  await entrarEnDemo(page)

  for (const { vieja, titulo } of [
    { vieja: '/#/riesgo', titulo: 'Riesgo total y contribuciones' },
    { vieja: '/#/diversificacion', titulo: 'Exposición y concentración' },
    { vieja: '/#/simular', titulo: 'Constructor y comparación' },
  ]) {
    await page.goto(vieja)
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
  }
})

test('G1 · todos los recorridos actuales siguen disponibles', async ({ page }) => {
  await entrarEnDemo(page)

  // Criterio literal de la puerta: ninguna superficie de antes queda perdida.
  for (const seccion of SECCIONES) {
    await page.goto(seccion.ruta)
    const esperado = 'destino' in seccion ? seccion.destino : seccion.titulo
    await expect(page.getByRole('heading', { level: 1, name: esperado })).toBeVisible()
  }
})

test('G1 · el Laboratorio funciona en móvil', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Solo aplica al proyecto móvil')

  await entrarEnDemo(page)
  await page.getByRole('link', { name: 'Lab', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Laboratorio' })).toBeVisible()

  // En móvil la subnavegación es un desplegable, no una tira horizontal.
  await page.goto('/#/laboratorio/estabilidad')
  const selector = page.getByRole('combobox')
  await expect(selector).toBeVisible()
  await selector.selectOption('lab.stability.stress')
  await expect(page.getByRole('heading', { level: 1, name: 'Pruebas de estrés' })).toBeVisible()
})

test('G1 · el modo demo alimenta el Laboratorio', async ({ page }) => {
  await entrarEnDemo(page)
  await cargarDatosDemo(page)

  await page.goto('/#/laboratorio')
  await expect(page.getByText(/posiciones/)).toBeVisible()
  await expect(page.getByText('Todavía no hay nada que analizar')).toHaveCount(0)
})

test('G1 · sin backend, el Laboratorio se abre sin cuenta', async ({ page }) => {
  // El build de pruebas no lleva variables de Supabase.
  await page.goto('/#/laboratorio')

  await expect(page.getByRole('heading', { level: 1, name: 'Laboratorio' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Probar la aplicación' })).toHaveCount(0)
  await expect(page.getByText('Algo ha fallado en la interfaz')).toHaveCount(0)
})
