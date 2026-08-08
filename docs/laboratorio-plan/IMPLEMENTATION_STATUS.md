# Estado de implementación del Laboratorio

> Este documento es el panel de estado vivo del plan descrito en [00-plan-maestro-laboratorio.md](./00-plan-maestro-laboratorio.md) y ejecutado tarea a tarea según [04-backlog-fases-y-tareas-ia.md](./04-backlog-fases-y-tareas-ia.md).
> Se actualiza en **cada** tarea LAB-xxx cerrada o cuando cambia la tarea activa. No se reescribe el historial; se añade.

## 1. Estado global

| Campo | Valor |
|---|---|
| Commit base | `c807281ae33d81dfe075f62a9fca98b88602a6f0` (`main`, sincronizada con `origin/main`) |
| Fase activa | Fase 0 — Base, contratos y calidad |
| Tarea activa | Ninguna — `LAB-002` terminada. Preparadas: `LAB-003` (recomendada, cierra G0, pero necesita aprobar su reformulación por D2) y `LAB-006` (sin condiciones) |
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
| LAB-003 — Separar CI de despliegue | Pendiente | Dependencia satisfecha. **Reformular por D2**: `ci.yml` ya existe; el trabajo es encadenar el despliegue a CI |
| LAB-004 — Endurecer GitHub Actions | Pendiente | Depende de LAB-003 |
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
| D2 | `ci.yml` ya existe con todas las puertas; lo que falta es que `deploy-pages.yml` **dependa** de CI | `LAB-003` debe reformularse: encadenar despliegue a CI, no crear CI |
| D3 | `LoginGate` cubre toda la app: ninguna ruta es accesible sin sesión demo o Supabase | Choca con «funciones esenciales sin cuenta». Decisión de producto pendiente |
| D4 | Segundo destino de despliegue (`vercel.json`, `DEPLOY_TARGET`) no contemplado en el plan | Validar cambios de `base` y rutas en ambos destinos |
| D5 | El router es `HashRouter` con redirecciones legacy ya implementadas | La migración de navegación parte de URLs con `#`, no de un diseño nuevo |
| D6 | No hay pgTAP ni pruebas de RLS en CI, solo `rls_verification.sql` manual | Ninguna tarea puede declarar RLS «verificada en CI» hoy |
| D8 | El arnés E2E levanta `npm run dev` (servidor de desarrollo) y el timeout de 30 s queda al borde del arranque en frío: 29,5 s medidos en el baseline, 6,8 s en caliente | Fallos intermitentes de `page.goto` ajenos al producto. Refuerza el paso 4 de `LAB-003` («servir build para Playwright»); considerar además un timeout mayor |

## 6. Historial de cambios

| Fecha | Evento |
|---|---|
| 2026-08-08 | Creación del paquete de planificación dentro de `Markovitz/`. Ninguna tarea LAB-xxx iniciada todavía. |
| 2026-08-08 | `LAB-001` terminada sobre el commit `c807281`. Alta de ADR-001 y del baseline verificado. Registradas seis divergencias entre plan y repositorio (§5 bis). Sin cambios de código. |
| 2026-08-08 | `LAB-002` terminada. Fixtures dorados y prueba de paridad de 27 casos sobre `src/lib/finance/`. Revisión cuantitativa independiente superada tras corregir cuatro debilidades. Registrada D7. Sin cambios en código de producción. |
| 2026-08-08 | Eliminada la copia obsoleta del plan en `Markovitz/`. `docs/laboratorio-plan/` queda como fuente de verdad única (cierra D1). |

## 6 bis. Última tarea cerrada — LAB-002

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
