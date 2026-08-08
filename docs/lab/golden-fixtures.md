# Fixtures financieros dorados

> Tarea `LAB-002`. Congela el comportamiento numérico actual de `src/lib/finance/`
> para que cualquier refactor posterior —empezando por
> [`HistoricalRiskSection.tsx`](../../src/components/analytics/HistoricalRiskSection.tsx)—
> demuestre paridad antes de añadir métricas nuevas.

| Artefacto | Ruta |
|---|---|
| Series históricas | [`src/test/fixtures/historical-series.ts`](../../src/test/fixtures/historical-series.ts) |
| Cartera pequeña | [`src/test/fixtures/portfolio-small.ts`](../../src/test/fixtures/portfolio-small.ts) |
| Prueba de paridad | [`src/lib/finance/__tests__/golden-current.test.ts`](../../src/lib/finance/__tests__/golden-current.test.ts) |

## 1. Principio de independencia

El backlog exige **no** usar snapshots generados por el mismo código bajo prueba. Aquí
ningún valor esperado procede de ejecutar la implementación: todos se derivan de la
definición de cada métrica sobre series construidas para que el resultado tenga forma
cerrada.

La construcción clave: con precios que alternan entre **100 y 101**, el retorno
logarítmico diario vale exactamente ±ln(1,01). Sobre un número par de observaciones la
media es cero, así que la varianza muestral colapsa a

$$s^2 = \frac{\sum r_i^2}{n-1} = \frac{n \cdot \ln(1{,}01)^2}{n-1}$$

y a partir de ahí todo se despeja a mano. Muchos de los valores resultantes son
**racionales exactos independientes de la muestra** (2, −1, 0,5, 0,30, +1,5/−0,5), lo que
los hace especialmente robustos como referencia.

Todos los datos son **sintéticos y están etiquetados como tales**. No hay precios,
clasificaciones ni fundamentales reales.

## 2. Series

| Serie | Divisa | Cierres | Qué caso cubre |
|---|---|---:|---|
| `SERIE_ALTERNA` (A) | EUR | 41 | Caso base: 100, 101, 100… |
| `SERIE_ESPEJO` (B) | **USD** | 41 | Activo en **otra divisa**; 202, 200, 202… ⇒ retornos opuestos exactos |
| `SERIE_CONSTANTE` (C) | EUR | 41 | **Serie constante**: todos los retornos son 0 |
| `SERIE_CON_HUECOS` (D) | EUR | 35 | **Fechas ausentes**: A sin los índices 10–15 |
| `SERIE_CORTA` (E) | EUR | 21 | Muestra insuficiente (20 retornos < 30) |

La rejilla son días naturales consecutivos desde `2025-01-01` en UTC. No son sesiones
reales de mercado: las funciones no interpretan el calendario, y así la serie es
trivialmente verificable.

El cociente 202/200 es exactamente 1,01, de modo que B es el espejo numérico de A sin
residuo de coma flotante. Esto permite exigir correlación −1 y covarianza opuesta con
tolerancia de 1e-12.

## 3. Derivaciones

Sea `u = ln(1,01) ≈ 0,0099503308531681` y `n = 40` retornos.

### Volatilidad anualizada de A y B

Media exacta 0 (20 retornos `+u` y 20 `−u`), luego `Σ(rᵢ−r̄)² = n·u²`:

$$\sigma = u\sqrt{\frac{252\,n}{n-1}} = u\sqrt{\frac{252 \cdot 40}{39}} \approx 0{,}1599689$$

La prueba comprueba además que este decimal documentado coincide con la forma cerrada, de
modo que un error de transcripción en este documento hace fallar el test.

### Drawdown máximo de A

La única caída posible es de 101 a 100:

$$\text{maxDD} = \frac{100}{101} - 1 = -\frac{1}{101} \approx -0{,}00990099$$

Racional exacto. El pico queda en `FECHAS[1]` y el valle en `FECHAS[2]`, porque la
implementación conserva la **primera** caída máxima (comparación estricta `<`).

### Correlación

`corr(A, A) = 1` y `corr(A, B) = −1`, exactos: los numeradores y denominadores de Pearson
son las mismas sumas con signo opuesto.

Frente a la serie constante, la suma de cuadrados vale 0 y la implementación devuelve
`ok: false` en lugar de un número: una serie plana no tiene correlación interpretable.

### Covarianza y riesgo de cartera

Con `s = σ² = 252·n·u²/(n−1)`, la matriz anualizada de A y B es

$$\Sigma = s\begin{pmatrix} 1 & -1 \\ -1 & 1\end{pmatrix}$$

Con pesos **0,75 / 0,25**:

$$\sigma_p^2 = w'\Sigma w = (0{,}75^2 + 0{,}25^2 - 2\cdot 0{,}75\cdot 0{,}25)\,s = 0{,}25\,s
\quad\Rightarrow\quad \sigma_p = 0{,}5\sqrt{s}$$

Contribuciones de Euler, `MCTRᵢ = (Σw)ᵢ/σ_p` y `CCTRᵢ = wᵢ·MCTRᵢ`:

| Activo | MCTR | CCTR | % del riesgo |
|---|---|---|---:|
| A | `+√s` | `+0,75√s` | **+150 %** |
| B | `−√s` | `−0,25√s` | **−50 %** |

Suman 100 %, como exige la identidad de Euler. La contribución negativa de B es una
**cobertura**, y es justo el caso que deja `effectiveBets` indefinido.

Con pesos **0,5 / 0,5** la varianza es exactamente 0 y `portfolioRisk` devuelve `null`:
una cobertura perfecta no tiene volatilidad definida.

Ese caso concreto usa `COV_ESPEJO_EXACTA`, una matriz **construida a mano**, no la
calculada desde los retornos. Motivo: `portfolioRisk` compara `variance <= 0` sin épsilon,
y la matriz calculada arrastra un residuo de coma flotante de orden 1e-17 cuyo signo es
arbitrario. Si ese residuo cae positivo, la función devuelve una volatilidad ≈1e-9 en vez
de `null`. Con la matriz exacta, `s + (−s)` cancela bit a bit y la propiedad queda fijada
por la especificación en lugar de depender de la suerte del redondeo.

### Control positivo: dos activos independientes

Contrapunto necesario del caso espejo. Con `Σ = s·I` y pesos iguales, todas las
contribuciones son positivas y las métricas que allí quedan indefinidas sí deben salir:

| Magnitud | Valor | Derivación |
|---|---|---|
| σ_p | `√(0,5·s)` | `w'Σw = 0,25s + 0,25s` |
| Contribuciones | `0,5` y `0,5` | Simetría |
| DR | `√2` | `√s / √(0,5s)` |
| Correlación media | `0` exacto | Los términos cruzados de Σ son nulos |
| Apuestas efectivas | `2` exacto | `exp(−2·0,5·ln 0,5) = exp(ln 2)` |

Sin este control, la aserción `effectiveBets === null` del caso espejo pasaría también con
la función rota o anulada por cualquier otra rama.

### Diversificación

$$DR = \frac{\sum w_i\sigma_i}{\sigma_p} = \frac{1\cdot\sqrt{s}}{0{,}5\sqrt{s}} = 2$$

- Reducción de volatilidad: `1 − 1/2 = 0,5`.
- Correlación media implícita: `(0,25s − 0,625s)/0,375s = −1`.
- `effectiveBets`: **null**, porque hay una contribución negativa y la entropía no está
  definida. La implementación no la inventa.

Los tres son exactos e independientes del valor de `s`.

### Alineación con fechas ausentes

D conserva los índices 0–9 y 16–40, es decir 35 cierres, que producen **34 retornos**: 9
en el tramo 1–9 y 25 en el tramo 16–40. El retorno que salva el hueco está fechado en el
índice 16 y ya va incluido en ese segundo tramo.

Al intersectar con los 40 retornos de A quedan 34 fechas comunes. La prueba exige
explícitamente `34 < 40`: **los huecos reducen la muestra, nunca se rellenan en silencio**.
Con 34 ≥ 30 la covarianza sigue siendo publicable, e informa de `observations: 34`.

## 4. Cartera pequeña

Cuatro posiciones long-only que suman 10.000, con pesos 0,4 · 0,3 · 0,2 · 0,1:

| Activo | Tipo | Divisa | Importe |
|---|---|---|---:|
| `ACC-EU` | stock | EUR | 4.000 |
| `ACC-US` | stock | **USD** | 3.000 |
| `CRIPTO` | crypto | EUR | 2.000 |
| `EFECTIVO` | cash | EUR | 1.000 |

`HHI = 0,4² + 0,3² + 0,2² + 0,1² = 0,30` exacto; posiciones efectivas `1/0,30 = 10/3`;
peso máximo 0,4.

### Escenario de estrés

Shocks multiplicativos: −10 % general, −30 % adicional a cripto, +5 % de divisa sobre lo
cotizado fuera de EUR.

| Activo | Cálculo | Resultado | Variación |
|---|---|---:|---:|
| `ACC-EU` | 4000 · 0,9 | 3.600 | −10 % |
| `ACC-US` | 3000 · 0,9 · 1,05 | 2.835 | −5,5 % |
| `CRIPTO` | 2000 · 0,9 · 0,7 | 1.260 | −37 % |
| `EFECTIVO` | 1000 · 0,9 | 900 | −10 % |
| **Total** | | **8.595** | **−14,05 %** |

Concentración posterior, exacta:

$$HHI = \frac{3600^2+2835^2+1260^2+900^2}{8595^2} = \frac{23\,394\,825}{73\,874\,025} = \frac{11\,553}{36\,481} \approx 0{,}3166854$$

La fracción es irreducible: `8595² = 3⁴·5²·191²`, `36 481 = 191²` y `11 553 = 3 · 3851` con 3851 primo.
El fixture usa la fracción exacta, nunca el decimal.

Sube desde 0,30: la posición más castigada es la pequeña, así que la cartera queda **más**
concentrada. Como control, un shock general uniforme del −20 % deja el HHI intacto en 0,30,
porque no altera los pesos relativos.

### Aportación hipotética

Aportar 2.000 a `ACC-US` no ejecuta ninguna compra; solo recalcula:

- peso del objetivo: `3000/10000 = 0,3` → `5000/12000 = 5/12`;
- concentración: `0,30` → `(4000²+5000²+2000²+1000²)/12000² = 46/144 = 23/72 ≈ 0,3194444`.

## 5. Tolerancias

Declaradas en la prueba como constantes, según exige el criterio de aceptación:

| Constante | Valor | Uso |
|---|---:|---|
| `TOL_ABS` | `1e-12` | Cota absoluta, la que manda cerca de cero |
| `TOL_REL` | `1e-12` | Cota relativa, la que manda en magnitudes grandes |
| `TOL_DOC` | `5e-8` | Contraste del decimal transcrito en este documento contra su forma cerrada |

El criterio es `|error| ≤ max(TOL_ABS, |esperado|·TOL_REL)`. Ambas cotas son necesarias y
ninguna basta sola:

- cerca de cero la relativa no está definida, así que manda la absoluta;
- en importes grandes manda la relativa, porque `ulp(8595) ≈ 1,8e-12` es **mayor** que
  `TOL_ABS`: exigir solo la cota absoluta impondría igualdad bit a bit en los totales y
  haría la prueba frágil por una razón ajena a la métrica.

El error de coma flotante medido en estas derivaciones es de ~1e-15 relativo (volatilidad,
covarianza, correlación) y ~5,7e-15 en el drawdown, de modo que `1e-12` deja dos o tres
órdenes de margen. Cualquier cambio real de convención desplazaría los valores mucho más:
pasar de varianza muestral a poblacional movería la volatilidad de 0,159969 a 0,157930
(2e-3), y de retornos logarítmicos a simples, 5e-5.

`TOL_DOC` vale `5e-8` precisamente porque el documento redondea a siete decimales: una
tolerancia más laxa no detectaría una errata de una unidad en el séptimo decimal, que es
justo la clase de error que este contraste existe para cazar.

Las magnitudes monetarias (pesos, HHI, estrés) se calculan con `decimal.js` a 28 dígitos y
no arrastran error binario; se comparan con el mismo criterio por uniformidad.

## 6. Cobertura y límites

Cubierto: retornos logarítmicos, volatilidad anualizada, volatilidad nula, muestra
insuficiente, Sharpe no publicable, drawdown, correlación (±1 y no interpretable),
alineación con huecos, covarianza anualizada, riesgo de cartera con contribuciones de
Euler, cobertura perfecta, diversificación (DR, reducción, correlación media,
`effectiveBets` nulo), pesos, HHI, estrés multiplicativo con shock de divisa y aportación
hipotética.

**No cubierto por esta tarea**, y por tanto sin red de seguridad todavía:
`recovery.ts`, `position.ts`, `xirr.ts`, `betaAlpha`, `sortinoRatio`, `downsideVolatility`
y `timeWeightedReturn`. Los cuatro primeros ya tienen pruebas propias adyacentes; los tres
últimos no tienen fixture dorado. `calculatePortfolioTwr` sigue viviendo dentro de
`HistoricalRiskSection.tsx` y **debe recibir su propio fixture cuando se extraiga**, que es
el momento exacto en que esta prueba de paridad demuestra su utilidad.

## 7. Hallazgos de la revisión cuantitativa

Una revisión independiente de solo lectura rehizo las doce derivaciones. Todas resultaron
correctas salvo una errata de transcripción (el decimal del HHI tras el estrés, ya
corregido arriba). Además señaló cuatro debilidades de la red de seguridad, tres ya
subsanadas en esta misma tarea:

| Hallazgo | Estado |
|---|---|
| El caso de cobertura perfecta dependía de una cancelación fortuita de coma flotante | **Corregido**: usa una matriz exacta del fixture |
| `TOL_ABS` era sub-ulp para importes de orden 1e4, exigiendo igualdad bit a bit | **Corregido**: criterio `max(abs, rel)` |
| Varias aserciones podían pasar en vacío por `return` de guarda sin `expect` previo, y dos bucles `forEach` no fijaban longitud | **Corregido** |
| `effectiveBets: null` no tenía control positivo | **Corregido**: caso de dos activos independientes |

Queda **sin corregir a propósito**, por caer fuera del alcance de LAB-002 (que excluye
cambiar el comportamiento actual):

- `sharpeRatio` con volatilidad nula y `correlation` frente a una serie constante devuelven
  `reason: 'insufficient_data'` con `observations: 40` y `required: 30`, un estado
  internamente contradictorio: la muestra es suficiente; lo que falla es que la métrica no
  está definida. La prueba congela la conducta observable (`ok: false`) sin avalar la
  razón. Merece una razón propia (`zero_volatility`) en una tarea posterior.
- El umbral `1e-12` de `diversification.ts` es **absoluto** y por tanto dependiente de
  escala: una cartera con σ ≈ 1e-6 daría `averageCorrelation: null` por artefacto numérico,
  no por indefinición real.
- La anualización de `covarianceMatrix` no queda anclada, porque la prueba siempre pasa el
  argumento de forma explícita.
- El fixture con huecos no distingue «alinear por fecha» de «alinear por posición»: por
  paridad de la serie, las dos columnas alineadas resultan idénticas. El guardián efectivo
  es el recuento de 34 observaciones.

## 8. Divergencia de convención

El backlog pide la prueba en `src/lib/finance/__tests__/golden-current.test.ts` y así se ha
creado, pero la convención del repositorio son pruebas adyacentes al módulo
(`historical.test.ts`, `stress.test.ts`…). Conviven ahora dos ubicaciones en la misma
carpeta. Vitest recoge ambas con `src/**/*.test.{ts,tsx}`, así que no hay impacto
funcional; queda anotado por si se prefiere unificar más adelante.
