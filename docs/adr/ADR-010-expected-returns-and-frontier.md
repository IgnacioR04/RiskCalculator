# ADR-010 — Rentabilidad esperada, frontera eficiente y qué puede imponer el optimizador

- **Estado**: aceptada
- **Fecha**: 2026-08-21
- **Sustituye a**: nada. Amplía [ADR-007](ADR-007-optimization-engine.md), que sigue vigente.

## Contexto

Hasta LAB-1101 el Laboratorio ofrecía cuatro carteras candidatas —pesos iguales,
solo contribuciones, mínima varianza y contribuciones iguales al riesgo— y
**ninguna estimaba rentabilidades futuras**. No era un olvido: era el criterio de
ADR-007. Estimar rentabilidades mal es la principal fuente de error de las
carteras optimizadas, y las cuatro se podían construir sin hacerlo.

La frontera de Markowitz y la cartera de máximo Sharpe no admiten esa salida.
Las dos necesitan un vector de rentabilidades esperadas, y el encargo de
convertir el Laboratorio en un diagnóstico automático las pide explícitamente.

## Decisión 1 — Existe un modelo de rentabilidad esperada, y está versionado

Se añade `expectedReturns`, con estas propiedades no negociables:

1. **Nunca extrapola la media histórica.** Encoge hacia un prior por clase
   económica, con el histórico al 35 %. Con un año de datos, el error típico de
   una media anualizada es del orden de la propia volatilidad: no distingue un
   activo que rinde 0 % de uno que rinde 20 %. Un optimizador de Sharpe se
   abalanza justo sobre el activo con la media más alta, que suele ser el que
   más ruido tiene.
2. **Recorta a [-10 %, 20 %].** Un recorte duro, porque un prior bien aplicado a
   un activo con dos meses de historia todavía puede dar un disparate.
3. **Publica sus supuestos con el resultado**, para que la pantalla no pueda
   enseñar el número sin enseñar de dónde sale.
4. **Es `experimental`.** Mientras la sensibilidad y la validación fuera de
   muestra no estén integradas, la cartera de máximo Sharpe se enseña y se
   compara, pero **no decide por sí sola** cuál es la cartera compatible con el
   perfil.

### Cómo se construyen los priors

`PRIOR_SET_V1`, vigente desde 2026-08-21, con metodología y fuentes escritas en
el propio conjunto:

| Clase | Prior anual | Base |
|---|---|---|
| Renta variable | 6,5 % | Prima histórica de mercados desarrollados, recortada hacia el extremo bajo del rango habitual de la literatura (3–6 % sobre el activo sin riesgo) |
| Deuda | 3,5 % | Prima de plazo y crédito agregada, modesta |
| Materias primas | 3,0 % | Rentabilidad real cercana a cero más inflación esperada; sin prima sistemática documentada |
| Cripto | 8,0 % | **El prior menos fundamentado del conjunto.** Sin serie larga ni flujo de caja subyacente. Es una convención declarada, no una estimación |
| Efectivo | — | No tiene prior: se deriva de la tasa configurada |

Son órdenes de magnitud de largo plazo, deliberadamente romos: la precisión
falsa en un prior invita a creerse el tercer decimal de una cartera optimizada.
Son **configuración versionada**, se fijan por clase y **nunca por instrumento**:
un prior por ticker sería una tesis personal disfrazada de modelo.

### El efectivo sale de la tasa configurada

La primera versión le daba un 2 % fijo, independiente de la tasa sin riesgo con
la que se calcula el Sharpe en la misma pantalla. Dos números hablando de lo
mismo que no coincidían. Ahora se deriva de `cashRate`, sin mezclarlo con su
pasado: la rentabilidad del efectivo no se estima, se conoce.

## Decisión 2 — Un ETF no es una clase de activo

`assetType` describe **el envoltorio**. Un ETF puede ser renta variable global,
deuda pública a corto, oro físico o una cuenta remunerada. La primera versión del
modelo le daba a todos el prior de renta variable, así que a un fondo monetario
se le regalaba un 6,5 % anual y el optimizador le daba peso por una razón falsa,
sin que nada fallara.

`classifyEconomically` resuelve la exposición por orden de fiabilidad:

1. **Declarada** por una persona. Manda sobre todo lo demás.
2. **Por transparencia**: si se conoce al menos el 80 % de la composición del
   fondo y **todas** sus clases coinciden, esa es la clase. Unanimidad y no
   mayoría: un fondo mixto no «es» renta variable porque el 60 % lo sea.
3. **Por tipo de producto**, y solo para los cuatro que sí determinan la
   exposición: efectivo, cripto, materia prima y acción directa.
4. **Desconocida**, que es un resultado legítimo y no un fallo.

## Decisión 3 — Cuándo el modelo queda no disponible

`expectedReturns` devuelve `insufficient_classification` cuando menos del **90 %
de la cartera, medido por peso**, tiene clase económica conocida.

Por peso y no por número de posiciones: diez residuales sin clasificar importan
mucho menos que una que sea el 40 % de la cartera.

Se rechaza **el modelo entero**, no los instrumentos sueltos. Estimar solo los
clasificados y dejar los demás fuera cambiaría el universo de la optimización sin
decirlo, que es peor que no calcular.

Cuando el modelo no está disponible:

- **No se calcula** el máximo Sharpe ni la frontera.
- **Sí se calculan** mínima varianza, contribuciones iguales al riesgo y máxima
  diversificación, que no necesitan rentabilidades esperadas.

## Decisión 4 — «Máximo Sharpe» no es «la cartera óptima»

Cada candidata optimiza un criterio distinto y ninguna domina a las demás.
Llamar «óptima» a la de máximo Sharpe esconde que depende del número más frágil
de todo el cálculo. Los nombres que se usan son: *óptima por mínima
volatilidad*, *óptima por Sharpe esperado*, *óptima por reparto de riesgo*,
*óptima por diversificación* y *compatible con el perfil*.

Además, Sharpe castiga igual las subidas bruscas que las caídas: una cartera con
Sharpe alto puede tener caídas máximas peores que otra con Sharpe menor.

## Decisión 5 — Qué restricciones puede imponer el motor, y qué pasa con las demás

Esta es la parte que estaba mal y no daba error.

`projectToSimplex` proyecta sobre **cajas por activo**. Eso impone bien:

- `assetWeight` (un solo instrumento);
- `eligibleUniverse` (se compila como techo cero, que sí cabe en una caja);
- `groupWeight` **solo cuando su techo es cero**.

Y **no impone nada más**. Un tope de sector al 30 %, un suelo de liquidez, una
posición bloqueada o un límite de rotación no caben en una caja por activo: el
optimizador los ignora mientras resuelve.

Peor: `violations` solo mira `bounds`, y `lockedPosition`, `contributionsOnly` y
`maxTurnover` no son bounds. Una candidata que vendiera una posición bloqueada
salía con **cero incumplimientos**.

A partir de LAB-1103, `candidateEligibility` distingue tres cosas que no son la
misma:

| | |
|---|---|
| **Impuesta** (`box`) | El solver la respeta en cada iteración. La solución no puede violarla. |
| **Comprobada después** (`checked_after`) | El solver no la conoce. Se verifica sobre el resultado. |
| **Elegible** | La candidata no incumple **ninguna** restricción dura. |

Consecuencias:

- Una candidata con una violación dura **no es factible** y no puede elegirse
  como cartera compatible con el perfil. Puede seguir mostrándose —comparar
  contra ella informa— pero etiquetada.
- Las restricciones que el solver no impone se declaran como **limitación
  aunque se cumplan**: que esta vez saliera bien no significa que el motor las
  estuviera vigilando.

## Decisión 6 — La covarianza se valida de verdad, no solo por su forma

`isUsableCovariance` comprobaba que la matriz fuera cuadrada, simétrica y con
diagonal positiva. Las tres son necesarias y ninguna basta: una matriz puede
cumplirlas y no ser semidefinida positiva, es decir, asignar varianza negativa a
alguna cartera. Entonces un minimizador de varianza encuentra direcciones de
«riesgo negativo» y se abalanza sobre ellas: devuelve pesos, no falla, y la
cartera es basura con aspecto de solución.

`covarianceHealth` intenta una factorización de Cholesky y, si falla, añade un
múltiplo pequeño de la identidad hasta un tope. Si con el tope sigue fallando,
**no devuelve matriz**. El término aplicado sale en el resultado: regularizar en
silencio es cambiar el problema sin decirlo.

Un detalle que costó encontrar: el pivote de Cholesky **hay que compararlo con
la escala de la matriz, no con cero**. Dos activos con correlación exactamente 1
dan una matriz singular cuyo último pivote sale en 7·10⁻¹⁸ por redondeo — mayor
que cero, así que una comprobación ingenua la da por buena. No es un caso
rebuscado: son dos clases del mismo índice en la misma cartera.

## Decisión 7 — La frontera se valida contra un solucionador independiente

Comparar un optimizador consigo mismo demuestra que es determinista, no que
acierte. Los fixtures de `optimizerReference.test.ts` proceden de
`scipy.optimize.minimize` con SLSQP —programación cuadrática secuencial frente a
gradiente proyectado, dos algoritmos distintos— y están **congelados en
TypeScript**: Python no entra en el producto.

Tolerancias: 10⁻³ absoluto en pesos, y comparación adicional del **valor
objetivo** con 10⁻⁴. Dos algoritmos que minimizan la misma función convexa paran
en sitios ligeramente distintos, y en las zonas planas del problema —típicas del
máximo Sharpe— un cambio de peso de 5·10⁻⁴ mueve el objetivo menos de 10⁻⁶. Si
dos vectores distintos dan el mismo Sharpe, los dos son óptimos.

Además, cincuenta problemas aleatorios con semilla fija se comparan contra una
rejilla exhaustiva sobre el símplex: un método sin nada en común con el gradiente
proyectado, así que un error compartido entre los dos es muy improbable.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Usar la media histórica como rentabilidad esperada | Es el modo clásico de fallar: concentra la cartera en el activo con más ruido |
| Añadir una librería de programación cuadrática | ADR-007 ya lo descartó por peso de bundle; el gradiente proyectado converge y ahora está validado contra SLSQP |
| Dar a los ETF sin clasificar el prior de renta variable | Es lo que hacía la primera versión, y regala rentabilidad esperada a un fondo monetario |
| Estimar solo los instrumentos clasificados | Cambiaría el universo de la optimización sin decirlo |
| Tratar una violación dura como texto informativo | Una cartera que incumple un límite duro no es factible; una lista de textos no impide presentarla como si lo fuera |
| Regularizar la covarianza siempre y en silencio | Cambia el problema sin decirlo, y con suficiente ruido cualquier matriz «funciona» |

## Cuándo revisar

- Cuando la sensibilidad y la validación fuera de muestra estén integradas:
  entonces el modelo puede dejar de ser `experimental` y el máximo Sharpe podría
  participar en la selección de la cartera compatible con el perfil.
- Si aparece una fuente de clasificación económica fiable para fondos, la
  cobertura mínima del 90 % dejará de ser el cuello de botella.
- Si el peso del bundle deja de ser un problema, merece la pena reconsiderar un
  solucionador de programación cuadrática de verdad para las restricciones de
  grupo, que hoy no se pueden imponer.
