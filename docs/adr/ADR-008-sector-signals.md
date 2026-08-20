# ADR-008 — Universo y señales sectoriales

- **Estado:** aceptada — **con alcance reducido y explícito**
- **Fecha:** 2026-08-20
- **Tarea:** `LAB-701`
- **Condiciona:** toda la Fase 7

## Contexto

La Fase 7 quiere producir un **ranking de sectores para investigar**, compatible
con la cartera del usuario. El plan pedía decidir taxonomía (GICS/ICB), región,
vehículos representativos, frecuencia, dos o tres señales MVP y su horizonte.

Dos cosas condicionan la respuesta antes de empezar:

1. **[ADR-004](./ADR-004-classification-holdings-provider.md) dejó la fase sin
   proveedor de clasificación.** No hay licencia de GICS ni de ICB, y el listado
   consolidado de ISIN tampoco es gratuito.
2. **Es la parte del producto más cerca del asesoramiento financiero.** Un
   ranking de sectores se lee como una lista de compra por mucho que se
   etiquete de otra forma.

## La observación que hace viable la fase

**Una taxonomía sectorial está licenciada; el precio de un ETF sectorial no.**

Que un fondo se llame «MSCI World Information Technology» y que su precio suba
un 3 % son dos cosas distintas: la primera es propiedad intelectual del
proveedor del índice, la segunda es dato de mercado ordinario, el mismo que la
aplicación ya descarga para cualquier posición.

De ahí la decisión de fondo: **el universo sectorial no se construye
clasificando empresas, sino observando vehículos que ya representan un sector**.
No hace falta saber a qué sector pertenece Apple; basta con seguir el ETF que
alguien ya ha construido para representar «tecnología».

Eso convierte un problema de licencias en un problema de precios, que está
resuelto.

## Decisión

### 1. Universo: ETF sectoriales que el usuario declara

**No se distribuye ninguna lista de ETF sectoriales con la aplicación.** El
universo lo compone el propio usuario, marcando cuáles de sus instrumentos —o
cuáles de los que puede comprar en su bróker— representan un sector, y cuál.

Es el mismo patrón que `LAB-404b` estableció para las composiciones de fondos, y
por las mismas dos razones:

- **No inventar datos.** Escribir aquí una lista de tickers de memoria sería
  inventar instrumentos, y la mitad no existirían como UCITS accesibles desde
  España.
- **La disponibilidad depende del bróker.** Un ETF sectorial que existe no es un
  ETF sectorial que este usuario pueda comprar.

Cada entrada del universo lleva: instrumento (con la identidad canónica de
`LAB-402`), etiqueta de sector, y fecha desde la que el usuario lo considera
representativo.

### 2. Taxonomía: las etiquetas del usuario, sin taxonomía externa

No se adopta GICS ni ICB. Las etiquetas de sector son texto libre normalizado
del propio usuario, exactamente como ya funciona el campo `sector` del activo.

**Consecuencia aceptada:** dos usuarios pueden llamar distinto a lo mismo. Es
irrelevante mientras los datos no se compartan, y compartirlos no está en el
plan.

### 3. Frecuencia y horizonte

- **Cálculo mensual.** Las señales de momentum a plazos cortos son
  mayoritariamente ruido y coste de transacción.
- **Horizonte declarado: 3 a 12 meses.** Por debajo, el ruido domina; por
  encima, las series de un año que ofrece la aplicación no dan para evaluarlo.
- **Sin rebalanceo automático.** La aplicación no propone operaciones. El
  ranking es una lista para mirar, no un calendario.

### 4. Señales MVP: dos, y las dos falsables

El criterio de aceptación de `LAB-701` es que cada señal tenga **una hipótesis
falsable**. Una señal sin hipótesis no se puede invalidar, y una señal que no se
puede invalidar no es una señal: es una decoración.

#### Señal 1 — Momentum 12-1

> **Hipótesis:** los sectores que más han subido en los últimos doce meses,
> excluyendo el último, tienden a seguir subiendo en los tres meses siguientes,
> más que los que menos han subido.
>
> **Cómo se falsa:** si en el backtest walk-forward el quintil superior no bate
> al inferior de forma consistente, o si la diferencia desaparece al descontar
> costes, la señal se retira.

Se excluye el último mes porque el efecto de reversión a corto plazo lo
contamina: es la convención estándar y no una elección propia.

#### Señal 2 — Momentum ajustado por volatilidad

> **Hipótesis:** ordenar por rentabilidad dividida entre su volatilidad produce
> un ranking más estable en el tiempo que el momentum a secas, con menos
> rotación para un resultado comparable.
>
> **Cómo se falsa:** si su rotación mensual no es menor que la de la señal 1, o
> si su resultado es peor sin compensarlo con menos rotación, no aporta nada
> sobre la señal 1 y se retira.

Nótese que **esta hipótesis no es sobre rentabilidad**: es sobre estabilidad. Es
la que de verdad se puede medir con un año de datos.

#### Señal 3 — Diversificación marginal (`LAB-707`)

> **Hipótesis:** añadir un sector con baja correlación con la cartera actual
> reduce la volatilidad de la cartera resultante más que añadir uno con alta
> correlación, para el mismo importe.
>
> **Cómo se falsa:** es aritmética sobre la covarianza, así que se comprueba
> directamente. Si el cálculo no reproduce la reducción esperada en un caso
> construido a mano, está mal implementado.

Esta señal es de otra naturaleza que las dos anteriores, y por eso va aparte:
**no predice nada**. Dice qué le falta a la cartera que el usuario ya tiene, que
es una pregunta sobre el presente y no sobre el futuro.

### 5. Exclusiones

No entran en el universo, y esto se comprueba en el código:

- **Apalancados e inversos.** Su comportamiento a plazo no es el del sector.
- **Sectores con menos de 12 meses de historial**, porque ninguna de las señales
  se puede calcular sobre ellos.
- **Cualquier instrumento que no sea un vehículo diversificado.** Una acción
  suelta no representa un sector aunque el usuario la etiquete.

### 6. Caducidad

- Un ranking caduca a los **35 días**. Pasado ese plazo se muestra como
  «desactualizado» y no como resultado.
- Una señal se **retira** si su validación deja de sostener su hipótesis. La
  retirada es un cambio de estado en el registro de modelos (`LAB-702`), no un
  borrado: los resultados antiguos siguen siendo explicables.

## Lo que esto NO es, y se dirá en pantalla

- **No es una recomendación de compra.** La pantalla se llama «Sectores para
  investigar» y cada entrada enlaza a información, no a una orden.
- **No es una predicción.** El momentum es una regularidad estadística
  documentada que **falla durante años seguidos**, y eso se dice junto al
  ranking, no en una nota al pie.
- **No sustituye a la parte de estabilidad.** Un usuario con un 40 % en una sola
  posición tiene un problema estructural que ningún ranking sectorial arregla.
  `LAB-613` ya establece que lo estructural va antes que lo táctico; esta fase
  produce **señal táctica**, así que va detrás por construcción.

## Consecuencias

- `LAB-703` (universo point-in-time) se simplifica: el historial de pertenencia
  lo declara el usuario y se guarda con vigencia, igual que las composiciones de
  `LAB-406`. No hay ingesta de un proveedor.
- `LAB-704` (feature store) se reduce a observaciones versionadas locales.
- **`LAB-702` (registro de modelos) sí se implementa**, porque es lo que permite
  retirar una señal sin borrar el pasado.
- El backtest de `LAB-709` tendrá **muy poca muestra**: con un año de series y
  cálculo mensual son doce observaciones por sector. Se hará y se publicará el
  resultado, incluido si es que no hay evidencia suficiente para sostener
  ninguna hipótesis. Esa es una conclusión válida y se escribirá tal cual.

## Sesgos declarados

1. **Sesgo de selección en el universo.** El usuario elige hoy qué ETF
   representan cada sector, y los evalúa hacia atrás. Los sectores que no se le
   ocurren no entran, y los ETF que cerraron no existen en su lista.
2. **Muestra insuficiente para el momentum.** Doce observaciones no permiten
   distinguir una señal de la suerte. La validación lo dirá con esas palabras.
3. **Sin datos point-in-time de composición**, un ETF sectorial de hoy no es el
   de hace cinco años, aunque el ticker sea el mismo.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Licenciar GICS o ICB | Coste incompatible con un proyecto personal, y ADR-004 ya lo descartó |
| Distribuir una lista de ETF sectoriales con la aplicación | Escribirla de memoria sería inventar instrumentos; y la disponibilidad depende del bróker |
| Clasificar las empresas de la cartera por sector automáticamente | Exige la taxonomía que no se tiene |
| Publicar el ranking sin backtest | Sería presentar una corazonada con formato de dato |
| Renunciar a la fase | Es una opción legítima y estuvo sobre la mesa. Con el universo declarado por el usuario, la fase se sostiene con alcance reducido |

## Revisión

Reabrir si se contrata una taxonomía con licencia, o si la validación de
`LAB-710` concluye que ninguna hipótesis se sostiene: en ese caso la decisión
correcta es **no publicar el ranking**, y la fase se cierra sin pantalla.
