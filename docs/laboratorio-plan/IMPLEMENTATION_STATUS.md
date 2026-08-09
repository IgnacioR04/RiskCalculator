# Estado de implementación del Laboratorio

> Este documento es el panel de estado vivo del plan descrito en [00-plan-maestro-laboratorio.md](./00-plan-maestro-laboratorio.md) y ejecutado tarea a tarea según [04-backlog-fases-y-tareas-ia.md](./04-backlog-fases-y-tareas-ia.md).
> Se actualiza en **cada** tarea LAB-xxx cerrada o cuando cambia la tarea activa. No se reescribe el historial; se añade.

## 1. Estado global

| Campo | Valor |
|---|---|
| Commit base | `c807281ae33d81dfe075f62a9fca98b88602a6f0` (`main`, sincronizada con `origin/main`) |
| Fase activa | Fase 0 — Base, contratos y calidad |
| Tarea activa | Ninguna — `LAB-004` terminada. Para cerrar G0 quedan `LAB-007` (cubrir las ocho rutas) y resolver D10 |
| Última puerta superada | Ninguna (G0 pendiente) |
| Última actualización | 2026-08-08 |

## 2. Estado por fase y puerta

| Fase | Objetivo | Puerta | Estado | Fecha de cierre |
|---:|---|---|---|---|
| 0 | Base, contratos y calidad | G0 | Pendiente | — |
| 1 | Shell y migración de navegación | G1 | Pendiente | — |
| 2 | IPS, restricciones y calidad de datos | G2 | Pendiente | — |
| 3 | Refactor y ampliación de estabilidad | G3 | Pendiente | — |
| 4 | Exposición, look-through y dependencia | G4 | Pendiente | — |
| 5 | Escenarios | G5 | Pendiente | — |
| 6 | Restricciones y carteras candidatas | G6 | Pendiente | — |
| 7 | Señales sectoriales | G7 | Pendiente | — |
| 8 | Empresas para investigar (opcional) | G8 | Pendiente | — |
| 9 | Evidencia y auditoría | G9 | Pendiente | — |
| 10 | Endurecer y lanzar | G10 | Pendiente | — |

Una fase no comienza hasta cumplir su puerta de entrada (dependencias en [00-plan-maestro-laboratorio.md §12](./00-plan-maestro-laboratorio.md)), salvo tareas sin dependencia explícita.

## 3. Tareas de la fase activa (Fase 0)

| Tarea | Estado | Notas |
|---|---|---|
| LAB-001 — Baseline y ADR de arquitectura | **Terminada** (2026-08-08) | Entrega `docs/adr/ADR-001-lab-architecture.md` y `docs/lab/current-baseline.md`. Sin cambios de código |
| LAB-002 — Fixtures financieros dorados | **Terminada** (2026-08-08) | 27 pruebas doradas sobre `src/lib/finance/`. Documentación en `docs/lab/golden-fixtures.md` |
| LAB-003 — Separar CI de despliegue | **Terminada** (2026-08-08) | Jobs `quality`, `build` y `e2e-core`; Playwright sirve el build. Cierra D8 |
| LAB-004 — Endurecer GitHub Actions | **Terminada** (2026-08-08) | Ocho Actions fijadas a SHA, permisos mínimos por job, despliegue por `workflow_run` sobre el SHA validado. Cierra D2 |
| LAB-005 — Metadatos de build | Pendiente | Depende de LAB-003 |
| LAB-006 — Feature flags tipadas | Pendiente | Dependencia satisfecha (LAB-001); lista para empezar |
| LAB-007 — Baseline E2E de rutas actuales | Pendiente | Depende de LAB-003 |
| LAB-008 — Presupuesto de bundle y lazy loading baseline | Pendiente | Depende de LAB-003 |

## 4. Decisiones abiertas registradas

Ninguna resuelta todavía. Ver [README.md §5](./README.md) para la lista completa de decisiones pendientes (proveedor de clasificaciones, motor de optimización, alcance jurídico, tratamiento fiscal, cobertura geográfica) y sus plazos límite.

## 5. ADR registrados

| ADR | Título | Estado | Fecha |
|---|---|---|---|
| ADR-001 | Arquitectura del Laboratorio y límites entre navegador, Supabase y cálculo | Aceptado | 2026-08-08 |

Ubicación: `docs/adr/` en la raíz del repositorio. Lista objetivo completa en [00-plan-maestro-laboratorio.md §17](./00-plan-maestro-laboratorio.md).

## 5 bis. Divergencias entre plan y repositorio

Detectadas al auditar el commit base. Registradas, **no** corregidas. Detalle y evidencia en `docs/lab/current-baseline.md` §10.

| # | Resumen | Efecto sobre el backlog |
|---|---|---|
| D1 | ~~El paquete del plan vive en `Markovitz/`~~ **Resuelta el 2026-08-08** | El plan está en `docs/laboratorio-plan/` con `phases/`, y `CLAUDE.md` en la raíz. La copia antigua de `Markovitz/` se ha eliminado: fuente de verdad única. Nada está aún commiteado |
| D7 | `sharpeRatio` con volatilidad nula y `correlation` frente a serie constante devuelven `reason: 'insufficient_data'` con `observations: 40 ≥ required: 30`, estado internamente contradictorio | Detectado en la revisión de LAB-002. La métrica no está indefinida por muestra, sino por división por cero. Merece una razón propia; fuera del alcance de LAB-002 |
| D2 | ~~`deploy-pages.yml` no dependía de CI~~ **Resuelta el 2026-08-08 por `LAB-004`** | El despliegue se dispara por `workflow_run` tras CI en verde sobre `main` y publica `workflow_run.head_sha`. Surte efecto **solo cuando el workflow esté en `main`** |
| D3 | `LoginGate` cubre toda la app: ninguna ruta es accesible sin sesión demo o Supabase | Choca con «funciones esenciales sin cuenta». Decisión de producto pendiente |
| D4 | Segundo destino de despliegue (`vercel.json`, `DEPLOY_TARGET`) no contemplado en el plan | Validar cambios de `base` y rutas en ambos destinos |
| D5 | El router es `HashRouter` con redirecciones legacy ya implementadas | La migración de navegación parte de URLs con `#`, no de un diseño nuevo |
| D6 | No hay pgTAP ni pruebas de RLS en CI, solo `rls_verification.sql` manual | Ninguna tarea puede declarar RLS «verificada en CI» hoy |
| D8 | ~~El arnés E2E levanta `npm run dev` y el timeout queda al borde del arranque en frío~~ **Resuelta el 2026-08-08 por `LAB-003`** | Playwright sirve ahora el build con `vite preview`. Las pruebas bajaron de 6,8–29,5 s a 0,7–2,4 s |
| D9 | El número de workers por defecto de Playwright (4) satura esta máquina: acciones de ~1 s agotaban el timeout de 30 s. Medido: 1 worker 10/10 · 2 workers 10/10 · 4 workers 6/10 | Fijado `workers: 2`. Si en los runners de CI resultara conservador, subir con medición, no a ojo |
| D10 | Fallo **intermitente** de la suite unitaria bajo carga. Historial: 153/154 (LAB-001, identificado como `ImportarPage > nada se escribe hasta que se confirma`, timeout de 5 s, y pasa aislado en 169 ms) · 180/181 en una pasada de LAB-003 **cuya identidad no se pudo capturar** · 181/181 en las tres pasadas posteriores, incluida la de LAB-004 | **Sigue bloqueando el primer criterio de G0** («unit tests pasan en CI»): no se ha corregido, solo no se ha reproducido. **Causa no confirmada**: no se sube `testTimeout` sin evidencia de que sea la causa. Diagnóstico pendiente: ejecutar la suite repetidamente hasta reproducir y capturar el fallo completo |

## 6. Historial de cambios

| Fecha | Evento |
|---|---|
| 2026-08-08 | Creación del paquete de planificación dentro de `Markovitz/`. Ninguna tarea LAB-xxx iniciada todavía. |
| 2026-08-08 | `LAB-001` terminada sobre el commit `c807281`. Alta de ADR-001 y del baseline verificado. Registradas seis divergencias entre plan y repositorio (§5 bis). Sin cambios de código. |
| 2026-08-08 | `LAB-002` terminada. Fixtures dorados y prueba de paridad de 27 casos sobre `src/lib/finance/`. Revisión cuantitativa independiente superada tras corregir cuatro debilidades. Registrada D7. Sin cambios en código de producción. |
| 2026-08-08 | Eliminada la copia obsoleta del plan en `Markovitz/`. `docs/laboratorio-plan/` queda como fuente de verdad única (cierra D1). |
| 2026-08-08 | `LAB-003` terminada. CI en tres jobs con `quality` y `e2e-core` como checks requeridos, y Playwright sirviendo el build. Cierra D8; registra D9 y D10. El despliegue **sigue sin depender de CI**: eso es `LAB-004`. |
| 2026-08-08 | Publicada la rama `lab/fase-0` en el remoto con los cuatro commits previos. |
| 2026-08-08 | `LAB-004` terminada. Ocho Actions fijadas a SHA, permisos mínimos por job y despliegue condicionado al SHA que CI validó. Cierra D2. Con esto G0 solo espera a `LAB-007` y a resolver D10. |

## 6 bis. Última tarea cerrada — LAB-004

**Archivos** (4): los tres workflows y `docs/runbooks/pages-deploy-failure.md` (nuevo).

**Qué cambia**

- **Cadena de suministro**: las ocho Actions quedan fijadas a SHA completo de 40 hex con su versión semántica anotada (`actions/checkout` v4.4.0, `setup-node` v4.4.0, `upload-artifact` v4.6.2, `download-artifact` v4.3.0, `configure-pages` v5.0.0, `upload-pages-artifact` v3.0.1, `deploy-pages` v4.0.5, `codeql-action` v3.37.6). SHA revalidados contra la API pública inmediatamente antes de aplicarlos. `persist-credentials: false` en todos los checkouts.
- **Permisos mínimos**: `deploy-pages.yml` pasa a `permissions: {}` a nivel de workflow; el job de build pide `contents: read` y solo el de deploy pide `pages: write` e `id-token: write`. Antes ambos heredaban los tres permisos.
- **Despliegue condicionado (criterio G0)**: `deploy-pages.yml` deja de dispararse por `push`. Escucha `workflow_run` de CI sobre `main`, exige `conclusion == 'success'` y hace checkout de `workflow_run.head_sha`, no de la punta de `main`.
- **Redespliegue manual**: `workflow_dispatch` con input obligatorio `sha`, documentado en el runbook.
- Concurrencia de Pages conservada (`group: pages`, sin cancelación).

**Pruebas**

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Correcto |
| `npm run typecheck` | Correcto |
| `npx vitest run` | 181/181 |
| `npm run build` | Correcto |
| `npm run test:e2e` | 10/10 en 37,3 s |
| YAML + permisos + fijación a SHA | Correcto: las 3 Actions por workflow parsean, ninguna sin fijar a SHA de 40 hex, ningún `pull_request_target` |

Durante la validación se detectó y corrigió un defecto propio: el escalar plegado `>-` del campo `ref` **conservaba saltos de línea** (las líneas de continuación estaban más indentadas que la primera), de modo que GitHub habría recibido un `ref` con retornos dentro. Se dejó en una sola línea y se comprobó por parseo que ya no los contiene.

**Limitaciones**

- El encadenado `workflow_run` **solo surte efecto cuando `deploy-pages.yml` esté en la rama por defecto**. Mientras viva en `lab/fase-0`, el despliegue encadenado no se activa. No es un fallo.
- El redespliegue manual **no puede comprobar** que el SHA aportado pasara CI: es responsabilidad de quien lo lanza. Documentado en el runbook.
- No se actualizan versiones mayores de Actions (van varias por detrás, p. ej. `checkout` v4 frente a v7). Fuera de alcance; Dependabot ya vigila `github-actions`.
- El build de Pages no es byte a byte el artefacto que audita CI: usa `DEPLOY_TARGET=gh-pages` y las variables públicas de Supabase. Es el mismo commit, reconstruido para su destino.

**Rollback**: revertir el commit devuelve el despliegue al disparo por `push`.

## 6 ter. Tarea anterior — LAB-003

**Archivos** (3):

- `.github/workflows/ci.yml` — reestructurado en tres jobs
- `playwright.config.ts` — sirve el build y limita la concurrencia
- `docs/runbooks/ci-required-checks.md` — nuevo

**Qué cambia**: `ci.yml` pasa de un job monolítico `verify` a `quality` (lint, tipos, unitarias), `build` (build, auditoría de secretos, publica `dist`) y `e2e-core` (`needs: build`, descarga `dist`, Playwright, traces solo si falla). Concurrencia por workflow+ref, cancelando solo en PR. Playwright sirve el build con `vite preview` en vez del servidor de desarrollo, de modo que **se prueba el mismo artefacto que se audita**.

**Pruebas**

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Correcto |
| `npm run typecheck` | Correcto |
| `npx vitest run` | 181/181 (ver D10: una pasada previa dio 180/181 por inestabilidad) |
| `npm run build` | Correcto |
| `npm run test:e2e` | 10/10 en 19,9 s, todas entre 0,7 y 2,4 s |
| YAML de los tres workflows | Parseado correctamente; `ci.yml` expone `quality`, `build`, `e2e-core` con `contents: read` |

**Limitaciones**

- La cobertura (`--coverage` en el paso 8 del documento 03) **no se añade**: exigiría la dependencia `@vitest/coverage-v8`, que no está instalada. Queda para la tarea que fije el presupuesto de calidad.
- Fijar las Actions a SHA completo es el paso 1 de `LAB-004`, no de esta tarea.
- Los checks requeridos en branch protection son **configuración remota manual**: el runbook los documenta, pero nadie los ha aplicado en GitHub.
- El workflow no se ha ejecutado en GitHub: se ha validado localmente y por parseo de YAML.

**Rollback**: revertir el commit. `deploy-pages.yml` no se ha tocado, así que el despliegue sigue comportándose igual que antes.

## 6 ter. Tarea anterior — LAB-002

**Archivos** (4 nuevos, ninguno de producción):

- `src/test/fixtures/historical-series.ts` — series sintéticas y valores dorados en forma cerrada
- `src/test/fixtures/portfolio-small.ts` — cartera long-only de 4 posiciones y escenario de estrés
- `src/lib/finance/__tests__/golden-current.test.ts` — 27 pruebas de paridad
- `docs/lab/golden-fixtures.md` — derivaciones, tolerancias y cobertura

**Pruebas ejecutadas**

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Correcto |
| `npx tsc -b` | Correcto |
| `npx vitest run` | 181/181 correctas (21 ficheros) |
| `npm run build` | Correcto |
| `npx playwright test` | 10/10 correctas (13,5 s) en la pasada válida. La anterior dio 6/10: ver nota |

**Nota sobre la pasada E2E fallida.** Una ejecución intermedia falló 4 pruebas de `chromium`, todas en `page.goto` de la primera navegación con `Test timeout of 30000ms exceeded`, no en una aserción. Causa: arranque en frío del servidor de desarrollo. En el baseline de LAB-001 esas mismas cuatro tardaban 29,5 s, a medio segundo del límite; con el servidor caliente bajan a 6,8–7,1 s. **No lo provoca esta tarea**: LAB-002 no modifica ningún fichero de producción. Es fragilidad preexistente del arnés E2E, que levanta `npm run dev` en vez de servir el build. `LAB-003` ya contempla «servir build para Playwright» en su paso 4; conviene además subir el timeout o esperar al servidor.

**Método**: ningún valor esperado procede de ejecutar el código bajo prueba. Las series están construidas para que el resultado tenga forma cerrada, y muchos valores son racionales exactos independientes de la muestra (DR = 2, correlación media −1, HHI = 0,30, contribuciones +1,5/−0,5, drawdown −1/101, apuestas efectivas = 2).

**Limitaciones**

- Sin fixture dorado todavía: `downsideVolatility`, `sortinoRatio`, `betaAlpha` y `timeWeightedReturn`. `calculatePortfolioTwr` sigue dentro de `HistoricalRiskSection.tsx` y necesitará el suyo al extraerse.
- Cuatro debilidades detectadas por la revisión y **no corregidas por quedar fuera del alcance** (cambiarían comportamiento actual): la razón contradictoria de D7, el umbral absoluto dependiente de escala en `diversification.ts`, la anualización de `covarianceMatrix` sin anclar y el fixture con huecos que no distingue alineación por fecha de alineación por posición. Detalle en `docs/lab/golden-fixtures.md` §7.
- Supabase (reset, migraciones, pgTAP/RLS): **no ejecutadas**, sin tooling ni credenciales (D6). La tarea no toca `supabase/`.

**Riesgo y rollback**: nulo sobre el runtime; no se modificó código de producción. Revertir es borrar los cuatro ficheros nuevos.

## 7. Cómo actualizar este documento

Al cerrar una tarea LAB-xxx:

1. Mover la tarea de "Pendiente" a "Terminada" en la tabla de la fase correspondiente, con enlace a la evidencia de pruebas.
2. Actualizar "Tarea activa" a la siguiente tarea con dependencias satisfechas.
3. Si se supera una puerta Gx, actualizar la tabla de la sección 2 con fecha de cierre.
4. Añadir una línea al historial de cambios (sección 6) — no reescribir entradas anteriores.
5. Si la tarea generó un ADR, añadirlo a la sección 5.
6. Si la tarea resolvió una decisión abierta del README, moverla de la sección 4 a "resuelta" con la opción elegida y su justificación.

No declarar una tarea terminada si falta un criterio de aceptación (ver [00-plan-maestro-laboratorio.md §15](./00-plan-maestro-laboratorio.md), Definition of Done).
