/**
 * Auditoría de accesibilidad (LAB-1001).
 *
 * Pasa axe sobre todas las pantallas del Laboratorio y de la aplicación, con el
 * conjunto de reglas WCAG 2.2 AA.
 *
 * ## Por qué en CI y no en una revisión de una tarde
 *
 * Una auditoría manual dice cómo estaba la aplicación el día que se hizo. Esta
 * dice cómo está hoy, y falla el día que alguien meta un `div` con `onClick` o
 * un color con contraste insuficiente. El plan pedía «automático + manual»: esto
 * es la mitad automática, y la manual está en el acta de G10.
 *
 * ## Lo que axe NO detecta
 *
 * Queda escrito para que nadie lea un verde de aquí como «es accesible»:
 *
 * - que el orden de tabulación tenga sentido;
 * - que un texto alternativo describa lo que hay que describir;
 * - que un mensaje de error se entienda;
 * - que un lector de pantalla anuncie un cambio dinámico.
 *
 * Esas cuatro se comprueban a mano, y están en el acta.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { cargarDatosDemo, entrarEnDemo } from './helpers'

/** Pantallas que entran en la revisión. */
const RUTAS: readonly { readonly nombre: string; readonly hash: string }[] = [
  { nombre: 'Resumen', hash: '#/resumen' },
  { nombre: 'Calculadora', hash: '#/calculadora' },
  { nombre: 'Cartera', hash: '#/cartera' },
  { nombre: 'Importar', hash: '#/importar' },
  { nombre: 'Perfil', hash: '#/perfil' },
  { nombre: 'Laboratorio · portada', hash: '#/laboratorio' },
  { nombre: 'Laboratorio · estabilidad', hash: '#/laboratorio/estabilidad' },
  { nombre: 'Laboratorio · datos', hash: '#/laboratorio/estabilidad/datos' },
  { nombre: 'Laboratorio · exposición', hash: '#/laboratorio/estabilidad/exposicion' },
  { nombre: 'Laboratorio · dependencia', hash: '#/laboratorio/estabilidad/dependencia' },
  { nombre: 'Laboratorio · riesgo', hash: '#/laboratorio/estabilidad/riesgo' },
  { nombre: 'Laboratorio · futuro', hash: '#/laboratorio/futuro' },
  { nombre: 'Laboratorio · escenarios', hash: '#/laboratorio/futuro/escenarios' },
  { nombre: 'Laboratorio · candidatas', hash: '#/laboratorio/futuro/candidatas' },
  { nombre: 'Laboratorio · reparar', hash: '#/laboratorio/futuro/reparar' },
  { nombre: 'Laboratorio · sectores', hash: '#/laboratorio/futuro/sectores' },
  { nombre: 'Laboratorio · cálculos', hash: '#/laboratorio/runs' },
]

for (const ruta of RUTAS) {
  test(`accesibilidad · ${ruta.nombre}`, async ({ page }) => {
    // Se usan los mismos helpers que el resto de la suite: entrar por la puerta
    // de demostración y cargar la cartera de ejemplo. Auditar pantallas vacías
    // no diría nada de las tablas, que es donde están los riesgos.
    await entrarEnDemo(page)
    await cargarDatosDemo(page)
    await page.goto(`/${ruta.hash}`)
    // Las pantallas del Laboratorio montan su shell de forma diferida.
    await page.waitForSelector('main', { state: 'attached' })

    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    // Se listan las reglas incumplidas **con sus selectores**, no solo el
    // número: un fallo tiene que decir qué arreglar sin abrir el informe HTML.
    const incumplidas = resultado.violations.map(
      (v) =>
        `${v.id} (${v.impact ?? 'sin impacto'}) → ${v.nodes
          .slice(0, 4)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    )
    expect(incumplidas, `${ruta.nombre}:\n  ${incumplidas.join('\n  ')}`).toEqual([])
  })
}
