# Fase 10 — Endurecimiento, beta y lanzamiento

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | CRÍTICA |
| Sensibilidad | EXTREMA |
| Esfuerzo predeterminado | high |
| Entrada/autorización | Solo sobre las capabilities elegidas para release y con sus gates previos superados. |
| Funcionalidad a posponer | No lanzar una capability no aprobada por presión de calendario. |

## Política de esfuerzo

- Usar **high** como punto de partida de la fase.
- Escalar a **xhigh**: LAB-1003 a LAB-1007 y LAB-1009.
- Uso de **max**: LAB-1010 justifica una única revisión max del gate de lanzamiento.
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

- [x] LAB-1001 — Auditoría WCAG 2.2 AA *(2026-08-20)* — **automatizada en CI**; encontró tres fallos reales: enlaces solo por color, un token de contraste 2,96:1 y `opacity` usada para significar «inactivo»
- [x] LAB-1002 — Rendimiento de frontend *(2026-08-20)* — bundle y motores **medidos**; sin Web Worker donde no hace falta, y el bootstrap sigue sin exponerse porque sí lo necesita
- [x] LAB-1003 — Pruebas de carga backend *(2026-08-20)* — **alcance reducido**: no hay backend que cargar; límites del proveedor documentados
- [x] LAB-1004 — Auditoría RLS/autorización *(2026-08-20)* — 51 aserciones pgTAP en CI; **cero acceso cruzado**. Tres riesgos de integridad declarados
- [x] LAB-1005 — Threat model y revisión de secretos *(2026-08-20)* — la clave privada no lleva prefijo `VITE_`, que es la protección real
- [x] LAB-1006 — Privacidad, retención y borrado *(2026-08-20)* — **cero telemetría**, retención de 50 cálculos y borrado explícito
- [x] LAB-1007 — Runbooks y simulacros *(2026-08-20)* — tres runbooks; el rollback está probado en producción
- [ ] LAB-1008 — Beta controlada — **pendiente del propietario**: exige personas, no código
- [x] LAB-1009 — Revisión de copy *(2026-08-20)* — comprobada con grep. **Sin revisión jurídica profesional**, y así queda dicho
- [x] LAB-1010 — Gate de lanzamiento *(2026-08-20)* — **G10 superada** salvo la beta. `docs/models/launch-g10-gate.md`
- [x] LAB-1011 — Retirada de adaptadores legacy *(2026-08-20)* — **nada se retira**: no son andamios, son la migración
- [x] LAB-1012 — Post-lanzamiento *(2026-08-20)* — tres guardianes que se vigilan solos, y uno que no

---

## Backlog detallado de la fase

## Objetivo

Validar accesibilidad, rendimiento, seguridad, privacidad, operaciones y comprensión antes de disponibilidad general.

## Puerta G10

- checklist del documento 05;
- runbooks;
- rollback;
- pruebas de carga razonables;
- revisión de copy;
- beta;
- cero issues críticos.

### LAB-1001 — Auditoría WCAG 2.2 AA

**Dependencias:** pantallas incluidas en release.
**Objetivo:** automático + manual.

**Pasos:**

1. axe/linters.
2. teclado.
3. lector de pantalla.
4. zoom.
5. contraste.
6. reduced motion.
7. tablas/heatmaps.

**Aceptación:** cero bloqueantes; excepciones documentadas con fecha.

### LAB-1002 — Rendimiento de frontend

**Dependencias:** LAB-313, pantallas release.
**Objetivo:** bundle, render, worker, memoria.

**Casos:** 10/25/50 activos, 10 años, móvil medio.
**Aceptación:** dentro del presupuesto o degradación/límite explícito.

### LAB-1003 — Pruebas de carga backend

**Dependencias:** APIs release.
**Objetivo:** concurrencia, rate limit, cola y timeout.

**Aceptación:** no usar producción; límites y capacidad documentados.

### LAB-1004 — Auditoría RLS/autorización

**Dependencias:** todas las migraciones release.
**Objetivo:** revisión tabla por tabla y endpoint por endpoint.

**Pruebas:** A/B, anónimo, IDs manipulados, JWT caducado, service role.
**Aceptación:** cero acceso cruzado.

### LAB-1005 — Threat model y revisión de secretos

**Dependencias:** infraestructura release.
**Objetivo:** frontend, Actions, Supabase, providers, quant.

**Pasos:** STRIDE o método elegido; bundle scan; logs; artifacts; rotation drill.
**Aceptación:** ningún crítico/alto abierto sin mitigación aprobada.

### LAB-1006 — Privacidad, retención y borrado

**Dependencias:** LAB-906.
**Objetivo:** inventario y ejecución.

**Pruebas:** borrar usuario de staging; limpiar blobs/cache; conservar solo lo permitido.
**Aceptación:** procedimiento repetible.

### LAB-1007 — Runbooks y simulacros

**Dependencias:** observabilidad completa.
**Objetivo:** probar incidentes.

**Escenarios:** Pages roto, migración, provider, stale, cola, modelo, secreto, acceso cruzado.
**Aceptación:** cada runbook probado y actualizado.

### LAB-1008 — Beta controlada

**Dependencias:** LAB-1001 a LAB-1007.
**Objetivo:** usuarios reales con funciones aprobadas.

**Medir:** comprensión, errores, cobertura, latencia, bloqueos, confusión de lenguaje.
**No medir:** rentabilidad a corto plazo como éxito de UX.
**Aceptación:** criterios de muestra y duración predefinidos.

### LAB-1009 — Revisión jurídica y de copy

**Dependencias:** features de personalización incluidas.
**Objetivo:** delimitar herramienta educativa/sugerencias.

**Aceptación:** textos, disclaimers y flujos revisados para mercados objetivo.
**Nota:** no se puede sustituir por una comprobación automatizada.

### LAB-1010 — Gate de lanzamiento

**Dependencias:** LAB-1008, LAB-1009.
**Objetivo:** decisión go/no-go por capability.

**Checklist:**

- estabilidad;
- escenarios;
- candidatas;
- sectores;
- empresas;
- explicación LLM.

Cada capability puede tener decisión diferente.
**Aceptación:** no se arrastran features no aprobadas por presión de calendario.

### LAB-1011 — Retirada de adaptadores legacy

**Dependencias:** lanzamiento estable + periodo de observación.
**Objetivo:** reducir duplicación.

**Pasos:**

1. revisar telemetría agregada de rutas.
2. mantener redirects.
3. eliminar componentes legacy solo si no tienen consumidores.
4. actualizar docs/tests.

**Aceptación:** enlaces antiguos siguen llegando al destino durante ventana acordada.

### LAB-1012 — Post-lanzamiento

**Dependencias:** LAB-1010.
**Objetivo:** revisión a 2–4 semanas.

**Contenido:** incidentes, modelos, comprensión, costes, proveedores, deuda y flags.
**Aceptación:** acciones priorizadas y owners.
