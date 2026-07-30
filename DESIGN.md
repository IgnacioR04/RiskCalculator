---
name: RiskCalculator
description: Instrumento oscuro y profesional para decidir cuánto aportar; el oro marca lo que importa y las cifras se leen como conclusiones.
colors:
  app-bg: "#101112"
  sidebar-bg: "#141516"
  surface-default: "#1b1d1e"
  surface-raised: "#1f2122"
  surface-inset: "#191b1c"
  surface-highlight: "#221f18"
  surface-highlight-deep: "#1f1c14"
  border-default: "#2c2f30"
  border-subtle: "#25282a"
  border-strong: "#464543"
  border-warning: "#4a3f22"
  text-primary: "#f0f0ec"
  text-body: "#b6bcc2"
  text-secondary: "#8c9298"
  text-tertiary: "#7b7f82"
  text-disabled: "#5e6264"
  brand-primary: "#bfa14a"
  brand-hover: "#c9aa55"
  brand-text: "#cfb35d"
  brand-muted: "#7f6c35"
  on-brand: "#12130f"
  positive: "#5aa17f"
  positive-muted: "#497d65"
  negative: "#a8455a"
  negative-muted: "#823a4a"
  negative-text: "#e08a99"
  positive-text: "#7cc4a0"
  warning-text: "#f2d489"
  warning: "#c99a3f"
  info-neutral: "#8b969c"
  benchmark: "#7b7f82"
  tint-positive: "rgba(90, 161, 127, 0.16)"
  tint-negative: "rgba(168, 69, 90, 0.16)"
  tint-warning: "rgba(201, 154, 63, 0.14)"
  tint-info: "rgba(139, 150, 156, 0.16)"
  tint-brand: "rgba(191, 161, 74, 0.16)"
  track-positive: "#2b3d36"
  track-warning: "#413a24"
  track-negative: "#3d2229"
  track-na: "#2f3234"
  series-1: "#b0922e"
  series-2: "#3f6bbf"
  series-3: "#d36c6b"
  series-4: "#99519e"
  series-5: "#10a6ad"
  series-6: "#2b7932"
  chart-portfolio: "#cfd2d0"
  chart-area: "rgba(182, 188, 194, 0.09)"
  chart-grid: "rgba(240, 240, 236, 0.07)"
typography:
  display:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontSize: "46px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums lining-nums"
  headline:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums lining-nums"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  aux:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  mono:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: "13px"
rounded:
  card: "6px"
  control: "4px"
  chip: "3px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  module: "14px"
components:
  button-primary:
    backgroundColor: "{colors.brand-primary}"
    textColor: "{colors.on-brand}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
    textColor: "{colors.on-brand}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-inset}"
  card:
    backgroundColor: "{colors.surface-default}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.card}"
    padding: "{spacing.4}"
  card-highlight:
    backgroundColor: "{colors.surface-highlight}"
    rounded: "{rounded.card}"
    padding: "{spacing.4}"
  input:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  chip:
    backgroundColor: "{colors.tint-info}"
    textColor: "{colors.text-body}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
---

# Design System: RiskCalculator

## Overview

**North Star: el instrumento profesional.** La app tiene que verse profesional
antes que nada, y el oro apagado (`#bfa14a`) es lo que sostiene esa lectura: no
es decoración, es la marca de que algo ha sido medido. Sobre un fondo casi negro
sin gradiente, un solo acento cálido y contenido comunica más autoridad que
cualquier paleta amplia.

Ánimo: sobrio, denso pero respirable, cálido en el acento y frío en el resto.
Las cifras van en serif con números tabulares, así que se leen como conclusiones
escritas y no como un ticker parpadeante. Todo lo demás —etiquetas, controles,
navegación— es sans-serif y se aparta del camino.

Anti-referencias declaradas (vinculantes):

- **Terminal de trading.** Sin verdes/rojos fosforito, sin parpadeos, sin
  densidad agresiva. El propio código lo dice: "herramienta financiera, no un
  terminal de trading".
- **Cripto / neón.** Sin gradientes morado-azul, glow, glassmorphism ni estética
  de exchange.
- **Fintech neobanco.** Sin ilustraciones redondeadas, emojis, radios enormes ni
  tono "tu dinero, fácil". Nada infantilizante.

### Decisiones cerradas en la fase de estructura (2026-07-30)

1. **Profundidad selectiva — aplicada.** Existen `--shadow-popover` y
   `--shadow-overlay`, multicapa y tintados al fondo. La regla operativa: *si
   algo tapa contenido, proyecta sombra; si convive con él, no*. Hoy solo la
   cumplen los tooltips de las gráficas, que es lo único que se superpone.
   Tarjetas, tablas y gráficas siguen planas.
2. **Motion — escala definida.** `--ease-out`, `--ease-out-strong` y
   `--dur-instant/fast/base/slow` (90/140/200/280 ms). Las transiciones que ya
   existían consumen los tokens. Añadir movimiento nuevo es trabajo de la fase
   de animación, no de esta.
3. **Un solo acento, jerarquía por superficie. Decidido: NO habrá color por
   sección.** La evidencia va en contra por dos vías. Las dos referencias
   medidas usan un único acento en toda su superficie, sin variación cromática
   por sección (Mercury un periwinkle, Linear un verde ácido, cero excepciones).
   Y la auditoría encontró que el problema real no era falta de énfasis sino
   falta de acuerdo: el mismo componente de título renderizaba a 37,6px en tres
   páginas y a 11px en las otras cinco. Añadir matiz por sección sobre esa base
   habría multiplicado la inconsistencia en lugar de crear jerarquía.

   **La jerarquía se construye con la escalera de superficie**, que para eso
   tiene cinco pasos: la zona principal en `--surface-raised` o
   `--surface-highlight` (teñida de oro) y el contexto en `--surface-inset`. El
   oro sigue siendo el único acento, con techo del 2 % del área visible.

## Colors

Fuente única de verdad: [src/styles/tokens.css](src/styles/tokens.css). No se
escriben hexadecimales fuera de ese fichero — las gráficas también consumen
tokens. [src/styles/global.css](src/styles/global.css) define encima una capa de
alias (`--color-primary: var(--brand-primary)`, etc.) por compatibilidad
histórica.

### Primary

**Oro Templado** `#bfa14a` — un dorado desaturado, casi latón, sin nada de
brillo metálico. Es el único color cálido del sistema y por eso su presencia es
la señal de importancia. Hover `#c9aa55` (Oro Encendido). Para texto sobre
oscuro se usa `#cfb35d` (Oro Legible), más claro para ganar contraste. Sobre oro
el texto va en `#12130f` (Casi Negro Oliva), nunca blanco.

### Secondary (semántica de resultado)

No hay un segundo color de marca; hay un eje semántico, y es deliberado:

- **Verde Salvia Apagado** `#5aa17f` — positivo. Elegido lejos del verde
  fosforito de exchange.
- **Granate Vino** `#a8455a` — negativo. Serio, no alarmista.
- **Ámbar Advertencia** `#c99a3f` — atención, vecino del oro de marca.
- **Gris Azulado Neutro** `#8b969c` — informativo, benchmark, N/A.

Cada semántico tiene su tinte al 14–16% (`--tint-*`) para fondos de chip y su
pista apagada (`--track-*`) para barras de progreso.

### Neutral

Escala de superficie muy comprimida —cinco pasos en 17 unidades de luminosidad—
que es lo que permite separar capas sin sombras: `#101112` (fondo de app) →
`#141516` (raíl lateral) → `#191b1c` (hundido) → `#1b1d1e` (superficie) →
`#1f2122` (elevado). Los dos `surface-highlight` (`#221f18`, `#1f1c14`) son la
misma idea teñida de oro, para la tarjeta que lleva el resultado principal.

Texto en cuatro pasos: `#f0f0ec` (primario, blanco cálido — nunca blanco puro) →
`#b6bcc2` (cuerpo) → `#8c9298` (secundario) → `#7b7f82` (terciario) → `#5e6264`
(deshabilitado).

### Paleta de gráficas

**Seis slots en orden fijo** (`--series-1..6`), verificados con el validador de
la skill `dataviz` sobre `--surface-default` en oscuro. Las cinco
comprobaciones en PASS: banda de luminosidad, suelo de croma, separación para
deuteranopia/protanopia/tritanopia (peor par adyacente ΔE 11,1), suelo de
visión normal (16,4) y contraste ≥ 3:1 contra la superficie.

| Slot | Hex | Papel |
|---|---|---|
| `--series-1` | `#b0922e` | oro — la primera categoría, ligada a la marca |
| `--series-2` | `#3f6bbf` | azul |
| `--series-3` | `#d36c6b` | rosa terroso |
| `--series-4` | `#99519e` | violeta |
| `--series-5` | `#10a6ad` | turquesa |
| `--series-6` | `#2b7932` | verde |

Alterna cálido/frío y luminosidad, para que el orden siga siendo legible al
desaturar. La cartera del usuario va siempre en `--chart-portfolio` (`#cfd2d0`)
y el benchmark en gris terciario: nunca compiten con las categorías.

Reglas de asignación:

- **El orden es fijo y no se cicla.** A partir del sexto dato el color no se
  reutiliza: la categoría cae al gris de `--na` («Otros»). Repetir el oro en la
  séptima haría que dos entidades distintas compartiesen identidad.
- **El color sigue a la entidad, no a su puesto en el ranking.** Un filtro que
  cambie el número de series no puede repintar a las supervivientes.
- **Categórico ≠ polaridad.** El signo positivo/negativo usa la pareja
  divergente (`--matrix-positive` / `--matrix-negative`), no dos colores del
  orden categórico.
- **La identidad nunca es solo color.** Toda gráfica de categorías lleva al
  lado su lista con etiqueta y porcentaje, más el resumen en `sr-only`.

La paleta anterior de siete series suspendía cuatro de las comprobaciones. Su
peor caso: `#5f6d74` y `#497d65` con **ΔE 6,6 en visión normal** — dos series
que no se distinguían ni con visión de color plena.

### Named Rules

- **El oro se gana.** Un elemento va en oro solo si es la acción principal de la
  pantalla o la cifra que el usuario vino a buscar. Dos oros compitiendo en una
  vista es un fallo.
- **Ni negro puro ni blanco puro.** Todo está teñido: el fondo tira a azul frío,
  el texto claro a cálido.
- **El color nunca es el único portador de significado** en la señalización de
  riesgo: siempre acompañado de signo, etiqueta o posición.
- **Un dato demo se etiqueta como demo**, no se distingue solo por color.

## Typography

Tres familias, cada una con un trabajo exclusivo:

- **Source Serif 4** (`--font-figures`) — **solo cifras**, siempre peso 600,
  siempre `tabular-nums lining-nums`, tracking `-0.01em`. Aplicado con la clase
  `.figure`. Es la firma del sistema.
- **Archivo** (`--font-ui`) — toda la interfaz: títulos, cuerpo, controles,
  navegación.
- **IBM Plex Mono** (`--font-mono`) — tickers, ISIN, fragmentos de datos y
  prompts copiables.

### Hierarchy

| Rol | Token | Tamaño | Familia | Uso |
|---|---|---|---|---|
| Display | `--fs-hero` | 46px | Serif 600 | La cifra protagonista de Calculadora |
| Headline | `--fs-result` | 34px | Serif 600 | Resultados secundarios, KPI grande |
| Title | `--fs-card-title` | 18px | Archivo 600 | Título de tarjeta |
| KPI | `--fs-kpi` | 16px | Serif 600 | Cifra dentro de tarjeta |
| Body | `--fs-body` | 13px | Archivo 400 | Texto corrido, tablas |
| Label | `--fs-label` | 11px | Archivo 400 | Etiquetas, `.14em` tracking, mayúsculas |

### Named Rules

- **Toda cifra monetaria o porcentual usa `.figure`.** Sin excepción: si dos
  números de la misma columna no están en tabulares, la tabla está rota.
- **Las etiquetas en mayúsculas necesitan su tracking** (`0.14em`). Mayúsculas
  con tracking normal se leen apretadas.
- **El titular es la conclusión, el nombre técnico va al lado.** Se dice HHI,
  XIRR, Sharpe — y se explica en llano desde la propia métrica.

### Piso legible

`--fs-aux: 12px` es el suelo. Cualquier texto auxiliar en prosa —hints, avisos,
leyendas, metadatos, celdas de tabla— usa ese tamaño como mínimo. Por debajo de
12px el texto corrido sobre fondo oscuro deja de leerse con comodidad.

`--fs-label: 11px` es la única excepción, y solo para etiquetas en mayúsculas
con tracking, que no se leen como prosa sino como rótulos.

### Texto sobre superficies teñidas

Un tinte al 14–16 % aclara la superficie y le come contraste al gris: el
secundario cae a 4,2:1 dentro de un callout. **Sobre tinte, el texto sube un
paso.** Para eso existen `--positive-text` (#7cc4a0) y `--negative-text`
(#e08a99): los semánticos plenos solo alcanzan 4,34:1 y 2,60:1 sobre su propio
tinte.

### Deuda conocida

Tres tamaños de protagonista siguen escritos a mano en JSX como
`<Figure size="hero"><span style={{ fontSize: 40 }}>`: el `size` del componente
existe pero el número inline lo anula. Afecta al veredicto de riesgo (40px en
Riesgo, 26px en Resumen para el mismo concepto) y al P&L de Resumen (19px).
Unificarlos exige elegir pesos visuales viendo la pantalla.

## Layout

Mobile first. Contenedor máximo 1320px (`--content-max`). Raíl lateral de 58px
en escritorio; en móvil se convierte en barra inferior de 58px de alto
(`--mobile-nav-height`).

Ritmo: escala de espaciado de 4px en seis pasos (4/8/12/16/20/24) más un
`--gap-module: 14px` que es la separación por defecto entre módulos de una
página. El espaciado interior de tarjeta es 16px.

Breakpoints reales en uso: 380px y 720px (max-width, ajustes de compresión),
680px (rejilla de dos columnas), 940px y 980px (paso a escritorio y raíl). Están
sin consolidar — hay cinco valores donde bastarían tres.

Densidad: alta por decisión de producto. Las pantallas de analítica muestran
tablas anchas y varias gráficas; el aire se gana con jerarquía tipográfica, no
con márgenes grandes.

## Elevation & Depth

**Hoy: completamente plano.** `--shadow-card: none` y ninguna escala de sombras.
La profundidad se construye con dos herramientas:

1. **Capas tonales** — cinco tonos de superficie que se apilan en 17 unidades de
   luminosidad.
2. **Bordes de 1px** — `--border-subtle` para separar dentro de una zona,
   `--border-default` para delimitar tarjetas, `--border-strong` para controles
   interactivos.

El sistema no tiene gradientes. Tampoco resplandores: había dos heredados de
una identidad azul anterior —uno en todos los botones primarios— y se
eliminaron en la fase de consolidación.

Foco: anillo doble (`--focus-ring`), 2px del color de fondo + 2px de oro. Se
lee sobre cualquier superficie y no desplaza el layout.

**Dirección confirmada:** añadir una sombra ambiental para lo que se superpone
—modal, dropdown, tooltip, popover—. Las tarjetas siguen planas. La regla nueva
es: *si algo tapa contenido, proyecta sombra; si convive con él, no*.

## Shapes

Radios pequeños y consistentes, en tres pasos que van de más a menos según el
tamaño del elemento: tarjeta 6px, control 5px, chip 4px. Es un lenguaje
deliberadamente cuadrado — los radios grandes leen como consumo, no como
instrumento.

Bordes siempre de 1px (`--border-width`). Nada de dobles bordes, nada de
bordes de color saturado: el borde de advertencia es `#4a3f22`, un ámbar
oscurecido casi hasta ser marrón.

Las barras de progreso y las pistas de riesgo son rectángulos con radio de chip,
nunca cápsulas.

## Components

### Buttons

- **Primario**: fondo oro, texto `--on-brand`, radio 5px, padding 10×16, peso
  600, 13px. Hover sube a `--brand-hover`. Active desplaza 1px hacia abajo.
- **Secundario** (el `.btn` por defecto): fondo `--surface-raised`, borde
  `--border-strong`, texto primario. Hover pasa a `--surface-inset`.
- Transición actual: `background .12s ease, border-color .12s ease, transform
  .06s ease`.
- Un solo botón oro por vista.

### Cards / Containers

`.card`: superficie por defecto plana (`--surface-default`), borde 1px, radio
6px, padding 16px. Sin sombra y sin gradiente: el gradiente que describía una
versión anterior de este documento vivía en una regla heredada que la regla
actual ya anulaba. `.card.highlight` tiñe el borde con 60% de oro y añade
un anillo de 1px al 30% — es la tarjeta del resultado principal.

**No se anidan tarjetas.** Si una zona necesita subdivisión, se usa
`--surface-inset` con un borde `--border-subtle`, no otra tarjeta.

### Inputs / Fields

Fondo hundido (`--surface-inset`), borde 1px, radio 5px, padding 10×12. Hay tres
variantes con adorno: `.input-suffix` (unidad o divisa a la derecha, 44px de
reserva), `.input-search` (icono a la izquierda, 38px), y el control
`.segmented` (radiogroup con fondo `--surface-raised` y 3px de padding interno).

Las etiquetas van encima, en estilo `.label`. Los errores en granate con texto,
no solo con borde rojo.

### Chips

Tinte semántico al 14–16% + texto en `--text-body` + tipografía de etiqueta +
radio 4px. Son el vehículo de estado (positivo/negativo/advertencia/info/demo).

### Navigation

Raíl vertical de 58px en escritorio con fondo `--sidebar-bg`, un tono por debajo
del fondo de app. En móvil, barra inferior de la misma altura. El item activo se
marca con oro; los inactivos en `--text-secondary`.

### Signature Component — el comparador de objetivos

El componente que define el producto: "restaurar valor" y "equilibrio real"
mostrados a la vez, con sus dos cifras en display serif, la diferencia explícita
entre ellas y el desglose matemático expandible debajo. **Nunca se muestra una
de las dos cifras sin la otra.**

## Do's and Don'ts

### Do:

- Escribir color solo en `tokens.css` y consumirlo por variable.
- Poner toda cifra en `.figure` (serif 600, tabulares).
- Reservar el oro para la acción principal o la cifra protagonista.
- Construir jerarquía con tono de superficie + borde de 1px.
- Declarar fuente, fecha y cobertura del dato junto al dato.
- Acompañar el color de riesgo con signo o etiqueta.
- Usar el nombre técnico de la métrica y explicarlo al lado.
- Respetar `prefers-reduced-motion` — ya hay una regla global que anula
  animaciones y transiciones.

### Don't:

- No escribir hexadecimales fuera de `tokens.css`.
- No anidar tarjetas dentro de tarjetas.
- No usar negro puro (#000) ni blanco puro (#fff).
- No poner texto gris sobre superficies teñidas de oro.
- No usar verde/rojo saturado de terminal: los semánticos son apagados a
  propósito.
- No meter gradientes morado-azul, glow ni glassmorphism.
- No usar Inter ni la sans del sistema para las cifras: van en serif.
- No usar easing con rebote o elástico.
- No poner dos elementos en oro compitiendo en la misma vista.
- No mostrar "restaurar valor" o "equilibrio real" por separado.
