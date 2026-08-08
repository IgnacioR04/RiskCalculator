# Fase 08 — Empresas para investigar, opcional

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | POSPUESTA |
| Sensibilidad | EXTREMA |
| Esfuerzo predeterminado | xhigh |
| Entrada/autorización | Requiere G7, entrada G8 aprobada y autorización explícita. Está bloqueada por defecto. |
| Funcionalidad a posponer | No implementar en la primera versión. |

## Política de esfuerzo

- Usar **xhigh** como punto de partida de la fase.
- Escalar a **xhigh**: Toda la fase si llega a autorizarse.
- Uso de **max**: LAB-809 y LAB-812 requieren revisión max independiente.
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

- [ ] LAB-801 — Revisión formal de entrada
- [ ] LAB-802 — Contratos fundamentales
- [ ] LAB-803 — Adaptador e ingesta fundamental
- [ ] LAB-804 — Universo histórico de empresas
- [ ] LAB-805 — Filtros de elegibilidad
- [ ] LAB-806 — Features empresariales aprobadas
- [ ] LAB-807 — Redundancia con cartera
- [ ] LAB-808 — Ranking de investigación empresarial
- [ ] LAB-809 — Backtest y validación
- [ ] LAB-810 — API de watchlist
- [ ] LAB-811 — UI Empresas
- [ ] LAB-812 — Cierre G8

---

## Backlog detallado de la fase

## Objetivo

Añadir una watchlist explicable dentro de sectores/universos aprobados. Esta fase no es necesaria para lanzar un Laboratorio profesional.

## Puerta G8

- G7 aprobada;
- proveedor fundamental y licencia;
- acciones corporativas/delistings;
- universo point-in-time;
- filtros de liquidez;
- validación fuera de muestra;
- revisión de lenguaje y cumplimiento.

### LAB-801 — Revisión formal de entrada

**Dependencias:** G7.
**Objetivo:** decidir si construir esta fase aporta más valor que riesgo.

**Entregable:** `docs/gates/G8-company-research-entry.md`.

**Preguntas:**

- ¿La calidad point-in-time es suficiente?
- ¿Se controlan delistings?
- ¿La licencia permite uso?
- ¿Existe owner del modelo?
- ¿El lenguaje sigue siendo educativo?
- ¿Hay recursos para monitorizar?

**Aceptación:** decisión go/no-go firmada; no-go cierra la fase sin workaround.

### LAB-802 — Contratos fundamentales

**Dependencias:** go LAB-801.
**Objetivo:** representar periodos, publicación, moneda y revisiones.

**Archivos esperados:**

- dominio/schemas;
- tests.

**Campos mínimos:** periodEnd, filed/published/availableAt, currency, units, source, revision.
**Aceptación:** no se usa periodEnd como availableAt.

### LAB-803 — Adaptador e ingesta fundamental

**Dependencias:** LAB-802, LAB-401.
**Objetivo:** validar proveedor y persistencia.

**Pruebas:** restatement, unidad, moneda, missing, rate limit.
**Aceptación:** revisión crea versión y no reescribe backtest usado.

### LAB-804 — Universo histórico de empresas

**Dependencias:** LAB-402, LAB-703.
**Objetivo:** miembros, IPO, delisting y corporate actions.

**Aceptación:** empresa desaparecida permanece en fechas históricas.

### LAB-805 — Filtros de elegibilidad

**Dependencias:** LAB-802 a LAB-804.
**Objetivo:** liquidez, tamaño, datos, complejidad, restricciones.

**Archivos esperados:** filtro declarativo, reason codes, tests.

**Aceptación:** cada exclusión tiene motivo; no imputar para pasar.

### LAB-806 — Features empresariales aprobadas

**Dependencias:** LAB-805.
**Objetivo:** implementar una feature por tarea adicional si son varias.

**Regla:** dividir en LAB-806A/B/C en ejecución real:

- calidad;
- valoración;
- momentum;
- estabilidad.

Cada subtask incluye fórmula, unit tests, point-in-time y nota metodológica.
**Aceptación:** ninguna feature se implementa en un PR conjunto masivo.

### LAB-807 — Redundancia con cartera

**Dependencias:** LAB-407, LAB-805.
**Objetivo:** saber si la empresa ya está dentro de ETF/fondos.

**Archivos esperados:** `companyPortfolioFit.ts`, tests.

**Aceptación:** muestra exposición directa + indirecta y cobertura.

### LAB-808 — Ranking de investigación empresarial

**Dependencias:** LAB-806, LAB-807.
**Objetivo:** combinar subpuntuaciones sin objetivo de precio.

**Pasos:** normalization, fixed weights, risks, exclusions, expiresAt.
**Aceptación:** ranking sectorial y empresarial quedan como modelos separados.

### LAB-809 — Backtest y validación

**Dependencias:** LAB-808, LAB-709.
**Objetivo:** walk-forward con costes, delistings y holdout.

**Entregable:** `docs/models/company-research-v1-validation.md`.
**Aceptación:** no se publica si falla calidad o estabilidad, aunque el retorno aparente sea alto.

### LAB-810 — API de watchlist

**Dependencias:** go LAB-809.
**Objetivo:** run privado y watchlist caducable.

**Pruebas:** RLS, stale, exclusiones, idempotencia.
**Aceptación:** no genera órdenes ni modifica cartera.

### LAB-811 — UI Empresas

**Dependencias:** LAB-810.
**Objetivo:** ficha de investigación y comparación.

**Pruebas:** datos parciales, exposición redundante, móvil, accesibilidad.
**Aceptación:** razones en contra tienen igual accesibilidad que razones a favor.

### LAB-812 — Cierre G8

**Dependencias:** LAB-809 a LAB-811.
**Objetivo:** aprobación limitada o general.

**Aceptación:** feature flag y rollback probados; copy revisado.
