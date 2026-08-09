# Backlog por fases y tareas ejecutables por IA

## 1. Cómo interpretar este backlog

Cada tarea `LAB-xxx` es una unidad de implementación. Una IA debe ejecutar una tarea por turno/PR, salvo que el propietario autorice una agrupación de tareas pequeñas y adyacentes.

Los nombres de archivos son objetivos propuestos. Antes de editar:

1. inspeccionar el árbol real;
2. comprobar convenciones existentes;
3. conservar cambios del usuario;
4. adaptar rutas sin crear duplicados;
5. actualizar este plan si una decisión aprobada cambia la arquitectura.

## 2. Reglas de fragmentación

- Máximo recomendado: cinco archivos productivos nuevos/modificados por tarea.
- Pruebas y documentación no cuentan contra ese límite.
- Una migración, un algoritmo nuevo y una pantalla completa no se implementan juntos.
- Un refactor debe alcanzar paridad antes de añadir comportamiento.
- Cada algoritmo se entrega primero como contrato + fixture, luego implementación, luego UI.
- Cada tabla se entrega con RLS y pruebas negativas.
- Cada llamada de red tiene mock, timeout, error tipado y cancelación cuando aplique.
- Cada nueva ruta tiene estado vacío, loading, error y móvil.
- Una fase no comienza hasta cumplir su puerta, salvo tareas sin dependencia explícita.

## 3. Comandos de verificación estándar

```bash
npm ci
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
```

Para cambios Supabase, añadir el flujo local definido por el proyecto:

```bash
supabase start
supabase db reset
supabase test db
supabase functions serve
```

No asumir que todos los comandos están instalados globalmente; usar versiones fijadas por el repositorio/CI.

## 4. Convención de estado

- **Pendiente**: no iniciada.
- **Preparada**: dependencias y decisiones resueltas.
- **En curso**.
- **Bloqueada**.
- **En revisión**.
- **Terminada**.

El cierre de una tarea requiere evidencia de pruebas.

# Fase 0 — Base, contratos y calidad

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

# Fase 1 — Shell y migración de navegación

## Objetivo

Introducir Laboratorio sin perder funciones actuales.

## Entrada

G0 superada.

## Salida

- rutas nuevas;
- shell;
- navegación móvil;
- vistas existentes adaptadas;
- redirecciones legacy.

## Puerta G1

- todos los recorridos actuales siguen disponibles;
- rutas nuevas están lazy-loaded;
- no se han cambiado resultados numéricos;
- desktop/móvil pasan E2E.

### LAB-101 — Definir contratos de ruta

**Dependencias:** G0.  
**Objetivo:** centralizar paths, etiquetas y breadcrumbs.

**Archivos esperados:**

- `src/features/lab/routes/labRoutes.ts`;
- pruebas de rutas.

**Pasos:**

1. Codificar mapa de rutas del documento 01.
2. Definir helpers y metadata.
3. Evitar strings duplicados.
4. Preparar legacy mapping.

**Pruebas:** generación de paths y breadcrumbs.  
**Aceptación:** toda ruta del Laboratorio tiene ID estable y padre.

### LAB-102 — Crear LabShell

**Dependencias:** LAB-101, LAB-006.  
**Objetivo:** shell con cabecera y dos áreas, inicialmente sin datos avanzados.

**Archivos esperados:**

- `src/features/lab/components/LabShell.tsx`;
- `src/features/lab/components/LabContextHeader.tsx`;
- estilos/pruebas.

**Pasos:**

1. Implementar landmarks.
2. Tabs Estabilidad/Futuro.
3. Subnavegación responsive.
4. Slots para cartera, asOf, IPS y calidad.
5. Skeletons sin métricas ficticias.

**Pruebas:** render, teclado, móvil.  
**Aceptación:** foco, tab seleccionada y breadcrumbs correctos.

### LAB-103 — Registrar rutas lazy

**Dependencias:** LAB-102.  
**Objetivo:** integrar el shell en `App.tsx`.

**Archivos esperados:**

- `src/App.tsx`;
- páginas placeholder;
- pruebas de routing.

**Pasos:**

1. Añadir entrada `/laboratorio`.
2. Añadir subrutas con lazy import.
3. Crear portadas mínimas informativas.
4. Respetar base y HashRouter.

**Pruebas:** navegación directa y recarga.  
**Aceptación:** no aumenta el chunk inicial más allá del presupuesto.

### LAB-104 — Actualizar navegación global

**Dependencias:** LAB-103.  
**Objetivo:** incorporar Laboratorio en side rail y móvil.

**Archivos esperados:**

- `src/components/shell/sections.ts`;
- `src/components/shell/AppShell.tsx`;
- pruebas.

**Pasos:**

1. Añadir destino Laboratorio.
2. Cambiar los cinco destinos móviles a Resumen, Calculadora, Cartera, Laboratorio, Perfil.
3. Mantener Importar accesible desde menú/contexto.
4. Definir icono y estado activo.

**Pruebas:** navegación teclado y móvil.  
**Aceptación:** ninguna sección queda inaccesible.

### LAB-105 — Adaptar Riesgo dentro de Estabilidad

**Dependencias:** LAB-103.  
**Objetivo:** renderizar la vista actual sin copiar lógica.

**Archivos esperados:**

- adaptador/página `LabRiskLegacyPage.tsx`;
- cambios mínimos en `RiesgoPage.tsx`.

**Pasos:**

1. Extraer contenido reutilizable si es necesario.
2. Evitar AppShell anidado.
3. Conservar tabs y resultados.
4. Etiquetar como versión actual.

**Pruebas:** paridad visual/numérica y E2E.  
**Aceptación:** mismo input produce mismo resultado.

### LAB-106 — Adaptar Diversificación

**Dependencias:** LAB-103.  
**Objetivo:** reutilizar distribución, concentración y overlap.

**Archivos esperados:**

- adaptador de página;
- mínimos cambios en `DiversificacionPage.tsx`.

**Pasos:** equivalentes a LAB-105; mapear a Exposición.  
**Pruebas:** tabs y métricas actuales.  
**Aceptación:** ningún cálculo duplicado.

### LAB-107 — Adaptar Simular

**Dependencias:** LAB-103.  
**Objetivo:** alojar estrés/aportaciones actuales en Escenarios.

**Archivos esperados:**

- adaptador de página;
- cambios mínimos en `SimularPage.tsx`.

**Pasos:**

1. Montar la simulación actual.
2. Etiquetar shocks como escenarios deterministas.
3. Mantener escenarios guardados.
4. No añadir Monte Carlo todavía.

**Pruebas:** presets y aportaciones.  
**Aceptación:** resultados idénticos a ruta anterior.

### LAB-108 — Crear redirecciones legacy

**Dependencias:** LAB-105, LAB-106, LAB-107.  
**Objetivo:** preservar enlaces.

**Archivos esperados:**

- rutas/redirect component;
- pruebas.

**Pasos:**

1. Mapear las tres rutas.
2. Preservar parámetros si existen.
3. Mostrar aviso temporal cerrable.
4. Registrar evento agregado opcional.

**Pruebas:** acceso directo, back/forward.  
**Aceptación:** enlaces antiguos no producen 404 ni bucle.

### LAB-109 — Portada inicial del Laboratorio

**Dependencias:** LAB-102, LAB-104.  
**Objetivo:** crear portada que explique las dos mitades.

**Archivos esperados:**

- `LabHomePage.tsx`;
- `TwoWorldsCard.tsx`;
- estados demo/vacío.

**Pasos:**

1. Presentar Estabilidad y Futuro.
2. Detectar cartera vacía.
3. Ofrecer demo/importar/manual.
4. Evitar findings simulados.

**Pruebas:** sin cartera, demo y cartera real.  
**Aceptación:** no se muestra una cifra que no provenga de datos.

### LAB-110 — E2E de migración

**Dependencias:** LAB-104 a LAB-109.  
**Objetivo:** cerrar G1.

**Archivos esperados:** `e2e/lab-shell.spec.ts`.

**Casos:**

- abrir nueva ruta;
- cambiar de área;
- acceder a vistas heredadas;
- redirecciones;
- móvil;
- demo;
- sin backend.

**Aceptación:** G1 completa y documentada.

# Fase 2 — IPS, restricciones y calidad de datos

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

# Fase 3 — Refactor y ampliación de estabilidad

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

# Fase 4 — Exposición, look-through y dependencia

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

# Fase 5 — Escenarios

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

# Fase 6 — Restricciones y carteras candidatas

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

# Fase 7 — Sectores para investigar

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

# Fase 8 — Empresas para investigar, opcional

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

# Fase 9 — Evidencia, explicaciones y auditoría

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

# Fase 10 — Endurecimiento, beta y lanzamiento

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

# 5. Matriz resumida de dependencias

| Capacidad | Depende de | No depende de |
|---|---|---|
| Shell | F0 | proveedor sectorial |
| IPS local | shell + schemas | backend live |
| Estabilidad V2 | refactor + series | señales |
| Look-through | identidad + proveedor | optimizador |
| Escenarios deterministas | schemas + motor actual | sectores |
| Monte Carlo | series + path engine | fundamentales |
| Candidatas | IPS + estabilidad + solver | señales sectoriales |
| Sectores | point-in-time + candidatos + validación | empresas |
| Empresas | sectores + fundamentales + corporate actions | LLM |
| Explicación determinista | reason codes | LLM |

# 6. Orden mínimo viable recomendado

Para entregar valor sin esperar a toda la visión:

1. F0 completa.
2. F1 completa.
3. F2 local + calidad.
4. F3 completa.
5. F5 determinista/histórico sin Monte Carlo avanzado.
6. F6 aportaciones + 1/N + mínima varianza restringida si pasa validación.
7. F4 exposición directa; look-through tras proveedor.
8. F7 solo después.

Esto produce un Laboratorio útil aunque G7 o G8 den no-go.

# 7. Plantilla obligatoria de handoff de cada tarea

```md
## LAB-XXX — Resultado

### Comportamiento entregado
- ...

### Archivos productivos
- ...

### Contratos o migraciones
- ...

### Pruebas ejecutadas
- comando: resultado

### Evidencia de aceptación
- criterio 1: ...
- criterio 2: ...

### Limitaciones y decisiones pendientes
- ...

### Riesgo de rollback
- ...
```

# 8. Plantilla de revisión de una IA

Antes de aprobar:

- [ ] La tarea coincide con LAB-xxx y no amplía alcance.
- [ ] Se inspeccionó el código real.
- [ ] Se preservaron cambios ajenos.
- [ ] Las fronteras validan.
- [ ] Los cálculos son puros.
- [ ] No hay secretos.
- [ ] No hay datos inventados.
- [ ] Hay estados parcial/stale/error.
- [ ] Hay pruebas numéricas o UI relevantes.
- [ ] Las tolerancias están justificadas.
- [ ] RLS se probó negativamente.
- [ ] Copy distingue hecho/estimación/escenario/señal.
- [ ] Documentación/ADR se actualizó.
- [ ] CI/build pasan.
- [ ] Se puede revertir.

# 9. Regla para subdividir una tarea

Si una tarea supera el límite, crear subtareas sin renumerar fases:

- `LAB-xxxA — contrato`;
- `LAB-xxxB — motor`;
- `LAB-xxxC — integración`;
- `LAB-xxxD — UI`;
- `LAB-xxxE — validación`.

Cada subtarea hereda dependencias, pero B depende de A, C de B, D de C y E de todas. Registrar la subdivisión antes de escribir código.

# 10. Señales de que una IA está intentando hacer demasiado

Detener la implementación si:

- crea más de una migración temática y una página a la vez;
- cambia fórmulas sin golden tests;
- sustituye el store completo;
- instala una librería de solver y construye la UI en el mismo cambio;
- añade proveedor sin revisar licencia;
- crea ranking sin backtest point-in-time;
- añade un chat/LLM antes de reason codes;
- elimina rutas legacy en la primera migración;
- modifica migraciones existentes;
- añade secrets `VITE_*`;
- resuelve un error de cobertura imputando cero.
