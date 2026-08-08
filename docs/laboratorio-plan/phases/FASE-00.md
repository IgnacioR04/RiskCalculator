# Fase 00 — Base, contratos y calidad

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | CRÍTICA |
| Sensibilidad | ALTA |
| Esfuerzo predeterminado | high |
| Entrada/autorización | Inicio autorizado. No pasar a Fase 1 hasta documentar G0 como superada. |
| Funcionalidad a posponer | No añadir funcionalidades del Laboratorio. |

## Política de esfuerzo

- Usar **high** como punto de partida de la fase.
- Escalar a **xhigh**: LAB-002 si aparecen discrepancias numéricas; LAB-004 para revisar permisos y cadena de suministro.
- Uso de **max**: No usar max en esta fase.
- El esfuerzo alto no sustituye pruebas, fixtures ni revisión independiente.
- Si la sesión tiene un esfuerzo inferior al requerido, detenerse antes de editar.

## Contexto que debe leer el agente

Siempre:

- [Estado de implementación](../IMPLEMENTATION_STATUS.md)
- [Índice del plan](../README.md)
- [Backlog completo](../04-backlog-fases-y-tareas-ia.md)

Específico de esta fase:

- [../00-plan-maestro-laboratorio.md](../00-plan-maestro-laboratorio.md)
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

- [x] LAB-001 — Registrar baseline y ADR de arquitectura *(2026-08-08)*
- [x] LAB-002 — Crear fixtures financieros dorados *(2026-08-08)*
- [ ] LAB-003 — Separar CI de despliegue — **reformular**: `ci.yml` ya existe con todas las puertas; el trabajo real es encadenar `deploy-pages.yml` a CI (divergencia D2)
- [ ] LAB-004 — Endurecer GitHub Actions
- [ ] LAB-005 — Añadir metadatos de build
- [ ] LAB-006 — Crear feature flags tipadas
- [ ] LAB-007 — Baseline E2E de rutas actuales
- [ ] LAB-008 — Presupuesto de bundle y lazy loading baseline

---

## Backlog detallado de la fase

## Objetivo

Crear una red de seguridad antes de tocar navegación o cálculos. No cambia la experiencia del usuario salvo metadatos técnicos.

## Entrada

- repositorio actual compila;
- tests actuales conocidos;
- acceso a configuración de GitHub y Supabase cuando corresponda.

## Salida

- CI separada del despliegue;
- fixtures dorados;
- ADR iniciales;
- feature flags;
- baseline E2E y numérico.

## Puerta G0

- lint, tipos, unit tests, E2E básico y build pasan en CI;
- deploy no puede adelantarse a CI;
- cálculos actuales tienen fixtures de paridad;
- rutas actuales están cubiertas.

### LAB-001 — Registrar baseline y ADR de arquitectura

**Dependencias:** ninguna.
**Objetivo:** documentar el estado actual y aprobar el límite navegador/Supabase/quant.

**Archivos esperados:**

- `docs/adr/ADR-001-lab-architecture.md`;
- `docs/lab/current-baseline.md`.

**Pasos:**

1. Registrar versiones, rutas, scripts y deployment reales.
2. Enumerar cálculos existentes y sus módulos.
3. Identificar `HistoricalRiskSection.tsx` como refactor con paridad.
4. Especificar modo local como requisito.
5. Documentar que Python, si se usa, será servicio separado.

**Pruebas:** revisión documental contra repositorio.
**Aceptación:** no hay afirmaciones de infraestructura no existente; alternativas y consecuencias constan.
**No incluido:** modificar código o elegir proveedor de datos.

### LAB-002 — Crear fixtures financieros dorados

**Dependencias:** LAB-001.
**Objetivo:** congelar resultados actuales para detectar regresiones durante el refactor.

**Archivos esperados:**

- `src/test/fixtures/portfolio-small.ts`;
- `src/test/fixtures/historical-series.ts`;
- `src/lib/finance/__tests__/golden-current.test.ts`;
- `docs/lab/golden-fixtures.md`.

**Pasos:**

1. Crear cartera long-only de 3–5 activos con cálculo manual verificable.
2. Incluir activo en otra divisa, fechas ausentes y una serie constante.
3. Guardar inputs, resultados esperados y tolerancias.
4. Cubrir volatilidad, covarianza, correlación, HHI, contribución y estrés.
5. Evitar snapshots generados por el mismo código bajo prueba sin validación independiente.

**Pruebas:** fixtures contra fórmulas manuales/implementación independiente.
**Aceptación:** resultados deterministas y documentados; tolerancia absoluta y relativa explícitas.
**No incluido:** cambiar fórmulas actuales.

### LAB-003 — Separar CI de despliegue

**Dependencias:** LAB-002.
**Objetivo:** crear `ci.yml` con puertas de calidad.

**Archivos esperados:**

- `.github/workflows/ci.yml`;
- ajustes menores de scripts en `package.json`.

**Pasos:**

1. Crear jobs quality, build y E2E core.
2. Usar Node 22 y `npm ci`.
3. Ejecutar lint, typecheck, unit tests, build.
4. Servir build para Playwright.
5. Subir traces solo al fallar.
6. Configurar concurrency por ref.
7. Documentar checks que deben ser requeridos en branch protection.

**Pruebas:** ejecutar localmente todos los scripts; validar YAML.
**Aceptación:** PR fallida no puede considerarse lista; artifacts no contienen secretos.
**No incluido:** cambiar Pages todavía.

### LAB-004 — Endurecer GitHub Actions

**Dependencias:** LAB-003.
**Objetivo:** permisos mínimos y dependencias fijadas.

**Archivos esperados:**

- `.github/workflows/ci.yml`;
- `.github/workflows/deploy-pages.yml`;
- `docs/runbooks/pages-deploy-failure.md`.

**Pasos:**

1. Fijar cada Action a SHA completo anotando versión.
2. Declarar permisos mínimos.
3. Evitar secretos en PR no confiable.
4. Hacer deploy dependiente del SHA validado.
5. Añadir concurrency de Pages.
6. Definir redeploy manual de SHA bueno.

**Pruebas:** revisión de permisos; ejecución en rama.
**Aceptación:** deploy usa commit validado; no hay `pull_request_target` inseguro.
**Referencia:** documentación GitHub de uso seguro.

### LAB-005 — Añadir metadatos de build

**Dependencias:** LAB-003.
**Objetivo:** poder identificar versión desplegada.

**Archivos esperados:**

- `scripts/generate-build-info.*`;
- `src/lib/buildInfo.ts`;
- integración Vite/CI;
- prueba.

**Pasos:**

1. Generar commit SHA, versión, fecha y schema soportado.
2. No incluir environment secrets.
3. Exponer en diagnóstico/console controlada.
4. Incluir archivo en `dist`.

**Pruebas:** schema y ausencia de secretos; build local.
**Aceptación:** un error de producción puede asociarse a un SHA.

### LAB-006 — Crear feature flags tipadas

**Dependencias:** LAB-001.
**Objetivo:** desplegar el Laboratorio por capacidades.

**Archivos esperados:**

- `src/lib/features/flags.ts`;
- `src/lib/features/flags.test.ts`;
- configuración por entorno documentada.

**Pasos:**

1. Definir flags del documento 03.
2. Defaults seguros.
3. Validar variables públicas.
4. Separar flag visual de autorización del backend.
5. Añadir helper `isFeatureEnabled`.

**Pruebas:** defaults, overrides válidos/inválidos.
**Aceptación:** una variable desconocida no habilita funcionalidad.

### LAB-007 — Baseline E2E de rutas actuales

**Dependencias:** LAB-003.
**Objetivo:** proteger las ocho superficies actuales.

**Archivos esperados:**

- `e2e/navigation-current.spec.ts`;
- fixtures/helpers E2E.

**Pasos:**

1. Cargar cada ruta con HashRouter.
2. Verificar título/landmark.
3. Cargar demo.
4. Comprobar navegación móvil principal.
5. Ejecutar sin variables Supabase.

**Pruebas:** Playwright desktop y móvil Chromium.
**Aceptación:** todas las rutas actuales cargan sin error fatal.

### LAB-008 — Presupuesto de bundle y lazy loading baseline

**Dependencias:** LAB-003.
**Objetivo:** evitar que el Laboratorio degrade toda la aplicación.

**Archivos esperados:**

- script de análisis;
- configuración CI;
- `docs/lab/performance-budget.md`.

**Pasos:**

1. Medir bundle y chunks actuales.
2. Fijar presupuesto inicial basado en baseline, con margen justificado.
3. Fallar CI ante regresión material.
4. Registrar carga lazy de páginas existentes.

**Pruebas:** build y script con fixture de manifest.
**Aceptación:** existe baseline reproducible, no un número arbitrario.
