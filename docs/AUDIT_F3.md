# Auditoría F3 — diagnóstico técnico y crítica UX

Medido el 2026-07-30 sobre el dev server (`localhost:5173`), sesión demo
(`admin1`) con la cartera de demostración cargada. 8 rutas recorridas en
escritorio (1280×720) y móvil (375×812). Contraste calculado con composición
de alfa real; el detector determinista de impeccable ejecutado sobre `src/`.

**Solo lectura. No se ha modificado nada.**

## Audit Health Score

| # | Dimensión | Score | Hallazgo principal |
|---|---|---|---|
| 1 | Accesibilidad | 2/4 | Fallos de contraste en las 7 páginas; controles de 20px de alto |
| 2 | Rendimiento | 3/4 | Sin animación costosa ni thrashing; rutas con Suspense |
| 3 | Theming | 3/4 | Fuente única de color respetada; 89 desviaciones, todas en `global.css` |
| 4 | Responsive | 3/4 | Cero overflow horizontal en 375px; tap targets por debajo del mínimo |
| 5 | Integridad de implementación | 2/4 | Perfil no renderiza; cinco escalas de título distintas en ocho páginas |
| **Total** | | **13/20** | **Aceptable — trabajo significativo pendiente** |

## Veredicto de integridad de implementación

**Aprueba con reservas.** El sistema es específico del producto y no
intercambiable: fuente única de color en `tokens.css`, cifras en serif con
tabulares, paleta de gráficas validada para daltonismo, y un componente firma
(el comparador de objetivos) que ningún otro producto tendría. El detector
determinista no encontró ni un solo anti-patrón de "slop de IA": ni gradientes
morado-azul, ni tarjetas anidadas (0 en las 8 páginas), ni iconos en cuadrado
redondeado. Eso es raro y merece decirse.

Las reservas son dos: una página no renderiza, y la escala tipográfica se ha
decidido página por página en lugar de sistémicamente.

## Resumen ejecutivo

- **P0: 2** · **P1: 6** · **P2: 5** · **P3: 2**
- La app está lejos del "slop" pero tiene un bug que rompe una ruta completa y
  un fallo de contraste que se repite en todas las pantallas.
- El hallazgo con más rendimiento no es un fallo puntual: es que **el 69-88 % de
  los nodos de texto renderiza por debajo de 12px**.

---

## P0 — Bloqueante

> **RESUELTO 2026-07-30.** La referencia rota ya no existe: `PerfilPage.tsx`
> se editó a las 00:03 durante esta auditoría y `RiskResultsCard` quedó
> definido en la línea 542 del propio fichero. `tsc -b` pasa y Perfil renderiza
> sus 8 secciones. La segunda mitad del hallazgo —el `ErrorBoundary` que
> arrastraba toda la app— sí era real y **se ha corregido**: boundary por ruta
> en `App.tsx` con `resetKey={location.pathname}`. Verificado provocando un
> fallo real en Riesgo: la shell sobrevive y navegar descarta el error sin
> recargar. 120 tests en verde.

### [P0-1] La página Perfil no renderiza: `RiskResultsCard is not defined`

- **Ubicación**: `src/pages/PerfilPage.tsx:190`
- **Categoría**: Integridad de implementación
- **Evidencia**: `<RiskResultsCard />` se usa sin import ni definición.
  `grep -rn "RiskResultsCard" src/` devuelve **una única** aparición: la de uso.
  La consola lanza `ReferenceError` y el `ErrorBoundary` captura toda la app.
- **Impacto**: Perfil es inaccesible. Y como el `ErrorBoundary` envuelve al
  `LoginGate` (por encima del router), una vez que salta **ninguna otra ruta
  vuelve a renderizar hasta recargar la página**: un fallo en una pantalla
  secundaria tumba la app entera. Ahí se pierden el perfil de riesgo, la
  exportación y el borrado de datos.
- **Recomendación**: importar el componente o eliminar la línea. Además, mover
  el `ErrorBoundary` a nivel de ruta (o añadir uno por ruta) para que un fallo
  aislado no arrastre a la aplicación completa.
- **Comando**: `/impeccable harden`

> **RESUELTO 2026-07-30.** El modo «restaurar valor» ya muestra las dos cifras
> a la vez. Clave del arreglo: el equilibrio real **no necesitaba datos nuevos**
> —se deriva de C, V y g con `A = (C − V·(1+g))/g`—, así que no hubo que pedir
> precio medio ni precio actual. Nuevo `breakevenFromValues()` en
> `recovery.ts`, que delega en `breakevenContribution` con base normalizada
> (q=1, P=V) para no duplicar el análisis de dominio. Verificado en navegador
> con el caso del README: **10,69 € y 165,71 €** lado a lado, más la diferencia
> (155,02 €). 128 tests en verde, 7 nuevos en `recovery.test.ts` y 1 nuevo en
> `CalculadoraPage.test.tsx` que fija el invariante.

### [P0-2] La calculadora rompe la promesa central del producto

- **Ubicación**: `src/pages/CalculadoraPage.tsx` (control «¿Qué quieres
  calcular?»)
- **Categoría**: Integridad de implementación
- **Evidencia**: los dos objetivos están tras un control segmentado —se ve uno
  **o** el otro—. El propio texto de la pantalla lo confirma: *"Para saber
  cuánto necesitas para no perder dinero, usa la pestaña «Punto de equilibrio
  real»"* y *"Para calcular tu punto de equilibrio económico real […] necesito
  el precio medio de compra […] cambia a"*.
- **Impacto**: `PRODUCT.md` marca como intocable que *"restaurar valor y
  equilibrio real nunca se muestran por separado sin su comparación"*, y el
  `README` presenta la tesis del producto con las dos cifras juntas (10,69 vs
  165,71). Hoy el usuario ve una, tiene que descubrir que existe otra, cambiar
  de pestaña y volver a introducir datos. **La diferencia entre los dos
  objetivos —que es la función del producto— nunca se ve en pantalla.**
- **Recomendación**: mostrar ambas cifras simultáneamente, con la diferencia
  explícita. La pestaña puede quedarse como control de *cuál se detalla*, no de
  cuál existe.
- **Comando**: `/impeccable shape` (es un cambio de estructura, no de estilo)

---

## P1 — Mayor

### [P1-1] El texto de la app vive por debajo del mínimo legible

- **Categoría**: Accesibilidad / Tipografía
- **Evidencia** (nodos de texto por página, % bajo 12px):
  Resumen 88 % · Simular 84 % · Riesgo 80 % · Importar 80 % ·
  Calculadora 73 % · Diversificación 73 % · Cartera 69 %.
  Tamaños reales en uso: **8,5 / 9 / 9,5 / 10 / 10,5 / 11 / 11,5 px**.
  Referencia F2: el mínimo de Linear es 10px y de Mercury 12px, pero su **base**
  es 14 y 16px respectivamente.
- **Impacto**: el público incluye a quien llega angustiado a leer una cifra. Un
  8,5px sobre fondo oscuro no se lee sin acercarse a la pantalla.
- **Recomendación**: suelo de 12px para cualquier texto y de 13px para texto
  corrido. Los `.btn` renderizan a 10,5px pese a declararse `0.9rem` (14,4px) en
  `global.css:325`: hay una regla posterior que gana. Revisar la cascada.
- **Comando**: `/impeccable typeset`

### [P1-2] Las etiquetas de nivel de riesgo: 8,5px a 2,75:1

- **Ubicación**: Resumen y Riesgo, bloque «Riesgo general»
- **Evidencia**: «Adecuado», «Alto», «N/D» a `font-size: 8.5px` y contraste
  **2,75:1** (WCAG AA exige 4,5:1).
- **Impacto**: es la señalización de riesgo, el dato más sensible de la app, y
  es el texto menos legible de la pantalla. Además llegan sin su dimensión
  visible: en Resumen se leen cinco fichas seguidas —«Atención / Adecuado /
  Atención / Alto / N/D»— sin decir de qué es cada nivel.
- **WCAG**: 1.4.3 Contraste (mínimo), nivel AA
- **Comando**: `/impeccable typeset` + `/impeccable clarify`

### [P1-3] El aviso legal es el texto menos legible de todas las páginas

- **Ubicación**: `.disclaimer`, presente en las 7 rutas
- **Evidencia**: 9px a **3,07:1**. Aparece en el 100 % de las páginas medidas.
- **Impacto**: es el descargo de "no es asesoramiento financiero". Si no se lee,
  no cumple su función.
- **WCAG**: 1.4.3 AA
- **Comando**: `/impeccable typeset`

### [P1-4] El botón primario de Importar tiene 2,80:1

- **Ubicación**: `.btn.primary` «Validar y previsualizar»
- **Evidencia**: 10,5px a **2,80:1** sobre el oro. El token `--on-brand`
  (`#12130f`) existe justo para esto y daría ~9:1; el botón no lo está usando.
- **Impacto**: es la acción principal del flujo de importación.
- **WCAG**: 1.4.3 AA
- **Comando**: `/impeccable polish`

### [P1-5] El botón destructivo de Perfil es casi invisible

- **Ubicación**: `.btn.danger` «Borrar todos mis datos»
- **Evidencia**: texto `#a8455a` sobre `rgba(168,69,90,0.16)` compuesto sobre la
  superficie ≈ **2,1:1**, a 10,5px.
- **Impacto**: una acción irreversible con el peor contraste de la app. El
  riesgo no es solo no leerla: es pulsarla sin haberla leído.
- **WCAG**: 1.4.3 AA
- **Comando**: `/impeccable harden`

### [P1-6] Controles de 20px de alto en móvil

- **Evidencia** (375×812): el conmutador EUR/USD mide **20px de alto** en las 7
  rutas; los grupos segmentados («Restaurar valor», «Posiciones», «Clase»,
  «Cuenta», «Crear cartera…») también 20px. Enlaces en línea de 11-13px de alto
  («Perfil», «calculadora», los «?» de ayuda a 13×13). En escritorio, 18
  controles reales por debajo de 44px, incluidos los ítems de navegación
  (40×36).
- **Impacto**: fallo de precisión táctil en el uso móvil real.
- **WCAG**: 2.5.8 Tamaño del objetivo (mínimo 24×24), nivel AA
- **Comando**: `/impeccable adapt`

---

## P2 — Menor

- **[P2-1] `.hint` a 9,5px / 4,19:1** — cae justo por debajo de AA. Aparece en
  Calculadora, Simular e Importar, y son los textos que explican qué introducir.
- **[P2-2] `.muted` a 13,6px / 4,21:1** y `.suffix` (EUR/USD dentro de los
  inputs) a 10px / 4,19:1.
- **[P2-3] La cifra grande de Cartera no está en serif.** «23.049,26 €» renderiza
  a 67,2px en **Archivo**, no en Source Serif 4. Contradice la regla de
  `DESIGN.md` de que toda cifra usa `.figure`, y justo en el número más grande
  de la app.
- ~~**[P2-6] Recharts no se re-mide al cambiar el tamaño del viewport.**~~
  **RETIRADO 2026-07-30: falso hallazgo, era un artefacto del entorno de
  medición.** El panel del navegador estaba oculto (`document.visibilityState
  === 'hidden'`), y en ese estado ni `requestAnimationFrame` ni
  `ResizeObserver` se disparan: comprobado con una sonda propia, 0 disparos
  tras cambiar el ancho de un elemento observado. `ResponsiveContainer` de
  Recharts se apoya en `ResizeObserver`, así que en una pestaña visible sí
  re-mide. No hay nada que arreglar.
- **[P2-4] Control de modo duplicado en Calculadora.** El segmentado «¿Qué
  quieres calcular?» y las dos fichas «◎ Restaurar valor / ◇ Equilibrio real»
  compiten: dos controles para la misma decisión, uno encima del otro.
- **[P2-5] Faltan tildes en texto de interfaz**: «Guardar calculo», «cerrar
  sesion», «Estado de sincronizacion», «Valoración y costes» (correcto) frente a
  «calculos» en el disclaimer. Comando: `/impeccable clarify`.

## P3 — Pulido

- **[P3-1] 89 desviaciones del sistema, todas en `global.css`**: 62 tamaños de
  letra fuera de la escala, 15 radios fuera de la escala (2px, entre otros), 12
  colores literales (`#000`). Ningún otro fichero de `src/` tiene desviaciones.
  El problema está localizado en un único fichero de 2952 líneas con bloques
  duplicados (`body {}` en las líneas 67 y 72, y otra vez en 1285 y 1290).
- **[P3-2] Motion inexistente**: la única transición del sistema es
  `0.12s ease` en ~10 elementos por página (hover de botón). Coincide con la
  dirección que ya confirmaste en F1.

---

## Patrones sistémicos

1. **No hay escala de títulos compartida.** El texto más grande de cada página:
   Cartera 67,2px · Riesgo 40px · Calculadora 37,6px · Importar 37,6px ·
   Resumen 34px · Simular 18px · **Diversificación 13,6px** (nada grande en
   absoluto). Cada página inventó su propia jerarquía. Esto es exactamente la
   "jerarquía de zonas" que planteaste en F1: el problema no es que falte
   énfasis, es que **cada página lo resuelve distinto**.
2. **El contraste falla siempre en el mismo sitio: el texto pequeño y auxiliar.**
   Ningún fallo está en el texto principal. Todos están en hints, disclaimers,
   sufijos, chips y etiquetas de estado — la capa que explica.
3. **Los controles compuestos (segmentados, conmutadores) se quedaron en 20px.**
   Los botones normales cumplen; los segmentados no. Es un patrón de un solo
   componente, no un problema general.

## Hallazgos positivos

- **Cero overflow horizontal** en las 7 rutas a 375px. Las tablas anchas están
  correctamente contenidas en `.table-wrap`.
- **Cero tarjetas anidadas** en las 8 páginas.
- **Cero inputs sin etiqueta** en las 8 páginas: todos tienen `label[for]`,
  `aria-label` o envoltorio. Muy poco habitual.
- **El oro cumple su propia regla sin haberla escrito**: 0,07 % – 0,68 % del área
  visible por página, muy por debajo del techo del 2 % fijado en F2 y en línea
  con Mercury (0,1 %).
- Uso real de `sr-only` para descripciones de gráficas, con cifras y fechas
  concretas.
- `prefers-reduced-motion` respetado globalmente.
- La copy es específica y honesta: *"no se dibuja una curva inventada"* al
  explicar por qué falta el histórico de mercado. Eso es exactamente el
  principio de honestidad sobre los datos, ejecutado.

---

## Crítica UX — Resumen y Calculadora

*Evaluación contra `PRODUCT.md` y `DESIGN.md`. Nota: no se cargó la rúbrica
completa de `critique.md` (40 KB) por economía de contexto; esto es juicio de
diseño sobre lo medido y leído, no el scoring formal de la skill.*

### Resumen

**Lo que funciona.** La secuencia es correcta: cuánto tienes → cómo va → qué
revisar → qué hacer. El bloque «Puedes calcular tu recuperación» convierte un
dato en una acción concreta ("Es lo que pierdes ahora mismo en AAPL"), que es
justo el trabajo del producto. La explicación de por qué no hay curva de
mercado es un ejemplo de honestidad que otros productos esconderían.

**Inversión de jerarquía.** El número más grande de la página es **33,01 €** (la
pérdida en AAPL, 34px) y el valor de la cartera —23.049,26 €— es más pequeño
(26px). Puede ser deliberado, pero entonces la página tiene dos protagonistas
compitiendo y el título de la sección («TIENES AHORA MISMO») anuncia el que
pierde. Decisión a tomar explícitamente, no por herencia.

**El bloque de riesgo no comunica.** «Atención / Adecuado / Atención / Alto /
N/D» son cinco veredictos seguidos sin decir de qué. A 8,5px y 2,75:1, el
usuario ve manchas de color y no sabe qué dimensión está mal. Es el peor punto
de la pantalla y no es un problema de estilo: falta el nombre de cada eje.

**Cola de poco valor.** «● Sin avisos pendientes» y «Último movimiento» ocupan
el final de la página sin aportar decisión. Candidatos a `distill`.

### Calculadora

**Lo que funciona, y mucho.** El aviso *"volver a ver 100,00 € en tu posición no
significa recuperar todo tu dinero. Habrías aportado en total 105,24 €, así que
en ese objetivo tu resultado económico sería −5,24 €"* es exactamente la tesis
del producto, bien dicha, con las cifras del caso concreto. La tabla de
escenarios y la curva aportación-subida están bien planteadas.

**Pero la comparación no existe.** Ver el P0-2. La app *explica con palabras* la
diferencia entre los dos objetivos y luego obliga a cambiar de pestaña —y a
introducir otros datos— para ver la segunda cifra. El producto se define por
poner las dos juntas; ahora mismo las pone en secuencia.

**Dos controles para una decisión.** El segmentado y las fichas «◎ / ◇» hacen lo
mismo. Uno de los dos sobra, o el segundo debe convertirse en la comparación
lado a lado que pide el P0-2 (que es lo que resolvería ambas cosas de una vez).

**Etiqueta huérfana.** «opcional», a 9px y 2,75:1, aparece junto a «Ver la cuenta
y la fórmula» sin que quede claro a qué campo pertenece.

---

## Acciones recomendadas, en orden

1. **[P0] `/impeccable harden`** — arreglar `RiskResultsCard` y aislar el
   `ErrorBoundary` por ruta. Sin esto, cualquier otro trabajo sobre Perfil es
   inverificable.
2. **[P0] `/impeccable shape`** — rediseñar la calculadora para mostrar los dos
   objetivos a la vez. Es estructura, no estilo: hacerlo antes de tocar layout.
3. **[P1] `/impeccable typeset`** — suelo de 12px, arreglar la cascada que baja
   los `.btn` a 10,5px, y conectar los encabezados a los tokens (los 4 cambios
   tipográficos de `docs/TASTE_REFERENCES.md` entran aquí).
4. **[P1] `/impeccable layout`** — una única escala de título para las 8 páginas
   y jerarquía por superficie. Resuelve el patrón sistémico nº 1 y tu pregunta
   de F1 sobre las zonas.
5. **[P1] `/impeccable adapt`** — mínimo 24px de alto en segmentados,
   conmutadores y enlaces en línea; 44px en móvil.
6. **[P1] `/impeccable polish`** — los cuatro fallos de contraste puntuales
   (`.btn.primary`, `.btn.danger`, `.disclaimer`, niveles de riesgo).
7. **[P2] `/impeccable clarify`** — nombrar las dimensiones de riesgo, tildes,
   etiqueta «opcional».
8. **[P2] `/impeccable distill`** — cola de Resumen y control duplicado de
   Calculadora.
9. **[P3] `/impeccable extract`** — consolidar `global.css` (89 desviaciones,
   bloques duplicados, 5 breakpoints).
10. **[P3] `/impeccable animate`** — la escala de motion de F2, una vez cerrada
    la estructura.

## Nota sobre el árbol de trabajo

`git status` muestra 6 ficheros modificados sin commitear, entre ellos
`PerfilPage.tsx` (el del P0-1), `CalculadoraPage.tsx`, `store.ts`, `sync.ts`,
`domain.ts` y `finance/diversification.ts`. El P0-1 vive en esos cambios sin
commitear. Conviene decidir qué hacer con ellos antes de empezar a arreglar.

---

# Cierre de la F7 (robustez) — 2026-07-30

Medición final con el mismo script, sobre las 8 rutas, en 375px y 1280px:

| Métrica | Auditoría inicial | Ahora |
|---|---|---|
| Fallos de contraste (AA) | 35 | **0** (peor ratio 5,14) |
| Texto por debajo de 11px | 69–88 % de los nodos | **0** |
| Controles por debajo de 24×24 | 18 en escritorio, 20px en móvil | **0** |
| Overflow horizontal a 375px | 0 | 0 |

Los enlaces en línea (3 en Resumen) quedan por debajo de 24px a propósito:
WCAG 2.5.8 exime los objetivos contenidos en una frase.

## P1-6 cerrado

`.segmented button` (9,5px / 20px de alto), `.tabs button` (10,5px) y el
`summary` del desplegable (14px de alto) pasan a `min-height: 24px` con el
tamaño del piso. El botón `.help` conserva su círculo de 13px por diseño y
amplía el área táctil con un `::after` de `inset: -6px`, que es lo que exige la
norma sin engordar el control.

## Rezagados del piso tipográfico que la F4 no cazó

La F4 arregló la cascada de `global.css` pero quedaron reglas y estilos inline
por debajo del piso. Los peores, por impacto:

- **`.field label` a 8,5px** — la etiqueta de *todos* los campos de formulario.
- **`table.data th` a 8,5px** — las cabeceras de todas las tablas.
- **`.kpi-label` a 8,5px** — las etiquetas de los KPI.
- **`.field .error` a 9,5px y en `--negative` (2,6:1)** — el mensaje de error de
  un formulario tiene que leerse; ahora usa `--negative-text`.
- `.crumb`, `.avatar`, `.section-num`, `.position-meta span` (0,66rem),
  `.tip-bubble .t-desc`, y 9 estilos inline en `ResumenPage`,
  `PortfolioPage` y `ui.tsx`.
- Regla nueva para `<small>`: heredaba 0,8125em del navegador, que sobre una
  base de 13px daba 10,5px.

También `.tip-bubble` gana `--shadow-popover`: es un overlay absoluto que tapa
contenido, así que le corresponde por la regla de profundidad de la F4. Se me
pasó entonces porque solo busqué los tooltips de Recharts.

## Endurecido: doble clic en la importación

`confirm()` en `ImportarPage` no tenía cerrojo. Limpiar el estado al final no
basta: dos clics rápidos se procesan antes de que React vuelva a renderizar, y
en el segundo `proposal` sigue vivo en el closure, así que **la importación
entera se escribía dos veces y duplicaba todas las operaciones**. Ahora hay un
`useRef` sincrónico.

Cubierto con dos tests nuevos en `src/pages/ImportarPage.test.tsx`. El del doble
clic se validó desactivando el cerrojo a propósito: sin él, el test falla con 2
lotes de importación en lugar de 1.

## Microcopy

- Tildes: «Estado de sincronización», «cerrar sesión», y el aviso legal
  («cálculos y análisis»), que aparece en las 8 páginas.
- `SimularPage` llamaba «Portfolio» a la página que en el resto de la app es
  «Cartera».

## Onboarding

Los estados vacíos ya guiaban bien —explican qué falta, enlazan a la acción y
ofrecen la vía del demo—, así que no se han reescrito. Solo heredan la entrada
animada de la F6.

---

# Cierre de la F8 (consolidación) — 2026-07-30

## Re-auditoría

| # | Dimensión | Antes | Ahora | Nota |
|---|---|---|---|---|
| 1 | Accesibilidad | 2/4 | **3/4** | AA cumplido en contraste y tamaño de objetivo; no se ha probado navegación por teclado ni lector de pantalla |
| 2 | Rendimiento | 3/4 | **3/4** | Sin cambios: no se ha medido el bundle |
| 3 | Theming | 3/4 | **4/4** | Cero colores literales; fuente única real |
| 4 | Responsive | 3/4 | **4/4** | Objetivos táctiles y cero overflow en 375px y 1280px |
| 5 | Integridad | 2/4 | **3/4** | P0 resueltos, título unificado, paleta validada, código muerto eliminado |
| **Total** | | **13/20** | **17/20** | **Bueno** (18+ sería Excelente) |

## Consolidación de `global.css`

`3138 → 2967 líneas` (−171), con **cero cambio visual demostrado**: se tomó una
huella de 14 propiedades computadas (`fontSize`, `color`, `backgroundColor`,
`borderRadius`, `boxShadow`, …) sobre cada elemento visible de las 8 rutas antes
y después. Hash idéntico en las 8.

El análisis del fichero corrigió una suposición: el bloque heredado **no es
código muerto**. De sus 178 reglas, 129 no tienen equivalente en el bloque vivo
y sostienen componentes propios del producto (`.recovery-visual`,
`.preview-kpis`, `.mode-explainer`…). Solo 29 estaban anuladas por completo, y
son las que se han borrado.

## Restos del diseño azul anterior

El detector señalaba 12 colores literales. Al revisarlos resultaron ser herencia
de una identidad azul previa, y uno seguía **vivo y visible**:

- **`.btn.primary` proyectaba `box-shadow: 0 2px 10px rgb(47 116 214 / 0.35)`**
  — un resplandor azul en todos los botones primarios de la app, sobre un botón
  oro. La regla nueva redefinía fondo, borde y color, pero no la sombra, así que
  sobrevivía. Contradecía la anti-referencia de «sin glow» y la regla de
  profundidad plana. Verificado antes (`rgba(47,116,214,0.35) 0px 2px 10px`) y
  después (`none`).
- El anillo de concentración tenía otro resplandor azul,
  `0 0 35px rgb(63 143 240 / 0.14)`.
- `.note.warning` y `.note.negative` usaban `#f2d489` y `#f6b4b4` escritos a
  mano. Ahora usan `--warning-text` (token nuevo) y `--negative-text`.

Colores literales: **12 → 0**.

## Deriva restante: 45 avisos (antes 89)

- **35 tamaños de letra fuera de la rampa**, casi todos en el bloque heredado
  (valores en `rem` del diseño anterior, en reglas que siguen vivas).
- **10 radios fuera de la escala**: 1px, 2px y 7px en micro-elementos (segmentos
  de la barra de riesgo, pistas, celdas de matriz).

Parte de la deriva no era código sino **especificación desactualizada**: el
frontmatter de `DESIGN.md` seguía declarando la paleta de 7 series y los radios
de 5px/4px que la F4 y la F5 ya habían cambiado. Sincronizarlo bajó el detector
de 63 a 45 sin tocar una línea de CSS.

No se han tocado: tokenizar los 36 del bloque heredado toca componentes que no
puedo verificar visualmente (el panel del navegador está oculto, sin capturas), y
declarar los 14 del vivo en `DESIGN.md` solo para silenciar al detector sería
inflar el sistema de diseño en lugar de arreglarlo.

## Breakpoints: NO consolidados, a propósito

Hay siete anchos distintos: `600`, `680`, `700`, `720`, `860`, `940`, `980`.
Fusionarlos (por ejemplo 720→680 y 980→940) cambia el layout en franjas
concretas que no puedo comprobar visualmente. El beneficio es orden; el riesgo
es una regresión en un ancho intermedio que nadie vería hasta producción. Queda
como deuda con la lista exacta.

## Deuda abierta al cerrar el plan

1. Siete breakpoints sin consolidar (arriba).
2. Tres `fontSize` inline en JSX que anulan el prop `size` de `<Figure>`:
   veredicto de riesgo (40px en Riesgo, 26px en Resumen para el mismo concepto) y
   P&L de Resumen (19px).
3. Diversificación y Perfil no tienen cifra protagonista.
4. Fila 2 de la F6 (apertura animada del desplegable), pendiente de que madure
   el soporte de `::details-content`.
5. Los 45 avisos de deriva de arriba.
