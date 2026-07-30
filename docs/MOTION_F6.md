# F6 — Oportunidades de movimiento

Barrido de solo lectura sobre `src/`. **No se ha modificado ningún fichero.**

## Reconocimiento

- **Sin librería de motion**: ni framer-motion ni springs. Todo CSS. Cualquier
  propuesta debe ser CSS puro o no entra.
- **Vocabulario ya existente** (añadido en F4, en `tokens.css`): `--ease-out:
  cubic-bezier(0.25, 0.46, 0.45, 0.94)`, `--ease-out-strong:
  cubic-bezier(0.16, 1, 0.3, 1)`, `--dur-instant: 90ms`, `--dur-fast: 140ms`,
  `--dur-base: 200ms`, `--dur-slow: 280ms`. Las propuestas los consumen; no se
  inventa vocabulario paralelo.
- **Movimiento actual**: 7 reglas de transición (hover de botón y de celda,
  color de nav, rotación del caret, opacidad del velo) más un `@keyframes sk`
  para el skeleton. `.btn:active` existe (`global.css:335`, bloque heredado):
  `transform: translateY(1px)` instantáneo.
- **Personalidad**: panel financiero denso, con «terminal de trading» y
  «cripto/neón» declarados anti-referencia y «nada de easing con rebote» en
  `DESIGN.md`. Eso significa **menos** sugerencias y más sutiles, no más.

### Mapa de frecuencia

| Superficie | Frecuencia | Elegible |
|---|---|---|
| Raíl de navegación, cambio de ruta | 100+/día | **No, nunca** |
| Conmutador EUR/USD, tabs, segmentados | Decenas/día | Solo imperceptible (ya lo tiene) |
| Cifras de la calculadora al teclear | Continuo | **No** |
| Tooltip de gráfica | Constante al leer | **No** |
| Desplegable del desglose matemático | Ocasional | Sí |
| Flujo de importación | Ocasional | Sí |
| Confirmación de guardado | Ocasional | Sí |
| Empty states, primer uso, resultado del perfil | Raro / primera vez | Sí — aquí vive el presupuesto de deleite |

---

## Parte 1 — Oportunidades

Ordenadas por palanca. Todas animan **solo `transform` y `opacity`**.

| # | Ubicación | Hoy | Propósito | Frecuencia | Movimiento propuesto |
|---|---|---|---|---|---|
| 1 | `ImportarPage.tsx:225` (previsualización) y `:214` (errores) | La tarjeta aparece de golpe tras «Validar y previsualizar» | Evitar un cambio brusco | Ocasional | Entrada con `@starting-style`: `opacity: 0; transform: translateY(6px)` → asentado, `transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)`. Sin salida: la tarjeta se sustituye por el resultado confirmado |
| 2 | `global.css:2505` (`.disclose-body`), componente en `ui.tsx:471` | El caret gira 140ms pero **el cuerpo abre de golpe** | Indicación de estado | Ocasional | `interpolate-size: allow-keywords` en `:root` + `details.disclose::details-content { height: 0; opacity: 0; overflow: hidden; transition: height var(--dur-base) var(--ease-out), opacity var(--dur-fast) var(--ease-out), content-visibility var(--dur-base) allow-discrete }` y `[open]::details-content { height: auto; opacity: 1 }`. Donde no haya soporte, se degrada al salto actual |
| 3 | `ui.tsx:512` (`EmptyState`), usado en `PortfolioPage.tsx:137` y `DiversificacionPage.tsx:45` | Estado vacío plano | Deleite (nivel raro / primera vez) | Raro | `opacity: 0 → 1` y `transform: translateY(8px) → 0`, `var(--dur-slow) var(--ease-out-strong)`; el glifo `.icon` con `60ms` de retardo. Es el único sitio del barrido donde se admite un tiempo más largo |
| 4 | `CalculadoraPage.tsx:440` y `:943` | «Guardado en cálculos y escenarios» aparece instantáneo al lado del botón | Retroalimentación | Ocasional | `@starting-style`: `opacity: 0; transform: translateX(-4px)` → asentado, `var(--dur-fast) var(--ease-out)`. 140ms: confirma sin hacerse notar |
| 5 | `PerfilPage.tsx:190` (resultado tras las 5 preguntas) | El resultado del perfil aparece de golpe al guardar | Deleite (raro / primera vez) | Raro | Misma receta que #3 con `var(--dur-base)`: `opacity` + `translateY(6px)`, `var(--ease-out-strong)` |

**Reduced-motion para todas**: el patrón debe ser *más suave, no cero*. Se
conserva el cambio de opacidad y se elimina el desplazamiento:

```css
@media (prefers-reduced-motion: reduce) {
  /* la entrada sigue existiendo, pero sin traslación */
  transform: none;
}
```

> **Aviso relacionado.** `tokens.css` tiene un apagado global:
> `* { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important }`.
> Un apagado indiscriminado destruye retroalimentación útil (el criterio de
> `audit.md` de impeccable lo marca explícitamente como hallazgo). Si se
> implementa cualquiera de las cinco filas, conviene sustituirlo por
> reducciones por caso. **Decisión previa a implementar.**

## Parte 2 — Candidatos rechazados

- **Raíl de navegación y transición de ruta** (`AppShell.tsx`, `App.tsx:43`) —
  **Rechazado: navegación central, 100+/día. Nunca se anima.** Una transición de
  página aquí convierte cada clic en una espera.
- **Las dos cifras de la calculadora al teclear** (`CalculadoraPage.tsx`,
  `.big-figure`) — **Rechazado por la pregunta 4: son datos que el usuario está
  leyendo y comparando.** Un contador animado o un fundido en cada pulsación
  haría ilegible justo lo que el producto existe para mostrar.
- **Dibujado progresivo de las líneas de las gráficas** (las 6 tienen
  `isAnimationActive={false}` puesto a mano) — **Rechazado: decoración sobre
  datos funcionales.** La decisión actual es la correcta y debe mantenerse.
- **Aparición del tooltip de gráfica** (`chartTheme.ts:24`) — **Rechazado por la
  pregunta 1: se dispara continuamente al recorrer el gráfico.** Animar su
  opacidad o su posición retrasaría la lectura del valor.
- **Conmutador EUR/USD, tabs y segmentados** — **Rechazado: decenas de día.** Ya
  tienen `background var(--dur-fast) var(--ease-out)`, que es exactamente el
  nivel imperceptible que permite ese tramo de frecuencia. Añadir un indicador
  deslizante sería empeorarlo.

## Parte 3 — Veredicto

Esta interfaz necesita **poco** movimiento, y está más cerca de lo correcto de
lo que parecía: las decisiones difíciles ya están tomadas bien —gráficas sin
animación, easing sin rebote, transiciones de 140ms en los controles frecuentes—
y lo que falta no es carácter sino **puentes en cuatro o cinco sitios donde el
contenido teletransporta**.

La fila con más palanca es la **#1, el flujo de importación**: es el momento de
mayor riesgo de la app —el usuario está a punto de escribir datos en su
cartera— y hoy la previsualización aparece sin ningún puente. Un fundido de
200ms ahí compra confianza en el paso más delicado.

La #2 (el desplegable) es la de mejor relación esfuerzo/beneficio: dos reglas
CSS arreglan un salto que hoy contradice al caret, que sí se anima.

**Nada de esto está implementado.** Siguiente paso: convertir las filas
aprobadas en planes con `improve-animations plan <fila>`, o implementarlas
directamente y cerrar con `review-animations` sobre el diff.

---

# Implementación y revisión (2026-07-30)

## Estado final

| Fila | Estado | Verificación |
|---|---|---|
| 1 · Previsualización de importación | **Implementada** | Flujo real: la tarjeta entra con `opacity: 0`, `translateY(6px)`, dos transiciones de 200ms `ease-out` |
| 2 · Apertura del desplegable | **REVERTIDA** | No funciona en Chrome 148 y clipaba el contenido. Ver abajo |
| 3 · Estados vacíos | **Implementada** | 280ms `ease-out-strong`, glifo con 60ms de retardo |
| 4 · Confirmación de guardado | **Implementada** | Cazada en tránsito: `opacity 0`, `translateX(-4px)`, 140ms |
| 5 · Resultado del perfil | **Implementada** | Comparte `.enter-rise` con la fila 1 |
| Reduced-motion | **Corregido** | Apagado global eliminado; cuatro reglas por caso |

## Por qué se revirtió la fila 2

La receta canónica (`::details-content` con `height: 0 → auto`,
`overflow: hidden` e `interpolate-size: allow-keywords`) se implementó completa.
`CSS.supports('selector(details::details-content)')` devuelve `true` en Chrome
148 y `interpolate-size` computaba `allow-keywords`, así que sobre el papel
estaba soportado.

Medido en un `<details>` aislado con el mismo CSS: **41px de alto tanto cerrado
como abierto**, 400ms después del clic. La transición no arrancaba y el
`height: 0` con `overflow: hidden` clipaba el contenido de forma permanente: el
desglose matemático quedaba invisible al abrirlo. `getAnimations()` solo
reportaba la rotación del caret.

Un salto instantáneo es peor que una animación, pero mucho mejor que contenido
oculto. Revertida: el cuerpo vuelve a abrir de golpe (verificado: 42px → 332px)
y el caret sigue girando en 140ms. A revisar cuando el soporte madure.

## Revisión contra los diez estándares

Sin hallazgos en el diff. Comprobado explícitamente:

- `transition: all` — ninguno.
- `ease-in` o easing con rebote — ninguno; todo `--ease-out` /
  `--ease-out-strong`.
- `scale(0)` o entradas sin transform inicial — ninguna.
- Propiedades de layout animadas (`width`/`height`/`margin`/`top`/`left`) —
  ninguna. Solo `transform` y `opacity`.
- Duración > 300ms — ninguna. El techo es 280ms y solo en el nivel raro.
- Animación en acción de teclado o de 100+/día — ninguna.
- `prefers-reduced-motion` — atendido, y ahora *reducido en vez de apagado*.
- Movimiento en `:hover` sin gate `@media (hover: hover)` — no aplica: los
  `:hover` del proyecto solo animan color, fondo y borde, nunca `transform`.
- Keyframes en superficies de disparo rápido — el único `@keyframes` es el
  pulso del skeleton, y bajo reduced-motion se detiene.

### Observaciones menores (no son hallazgos del diff)

- `global.css:327` declara `transition: ..., transform 0.06s ease` para `.btn`,
  pero la regla `.btn` del bloque vivo (1897) la sustituye por completo y no
  incluye `transform`. Es código muerto: el `:active` del botón es instantáneo,
  que es además el comportamiento correcto para retroalimentación de pulsación.
- `.rmatrix-cell` declara una transición de `transform` que nada dispara:
  ninguna regla le aplica un `transform`. Declaración muerta.
- La entrada de `.empty-state` se ejecuta en cada montaje, no solo la primera
  vez. Para un usuario sin datos que navega entre páginas se repite. Son 280ms
  y solo al montar, así que se acepta; si molestase, la solución es un flag de
  primera visita, no acortar la animación.
