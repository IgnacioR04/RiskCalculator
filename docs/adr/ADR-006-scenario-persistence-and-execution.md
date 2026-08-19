# ADR-006 — Persistencia y ejecución de escenarios

- **Estado:** aceptada
- **Fecha:** 2026-08-19
- **Tareas:** `LAB-509` (persistencia cloud), `LAB-510` (API asíncrona de runs)
- **Evidencia:** `npm run bench:scenarios`

## Contexto

La Fase 5 contemplaba dos piezas de infraestructura: guardar escenarios y
resultados en Supabase, y ejecutar los escenarios a través de una API asíncrona
en vez de en el navegador.

Las dos se plantearon antes de saber cuánto cuesta ejecutar un escenario. Ahora
está medido, y el número cambia una de las dos respuestas.

## Medición

Portátil del propietario, con calentamiento de JIT antes de medir:

| Caso | p50 | p95 |
|---|---:|---:|
| Determinista, 20 activos | 0,23 ms | 0,39 ms |
| `portfolioPath`, 20 activos × 252 periodos | 0,44 ms | 1,05 ms |
| Bootstrap, 5 activos × 1.000 trayectorias × 252 días | 173 ms | 182 ms |
| Bootstrap, 20 activos × 1.000 trayectorias × 252 días | **378 ms** | 387 ms |
| Bootstrap, 20 activos × 2.000 trayectorias × 252 días | **758 ms** | 788 ms |
| Bootstrap, 20 activos × 10.000 trayectorias × 252 días | **~3,8 s** | — |

El último caso no está en el banco: veinte repeticiones bloquean el hilo el
tiempo suficiente para tumbar el canal RPC del worker de Vitest. Que una
medición **rompa la herramienta de medición** ya es el hallazgo.

## Decisión 1 — La persistencia en la nube **se pospone**

Los escenarios y sus resultados se quedan en el dispositivo, sobre el registro
local de `LAB-311`.

### Motivos

1. **Ya hay precedente en este proyecto y es deliberado.** `LAB-311` decidió que
   los cálculos son «material reconstruible y no tienen por qué viajar a la
   nube». Un resultado de escenario es exactamente eso: dado el escenario, la
   cartera y la fecha, se vuelve a producir. Guardarlo en un servidor añade
   superficie sin añadir información.
2. **La cartera es el dato más sensible de la aplicación**, y un resultado de
   escenario la contiene implícitamente: valor de partida y contribución por
   posición. Subirlo exige una razón mejor que «el plan lo decía».
3. **D14 y D15 siguen abiertas** —tipos de Supabase escritos a mano y escrituras
   multi-tabla no atómicas—. Añadir dos tablas más sobre eso multiplica un
   problema que no está resuelto.

### Qué se hace en su lugar

`LAB-511` guarda y compara sobre el registro local, con las mismas reglas de
reproducibilidad: `modelVersion` y `asOf` obligatorios, y una comparación que
**se niega** cuando las dos ejecuciones no vienen de la misma definición en la
misma versión.

### Cuándo reabrir

Si el usuario pide usar la aplicación desde dos dispositivos con el mismo
historial de escenarios, o cuando D14 y D15 se cierren.

## Decisión 2 — La API asíncrona **no se implementa**; el Web Worker **sí hace falta**

Son dos cosas distintas y el plan las mezclaba en una tarea.

### La API de servidor no

Ejecutar el escenario en un servidor exigiría **enviar la cartera del usuario**
—posiciones y valoración— a un backend, para ahorrar entre 0,2 ms y 4 s de
cálculo. Es una regresión de privacidad clara en una aplicación que funciona sin
cuenta, y contradice el principio de mantener el modo local sin registro.

### El Web Worker sí

Aquí me equivocaba. En `LAB-313` y `LAB-416` decidí **no** introducir un Web
Worker, y en los dos casos era correcto: 0,45 ms y 149 ms en el peor caso.

El bootstrap es otra cosa. **378 ms bloquean el hilo principal de forma
perceptible**, y 3,8 s lo congelan: sin worker, la pestaña deja de responder,
no se puede cancelar y no hay barra de progreso posible.

La conclusión no es «hace falta un servidor», es «hace falta sacarlo del hilo
principal». Y como el bootstrap **todavía no está expuesto en ninguna
pantalla** —`LAB-508` solo ofrece escenarios deterministas, que cuestan
0,23 ms—, hoy no bloquea a nadie.

### Regla que queda establecida

> **El bootstrap no se expone en la interfaz hasta que se ejecute en un Web
> Worker, con cancelación y progreso.**

Es una condición de entrada de la pantalla, no una tarea suelta que se pueda
olvidar. El motor está construido, probado y es reproducible (`LAB-505`); lo que
falta es cómo se ejecuta, no qué calcula.

## Consecuencias

- La Fase 5 entrega los escenarios deterministas e históricos en la interfaz, y
  el bootstrap como motor disponible pero no expuesto.
- `MAX_PATHS` se queda en 10.000 como tope de validación del contrato. No es un
  tope de interfaz: la interfaz no ofrece bootstrap todavía.
- G5 puede cerrarse: las dos tareas eran decisiones de infraestructura, y decidir
  «no» con un número medido delante es cerrarlas.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Ejecutar el bootstrap en el hilo principal con menos trayectorias | 1.000 trayectorias ya son 378 ms, y bajar de ahí empeora los percentiles de cola, que es justo para lo que sirve |
| Trocear el cálculo con `setTimeout` | Mantiene la pestaña viva a costa de multiplicar el tiempo total y de un código difícil de razonar. Un worker hace lo mismo mejor |
| Subir el cálculo a una Edge Function | Enviaría la cartera al servidor para ahorrar segundos. Mal cambio |
| Guardar los resultados en Supabase «porque el plan lo decía» | El plan no había medido nada, y `LAB-311` ya había decidido lo contrario con argumentos |
