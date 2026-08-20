import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TableWrap } from './TableWrap'

/**
 * jsdom no maqueta: todo mide 0. Se falsean los dos anchos que decide el
 * navegador y el `ResizeObserver` que jsdom tampoco trae, porque lo que se
 * prueba es la regla —enfocable solo si desborda—, no la maquetación.
 */
function medidas(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLDivElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  })
  Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TableWrap', () => {
  it('es alcanzable con el teclado cuando la tabla desborda', () => {
    medidas(600, 320)
    render(
      <TableWrap>
        <table>
          <tbody>
            <tr>
              <td>dato</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>,
    )
    // Sin esto, las columnas que quedan fuera son inalcanzables sin ratón.
    expect(screen.getByRole('table').parentElement).toHaveAttribute('tabindex', '0')
  })

  it('no añade una parada de tabulador cuando la tabla cabe', () => {
    medidas(320, 320)
    render(
      <TableWrap>
        <table>
          <tbody>
            <tr>
              <td>dato</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>,
    )
    expect(screen.getByRole('table').parentElement).not.toHaveAttribute('tabindex')
  })

  it('no revienta en un entorno sin ResizeObserver', () => {
    // jsdom no lo trae. Sin la guarda, montar cualquier tabla tiraba la prueba
    // entera: no es un caso hipotético, puso en rojo 30 pruebas ajenas a esto.
    vi.stubGlobal('ResizeObserver', undefined)
    medidas(600, 320)
    render(
      <TableWrap>
        <table>
          <tbody>
            <tr>
              <td>dato</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>,
    )
    // La medida inicial se conserva: sigue siendo correcta si nadie redimensiona.
    expect(screen.getByRole('table').parentElement).toHaveAttribute('tabindex', '0')
  })

  it('un píxel de diferencia no cuenta como desbordamiento', () => {
    // `scrollWidth` y `clientWidth` son enteros redondeados: un ancho
    // fraccionario da 1 px de diferencia que no desplaza nada.
    medidas(321, 320)
    render(
      <TableWrap>
        <table>
          <tbody>
            <tr>
              <td>dato</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>,
    )
    expect(screen.getByRole('table').parentElement).not.toHaveAttribute('tabindex')
  })
})
