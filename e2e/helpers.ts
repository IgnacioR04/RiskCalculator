import { expect, type Page } from '@playwright/test'

/**
 * Helpers compartidos por las especificaciones end-to-end (LAB-007).
 *
 * Las pruebas se ejecutan contra el build servido con `vite preview`, sin
 * variables de Supabase, de modo que la aplicación corre en modo local/demo.
 */

/** Las ocho secciones actuales, con su numeración fija y su etiqueta de rail. */
export const SECCIONES = [
  { num: '01', titulo: 'Resumen', ruta: '/#/resumen', movil: 'Resumen' },
  { num: '02', titulo: 'Calculadora', ruta: '/#/calculadora', movil: 'Calcular' },
  { num: '03', titulo: 'Cartera', ruta: '/#/cartera', movil: 'Cartera' },
  // Migradas al Laboratorio (LAB-105 a LAB-108): su URL sigue viva y redirige,
  // así que el encabezado que aparece es el de su nuevo sitio.
  { num: '04', titulo: 'Riesgo', ruta: '/#/riesgo', destino: 'Riesgo total y contribuciones' },
  { num: '05', titulo: 'Diversificación', ruta: '/#/diversificacion', destino: 'Exposición y concentración' },
  { num: '06', titulo: 'Simular', ruta: '/#/simular', destino: 'Constructor y comparación' },
  { num: '07', titulo: 'Importar', ruta: '/#/importar' },
  { num: '08', titulo: 'Perfil', ruta: '/#/perfil', movil: 'Perfil' },
  { num: '09', titulo: 'Laboratorio', ruta: '/#/laboratorio', movil: 'Lab' },
] as const

/** Texto del fallback del ErrorBoundary: si aparece, el render ha fallado. */
export const TEXTO_ERROR_FATAL = 'Algo ha fallado en la interfaz'

/**
 * Entra en la aplicación por la puerta de demostración. Sin Supabase
 * configurado, `LoginGate` muestra directamente el formulario de demo; con
 * Supabase habría además una pestaña «Demo».
 */
export async function entrarEnDemo(page: Page): Promise<void> {
  await page.goto('/')
  const pestanaDemo = page.getByRole('tab', { name: 'Demo' })
  if (await pestanaDemo.isVisible()) {
    await pestanaDemo.click()
  }
  await page.getByLabel('Usuario de prueba').fill('admin1')
  await page.getByLabel('Contraseña').fill('1234')
  await page.getByRole('button', { name: 'Probar la aplicación' }).click()
  await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible()
}

/** Carga los datos de demostración desde el resumen. */
export async function cargarDatosDemo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click()
}

/**
 * Navega a una sección. En escritorio se usa el rail, cuyo nombre accesible es
 * «NN Título». En móvil el rail se sustituye por una barra inferior de cinco
 * iconos con etiqueta corta; las secciones que no caben ahí se abren por su
 * ruta, que es exactamente lo que hace un usuario con un enlace guardado.
 */
export async function irASeccion(
  page: Page,
  num: string,
  titulo: string,
  etiquetaMovil?: string,
): Promise<void> {
  const rail = page.getByRole('link', { name: `${num} ${titulo}`, exact: true })
  if (await rail.isVisible()) {
    await rail.click()
    return
  }
  if (etiquetaMovil !== undefined) {
    const inferior = page.getByRole('link', { name: etiquetaMovil, exact: true })
    if (await inferior.isVisible()) {
      await inferior.click()
      return
    }
  }
  await page.goto(rutaDe(titulo))
}

/** Ruta con hash de cada sección. */
export function rutaDe(titulo: string): string {
  return SECCIONES.find((s) => s.titulo === titulo)?.ruta ?? '/#/resumen'
}
