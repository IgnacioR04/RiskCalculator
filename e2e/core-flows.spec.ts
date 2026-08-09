import { expect, test } from '@playwright/test'
import { entrarEnDemo as enterDemo, irASeccion as goToSection } from './helpers'

/**
 * Flujos principales sobre el shell de ocho secciones. Los enlaces del rail
 * exponen su nombre accesible como «NN Título» (p. ej. «02 Calculadora»), y
 * cada pantalla abre con su encabezado numerado, que es el h1 de la vista.
 *
 * La cobertura de que las ocho rutas cargan vive en `navigation-current.spec.ts`
 * (LAB-007); aquí se comprueban comportamientos de producto concretos.
 */

test('calcula recuperación y equilibrio real', async ({ page }) => {
  await enterDemo(page)
  await goToSection(page, '02', 'Calculadora', 'Calcular')
  await expect(page.getByRole('heading', { name: 'Calculadora', level: 1 })).toBeVisible()
  // Invariante de producto: los dos objetivos se ven juntos ya en el modo por
  // defecto, con su diferencia. Antes había que cambiar de pestaña para ver el
  // segundo, y el título de esta tarjeta era «Capital para restaurar el valor
  // inicial».
  await expect(page.getByText('Dos números distintos para tu objetivo')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Restaurar el valor inicial' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Punto de equilibrio real' })).toBeVisible()
  await expect(page.getByText('¿Por qué no coinciden?')).toBeVisible()
  await page.getByRole('radio', { name: 'Punto de equilibrio real' }).click()
  await expect(page.getByText('Compra media')).toBeVisible()
})

test('carga demo y muestra el panel visual de cartera', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click()
  await goToSection(page, '03', 'Cartera', 'Cartera')
  await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible()
  await expect(page.getByText('Resultado total')).toBeVisible()
  await expect(page.getByText('Dónde está tu dinero')).toBeVisible()
  await expect(page.getByText('posiciones efectivas')).toBeVisible()
})

test('el análisis de riesgo vive en su propia sección', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click()
  await goToSection(page, '04', 'Riesgo', 'Riesgo')
  await expect(page.getByRole('heading', { name: 'Riesgo', level: 1 })).toBeVisible()
  await expect(page.getByText('Dependencia de un activo')).toBeVisible()
  await page.getByRole('tab', { name: 'Análisis histórico' }).click()
  await expect(page.getByText('Riesgo y diversificación')).toBeVisible()
})

test('la diversificación reparte por varias dimensiones', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click()
  await goToSection(page, '05', 'Diversificación', 'Reparto')
  await expect(page.getByRole('heading', { name: 'Diversificación', level: 1 })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Sector' })).toBeVisible()
  await page.getByRole('tab', { name: 'Concentración' }).click()
  await expect(page.getByText('Nº efectivo de activos')).toBeVisible()
})

test('previsualiza una actualización de cartera generada por IA', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click()
  await goToSection(page, '07', 'Importar')
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
  await expect(page.getByRole('cell', { name: 'Venta' })).toBeVisible()
})
