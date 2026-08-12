# Fase 04 — Exposición, look-through y dependencia

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | ALTA |
| Sensibilidad | MUY ALTA |
| Esfuerzo predeterminado | high |
| Entrada/autorización | Requiere G3. Las tareas de proveedor requieren además decisión y licencia. |
| Funcionalidad a posponer | Posponer look-through, factores o cola si no existe una fuente fiable y permitida. |

## Política de esfuerzo

- Usar **high** como punto de partida de la fase.
- Escalar a **xhigh**: LAB-401 a LAB-408, LAB-410 a LAB-412 y LAB-416.
- Uso de **max**: No usar max salvo revisión excepcional de una metodología no resuelta.
- El esfuerzo alto no sustituye pruebas, fixtures ni revisión independiente.
- Si la sesión tiene un esfuerzo inferior al requerido, detenerse antes de editar.

## Contexto que debe leer el agente

Siempre:

- [Estado de implementación](../IMPLEMENTATION_STATUS.md)
- [Índice del plan](../README.md)
- [Backlog completo](../04-backlog-fases-y-tareas-ia.md)

Específico de esta fase:

- [../00-plan-maestro-laboratorio.md](../00-plan-maestro-laboratorio.md)
- [../01-especificacion-producto-ux.md](../01-especificacion-producto-ux.md)
- [../02-arquitectura-cuantitativa-datos.md](../02-arquitectura-cuantitativa-datos.md)
- [../03-arquitectura-sistema-infraestructura-ci-cd.md](../03-arquitectura-sistema-infraestructura-ci-cd.md)
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

- [ ] LAB-401 — Spike de proveedores y licencias
- [ ] LAB-402 — Identidad canónica de instrumentos
- [x] LAB-403 — Contratos de composición *(2026-08-12)* — fuente, fecha y **cobertura declarada** en cada composición
- [x] LAB-404 — Adaptador de composición manual *(2026-08-12)* — sobre el campo `holdings` que ya existía; una posición sin peso se descarta, no se le inventa uno
- [x] LAB-404b — Formulario de composición manual *(2026-08-12)* — `HoldingsEditor`: se pregunta en porcentaje y se guarda en fracción; sin símbolo, con peso fuera de rango o duplicado no entra nada
- [x] LAB-405 — Motor de exposición directa *(2026-08-12)* — incluido en el motor de look-through
- [ ] LAB-406 — Contratos e ingesta de holdings
- [x] LAB-407 — Motor look-through *(2026-08-12)* — **lo que no se conoce no se reparte**: cuenta como no mirado y se dice cuánto
- [x] LAB-408 — Motor de solapamiento *(2026-08-12)* — suma de mínimos entre pares de fondos
- [x] LAB-409 — UI de Exposición *(2026-08-12)* — cobertura mirada, exposición real por empresa, solapamiento entre fondos y el editor de cada envoltorio; conserva el reparto clásico porque `/diversificacion` redirige aquí
- [ ] LAB-410 — Matrices par-a-par con muestra
- [ ] LAB-411 — Correlación rolling y downside
- [ ] LAB-412 — Clustering jerárquico
- [ ] LAB-413 — UI de Dependencia
- [ ] LAB-414 — Correlación de cola: spike
- [ ] LAB-415 — Factores: contrato y alcance
- [ ] LAB-416 — Cierre G4

---

## Backlog detallado de la fase

## Objetivo

Explicar la exposición económica real y la dependencia entre posiciones sin inventar holdings ni clasificaciones.

## Puerta G4

- identidad de instrumentos canónica;
- proveedor/licencia decididos;
- cobertura visible;
- look-through parcial se representa correctamente;
- correlaciones muestran muestra;
- clusters tienen estabilidad;
- no se afirma causalidad.

### LAB-401 — Spike de proveedores y licencias

**Dependencias:** G3.
**Objetivo:** decidir qué datos pueden obtenerse, mostrarse, cachearse y exportarse.

**Archivos esperados:**

- `docs/research/data-provider-evaluation.md`;
- `docs/adr/ADR-004-classification-holdings-provider.md`.

**Evaluar:**

- identidad/tickers;
- taxonomía sectorial;
- holdings de ETF/fondos;
- vigencia point-in-time;
- fundamentales futuros;
- rate limits;
- coste;
- cobertura UE/EE. UU./cripto;
- licencia de almacenamiento y redistribución;
- SLA y correcciones.

**Aceptación:** decisión o alcance reducido explícito.
**Regla de parada:** si no se puede persistir holdings, diseñar caché compatible o posponer look-through.

### LAB-402 — Identidad canónica de instrumentos

**Dependencias:** LAB-401.
**Objetivo:** evitar identificar por ticker.

**Archivos esperados:**

- tipos/schemas;
- migración `instruments` y `instrument_aliases`;
- tests RLS/permisos;
- adaptador de assets actuales.

**Pasos:**

1. Definir UUID, MIC, ISIN opcional y aliases.
2. Escritura solo de servicio en catálogo.
3. Relacionar asset de usuario sin migración destructiva.
4. Detectar mapping ambiguo.

**Pruebas:** tickers duplicados en mercados, cambio de alias.
**Aceptación:** ticker sin mercado ambiguo no se autoasigna.

### LAB-403 — Contratos de clasificación point-in-time

**Dependencias:** LAB-402.
**Objetivo:** sector, industria, país y otras dimensiones con vigencia.

**Archivos esperados:**

- dominio/schema;
- migración `asset_classifications`;
- repositorio y tests.

**Pasos:**

1. Soportar taxonomía y versión.
2. `validFrom/validTo`.
3. confidence/provenance.
4. «Unknown» como categoría explícita, no imputación.

**Aceptación:** consultar clasificación a fecha devuelve versión correcta.

### LAB-404 — Ingesta/adaptador de clasificación

**Dependencias:** LAB-401, LAB-403.
**Objetivo:** normalizar proveedor elegido.

**Archivos esperados:**

- Edge adapter;
- schemas de proveedor;
- contract tests con respuestas grabadas permitidas.

**Pasos:**

1. Validar payload.
2. Mapear taxonomía.
3. Registrar errores/missing.
4. Cache y rate limit.
5. No exponer clave.

**Pruebas:** cambio de schema, unknown, rate limit.
**Aceptación:** payload inválido no contamina catálogo.

### LAB-405 — Motor de exposición directa

**Dependencias:** LAB-403, LAB-305.
**Objetivo:** agregación por dimensiones.

**Archivos esperados:**

- `src/lib/lab/analytics/exposure.ts`;
- tests.

**Pasos:**

1. Agregar por activo/emisor/tipo/sector/región/moneda.
2. Mantener unknown.
3. Calcular HHI/N efectivo por dimensión.
4. Devolver contribuyentes.

**Pruebas:** pesos, unknown, redondeo solo UI.
**Aceptación:** exposiciones suman 1 dentro de tolerancia incluyendo unknown.

### LAB-406 — Contratos e ingesta de holdings

**Dependencias:** LAB-401, LAB-402.
**Objetivo:** holdings de fondos con vigencia.

**Archivos esperados:**

- schema `FundHoldingObservation`;
- migración/repositorio o adaptador de caché;
- tests.

**Pasos:**

1. Incluir reportedAt/validFrom.
2. Identidad canónica del componente.
3. Cobertura y «otros».
4. Política de licencia.
5. Escritura de servicio.

**Aceptación:** holdings antiguos no se reemplazan si se necesitan para reproducir.

### LAB-407 — Motor look-through

**Dependencias:** LAB-405, LAB-406.
**Objetivo:** expandir exposición real.

**Archivos esperados:**

- `lookThrough.ts`;
- tests.

**Pasos:**

1. Expandir un nivel en MVP.
2. Conservar efectivo/otros/no cubierto.
3. Detectar ciclos.
4. Límites de profundidad.
5. Devolver lineage por exposición.

**Pruebas:** ETF + acciones directas, cobertura parcial, ciclo.
**Aceptación:** total cuadra y coverage se conserva.

### LAB-408 — Motor de solapamiento

**Dependencias:** LAB-406.
**Objetivo:** ETF/ETF y ETF/acción.

**Archivos esperados:** `overlap.ts` y tests.

**Métricas:** min-overlap, exposición duplicada, top componentes.
**Aceptación:** simetría par a par; sin holdings produce «no disponible».

### LAB-409 — UI de Exposición

**Dependencias:** LAB-405, LAB-407, LAB-408.
**Objetivo:** vistas directa/real y drill-down.

**Archivos esperados:**

- `LabExposurePage.tsx`;
- `ExposureBars.tsx`;
- `ExposureTable.tsx`;
- `ExposureLineageDrawer.tsx`.

**Pruebas:** dimensiones, partial, unknown, móvil, tabla accesible.
**Aceptación:** seleccionar sector muestra posiciones originadoras.

### LAB-410 — Matrices par-a-par con muestra

**Dependencias:** LAB-304, LAB-305.
**Objetivo:** motor de correlación/covarianza detallado.

**Archivos esperados:**

- `dependencyMatrix.ts`;
- tests.

**Pasos:**

1. Estimación por par.
2. N y periodo por celda.
3. Pearson inicial; Spearman opcional separada.
4. warnings por muestra.
5. matrices simétricas.

**Aceptación:** no se fuerza intersección global sin opción explícita.

### LAB-411 — Correlación rolling y downside

**Dependencias:** LAB-410.
**Objetivo:** dependencia por tiempo y caídas.

**Archivos esperados:**

- `rollingDependency.ts`;
- tests.

**Pasos:**

1. Definir ventanas.
2. Definir condición downside.
3. Incluir N.
4. Bloquear muestras insuficientes.

**Pruebas:** series sintéticas con cambio de régimen.
**Aceptación:** UI/resultado declara definición downside.

### LAB-412 — Clustering jerárquico

**Dependencias:** LAB-410.
**Objetivo:** ordenar matriz y crear grupos.

**Archivos esperados:**

- `dependencyClustering.ts`;
- tests/fixture independiente.

**Pasos:**

1. Distancia documentada.
2. Linkage versionado.
3. Orden de hojas determinista.
4. Estabilidad por resampling.
5. Label genérico.

**Aceptación:** permutar inputs no cambia clusters salvo orden equivalente.

### LAB-413 — UI de Dependencia

**Dependencias:** LAB-410 a LAB-412.
**Objetivo:** matriz, rolling y cluster cards.

**Archivos esperados:**

- `LabDependencyPage.tsx`;
- heatmap;
- tabla accesible;
- cluster cards.

**Pruebas:** teclado, N por celda, cartera grande, móvil.
**Aceptación:** heatmap tiene alternativa textual/tabular.

### LAB-414 — Correlación de cola: spike

**Dependencias:** LAB-411.
**Objetivo:** decidir si la muestra permite una métrica de cola.

**Entregable:** ADR/nota con método, mínimos, fixture y decisión.
**Aceptación:** si no hay robustez, no se implementa y no bloquea G4.

### LAB-415 — Factores: contrato y alcance

**Dependencias:** LAB-401.
**Objetivo:** decidir fuentes y factores.

**Entregable:** ADR con licencias, frecuencia, regresión y límites.
**Aceptación:** no inferir factores sin series adecuadas.
**Estado posible:** pospuesto.

### LAB-416 — Cierre G4

**Dependencias:** LAB-409, LAB-413 y decisiones 414/415.
**Objetivo:** informe de cobertura y validación.

**Contenido:** activos cubiertos, holdings, errores, matrices, rendimiento, copy.
**Aceptación:** cartera del caso cripto/tech explica exposición y dependencia sin datos fabricados.
