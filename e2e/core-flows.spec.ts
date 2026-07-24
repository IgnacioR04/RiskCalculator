import { expect, test, type Page } from '@playwright/test'

async function enterDemo(page: Page) {
  await page.goto('/')
  await page.getByLabel('Usuario de prueba').fill('admin1')
  await page.getByLabel('Contraseña').fill('1234')
  await page.getByRole('button', { name: 'Probar la aplicación' }).click()
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible()
}

test('calcula recuperación y equilibrio real', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('link', { name: 'Calculadora' }).click()
  await expect(page.getByRole('heading', { name: 'Calculadora de recuperación' })).toBeVisible()
  await expect(page.getByText('Capital para restaurar el valor inicial')).toBeVisible()
  await page.getByRole('radio', { name: 'Punto de equilibrio real' }).click()
  await expect(page.getByText('Dos números distintos para tu objetivo')).toBeVisible()
  await expect(page.getByText('Compra media')).toBeVisible()
})

test('carga demo y muestra el panel visual de portfolio', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click()
  await page.getByRole('link', { name: 'Portfolio' }).click()
  await expect(page.getByText('Resultado total')).toBeVisible()
  await expect(page.getByText('Dónde está tu dinero')).toBeVisible()
  await expect(page.getByText('posiciones efectivas')).toBeVisible()
  await page.getByRole('radio', { name: 'Riesgo y relaciones' }).click()
  await expect(page.getByText('Riesgo y diversificación')).toBeVisible()
})

test('previsualiza una actualización de cartera generada por IA', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click()
  await page.getByRole('link', { name: 'Importar' }).click()
  await page.getByRole('radio', { name: 'Actualizar una cartera existente' }).click()
  await expect(page.getByText('Prompt para convertir cambios en operaciones')).toBeVisible()
  await page.getByLabel('Respuesta de la IA').fill(
    JSON.stringify({
      schema_version: 1,
      accounts: [],
      positions: [],
      transactions: [
        {
          account_broker: 'Bitget',
          asset: {
            symbol: 'BTC',
            name: 'Bitcoin',
            type: 'crypto',
            quote_currency: 'EUR',
            isin: null,
          },
          type: 'sell',
          datetime: '2026-07-24',
          invested_amount: '100',
          invested_currency: 'EUR',
          quantity: '0.0015',
          execution_price: '66666.67',
          evidence: 'vendí 100 euros de BTC',
          confidence: 'high',
        },
      ],
    }),
  )
  await page.getByRole('button', { name: 'Validar y previsualizar' }).click()
  await expect(page.getByRole('heading', { name: 'Previsualización' })).toBeVisible()
  await expect(page.getByText('Venta')).toBeVisible()
})
