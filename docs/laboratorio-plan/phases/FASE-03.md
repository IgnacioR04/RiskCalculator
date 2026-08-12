# Fase 03 — Refactor y ampliación de estabilidad

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | CRÍTICA |
| Sensibilidad | MUY ALTA |
| Esfuerzo predeterminado | high |
| Entrada/autorización | Requiere G2 superada. |
| Funcionalidad a posponer | No añadir señales, optimizadores ni nuevas fuentes durante el refactor. |

## Política de esfuerzo

- Usar **high** como punto de partida de la fase.
- Escalar a **xhigh**: LAB-301, LAB-302, LAB-304, LAB-305, LAB-309, LAB-310 y LAB-314.
- Uso de **max**: Opcional una única revisión max de G3, solo sobre contratos, fixtures, diferencias y validación.
- El esfuerzo alto no sustituye pruebas, fixtures ni revisión independiente.
- Si la sesión tiene un esfuerzo inferior al requerido, detenerse antes de editar.

## Contexto que debe leer el agente

Siempre:

- [Estado de implementación](../IMPLEMENTATION_STATUS.md)
- [Índice del plan](../README.md)
- [Backlog completo](../04-backlog-fases-y-tareas-ia.md)

Específico de esta fase:

- [../00-plan-maestro-laboratorio.md](../00-plan-maestro-laboratorio.md)
- [../02-arquitectura-cuantitativa-datos.md](../02-arquitectura-cuantitativa-datos.md)
- [../05-pruebas-seguridad-gobierno-modelos.md](../05-pruebas-seguridad-gobierno-modelos.md)

No leer los documentos completos si basta con localizar las secciones relacionadas con la tarea.

## Regla de ejecución

1. Leer estado y localizar la tarea actual.
2. Verificar dependencias y gate.
3. Inspeccionar código real y cambios existentes.
4. Presentar microplan.
5. Ejecutar una sola tarea.
6. Probar.
7. Actualizar este checklist y el estado.
8. Detenerse.

El checklist de este archivo ayuda a navegar, pero `IMPLEMENTATION_STATUS.md` tiene prioridad si existe una discrepancia.

## Checklist de tareas

- [x] LAB-301 — Inventario del componente histórico *(2026-08-11)* — `docs/lab/historical-inventory.md`: cada bloque de las 919 líneas con destino
- [x] LAB-302 — Contratos de presentación *(2026-08-12)* — `features/lab/stability/contracts.ts`; lo que no se pudo calcular es `null`, nunca cero
- [x] LAB-303 — Extraer adquisición histórica *(2026-08-11)* — `lab/stability/acquisition.ts`, lo único que toca red
- [x] LAB-304 — Extraer alineación y FX *(2026-08-11)* — `lab/stability/fx.ts`, puro y probado con números; un día sin tipo no vale cero
- [x] LAB-305 — Componer motor Stability V1 *(2026-08-11)* — `lab/stability/twr.ts`; paridad demostrada con los 27 fixtures dorados
- [x] LAB-306 — Hook de análisis *(2026-08-11)* — `useStabilityAnalysis`; testigo de petición: una respuesta que llega tarde no pisa a la vigente
- [x] LAB-307 — Descomponer tarjetas y tablas *(2026-08-12)* — cinco bloques de presentación, cada uno probado con objeto fijo; 16 pruebas
- [x] LAB-308 — Sustituir por composición *(2026-08-12)* — el monolito baja de 919 a 371 líneas y queda como adaptador; cero cambio numérico
- [x] LAB-309 — Métricas downside y drawdown *(2026-08-11)* — VaR/CVaR históricos y perfil de caída con duración y recuperación; el VaR nunca se llama pérdida máxima
- [x] LAB-310 — Estabilidad por ventanas *(2026-08-11)* — una ventana que la serie no cubre se marca «no disponible», no se simula
- [x] LAB-311 — Runs locales reproducibles *(2026-08-11)* — índice acotado en `localStorage`; sin `modelVersion` y `asOf` no se guarda ni se lee
- [ ] LAB-312 — Página Resumen de estabilidad V2
- [ ] LAB-313 — Medir y aislar cálculo pesado
- [ ] LAB-314 — Paridad y cierre G3

---

## Backlog detallado de la fase

## Objetivo

Desacoplar el componente histórico actual y construir un motor reproducible con paridad.

## Puerta G3

- UI, datos y cálculo están separados;
- fixtures actuales mantienen paridad;
- no hay fetch dentro de componentes de métricas;
- runs locales tienen versión;
- rendimiento medido.

### LAB-301 — Inventario del componente histórico

**Dependencias:** G2.
**Objetivo:** mapa de responsabilidades antes de refactor.

**Archivos esperados:** `docs/lab/historical-risk-refactor.md`.

**Pasos:**

1. Enumerar estado, efectos, fetches, caché, transformaciones, cálculos y UI.
2. Trazar dependencias.
3. Identificar funciones ya puras reutilizables.
4. Definir orden de extracción.

**Aceptación:** cada bloque de las ~920 líneas tiene destino.

### LAB-302 — Contratos de entrada/salida de estabilidad

**Dependencias:** LAB-301, LAB-210.
**Objetivo:** schemas `StabilityInput/Result`.

**Archivos esperados:**

- dominio/schemas;
- tests.

**Pasos:** incluir snapshot, series, ventana, cobertura, warnings y versiones.
**Aceptación:** UI antigua puede mapearse sin perder datos.

### LAB-303 — Extraer adquisición histórica

**Dependencias:** LAB-302.
**Objetivo:** hook/servicio sin cálculos.

**Archivos esperados:**

- `src/lib/lab/services/historicalDataService.ts`;
- `src/features/lab/hooks/useHistoricalData.ts`;
- tests.

**Pasos:**

1. Reutilizar MarketDataProvider/service.
2. Cancelar requests obsoletos.
3. Devolver provenance y quality.
4. Cache key completa.
5. No transformar en métricas.

**Pruebas:** éxito, parcial, rate limit, cancelación.
**Aceptación:** cambio de cartera no mezcla respuestas.

### LAB-304 — Extraer alineación y FX

**Dependencias:** LAB-303.
**Objetivo:** normalizar series mediante funciones puras.

**Archivos esperados:**

- `src/lib/lab/data/alignSeries.ts`;
- `src/lib/lab/data/convertReturns.ts`;
- tests.

**Pruebas:** calendarios distintos, FX invertido, días ausentes, moneda base.
**Aceptación:** no se imputa retorno cero silencioso.

### LAB-305 — Componer motor Stability V1

**Dependencias:** LAB-302, LAB-304, LAB-002.
**Objetivo:** envolver cálculos financieros existentes.

**Archivos esperados:**

- `src/lib/lab/analytics/stability.ts`;
- tests.

**Pasos:**

1. Reutilizar portfolioRisk/historical/diversification.
2. No reescribir fórmulas sin motivo.
3. Añadir warnings/cobertura.
4. Devolver result versionado.

**Pruebas:** golden y propiedades.
**Aceptación:** paridad dentro de tolerancia.

### LAB-306 — View model y hook de análisis

**Dependencias:** LAB-303, LAB-305.
**Objetivo:** orquestar estado sin que UI conozca proveedores.

**Archivos esperados:**

- `useStabilityAnalysis.ts`;
- `stabilityViewModel.ts`;
- tests.

**Estados:** idle/loading/partial/completed/error/stale.
**Aceptación:** reintentar no duplica datos ni resultados.

### LAB-307 — Descomponer tarjetas y tablas

**Dependencias:** LAB-306.
**Objetivo:** extraer UI del monolito.

**Archivos esperados:**

- componentes de summary;
- risk contributions;
- asset metrics;
- correlation summary.

**Pasos:**

1. Componentes presentacionales.
2. Props tipadas y formateadas.
3. Tabla accesible.
4. Sin store/fetch directo.

**Pruebas:** render de estados y snapshots visuales razonables.
**Aceptación:** cada componente se prueba con objeto fijo.

### LAB-308 — Sustituir HistoricalRiskSection por composición

**Dependencias:** LAB-307.
**Objetivo:** cerrar refactor con paridad.

**Pasos:**

1. Montar hook + componentes.
2. Eliminar lógica ya extraída.
3. Mantener API temporal si la usan rutas legacy.
4. Comparar golden/E2E.

**Aceptación:** monolito desaparece o queda como adaptador pequeño; cero cambio numérico no aprobado.

### LAB-309 — Añadir métricas downside y drawdown

**Dependencias:** LAB-305, LAB-308.
**Objetivo:** downside deviation, CVaR histórico, duración y recuperación.

**Archivos esperados:**

- analytics;
- tests;
- view components.

**Pasos:**

1. Definir signos/MAR/confianza.
2. Aplicar mínimos.
3. Mostrar warnings.
4. Añadir metodología.

**Pruebas:** series manuales, cola insuficiente, all-positive.
**Aceptación:** VaR nunca se describe como pérdida máxima.

### LAB-310 — Estabilidad por ventanas

**Dependencias:** LAB-305.
**Objetivo:** sensibilidad a ventanas/métodos.

**Archivos esperados:**

- `estimateStability.ts`;
- tests;
- sección UI.

**Pasos:**

1. Ejecutar presets 1/3/5 años cuando haya muestra.
2. Comparar estimador muestral/shrinkage cuando esté disponible.
3. Calcular rango y cambio de ranking.
4. Etiquetar no concluyente.

**Aceptación:** ninguna ventana inexistente se simula.

### LAB-311 — Runs locales reproducibles

**Dependencias:** LAB-305, LAB-204.
**Objetivo:** guardar índice y resultado acotado localmente.

**Archivos esperados:**

- `labRunsSlice.ts`;
- repositorio IndexedDB si procede;
- schemas/tests.

**Pasos:**

1. Crear run ID/input hash.
2. Guardar metadata en store.
3. Resultado grande en IndexedDB.
4. TTL/stale.
5. invalidación por usuario.

**Pruebas:** round-trip, schema migration, quota error.
**Aceptación:** resultados guardados conservan modelVersion/asOf.

### LAB-312 — Página Resumen de estabilidad V2

**Dependencias:** LAB-309, LAB-310, LAB-311.
**Objetivo:** cuatro tarjetas y estabilidad de medición.

**Pruebas:** cartera concentrada, diversificada, datos parciales.
**Aceptación:** máximo de hallazgos y evidencia accesible.

### LAB-313 — Medir y aislar cálculo pesado

**Dependencias:** LAB-308.
**Objetivo:** decidir Web Worker con datos.

**Pasos:**

1. Benchmark 10/25/50 activos.
2. Medir main-thread blocking.
3. Si supera presupuesto, extraer worker.
4. Añadir cancelación y progreso.
5. Registrar decisión.

**Aceptación:** elección basada en benchmark; no introducir worker innecesario.

### LAB-314 — Paridad y cierre G3

**Dependencias:** LAB-308 a LAB-313.
**Objetivo:** informe de validación.

**Archivos esperados:** `docs/models/stability-v1-validation.md`.

**Contenido:** fixtures, tolerancias, diferencias, rendimiento, limitaciones.
**Aceptación:** cualquier diferencia está aprobada y explicada.
