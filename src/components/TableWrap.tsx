import { useEffect, useRef, useState } from 'react'

/**
 * Contenedor de tabla con desplazamiento horizontal accesible por teclado.
 *
 * Un `div` con `overflow-x: auto` es alcanzable con el ratón y con el dedo, pero
 * no con el teclado: quien navega con tabulador no puede llegar a las columnas
 * que quedan fuera. Es la regla `scrollable-region-focusable` de axe, y la
 * auditoría de LAB-1001 la encontró en la pantalla de estabilidad en móvil,
 * donde la tabla desborda.
 *
 * El `tabIndex` se pone **solo cuando la tabla desborda de verdad**. Ponerlo
 * siempre añadiría una parada de tabulador inútil en cada tabla de escritorio,
 * que es una molestia real para la misma persona a la que esto pretende ayudar.
 * Por eso se mide, y se vuelve a medir cuando cambia el tamaño: el desbordamiento
 * aparece y desaparece al girar el móvil o al estrechar la ventana.
 *
 * No lleva `role="region"`: una región sin nombre accesible incumple otra regla,
 * y la regla de axe que aquí importa se satisface solo con poder enfocarlo.
 */
export function TableWrap(props: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [desborda, setDesborda] = useState(false)

  useEffect(() => {
    const elemento = ref.current
    if (elemento === null) return

    // 1 px de holgura: `scrollWidth` y `clientWidth` son enteros redondeados y
    // un ancho fraccionario puede dar una diferencia de 1 px que no desplaza
    // nada, pero sí crearía la parada de tabulador vacía que se quiere evitar.
    const medir = () => setDesborda(elemento.scrollWidth - elemento.clientWidth > 1)

    medir()

    // `ResizeObserver` existe en todos los navegadores que soporta la
    // aplicación, pero no en jsdom. Sin esta guarda, montar cualquier tabla en
    // una prueba de componente reventaba: 30 pruebas ajenas a esto se pusieron
    // en rojo. Si falta, se conserva la medida inicial, que es la correcta
    // mientras nadie cambie el tamaño.
    if (typeof ResizeObserver === 'undefined') return

    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="table-wrap"
      {...(props.style === undefined ? {} : { style: props.style })}
      {...(desborda ? { tabIndex: 0 } : {})}
    >
      {props.children}
    </div>
  )
}
