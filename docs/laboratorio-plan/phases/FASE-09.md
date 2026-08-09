# Fase 09 — Evidencia, explicaciones y auditoría

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | CRÍTICA |
| Sensibilidad | ALTA |
| Esfuerzo predeterminado | high |
| Entrada/autorización | Es transversal: cada tarea conserva sus dependencias. El cierre G9 ocurre después de las capacidades incluidas. |
| Funcionalidad a posponer | Posponer explicación con LLM; comenzar con explicaciones deterministas. |

## Política de esfuerzo

- Usar **high** como punto de partida de la fase.
- Escalar a **xhigh**: LAB-901, LAB-906, LAB-908, LAB-909 y LAB-910.
- Uso de **max**: No usar max. LAB-908/909 permanecen pospuestas salvo autorización.
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

- [ ] LAB-901 — Contrato de evidencia
- [ ] LAB-902 — Catálogo de reason codes
- [ ] LAB-903 — Generador determinista de explicaciones
- [ ] LAB-904 — EvidenceDrawer y metodología
- [ ] LAB-905 — Historial de runs
- [ ] LAB-906 — Auditoría
- [ ] LAB-907 — Exportación de análisis
- [ ] LAB-908 — Spike de explicación con LLM
- [ ] LAB-909 — Implementar narración opcional
- [ ] LAB-910 — Cierre G9

---

## Backlog detallado de la fase

## Objetivo

Conseguir trazabilidad extremo a extremo. Parte de esta fase puede adelantarse: toda nueva pantalla debe incorporar evidencia básica desde su fase.

## Puerta G9

- cada resultado enlaza inputs, datos, modelo y versión;
- reason codes deterministas;
- historial;
- auditoría privada;
- exportaciones correctas;
- LLM opcional no altera números.

### LAB-901 — Contrato de evidencia

**Dependencias:** LAB-302, LAB-501, LAB-702.
**Objetivo:** unificar fuentes y metodología.

**Archivos esperados:**

- `EvidenceItem` schema;
- helpers;
- tests.

**Campos:** kind, source, asOf, availableAt, method, inputRefs, modelVersion, coverage, limitations.
**Aceptación:** soporta hecho, estimación, escenario, señal, candidata.

### LAB-902 — Catálogo de reason codes

**Dependencias:** LAB-203, LAB-613, LAB-708.
**Objetivo:** razones estables y traducibles.

**Archivos esperados:**

- catálogo tipado;
- traducción española;
- tests de exhaustividad.

**Aceptación:** un reason code desconocido se muestra de forma segura y se monitoriza.

### LAB-903 — Generador determinista de explicaciones

**Dependencias:** LAB-901, LAB-902.
**Objetivo:** plantillas sin LLM.

**Archivos esperados:**

- `src/lib/lab/explanations/rules.ts`;
- templates;
- tests.

**Pasos:**

1. Priorizar razones.
2. Insertar valores ya calculados.
3. Adjuntar uncertainty.
4. Validar lenguaje.

**Aceptación:** explicación no puede cambiar el resultado.

### LAB-904 — EvidenceDrawer y metodología

**Dependencias:** LAB-901.
**Objetivo:** componente compartido.

**Archivos esperados:**

- `EvidenceDrawer.tsx`;
- `MethodologyPanel.tsx`;
- tests.

**Pruebas:** teclado, foco, source ausente, múltiples versiones.
**Aceptación:** desde toda métrica principal se accede a evidencia.

### LAB-905 — Historial de runs

**Dependencias:** LAB-311, LAB-509.
**Objetivo:** listar, abrir y comparar ejecuciones.

**Archivos esperados:**

- page/hook/repository;
- paginación;
- tests.

**Aceptación:** abrir un run no recalcula; datos nuevos ofrecen crear otro.

### LAB-906 — Auditoría

**Dependencias:** LAB-509, LAB-702.
**Objetivo:** eventos mínimos y privados.

**Archivos esperados:**

- migración `lab_audit_events`;
- writer de servicio;
- RLS/tests;
- política de retención.

**Eventos:** create/update policy, request/complete run, activate model, publish signal, export.
**Aceptación:** metadata redactada y acceso del usuario limitado según política.

### LAB-907 — Exportación de análisis

**Dependencias:** LAB-904, LAB-905.
**Objetivo:** JSON/CSV permitido y resumen imprimible.

**Pasos:**

1. Export schema version.
2. Incluir metodología/asOf.
3. Respetar licencia.
4. No incluir datos de otro usuario.
5. Escape CSV.

**Pruebas:** fórmulas CSV, Unicode, licencia.
**Aceptación:** exportación se puede reimportar como evidencia, no como transacción.

### LAB-908 — Spike de explicación con LLM

**Dependencias:** LAB-903, revisión ESMA/privacidad.
**Objetivo:** determinar si aporta valor.

**Entregable:** threat model, evaluación de factualidad, campos permitidos, coste, fallback.
**Aceptación:** puede concluir no implementar.

### LAB-909 — Implementar narración opcional

**Dependencias:** go LAB-908.
**Objetivo:** reformular evidencia estructurada.

**Pasos:**

1. backend only.
2. allowlist.
3. sin PII.
4. salida estructurada.
5. validación contra facts.
6. etiqueta.
7. fallback determinista.

**Pruebas:** prompt injection en nombres, números alterados, fuente ausente.
**Aceptación:** si difiere un número, se descarta.

### LAB-910 — Cierre G9

**Dependencias:** LAB-901 a LAB-907 y decisión 908/909.
**Objetivo:** auditoría de trazabilidad.

**Aceptación:** elegir una tarjeta y reconstruir origen completo.
