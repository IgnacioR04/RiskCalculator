import { expect, test } from '@playwright/test'
import { cargarDatosDemo, entrarEnDemo } from './helpers'

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
  await expect(page).toHaveURL(/#\/laboratorio$/)
})

test('el resto de la aplicación sigue pidiendo acceso', async ({ page }) => {
  await page.goto('/#/cartera')

  // Cartera no es pública: la puerta sigue en su sitio.
  await expect(page.getByRole('button', { name: 'Probar la aplicación' })).toBeVisible()
})

/** Porcentajes visibles en la página, en orden de aparición. */
async function porcentajes(page: import('@playwright/test').Page): Promise<string[]> {
  const texto = await page.locator('body').innerText()
  return texto.match(/-?\d+(?:[.,]\d+)?\s?%/g) ?? []
}

test('Riesgo muestra las mismas cifras dentro y fuera del Laboratorio', async ({ page }) => {
  await entrarEnDemo(page)
  await cargarDatosDemo(page)

  await page.goto('/#/riesgo')
  await expect(page.getByText('Dependencia de un activo')).toBeVisible()
  const fuera = await porcentajes(page)
  expect(fuera.length).toBeGreaterThan(0)

  await page.goto('/#/laboratorio/estabilidad/riesgo')
  await expect(page.getByText('Dependencia de un activo')).toBeVisible()
  const dentro = await porcentajes(page)

  // Mismo input, mismo resultado: no hay dos implementaciones, hay una.
  expect(dentro).toEqual(fuera)
})

test('la versión dentro del Laboratorio se declara como la actual', async ({ page }) => {
  await page.goto('/#/laboratorio/estabilidad/riesgo')

  await expect(page.getByText(/versión actual del análisis de riesgo/)).toBeVisible()
  // Un solo h1: el de la shell. La pantalla no repite su encabezado numerado.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
})

test('Diversificación muestra las mismas cifras dentro y fuera del Laboratorio', async ({
  page,
}) => {
  await entrarEnDemo(page)
  await cargarDatosDemo(page)

  await page.goto('/#/diversificacion')
  await expect(page.getByRole('radio', { name: 'Sector' })).toBeVisible()
  const fuera = await porcentajes(page)
  expect(fuera.length).toBeGreaterThan(0)

  await page.goto('/#/laboratorio/estabilidad/exposicion')
  await expect(page.getByRole('radio', { name: 'Sector' })).toBeVisible()
  const dentro = await porcentajes(page)

  expect(dentro).toEqual(fuera)
})

test('Simular produce resultados idénticos dentro y fuera del Laboratorio', async ({ page }) => {
  await entrarEnDemo(page)
  await cargarDatosDemo(page)

  await page.goto('/#/simular')
  const fuera = await porcentajes(page)

  await page.goto('/#/laboratorio/futuro/escenarios')
  const dentro = await porcentajes(page)

  expect(dentro).toEqual(fuera)
  // Los shocks se declaran como escenarios deterministas, no como predicción.
  await expect(page.getByText(/escenarios deterministas/)).toBeVisible()
  await expect(page.getByText(/No estiman probabilidades ni predicen precios/)).toBeVisible()
})

test('las URL antiguas redirigen sin 404 ni bucle, y avisan de la mudanza', async ({ page }) => {
  const mudanzas = [
    { vieja: '/#/riesgo', nueva: '#/laboratorio/estabilidad/riesgo' },
    { vieja: '/#/diversificacion', nueva: '#/laboratorio/estabilidad/exposicion' },
    { vieja: '/#/simular', nueva: '#/laboratorio/futuro/escenarios' },
  ]

  await entrarEnDemo(page)

  for (const { vieja, nueva } of mudanzas) {
    await page.goto(vieja)
    // `toHaveURL` reintenta: la redirección la hace React tras procesar el
    // cambio de hash, así que leer `page.url()` sin esperar llega demasiado pronto.
    await expect(page).toHaveURL(new RegExp(nueva.replace(/[/?]/g, '\$&')))
    await expect(page.getByText(/ahora está dentro de Laboratorio/)).toBeVisible()
  }

  // El aviso se puede cerrar y no vuelve solo.
  await page.getByRole('button', { name: 'Entendido' }).click()
  await expect(page.getByText(/ahora está dentro de Laboratorio/)).toHaveCount(0)
})

test('volver atrás desde una URL antigua no rebota', async ({ page }) => {
  await entrarEnDemo(page)
  await page.goto('/#/cartera')
  await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible()

  await page.goto('/#/riesgo')
  await expect(page).toHaveURL(/#\/laboratorio\/estabilidad\/riesgo/)

  // `replace` deja fuera la ruta vieja del historial: atrás vuelve a Cartera y
  // no al redirector, que reenviaría otra vez y atraparía al usuario.
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible()
})

test('la redirección conserva la cadena de consulta', async ({ page }) => {
  await entrarEnDemo(page)
  await page.goto('/#/riesgo?periodo=365')
  await expect(page).toHaveURL(/#\/laboratorio\/estabilidad\/riesgo\?periodo=365/)
})
