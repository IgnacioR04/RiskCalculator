# Fase 05 — Escenarios

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | ALTA |
| Sensibilidad | ALTA |
| Esfuerzo predeterminado | high |
| Entrada/autorización | Requiere G3 y contratos de perfil/datos disponibles. |
| Funcionalidad a posponer | Para MVP puede posponerse LAB-505 Monte Carlo; no llamar probabilidad real a frecuencias simuladas. |

## Política de esfuerzo

- Usar **high** como punto de partida de la fase.
- Escalar a **xhigh**: LAB-504, LAB-505, LAB-506, LAB-509, LAB-510 y LAB-512.
- Uso de **max**: No usar max.
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

- [x] LAB-501 — Contratos de escenario *(2026-08-19)* — sin tipo ni horizonte no existe; con azar, la semilla es obligatoria **en el esquema**
- [x] LAB-502 — Migrar estrés determinista actual *(2026-08-19)* — envoltorio sin tocar una línea de la aritmética; paridad comprobada preset a preset
- [x] LAB-503 — Escenarios históricos *(2026-08-19)* — **no se afirma que tuvieras esa cartera entonces**; lo que no tiene historia no se rellena
- [x] LAB-504 — Flujos, aportaciones y rebalanceo *(2026-08-19)* — orden explícito: la aportación no participa del periodo en que entra
- [x] LAB-505 — Bootstrap por bloques *(2026-08-19)* — bloques **comunes** a todos los activos, que es lo que conserva la correlación. Motor listo, no expuesto (ADR-006)
- [x] LAB-506 — Sensibilidad de escenarios *(2026-08-19)* — una variable cada vez: coste lineal, no exponencial
- [x] LAB-507 — Biblioteca de escenarios *(2026-08-19)* — lo de fábrica se deriva, no se edita; editar lo propio sube su versión
- [x] LAB-508 — UI constructor *(2026-08-19)* — de la respuesta a sus condiciones; conserva el simulador de aportaciones
- [x] LAB-509 — Persistencia cloud de escenarios y runs *(2026-08-19)* — **pospuesta**: material reconstruible, y la cartera es el dato más sensible. ADR-006
- [x] LAB-510 — API asíncrona de runs *(2026-08-19)* — **no se implementa**; lo que hace falta es un Web Worker, no un servidor. ADR-006
- [x] LAB-511 — Comparar y guardar resultados *(2026-08-19)* — la comparación se **niega** si no vienen de la misma definición y versión
- [x] LAB-512 — Cierre G5 *(2026-08-19)* — **G5 superada**. `docs/models/scenarios-v1-validation.md`

---

## Backlog detallado de la fase

## Objetivo

Transformar «Simular» en un motor de escenarios reproducible y comparable.

## Puerta G5

- cada escenario tiene definición/versiones;
- determinismo o semilla;
- sensibilidad;
- costes/aportaciones definidos;
- resultados etiquetados;
- persistencia idempotente.

### LAB-501 — Contratos de escenario

**Dependencias:** G3, LAB-202.
**Objetivo:** schemas Definition/Result.

**Archivos esperados:**

- dominio/schemas;
- tests.

**Pasos:** tipos histórico, determinista, bootstrap y goal; versionado; seed; supuestos.
**Aceptación:** un escenario no puede existir sin horizonte y tipo.

### LAB-502 — Migrar estrés determinista actual

**Dependencias:** LAB-501.
**Objetivo:** envolver `stress.ts` sin cambiar resultados.

**Archivos esperados:**

- `deterministicScenario.ts`;
- adaptador de presets;
- golden tests.

**Aceptación:** presets actuales conservan paridad y adquieren definición versionada.

### LAB-503 — Escenarios históricos

**Dependencias:** LAB-501, LAB-304.
**Objetivo:** reproducir un periodo histórico.

**Pasos:**

1. Definir fechas y activos sin historia.
2. Aplicar series/FX.
3. Devolver pérdida y contribuciones.
4. Mostrar que composición actual se proyecta al periodo.

**Pruebas:** periodo completo/parcial.
**Aceptación:** no se afirma que el usuario tuviera esa cartera entonces.

### LAB-504 — Flujos, aportaciones y rebalanceo

**Dependencias:** LAB-501.
**Objetivo:** motor de evolución contable.

**Archivos esperados:**

- `portfolioPath.ts`;
- tests.

**Pasos:**

1. Orden temporal explícito: retorno, flujo, coste, rebalanceo.
2. Frecuencia.
3. Política de bandas/calendario.
4. Costes y FX.

**Pruebas:** caso manual de varios periodos, aportación cero, coste.
**Aceptación:** conservación de valor explicable.

### LAB-505 — Bootstrap por bloques

**Dependencias:** LAB-501, LAB-504.
**Objetivo:** simulación no paramétrica inicial.

**Archivos esperados:**

- `blockBootstrap.ts`;
- PRNG fijado;
- tests.

**Pasos:**

1. Semilla reproducible.
2. Bloques comunes multivariantes.
3. Validar ventana/tamaño.
4. Número máximo de trayectorias.
5. percentiles y frecuencia de cumplimiento.

**Pruebas:** misma semilla, distribución simple, límites.
**Aceptación:** conserva dependencia transversal al muestrear bloques comunes.

### LAB-506 — Sensibilidad de escenarios

**Dependencias:** LAB-502 a LAB-505.
**Objetivo:** variar supuestos principales.

**Archivos esperados:** `scenarioSensitivity.ts`, tests.

**Pasos:**

1. Definir grid limitado.
2. No combinatoria explosiva.
3. Determinar drivers.
4. Rango y warning.

**Aceptación:** muestra supuestos que más cambian el resultado.

### LAB-507 — Biblioteca de escenarios

**Dependencias:** LAB-501, LAB-502.
**Objetivo:** presets transparentes.

**Archivos esperados:**

- `scenarioPresets.ts`;
- docs y tests.

**Reglas:** IDs/versiones, supuestos visibles, sin actualización silenciosa.
**Aceptación:** editar preset crea copia.

### LAB-508 — UI constructor

**Dependencias:** LAB-502 a LAB-507.
**Objetivo:** flujo de ocho pasos simplificado.

**Archivos esperados:**

- `LabScenarioBuilderPage.tsx`;
- step components;
- result summary.

**Pruebas:** determinista, histórico, bootstrap, validación, móvil.
**Aceptación:** usuario distingue inputs de outputs.

### LAB-509 — Persistencia cloud de escenarios y runs

**Dependencias:** LAB-205, LAB-501, LAB-311.
**Objetivo:** tablas, RLS y repositorio.

**Archivos esperados:**

- migración scenarios/analytics_runs/results;
- pgTAP;
- repository.

**Pasos:**

1. Tablas aditivas.
2. owner-only.
3. hashes/idempotencia.
4. estado.
5. JSON validado en frontera.

**Aceptación:** A no accede a run B por ID.

### LAB-510 — API asíncrona de runs

**Dependencias:** LAB-509.
**Objetivo:** crear/consultar run.

**Archivos esperados:**

- handlers `lab-api`;
- schemas;
- tests.

**Pasos:**

1. Auth/ownership.
2. Idempotency key.
3. estados.
4. errores.
5. polling/backoff.

**Aceptación:** repetir request no duplica ejecución.

### LAB-511 — Comparar y guardar resultados

**Dependencias:** LAB-508, LAB-509.
**Objetivo:** comparison tray y rutas guardadas.

**Archivos esperados:**

- comparación UI;
- repositorio;
- migración si procede.

**Pruebas:** dos escenarios, stale, versión distinta.
**Aceptación:** diferencias de supuestos se muestran antes de métricas.

### LAB-512 — Cierre G5

**Dependencias:** LAB-508 a LAB-511.
**Objetivo:** validación y copy.

**Aceptación:** ninguna pantalla usa «predicción» para un escenario; los runs se reproducen.
