/**
 * LAB-1209. Dos defectos que la auditoría de accesibilidad solo pudo ver cuando
 * la pantalla de dependencia tuvo datos de verdad — hasta entonces la matriz no
 * se pintaba y axe no encontraba nada que revisar.
 *
 * - **La tabla no tenía filas.** `role="table"` exige `role="row"` como hijos
 *   directos; las cabeceras colgaban del propio table, así que un lector de
 *   pantalla no podía anunciar a qué fila pertenecía cada celda.
 * - **El contraste se decidía por un umbral de intensidad**, no midiendo. A
 *   media escala se quedaba en 4,33:1.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RiskMatrix } from './RiskMatrix'

const ETIQUETAS = ['AAA', 'BBB', 'CCC']
const VALORES = [
  [1, 0.6, -0.4],
  [0.6, 1, 0.1],
  [-0.4, 0.1, 1],
]

/** Contraste WCAG entre dos colores en formato `rgb(r g b)` o `#rrggbb`. */
function contraste(a: string, b: string): number {
  const lum = (color: string) => {
    const nums = color.startsWith('#')
      ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
      : color.match(/\d+/g)!.map(Number)
    const canal = (c: number) => {
      const x = c / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * canal(nums[0]!) + 0.7152 * canal(nums[1]!) + 0.0722 * canal(nums[2]!)
  }
  const [claro, oscuro] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (claro! + 0.05) / (oscuro! + 0.05)
}

describe('RiskMatrix · estructura', () => {
  it('la tabla tiene filas, y las cabeceras cuelgan de una', () => {
    render(<RiskMatrix labels={ETIQUETAS} values={VALORES} mode="correlacion" />)

    const tabla = screen.getByRole('table')
    // Una fila de cabecera más una por etiqueta.
    expect(screen.getAllByRole('row')).toHaveLength(ETIQUETAS.length + 1)

    const cabeceras = screen.getAllByRole('columnheader')
    expect(cabeceras).toHaveLength(ETIQUETAS.length)
    for (const c of cabeceras) {
      // Sin esto, axe marca `aria-required-parent` como crítico.
      expect(c.closest('[role="row"]')).not.toBeNull()
      expect(tabla).toContainElement(c)
    }
  })

  it('cada celda pertenece a una fila', () => {
    render(<RiskMatrix labels={ETIQUETAS} values={VALORES} mode="correlacion" />)
    for (const celda of screen.getAllByRole('cell')) {
      expect(celda.closest('[role="row"]')).not.toBeNull()
    }
  })
})

describe('RiskMatrix · contraste', () => {
  it('toda casilla llega al 4,5:1 que exige WCAG AA', () => {
    // Se recorre la escala entera, no una muestra: el fallo estaba justo en el
    // tramo medio y en el extremo positivo, que son los que un ojo humano no
    // señala como sospechosos.
    const escala = [-1, -0.8, -0.55, -0.3, 0, 0.3, 0.55, 0.8, 1]
    const valores = escala.map((v) => [v])

    render(<RiskMatrix labels={['X']} values={valores} mode="correlacion" />)

    for (const celda of screen.getAllByRole('cell')) {
      const estilo = (celda as HTMLElement).style
      if (estilo.backgroundColor === '' || estilo.color === '') continue
      expect(contraste(estilo.backgroundColor, estilo.color)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('la diagonal, que es el extremo de la escala, también cumple', () => {
    render(<RiskMatrix labels={ETIQUETAS} values={VALORES} mode="correlacion" />)
    const diagonales = document.querySelectorAll<HTMLElement>('.rmatrix-cell.diagonal')
    expect(diagonales.length).toBeGreaterThan(0)
    for (const celda of diagonales) {
      expect(contraste(celda.style.backgroundColor, celda.style.color)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
