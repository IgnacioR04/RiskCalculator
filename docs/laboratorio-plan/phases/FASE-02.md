# Fase 02 — IPS, restricciones y calidad de datos

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | CRÍTICA |
| Sensibilidad | MUY ALTA |
| Esfuerzo predeterminado | high |
| Entrada/autorización | Requiere G1 superada. |
| Funcionalidad a posponer | No inferir capacidad de pérdida ni activar personalización con campos incompletos. |

## Política de esfuerzo

- Usar **high** como punto de partida de la fase.
- Escalar a **xhigh**: LAB-201 a LAB-206, LAB-210 y LAB-214 por dominio, migraciones, RLS y conflictos de sincronización.
- Uso de **max**: No usar max; una revisión xhigh independiente es suficiente.
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

- [x] LAB-201 — ADR del modelo IPS *(2026-08-10)* — `RiskBand` de 5 bandas, tres dimensiones separadas, riesgo efectivo, conflicto y caducidad de 12 meses
- [x] LAB-202 — Tipos y schemas IPS *(2026-08-10)* — dominio puro y validación en frontera; 25 pruebas
- [x] LAB-203 — Motor de riesgo efectivo y conflictos *(2026-08-10)* — función pura y determinista, códigos estables y tabla de las 25 combinaciones
- [ ] LAB-204 — Slice local de IPS y migración
- [ ] LAB-205 — Migraciones SQL de IPS
- [ ] LAB-206 — Tipos de base de datos y repositorio IPS
- [ ] LAB-207 — Asistente IPS: objetivos y horizonte
- [ ] LAB-208 — Asistente IPS: situación y tolerancia
- [ ] LAB-209 — Asistente IPS: restricciones y revisión
- [ ] LAB-210 — Modelo de calidad de datos
- [ ] LAB-211 — Adaptadores de calidad para datos actuales
- [ ] LAB-212 — Página Calidad de datos
- [ ] LAB-213 — Cabecera de contexto real
- [ ] LAB-214 — Sincronización cloud de IPS

---

## Backlog detallado de la fase

## Objetivo

Sustituir la clasificación simple por una política de inversión útil y dar al usuario una evaluación de datos antes del cálculo.

## Puerta G2

- IPS versionada;
- conflictos explicados;
- modo local y cloud;
- migraciones aditivas;
- RLS negativa;
- calidad visible.

### LAB-201 — ADR del modelo IPS

**Dependencias:** G1.
**Objetivo:** aprobar escalas, regla efectiva y caducidad.

**Archivos esperados:** `docs/adr/ADR-002-investment-policy.md`.

**Decisiones:**

- RiskBand;
- cuestionario;
- tolerancia/capacidad/necesidad;
- horizonte;
- revisión;
- campos obligatorios;
- comportamiento ante conflicto.

**Aceptación:** no se deduce capacidad a partir de tolerancia.

### LAB-202 — Tipos y schemas IPS

**Dependencias:** LAB-201.
**Objetivo:** implementar dominio puro y validación.

**Archivos esperados:**

- `src/lib/lab/domain/investmentPolicy.ts`;
- `src/lib/lab/schemas/investmentPolicy.ts`;
- tests.

**Pasos:**

1. Definir policy, goals, constraints y assessment.
2. Validar rangos, fechas y consistencia básica.
3. Introducir `schemaVersion`.
4. Evitar tipos UI.

**Pruebas:** válidos, inválidos, límites, round-trip.
**Aceptación:** parseo nunca acepta NaN, infinito o pesos fuera de rango.

### LAB-203 — Motor de riesgo efectivo y conflictos

**Dependencias:** LAB-202.
**Objetivo:** calcular riesgo efectivo y conflictos de forma determinista.

**Archivos esperados:**

- `src/lib/lab/analytics/policyAssessment.ts`;
- tests con tabla de casos.

**Pasos:**

1. Implementar regla versionada.
2. Generar reason codes.
3. Separar conflicto de error.
4. No recomendar aumento de riesgo.

**Pruebas:** combinaciones de bandas y campos ausentes.
**Aceptación:** mismos inputs producen mismos reason codes.

### LAB-204 — Slice local de IPS y migración

**Dependencias:** LAB-202.
**Objetivo:** persistencia local versionada sin inflar el store monolítico.

**Archivos esperados:**

- `src/state/slices/labProfileSlice.ts`;
- migrador;
- tests.

**Pasos:**

1. Definir draft y active.
2. Adaptar `RiskProfile` legacy a borrador.
3. No inventar campos.
4. Incrementar STORE_VERSION con migración.
5. Añadir export/restore test.

**Aceptación:** estado v2 abre sin pérdida; perfil legacy sigue visible.

### LAB-205 — Migraciones SQL de IPS

**Dependencias:** LAB-202.
**Objetivo:** tablas aditivas.

**Archivos esperados:**

- nueva migración timestamp;
- tests pgTAP/RLS.

**Pasos:**

1. Crear policies, goals, constraints.
2. Constraints e índices.
3. Una policy active por usuario.
4. RLS owner-only.
5. No modificar migraciones anteriores.

**Pruebas:** reset completo, CRUD propio, acceso cruzado denegado.
**Aceptación:** usuario A no ve ni referencia policy B.

### LAB-206 — Tipos de base de datos y repositorio IPS

**Dependencias:** LAB-205.
**Objetivo:** capa de persistencia cloud.

**Archivos esperados:**

- tipos Supabase regenerados;
- `src/lib/lab/services/investmentPolicyRepository.ts`;
- tests con mock/entorno local.

**Pasos:**

1. Mapear DB ↔ dominio.
2. Validar al leer.
3. Crear nueva versión, no sobrescribir activa.
4. Manejar conflictos de concurrencia.

**Aceptación:** ningún componente llama tablas directamente.

### LAB-207 — Asistente IPS: objetivos y horizonte

**Dependencias:** LAB-202, LAB-204.
**Objetivo:** dos primeros pasos del wizard.

**Archivos esperados:**

- página/wizard;
- step components;
- validación.

**Pasos:**

1. Crear navegación por pasos.
2. Guardar draft.
3. Objetivos múltiples con prioridad.
4. Fechas y divisas accesibles.
5. Estado incompleto.

**Pruebas:** teclado, validación y resume.
**Aceptación:** recargar conserva borrador local.

### LAB-208 — Asistente IPS: situación y tolerancia

**Dependencias:** LAB-207, LAB-203.
**Objetivo:** capacidad, liquidez, tolerancia y experiencia.

**Pasos:**

1. Formular preguntas sin inducir.
2. Separar capacidad/tolerancia.
3. Mostrar por qué se pregunta.
4. Permitir «no sé» como incompleto, no valor medio.

**Pruebas:** conflicto y accesibilidad.
**Aceptación:** no se auto-completa capacidad.

### LAB-209 — Asistente IPS: restricciones y revisión

**Dependencias:** LAB-208.
**Objetivo:** restricciones, bandas y activación.

**Pasos:**

1. Editor de límites.
2. Validar restricciones contradictorias.
3. Mostrar resumen y conflictos.
4. Requerir confirmación antes de activar.
5. Guardar versión nueva.

**Pruebas:** límites incompatibles, local/cloud.
**Aceptación:** policy activa es inmutable; editar crea draft/version.

### LAB-210 — Modelo de calidad de datos

**Dependencias:** LAB-202.
**Objetivo:** contratos y thresholds versionados.

**Archivos esperados:**

- `src/lib/lab/domain/dataQuality.ts`;
- `src/lib/lab/data/quality.ts`;
- `src/lib/lab/data/thresholds.ts`;
- tests.

**Pasos:**

1. Implementar dimensiones/status/issues.
2. Cobertura ponderada.
3. Matriz de requisitos por cálculo.
4. Reason codes.

**Pruebas:** ausente ≠ cero, coberturas, umbrales.
**Aceptación:** cada bloqueo tiene remediation.

### LAB-211 — Adaptadores de calidad para datos actuales

**Dependencias:** LAB-210.
**Objetivo:** evaluar quotes, FX e historia existentes.

**Archivos esperados:**

- adaptadores en `src/lib/lab/data`;
- tests.

**Pasos:**

1. Mapear quality/provenance existentes.
2. Calcular freshness.
3. Detectar moneda/ticker inválido.
4. No hacer nuevas llamadas de red.

**Aceptación:** misma cartera produce reporte estable.

### LAB-212 — Página Calidad de datos

**Dependencias:** LAB-211, LAB-102.
**Objetivo:** tabla y acciones.

**Archivos esperados:**

- `LabDataQualityPage.tsx`;
- `CoverageMeter.tsx`;
- `AsOfBadge.tsx`.

**Pruebas:** completa, parcial, stale, manual, demo.
**Aceptación:** falta se muestra como «No disponible».

### LAB-213 — Cabecera de contexto real

**Dependencias:** LAB-209, LAB-212.
**Objetivo:** conectar cartera, IPS, calidad y fecha.

**Pasos:**

1. View model único.
2. Mostrar estado sin recalcular.
3. Links a perfil/calidad.
4. Responder a cambio de cartera.

**Pruebas:** estados combinados.
**Aceptación:** no mezcla datos de carteras al cambiar rápido.

### LAB-214 — Sincronización cloud de IPS

**Dependencias:** LAB-206, LAB-209.
**Objetivo:** sync opcional y conflictos.

**Pasos:**

1. Local-first.
2. Subida tras login explícito/configuración.
3. Resolver por versiones, nunca last-write silencioso.
4. Limpiar caché privada al logout.

**Pruebas:** offline, reconexión, conflicto, usuario distinto.
**Aceptación:** no hay pérdida silenciosa.
