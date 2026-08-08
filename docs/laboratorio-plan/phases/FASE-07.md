# Fase 07 — Sectores para investigar

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | OPCIONAL EN V1 |
| Sensibilidad | EXTREMA |
| Esfuerzo predeterminado | xhigh |
| Entrada/autorización | Requiere G6 y autorización explícita del propietario. No iniciar automáticamente. |
| Funcionalidad a posponer | Recomendación predeterminada: posponer hasta que el núcleo esté estable y exista proveedor. |

## Política de esfuerzo

- Usar **xhigh** como punto de partida de la fase.
- Escalar a **xhigh**: Todas las tareas cuantitativas y de datos point-in-time.
- Uso de **max**: LAB-710 y LAB-716 justifican una revisión max independiente.
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

- [ ] LAB-701 — ADR de universo y señales
- [ ] LAB-702 — Registro de modelos
- [ ] LAB-703 — Universo point-in-time
- [ ] LAB-704 — Feature store sectorial
- [ ] LAB-705 — Implementar señal 1
- [ ] LAB-706 — Implementar señal 2
- [ ] LAB-707 — Señal de diversificación marginal
- [ ] LAB-708 — Normalización y combinación
- [ ] LAB-709 — Motor de backtest walk-forward
- [ ] LAB-710 — Informe de validación sectorial
- [ ] LAB-711 — Jobs de cálculo y publicación
- [ ] LAB-712 — API de compatibilidad sector-cartera
- [ ] LAB-713 — UI Sectores
- [ ] LAB-714 — Estado «sin candidato»
- [ ] LAB-715 — Monitorización de señal
- [ ] LAB-716 — Cierre G7

---

## Backlog detallado de la fase

## Objetivo

Crear señales sectoriales point-in-time y un ranking de investigación compatible con la cartera.

## Puerta G7

- proveedor y universo aprobados;
- datos point-in-time;
- backtest walk-forward;
- costes;
- benchmark;
- estabilidad;
- model registry;
- publicación separada del cálculo;
- revisión de copy/compliance.

### LAB-701 — ADR de universo y señales

**Dependencias:** G4, G6, LAB-401.
**Objetivo:** fijar taxonomía, región, frecuencia y familias de señal.

**Archivos esperados:** `docs/adr/ADR-008-sector-signals.md`.

**Decisiones:**

- GICS/ICB/u otra licencia;
- sectores o industrias;
- vehículos representativos;
- point-in-time;
- 2–3 señales MVP;
- horizonte;
- rebalanceo;
- exclusiones;
- caducidad.

**Aceptación:** hipótesis falsable por señal.

### LAB-702 — Registro de modelos

**Dependencias:** LAB-701, LAB-205.
**Objetivo:** tabla `model_versions` y estados.

**Archivos esperados:**

- migración;
- RLS/permisos;
- repository;
- tests.

**Reglas:** escritura de servicio; draft/validated/active/retired; commit SHA.
**Aceptación:** solo una versión activa por model key cuando proceda.

### LAB-703 — Universo point-in-time

**Dependencias:** LAB-701, LAB-402.
**Objetivo:** membership histórico.

**Archivos esperados:**

- contratos;
- ingesta;
- almacenamiento permitido;
- tests.

**Aceptación:** consulta por fecha no usa miembros futuros.

### LAB-704 — Feature store sectorial

**Dependencias:** LAB-702, LAB-703.
**Objetivo:** observaciones versionadas.

**Pasos:**

1. observed/available/ingested.
2. source.
3. feature version.
4. missing.
5. correcciones.

**Pruebas:** revisión posterior y query point-in-time.
**Aceptación:** no se reescribe el pasado utilizado por runs.

### LAB-705 — Implementar señal 1

**Dependencias:** LAB-704.
**Objetivo:** una señal simple aprobada, por ejemplo momentum.

**Archivos esperados:** calculador puro, fixtures, metodología.

**Pasos:**

1. Fórmula.
2. lag.
3. tratamiento de dividendos.
4. missing/outliers.
5. frecuencia.

**Aceptación:** cálculo independiente y sin lookahead.

### LAB-706 — Implementar señal 2

**Dependencias:** LAB-704.
**Objetivo:** segunda señal ortogonal aprobada.

**Reglas y aceptación:** iguales a LAB-705; no elegir por conveniencia de datos actuales.

### LAB-707 — Señal de diversificación marginal

**Dependencias:** LAB-405, LAB-410, LAB-704.
**Objetivo:** compatibilidad sector-cartera.

**Archivos esperados:** `portfolioFit.ts`, tests.

**Entradas:** exposición actual, correlación, contribución marginal, IPS.
**Aceptación:** se separa de marketScore.

### LAB-708 — Normalización y combinación

**Dependencias:** LAB-705 a LAB-707.
**Objetivo:** scores transparentes.

**Archivos esperados:** normalizer, combiner, tests.

**Pasos:**

1. Winsor/rank policy.
2. pesos fijos.
3. missing policy.
4. subpuntuaciones.
5. reason codes.

**Aceptación:** ranking reproduce fixture; no entrena y evalúa en misma muestra.

### LAB-709 — Motor de backtest walk-forward

**Dependencias:** LAB-703 a LAB-708.
**Objetivo:** infraestructura de validación.

**Archivos esperados:**

- backtest engine o job;
- config versionada;
- tests.

**Pasos:**

1. rebalance dates.
2. availableAt.
3. universo.
4. selección.
5. costes.
6. benchmark.
7. resultados por régimen.

**Pruebas:** fixture con dato publicado tarde; delisting.
**Aceptación:** test falla si se introduce lookahead.

### LAB-710 — Informe de validación sectorial

**Dependencias:** LAB-709.
**Objetivo:** evaluar puerta, no justificar modelo a posteriori.

**Archivo:** `docs/models/sector-signals-v1-validation.md`.

**Contenido:**

- hipótesis;
- periodo desarrollo/validación/holdout;
- benchmarks;
- costes;
- IC y estabilidad;
- turnover;
- drawdown;
- subperiodos;
- sensibilidad;
- limitaciones;
- decisión go/no-go.

**Aceptación:** holdout no se usa para ajustar.

### LAB-711 — Jobs de cálculo y publicación

**Dependencias:** LAB-702, LAB-708, decisión go en LAB-710.
**Objetivo:** pipeline idempotente.

**Archivos esperados:**

- `lab-jobs` handlers;
- migración job runs/signals;
- cron config;
- tests.

**Pasos:**

1. calcular draft.
2. validar datos.
3. publicar si versión activa.
4. expiresAt.
5. no solapar.
6. alerta.

**Aceptación:** fallo parcial no reemplaza señal válida.

### LAB-712 — API de compatibilidad sector-cartera

**Dependencias:** LAB-711, LAB-707.
**Objetivo:** combinar señal global con snapshot privado.

**Pasos:**

1. auth/ownership.
2. cargar signal active.
3. aplicar constraints/fit.
4. guardar run privado.
5. evidence.

**Aceptación:** ninguna fila global contiene cartera del usuario.

### LAB-713 — UI Sectores

**Dependencias:** LAB-712.
**Objetivo:** ranking de investigación.

**Archivos esperados:**

- `LabSectorResearchPage.tsx`;
- ranking;
- drawer de comparación;
- evidence.

**Pruebas:** señal válida, caducada, ningún sector, cobertura parcial, móvil.
**Aceptación:** marketScore/fit/quality visibles por separado.

### LAB-714 — Estado «sin candidato»

**Dependencias:** LAB-713.
**Objetivo:** tratar ausencia como resultado normal.

**Aceptación:** la UI no relaja filtros automáticamente ni inventa una primera posición.

### LAB-715 — Monitorización de señal

**Dependencias:** LAB-711.
**Objetivo:** freshness, drift, cobertura, distribución.

**Archivos esperados:** checks, alertas y dashboard/runbook.

**Aceptación:** señal stale se retira de nuevos runs.

### LAB-716 — Cierre G7

**Dependencias:** LAB-710 a LAB-715.
**Objetivo:** revisión cuantitativa, seguridad, UX y jurídica.

**Salida:** decisión:

- publicar;
- beta limitada;
- rehacer;
- no publicar.

**Aceptación:** una decisión no-go se respeta sin bloquear el resto del Laboratorio.
