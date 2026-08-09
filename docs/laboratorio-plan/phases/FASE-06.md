# Fase 06 — Restricciones y carteras candidatas

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | CRÍTICA |
| Sensibilidad | EXTREMA |
| Esfuerzo predeterminado | xhigh |
| Entrada/autorización | Requiere G4 y G5, además de restricciones y costes definidos. |
| Funcionalidad a posponer | No introducir Black-Litterman, HRP, CVaR avanzada o servicio Python sin ADR y validación. |

## Política de esfuerzo

- Usar **xhigh** como punto de partida de la fase.
- Escalar a **xhigh**: LAB-601 a LAB-610 y LAB-614. La UI/API puede realizarse en high cuando los contratos estén congelados.
- Uso de **max**: Usar max una sola vez para revisión adversarial independiente de LAB-614/G6.
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

- [ ] LAB-601 — Compilador de restricciones
- [ ] LAB-602 — Diagnóstico de factibilidad
- [ ] LAB-603 — ADR del motor de optimización
- [ ] LAB-604 — Baseline 1/N
- [ ] LAB-605 — Candidata de aportaciones solamente
- [ ] LAB-606 — Mínima varianza restringida
- [ ] LAB-607 — Equal Risk Contribution
- [ ] LAB-608 — Modelo de costes y turnover
- [ ] LAB-609 — Métricas de candidata
- [ ] LAB-610 — Robustez de pesos
- [ ] LAB-611 — API de candidatas
- [ ] LAB-612 — UI de carteras candidatas
- [ ] LAB-613 — Motor de brechas/reparación
- [ ] LAB-614 — Validación fuera de muestra de candidatas
- [ ] LAB-615 — Cierre G6

---

## Backlog detallado de la fase

## Objetivo

Generar alternativas robustas y comparables, no una «cartera perfecta».

## Puerta G6

- restricciones compiladas y factibles;
- baselines;
- costes;
- robustez;
- solver validado;
- comparación fuera de muestra;
- UI no prescriptiva.

### LAB-601 — Compilador de restricciones

**Dependencias:** LAB-202, LAB-405.
**Objetivo:** traducir IPS a restricciones numéricas.

**Archivos esperados:**

- `constraintCompiler.ts`;
- tests.

**Pasos:**

1. Resolver dimensiones a instrumentos.
2. Separar hard/soft.
3. Normalizar límites.
4. reason codes.
5. reporte de cobertura.

**Aceptación:** constraint sin clasificación no se ignora; produce bloqueo/warning.

### LAB-602 — Diagnóstico de factibilidad

**Dependencias:** LAB-601.
**Objetivo:** explicar por qué no existe solución.

**Archivos esperados:** `constraintFeasibility.ts`, tests.

**Casos:** mínimos suman >1, locked positions, grupo incompatible, universo vacío.
**Aceptación:** error muestra conjunto mínimo útil o razones ordenadas.

### LAB-603 — ADR del motor de optimización

**Dependencias:** LAB-602, benchmarks LAB-313.
**Objetivo:** TypeScript vs servicio Python.

**Evaluar:** precisión, solver, licencias, tamaño, operación, determinismo, seguridad.
**Aceptación:** método y límites aprobados antes de optimizadores.

### LAB-604 — Baseline 1/N

**Dependencias:** LAB-602.
**Objetivo:** candidata simple restringida.

**Archivos esperados:** `candidateEqualWeight.ts`, tests.

**Pasos:** activos elegibles, locked, residual, límites.
**Aceptación:** pesos suman uno y violaciones son cero.

### LAB-605 — Candidata de aportaciones solamente

**Dependencias:** LAB-602, LAB-504.
**Objetivo:** aproximarse a bandas sin vender.

**Archivos esperados:** `candidateContributionsOnly.ts`, tests.

**Pruebas:** efectivo insuficiente, activo bloqueado, costes.
**Aceptación:** ninguna cantidad vendida.

### LAB-606 — Mínima varianza restringida

**Dependencias:** LAB-603, LAB-305, LAB-602.
**Objetivo:** solver y covarianza regularizada.

**Archivos esperados:**

- `candidateMinimumVariance.ts`;
- tests independientes.

**Pasos:**

1. Shrinkage.
2. Constraints.
3. tolerancias.
4. timeout.
5. solver status.

**Pruebas:** matriz diagonal, activos idénticos, PSD problemática.
**Aceptación:** no devuelve pesos si solver no converge.

### LAB-607 — Equal Risk Contribution

**Dependencias:** LAB-603, LAB-305, LAB-602.
**Objetivo:** candidata ERC.

**Pruebas:** covarianza diagonal y simétrica; contribuciones dentro de tolerancia.
**Aceptación:** reporta error de paridad y convergencia.

### LAB-608 — Modelo de costes y turnover

**Dependencias:** LAB-504.
**Objetivo:** coste uniforme para candidatas.

**Archivos esperados:** `costModel.ts`, `turnover.ts`, tests.

**Pasos:** bps, fijo, FX, unknown; no impacto inventado.
**Aceptación:** coste desconocido no se representa como 0.

### LAB-609 — Métricas de candidata

**Dependencias:** LAB-604 a LAB-608.
**Objetivo:** comparar bajo el mismo motor.

**Archivos esperados:** `evaluateCandidate.ts`, tests.

**Métricas:** riesgo, downside, concentración, violations, distance, turnover, cost.
**Aceptación:** actual y candidatas usan mismos supuestos.

### LAB-610 — Robustez de pesos

**Dependencias:** LAB-606, LAB-607, LAB-609.
**Objetivo:** perturbación/bootstrap.

**Archivos esperados:** `candidateRobustness.ts`, tests.

**Salida:** rango de peso, selección, riesgo y etiqueta.
**Aceptación:** semilla y número de repeticiones guardados.

### LAB-611 — API de candidatas

**Dependencias:** LAB-509, LAB-604 a LAB-610.
**Objetivo:** run tipado e idempotente.

**Pasos:** auth, snapshot/policy, límites, timeout, resultado.
**Aceptación:** inputs incompatibles devuelven `LAB_CONSTRAINTS_INFEASIBLE`.

### LAB-612 — UI de carteras candidatas

**Dependencias:** LAB-609 a LAB-611.
**Objetivo:** tabla comparativa y controles.

**Archivos esperados:**

- `LabCandidatesPage.tsx`;
- `CandidateComparisonTable.tsx`;
- `CandidateStabilityPanel.tsx`.

**Pruebas:** móvil dos candidatas, restricciones, no solución, stale.
**Aceptación:** no hay candidata preseleccionada como «mejor».

### LAB-613 — Motor de brechas/reparación

**Dependencias:** LAB-203, LAB-405, LAB-609.
**Objetivo:** priorizar problemas y enlazar simulación.

**Archivos esperados:** rules, engine, tests, page.

**Pasos:**

1. Reglas declarativas.
2. Severidad/materialidad.
3. evidencia.
4. opciones de simulación.
5. señal táctica siempre después.

**Aceptación:** caso cripto/tech muestra riesgo estructural primero.

### LAB-614 — Validación fuera de muestra de candidatas

**Dependencias:** LAB-604 a LAB-610.
**Objetivo:** comparar con 1/N y actual.

**Entregable:** `docs/models/candidates-v1-validation.md`.

**Contenido:** periodos, walk-forward, costes, turnover, sensibilidad, fallos.
**Aceptación:** claims UI coinciden con evidencia; una no-superioridad no se oculta.

### LAB-615 — Cierre G6

**Dependencias:** LAB-612 a LAB-614.
**Objetivo:** revisión cuantitativa/producto.

**Aceptación:** pesos válidos, explicables, sensibles marcados y sin lenguaje prescriptivo.
