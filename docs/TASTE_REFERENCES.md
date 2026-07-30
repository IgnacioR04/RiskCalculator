# Referencias visuales — medición y reconciliación

Medido el 2026-07-29 sobre `mercury.com` y `linear.app` (DOM + estilos
computados, viewport de escritorio). Números exactos, no adjetivos.

---

## mercury.com

| Categoría | Valores |
|---|---|
| Fondo / superficies | `#000000` base; `#171721` domina (superficie real), `#1e1e2a`, `#272735`. Tinte frío-violeta. |
| Texto | `#ededf3` primario (137 nodos), `#c3c3cc` secundario (42). **Solo 2 pasos.** |
| Acento | `#5266eb` periwinkle — **0,1 % del área visible**. Secundario claro `#9cb4e8` (0,2 %). |
| Tipografía | `arcadia` (161 nodos) + `arcadiaDisplay` (24, solo display). Sin mono. |
| Pesos | 420 (66), 480 (52), 400 (49), 360 (17). **Variable font, ningún 600/700.** |
| Escala | 12 / 16 / 18 / 21 / 28 / 32 / 42 / 59,5 px → ratio ~1,25–1,3 |
| H1 | 45,1 px / lh 49,6 (1,10) / peso 480 / centrado |
| Radios | 4px (106 nodos) domina; 12px tarjetas; 40px y pill en botones |
| Sombras | 3 capas, **tintadas al color de superficie** `rgba(28,28,35,·)`, alphas 0,02 / 0,04 / 0,09 |
| Espaciado | gaps 4 / 12 / 32 / 40 px |
| Motion | `0.3s cubic-bezier(0,0,0.2,1)` (decelerate puro) en todo color/fondo/borde |

## linear.app

| Categoría | Valores |
|---|---|
| Fondo / superficies | `#08090a` base; escalera `#0f1011` → `#101112` → `#121314` → `#161718`. **5 pasos en ~14 unidades.** |
| Texto | `#f7f8f8` → `#e2e4e7` → `#d0d6e0` → `#8a8f98` → `#62666d`. **5 pasos, grises fríos.** |
| Acento | `#e4f222` verde ácido — 1,5 % del área. Rosa `#f79ce0` en texto puntual. |
| Tipografía | `Inter Variable` (380 nodos) + **`Berkeley Mono` (189 nodos)**. Mono es ciudadano de primera. |
| Pesos | 400 (453), 510 (94), 590 (18), 300 (4). **Micro-pesos variables, ningún 600/700.** |
| Escala | 10 / 12 / 13 / 14 / 15 / 16 / 18 / 48 px. Base 14. **Muy comprimida y pequeña.** |
| H1 | 64 px / lh 64 (**1,00**) / ls −1,408 px (−0,022em) / peso 510 / alineado a la izquierda |
| Radios | 2px (42 nodos), 6px (38), 4px (27), 12px (12), pill. **Radios diminutos.** |
| Sombras | 5 capas ultra-sutiles (alpha 0,01→0,08, blur ≤ 8px) + truco de borde `inset 0 0 0 1px rgb(35,37,42)` |
| Espaciado | gaps 2 / 3 / 4 / 6 / 8 (90 nodos) / 12. **Rejilla de 4 con micro-gaps.** |
| Motion | `0.1s` y `0.16s cubic-bezier(0.25,0.46,0.45,0.94)` (easeOutQuad). **Rapidísimo.** |

---

## Patrones comunes a las dos (lo que importa)

1. **La restricción del acento es medible, no una opinión.** Mercury 0,1 %,
   Linear 1,5 % del área visible. Ninguna usa el acento para rellenar
   superficies grandes.
2. **Ninguna usa peso 600 o 700.** Ambas usan fuentes variables con micro-pesos
   (420/480/510/590). El énfasis viene de un salto de peso pequeño, no de negrita.
3. **Escalera de superficie comprimida.** 4–5 tonos separados por 3–5 unidades
   de luminosidad cada uno. Es lo que permite separar capas sin sombras.
4. **Sombras multicapa de alpha ínfima, tintadas.** Nunca `rgba(0,0,0,0.3)` de
   una capa. Mercury tinta al color de superficie; Linear apila 5 capas de
   0,01–0,08 y añade un anillo inset de 1px.
5. **Display con `line-height` ≤ 1,10 y tracking negativo.** Cuanto más grande
   el tipo, más apretado.
6. **Radios pequeños.** 2–6 px en controles, 12 px como máximo en tarjetas.
7. **Easing de salida, siempre.** `cubic-bezier(0,0,0.2,1)` o
   `cubic-bezier(0.25,0.46,0.45,0.94)`. Ninguna usa `ease-in` ni rebote.
8. **Densidad tipográfica alta.** Base de 13–16 px con UI a 12–14 px.

## Lo que RiskCalculator NO debe copiar

- **La serif en las cifras es nuestra ventaja.** Ninguna de las dos referencias
  usa serif en ningún sitio. Copiar su Inter/Arcadia nos convertiría en un clon
  de Linear. Source Serif 4 en las cifras se queda.
- El acento ácido de Linear (`#e4f222`) y el periwinkle de Mercury son colores
  de marca de producto SaaS. El oro es más apropiado para el dominio financiero.
- Los pill buttons de 40px de Mercury: leen como marketing, no como instrumento.

---

## Reconciliación con DESIGN.md — diff de tokens propuesto

Estado: **propuesto, sin aplicar.** Cada cambio cita la evidencia.

### 1. Separar los pasos de texto redundantes  · P1

`--text-secondary: #8c9298` y `--text-tertiary: #7b7f82` se diferencian en ~17
unidades de luminosidad: en pantalla son el mismo gris, así que tenemos 5 tokens
haciendo el trabajo de 4. Linear separa los suyos claramente (`#8a8f98` vs
`#62666d`, ~40 unidades).

```diff
- --text-tertiary: #7b7f82;
+ --text-tertiary: #6a6e73;
```

Afecta también a `--benchmark` y `--na`, que apuntan al mismo valor: pasarían a
ser un gris claramente terciario en las gráficas, que es lo que se busca (no
competir con la serie del usuario).

### 2. Escala de motion explícita  · P1 (dirección confirmada en F1)

Hoy solo existe `transition: ... 0.12s ease` escrito a mano en `.btn`. Añadir:

```diff
+ /* motion */
+ --ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
+ --ease-out-strong: cubic-bezier(0.16, 1, 0.3, 1);
+ --dur-instant: 90ms;   /* feedback de press, hover de control */
+ --dur-fast: 140ms;     /* cambio de estado, chips, tabs */
+ --dur-base: 200ms;     /* entrada de overlay, expansión de desglose */
+ --dur-slow: 280ms;     /* transición de página, techo absoluto */
```

Evidencia: Linear usa 100–160 ms con easeOutQuad; Mercury 300 ms con decelerate
puro. Nada de `ease-in`, nada de rebote — coincide con lo que exige
`review-animations` (< 300 ms en UI, `ease-out` en entradas).

### 3. Escala de sombras para lo que flota  · P1 (dirección confirmada en F1)

`--shadow-card: none` se queda (las tarjetas siguen planas). Se añade elevación
solo para lo que tapa contenido, con la técnica de las dos referencias: varias
capas de alpha mínima, **tintadas al fondo de la app**, no negro puro.

```diff
+ --shadow-overlay:
+   0 0 0 1px rgba(0, 0, 0, 0.2),
+   0 1px 1px rgba(8, 9, 10, 0.07),
+   0 3px 6px rgba(8, 9, 10, 0.10),
+   0 12px 24px rgba(8, 9, 10, 0.14);
+ --shadow-popover:
+   0 0 0 1px rgba(0, 0, 0, 0.2),
+   0 1px 2px rgba(8, 9, 10, 0.08),
+   0 6px 14px rgba(8, 9, 10, 0.12);
```

Regla: modal y drawer usan `--shadow-overlay`; dropdown, tooltip y popover usan
`--shadow-popover`; tarjetas, tablas y gráficas siguen sin sombra.

### 4. Conectar los encabezados a la escala de tokens  · P0

Los `h1`/`h2` de `global.css` (1,45rem / 1,15rem) no consumen ningún token, y
`--fs-hero: 46px` no lo usa nadie. Además faltan las dos propiedades que hacen
que un display se vea profesional y no inflado:

```diff
+ --lh-display: 1.06;
+ --ls-display: -0.022em;
+ --fs-section: 20px;   /* h2 real, hoy 1.15rem sin token */
+ --fs-page: 24px;      /* h1 real, hoy 1.45rem sin token */
```

Evidencia: Linear h1 64px con lh 1,00 y ls −0,022em; Mercury 45px con lh 1,10.
Nuestro `--fs-hero: 46px` está en el rango correcto pero sin lh ni tracking
definidos.

### 5. Bajar el peso de los controles de 600 a 500  · P2

`.btn` usa `font-weight: 600` a 13px. Ninguna de las dos referencias pasa de
510 en interfaz. A 13px sobre fondo oscuro, el 600 engorda el texto y compite
con las cifras en serif, que son las que deben pesar.

```diff
+ --fw-control: 500;
+ --fw-emphasis: 590;
```

El `--fw-figures: 600` **no se toca**: es la firma del sistema.

### 6. Simplificar la escalera de radios  · P2

`--radius-control: 5px` es un valor que no aparece en ninguna referencia (usan
2 / 4 / 6 / 12) y está a 1px de `--radius-card: 6px`, así que no crea jerarquía.

```diff
- --radius-control: 5px;
+ --radius-control: 4px;
- --radius-chip: 4px;
+ --radius-chip: 3px;
```

### 7. Ascender el mono a ciudadano de primera  · P2

Linear usa Berkeley Mono en 189 nodos: en una estética de instrumento, el mono
es lo que hace que un dato parezca un dato. Tenemos `--font-mono` declarada y
casi sin usar. No es un cambio de token, es una regla de uso: **tickers, ISIN,
fechas, tipos de cambio y códigos van en mono**; las cifras monetarias siguen
en serif.

### 8. Objetivo medible para el oro  · P1

Convertir "el oro se gana" en un número verificable, tomado de la medición:

> El oro (`--brand-primary` en fondos, texto o bordes saturados) no debe ocupar
> más del **2 % del área visible** de ninguna pantalla. Mercury: 0,1 %.
> Linear: 1,5 %.

Esto es directamente comprobable en la fase de auditoría con el mismo script de
medición.

---

## Lo que la medición NO resuelve

Tu pregunta de la F1 —color por secciones y jerarquía de zonas— sigue abierta, y
las referencias no la responden porque ninguna de las dos lo hace: **ambas usan
un solo acento en toda la superficie**. Mercury tiene un periwinkle y nada más;
Linear un verde ácido y nada más. Cero variación cromática por sección.

Es evidencia contraria a la idea de dar matiz propio a cada sección. La
alternativa que sí sostienen los datos es **jerarquía por superficie**: usar la
escalera de 5 tonos para marcar qué zona importa (la zona principal en
`--surface-raised`, el contexto en `--surface-inset`) en lugar de por color.
A decidir con las páginas delante, en la fase de color.
