# Acta de la puerta G7

> `LAB-716`. Cierre de la Fase 7 — sectores para investigar.
> Fecha: 2026-08-20.

## Resumen en una frase

La fase se cierra **sin ranking de sectores**, porque
[`LAB-710`](./sector-signals-v1-validation.md) demostró que no hay datos para
sostenerlo, y **con una pantalla que explica por qué** y publica lo único que sí
se sostiene: qué le falta a la cartera del usuario.

## 1. Qué se ha construido

| Módulo | Tarea | Estado |
|---|---|---|
| `ADR-008` | LAB-701 | Decisión: universo declarado por el usuario, sin taxonomía licenciada |
| `modelRegistry.ts` | LAB-702 | Implementado |
| `universe.ts` | LAB-703 | Implementado |
| `featureStore.ts` | LAB-704 | Implementado |
| `signals.ts` | LAB-705, 706, 707 | Implementado; dos señales en `draft` |
| `combine.ts` | LAB-708 | Implementado |
| `backtest.ts` | LAB-709 | Implementado |
| `sector-signals-v1-validation.md` | LAB-710 | **Decide la fase** |
| `compatibility.ts` | LAB-712 | Implementado y **publicado** |
| `LabSectorsPage.tsx` | LAB-713, 714 | Implementado |

## 2. Tareas cerradas con alcance reducido

### LAB-711 — Jobs de cálculo y publicación: **no aplica**

El plan pedía separar el cálculo de la publicación con trabajos programados en
servidor. Dos motivos por los que no se implementa:

1. **No hay nada que publicar.** Las señales que requerirían un cálculo
   periódico están en `draft` y no son publicables por construcción.
2. **La arquitectura es local primero.** `ADR-006` y `ADR-007` establecieron que
   el cálculo corre en el navegador y que la cartera no viaja. Un trabajo en
   servidor exigiría enviarla.

La separación entre calcular y publicar **sí existe**, pero como estado en el
registro de modelos y no como infraestructura: un modelo en `draft` se puede
calcular y no se puede enseñar. Es la misma garantía con menos piezas.

### LAB-715 — Monitorización de señal: **reducida y automatizada**

No se monitoriza el rendimiento de una señal que no se publica. Lo que sí se
vigila es **la condición que la mantiene sin publicar**, y se vigila sola:
`src/lib/lab/sectors/dataSufficiency.test.ts` falla en CI el día que la
aplicación pueda descargar historial suficiente.

Es mejor que un panel: nadie tiene que acordarse de mirarlo.

## 3. Criterios de G7

| Criterio | Estado | Evidencia |
|---|---|---|
| Proveedor y universo aprobados | **Cumplido** *(alcance reducido)* | ADR-008: sin taxonomía licenciada; universo declarado por el usuario sobre ETF sectoriales, cuyos precios son dato de mercado ordinario |
| Datos point-in-time | **Cumplido** | `universe.ts` no devuelve miembros futuros; `featureStore.ts` guarda tres fechas y no reescribe el pasado |
| Backtest walk-forward | **Cumplido** | `backtest.ts`, con el número de periodos en el resultado y el veredicto empezando por la muestra |
| Costes | **Cumplido** | Se descuentan de la diferencia; hay una prueba de que una señal que solo gana antes de costes se declara no sostenida |
| Benchmark | **Cumplido** | La comparación es grupo superior contra inferior, que es el benchmark natural de una señal de ordenación |
| Estabilidad | **Cumplido** | La rotación se mide y se publica por periodo |
| Model registry | **Cumplido** | `modelRegistry.ts`, con una sola versión activa y retirada sin borrado |
| Publicación separada del cálculo | **Cumplido** *(por estado, no por infraestructura)* | `isPublishable` exige versión activa |
| Revisión de copy y compliance | **Cumplido** | Ver sección 4 |

**G7 se declara superada**, con dos tareas de alcance reducido declaradas
arriba.

## 4. Revisión de copy

La pantalla de Sectores es la del proyecto más cerca del asesoramiento
financiero, así que su texto se revisó expresamente:

- **No hay ranking**, así que no hay ninguna lista que se pueda leer como orden
  de compra.
- **La tabla se agrupa por categoría, no se ordena por bondad.** Un fallo
  encontrado en el navegador: ordenar por «cuánto reduce la oscilación» ponía
  arriba sectores etiquetados «ya lo tienes», y la primera fila de una tabla se
  lee como la mejor opción por mucho que la etiqueta diga lo contrario.
- **Ninguna etiqueta es un verbo de acción.** Se usa «Aporta algo distinto»,
  «Más de lo mismo», «Ya lo tienes» y «Sin datos». No hay «Comprar», «Añadir» ni
  «Recomendado».
- **El aviso viaja con el dato**: «esto describe qué le falta a tu cartera, no
  qué comprar. Un sector puede reducir la volatilidad y ser mala idea por su
  coste, su fiscalidad o porque no lo entiendas».
- **Se declara la limitación que más importa**: la correlación cambia justo
  cuando más falta hace, porque en un desplome casi todo correlaciona más.

## 5. Verificación con la cartera de demostración

Ningún sector sale como «aporta algo distinto». Los cinco son «más de lo mismo»
o «ya lo tienes», con correlaciones entre 0,53 y 0,93 frente a la propia
cartera.

Es un resultado correcto y útil: la cartera de demostración es renta variable
correlacionada más cripto, y la pantalla lo dice sin adornos en vez de rellenar
la tabla con un ganador.

## 6. Limitaciones declaradas

1. **No hay ranking de sectores**, y no lo habrá hasta que haya 36 meses de
   historial (LAB-710).
2. **El universo lo declara el usuario**, con el sesgo de selección que eso
   implica: los sectores que no se le ocurren no entran nunca.
3. **La compatibilidad se calcula sobre las posiciones que ya se tienen**, no
   sobre un universo de sectores investigables. Contesta «qué de lo mío repite»
   mejor que «qué me falta comprar».
4. **Un activo sin sector declarado no entra**, y no se le asigna uno
   automáticamente: inventarlo sería inventar el dato.
5. **La correlación con «la cartera» usa la media de los retornos disponibles**,
   no los pesos históricos. Misma aproximación declarada que en la Fase 4.

## 7. Cero cifras inventadas

- No se publica ningún ranking que no se sostiene.
- Una señal sin muestra devuelve `null` con motivo, nunca un número pequeño.
- Un sector sin historial suficiente se marca «sin datos» y va al final: no es
  bueno ni malo, es desconocido.
- El veredicto del backtest **empieza por la muestra**: con doce periodos y un
  acierto del 100 %, sigue siendo «insuficiente».
- No se asigna sector a ningún activo automáticamente.
