# Validación de Stability V1 (LAB-314)

Informe de cierre de la Fase 3. Documenta qué se ha comprobado, con qué tolerancias, qué
diferencias han aparecido y qué limitaciones tiene lo entregado.

**Fecha:** 2026-08-12 · **Alcance:** refactor del motor histórico y métricas nuevas.

---

## 1. Paridad: cero cambio numérico

El refactor de LAB-301 a LAB-308 movió ~550 líneas del componente monolítico a módulos
propios. La condición fue **mover, no mejorar**: ninguna línea de lógica se tocó al
extraerla.

| Evidencia | Antes | Después |
|---|---|---|
| Fixtures dorados de LAB-002 | 27 ✓ | 27 ✓ |
| Suite unitaria completa | verde | verde (777) |
| E2E sobre el build real | 58 ✓ | 58 ✓ |

**Diferencias numéricas encontradas: ninguna.** No hay ninguna que aprobar ni explicar,
que es lo que exige el criterio de aceptación de LAB-308.

Por qué esto es evidencia y no una afirmación: los 27 fixtures de LAB-002 tienen valores
**derivados analíticamente** —no capturados del código— sobre `recovery`, `metrics`,
`xirr`, `stress`, `diversification` y `portfolioRisk`. Si el movimiento hubiera alterado
un cálculo, esos valores dejarían de cuadrar.

### Lo que el refactor sí cambió

Dos cosas, ambas deliberadas y ninguna numérica:

1. **Se cerró una carrera de peticiones** (LAB-306). Antes, dos ejecuciones solapadas
   podían resolverse en orden inverso y la respuesta vieja pisaba a la nueva. No cambia
   ningún número: cambia *cuál* se enseña.
2. **Un error de coma flotante en el tamaño de la cola** (LAB-309). `1 - 0.95` da
   `0.050000000000000044`, y una muestra de 100 usaba seis días de cola en vez de cinco.
   Afectaba a código nuevo, no a nada previamente publicado.

---

## 2. Tolerancias

| Comprobación | Tolerancia | Motivo |
|---|---|---|
| Fixtures dorados | Exacta sobre decimales; `1e-9` en los estadísticos | Los importes usan `Decimal`; los estadísticos son `number` |
| Conversión de divisa | `toBeCloseTo(…, 9)` | 100 × 1,1 da 110,00000000000001 en binario: exigir igualdad exacta probaría la coma flotante, no la conversión |
| Cobertura frente a umbral | Margen `1e-9` | Una cartera que cumple justo el umbral no debe bloquearse por redondeo |
| Tamaño de cola de VaR | Margen `1e-9` antes de redondear | Ver el error corregido arriba |

---

## 3. Rendimiento (LAB-313)

Benchmark en `scripts/bench-stability.mjs`, ejecutable con `npm run bench:stability`.
Mide lo único que puede bloquear el hilo principal: covarianza y contribución al riesgo.
Serie de 365 días, 10 vueltas de calentamiento y 50 medidas.

| Activos | Mediana | p95 | Presupuesto (50 ms) |
|---:|---:|---:|---|
| 10 | 0,08 ms | 0,17 ms | ✓ |
| 25 | 0,12 ms | 0,35 ms | ✓ |
| 50 | 0,45 ms | 0,50 ms | ✓ |

### Decisión: no se introduce Web Worker

El peor caso medido está **100 veces por debajo** del presupuesto. Añadir un worker
traería serialización de datos, gestión de ciclo de vida, cancelación y una ruta de
error nueva, a cambio de ahorrar medio milisegundo. El criterio de aceptación de LAB-313
pide decidir con datos y **no introducir un worker innecesario**: esto es lo segundo.

**Cuándo reconsiderarlo:** si una cartera realista pasara de ~200 activos, o si la
covarianza dejara de ser el cálculo dominante (por ejemplo al añadir bootstrap por
bloques en la Fase 5, que sí es pesado). El benchmark queda en el repositorio para poder
repetir la medición en vez de discutirla.

**Nota honesta sobre la primera medición.** Sin vueltas de calentamiento, el p95 salía en
27 ms con 50 activos: lo dominaba el arranque del JIT, no el cálculo. Un benchmark cuyos
números manda el calentamiento no mide lo que dice medir. Se añadió calentamiento y los
números se estabilizaron dos órdenes de magnitud por debajo.

---

## 4. Métricas nuevas y sus límites

| Métrica | Qué mide | Límite declarado |
|---|---|---|
| VaR histórico | Umbral que supera el peor 5 % de días | **No es la pérdida máxima.** La frase que lo aclara vive en el módulo, no en la interfaz, para que no se pueda enseñar el número sin ella |
| CVaR histórico | Pérdida media dentro de esa cola | Mínimo de 100 observaciones: con 30 días, el 5 % peor es día y medio, y un dato no es una cola |
| Perfil de caída | Profundidad, duración y recuperación | Sin recuperar devuelve `null`, que no es cero días |
| Ventanas | La misma métrica en 1, 3 y 5 años | Una ventana que la serie no cubre se marca «no disponible»; **no se simula** |

Ningún método asume normalidad. El percentil es empírico a propósito: la normal
subestima justo las colas, que es lo único que estas métricas existen para medir.

---

## 5. Limitaciones conocidas

1. **Todo es histórico.** Describe lo que pasó en la muestra disponible, no lo que pasará.
   Una cartera que no cayó en el periodo medido no es una cartera que no pueda caer.
2. **La serie de cartera es una aproximación.** Se construye normalizando cada activo a su
   primer cierre común y ponderando por el peso **actual**, no por el peso histórico. Con
   aportaciones grandes durante el periodo, la caída máxima calculada no es exactamente la
   que sufrió el inversor. La métrica que sí aísla el efecto de las aportaciones es la TWR,
   que se muestra aparte.
3. **La cobertura manda sobre todo lo demás.** Si el análisis cubre el 60 % de la cartera,
   todas las cifras describen ese 60 %. La pantalla lo dice como primer hallazgo, antes que
   ninguna conclusión.
4. **El adaptador sigue existiendo.** `HistoricalRiskSection` no desapareció: quedó en 371
   líneas de pegamento entre el store y los bloques. Es deliberado, no deuda pendiente.
5. **Sin ventanas largas con los proveedores actuales.** Las ventanas de 3 y 5 años se
   marcarán casi siempre «no disponible» mientras la aplicación pida 365 días de histórico.
   Ampliarlo es una decisión de coste de proveedor, no de código.

---

## 6. Puerta G3

| Criterio | Estado | Evidencia |
|---|---|---|
| Refactor sin cambio numérico | **Cumplido** | 27 fixtures dorados + 777 unitarias + 58 E2E, verdes antes y después |
| Métricas downside y drawdown | **Cumplido** | `lib/lab/analytics/downside.ts`, con VaR nunca presentado como pérdida máxima |
| Estabilidad por ventanas | **Cumplido** | Una ventana no cubierta se marca, no se simula |
| Runs reproducibles | **Cumplido** | `modelVersion` y `asOf` obligatorios al guardar **y** al leer |
| Decisión de rendimiento con datos | **Cumplido** | Benchmark reproducible; se decide **no** añadir worker |
| Resumen con hallazgos acotados y evidencia | **Cumplido** | Máximo de 4 hallazgos, cada uno con su procedencia en la propia página |

**G3 se puede firmar.** Las tres tareas que quedan fuera de esta puerta —`LAB-302` quedó
cubierta por los contratos de presentación— no la bloquean.
