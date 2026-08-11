# Estado de implementación del Laboratorio

> Este documento es el panel de estado vivo del plan descrito en [00-plan-maestro-laboratorio.md](./00-plan-maestro-laboratorio.md) y ejecutado tarea a tarea según [04-backlog-fases-y-tareas-ia.md](./04-backlog-fases-y-tareas-ia.md).
> Se actualiza en **cada** tarea LAB-xxx cerrada o cuando cambia la tarea activa. No se reescribe el historial; se añade.

## 1. Estado global

| Campo | Valor |
|---|---|
| Commit base de la Fase 0 | `c807281` |
| Último commit en `main` | `15be7be` |
| Fase activa | **Fase 2 — IPS, restricciones y calidad de datos** |
| Tarea activa | Ninguna — `LAB-211` terminada. Siguiente: `LAB-212` (página Calidad de datos) |
| Última puerta superada | **G1**, el 2026-08-10 |
| Última actualización | 2026-08-11 |

## 2. Estado por fase y puerta

| Fase | Objetivo | Puerta | Estado | Fecha de cierre |
|---:|---|---|---|---|
| 0 | Base, contratos y calidad | G0 | **Superada** | 2026-08-09 |
| 1 | Shell y migración de navegación | G1 | **Superada** | 2026-08-10 |
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

## 2 bis. Acta de la puerta G0 — **SUPERADA**

Cerrada el 2026-08-09 sobre `569e2a8b0ca8b346f07ead1719f8e52e0354743b`, commit de fusión de la PR [#9](https://github.com/IgnacioR04/RiskCalculator/pull/9) en `main`.

| Criterio G0 | Estado | Evidencia verificable |
|---|---|---|
| lint, tipos, unit tests, E2E básico y build pasan en CI | **Cumplido** | CI [`31323042816`](https://github.com/IgnacioR04/RiskCalculator/actions/runs/31323042816) sobre `569e2a8`: `quality` ✓, `build` ✓, `e2e-core` ✓ (181 unitarias y 22 E2E). D10 diagnosticada y corregida, no solo ausente |
| El despliegue no puede adelantarse a CI | **Cumplido** *(canal GitHub Pages)* | Demostrado en producción: CI terminó a las 16:11:03 y **solo entonces** arrancó Deploy [`31323113237`](https://github.com/IgnacioR04/RiskCalculator/actions/runs/31323113237) a las 16:11:05, con `event=workflow_run`. El log confirma `git checkout 569e2a8b…`: se publicó exactamente el SHA que CI validó |
| Los cálculos actuales tienen fixtures de paridad | **Cumplido** | `LAB-002`: 27 pruebas doradas sobre `src/lib/finance/`, con valores derivados analíticamente y revisión cuantitativa independiente |
| Las rutas actuales están cubiertas | **Cumplido** | `LAB-007`: las ocho rutas, redirecciones antiguas, modo sin Supabase, rail y barra móvil. 22 pruebas E2E, verificadas en CI y en el sitio publicado |

### Protección de `main` aplicada

No existía protección ni rulesets previos. Aplicada el 2026-08-09 y verificada por lectura de la API:

| Regla | Valor |
|---|---|
| Checks requeridos | `quality`, `e2e-core` |
| Comprobaciones estrictas (rama al día con `main`) | Sí |
| Aplicable a administradores | **Sí** — nadie puede saltarse las reglas |
| Aprobaciones de terceros | 0 (repositorio individual); los cambios siguen pasando por PR |
| Force push / borrado de `main` | Prohibidos |

### Smoke test del sitio publicado

Sobre <https://ignacior04.github.io/RiskCalculator/>, tras el despliegue de `569e2a8`:

- carga inicial correcta y **assets servidos bajo `/RiskCalculator/`**;
- las **ocho rutas** responden con su encabezado correcto vía `HashRouter`;
- **cero apariciones** del fallback del `ErrorBoundary`;
- **cero errores de consola**;
- rail de escritorio presente en las ocho rutas; en móvil el rail queda oculto y la barra inferior abre sus cinco secciones.

El hash del bundle no cambió respecto al despliegue anterior (`index-Cz6I4xU_.js`), lo cual es lo esperado: la Fase 0 **no modificó código de producción**. La prueba de que el despliegue ocurrió es la ejecución del workflow, no un cambio de hash.

### Alcance declarado y riesgo abierto

La evidencia del segundo criterio cubre el canal de **GitHub Pages**. El repositorio reconoce un segundo destino (divergencia D4: `vercel.json` y la bifurcación `DEPLOY_TARGET` de `vite.config.ts`), y **desde el repositorio no puede comprobarse** si hay un proyecto de Vercel conectado ni si su integración con Git está condicionada a CI: `vercel.json` es solo una reescritura para SPA y ningún workflow lo gobierna. Si ese destino estuviera activo, desplegaría en cada push sin esperar a CI. **G0 se declara sobre el canal de Pages**; comprobar Vercel exige entrar en su panel y queda como riesgo abierto.

Quedan además tres tareas de Fase 0 **fuera del criterio de G0**, que no la bloquean: `LAB-005` (metadatos de build), `LAB-006` (feature flags tipadas) y `LAB-008` (presupuesto de bundle).

## 2 ter. Acta de la puerta G1 — **SUPERADA**

Cerrada el 2026-08-10, con las diez tareas de la Fase 1 terminadas.

| Criterio G1 | Estado | Evidencia |
|---|---|---|
| Todos los recorridos actuales siguen disponibles | **Cumplido** | `lab-shell.spec.ts` recorre las nueve secciones y las tres URL antiguas; el menú «Más» del móvil cubre además un hueco anterior |
| Rutas nuevas están lazy-loaded | **Cumplido** | El Laboratorio viaja en un chunk propio (`LabSection`), cargado bajo demanda; no toca el arranque |
| No se han cambiado resultados numéricos | **Cumplido** | Las tres pantallas migradas **reutilizan la misma implementación**, no una copia: no hay dos cálculos que puedan divergir. Los 27 fixtures dorados de `LAB-002` siguen en verde |
| Escritorio y móvil pasan E2E | **Cumplido** | 58 pruebas en los dos proyectos de Playwright, sobre el build real |

**Nota honesta sobre la paridad.** Hasta `LAB-107` una E2E comparaba las cifras de la ruta antigua con las de la nueva. Desde `LAB-108` la antigua redirige a la nueva, así que esa comparación se compararía consigo misma: se retiró por tautológica en vez de dejarla dando una falsa sensación de cobertura. La garantía real es estructural —una sola implementación por pantalla— y se apoya en las unitarias de `LabSection` y en los fixtures dorados.

## 3. Tareas de la Fase 0

> Los checklists vivos de cada fase están en [`phases/`](./phases/). Aquí se conserva el
> detalle de la Fase 0 por ser la que fija la red de seguridad; el de la Fase 1 está en
> [`phases/FASE-01.md`](./phases/FASE-01.md) y el de la Fase 2 en
> [`phases/FASE-02.md`](./phases/FASE-02.md).

| Tarea | Estado | Notas |
|---|---|---|
| LAB-001 — Baseline y ADR de arquitectura | **Terminada** (2026-08-08) | Entrega `docs/adr/ADR-001-lab-architecture.md` y `docs/lab/current-baseline.md`. Sin cambios de código |
| LAB-002 — Fixtures financieros dorados | **Terminada** (2026-08-08) | 27 pruebas doradas sobre `src/lib/finance/`. Documentación en `docs/lab/golden-fixtures.md` |
| LAB-003 — Separar CI de despliegue | **Terminada** (2026-08-08) | Jobs `quality`, `build` y `e2e-core`; Playwright sirve el build. Cierra D8 |
| LAB-004 — Endurecer GitHub Actions | **Terminada** (2026-08-08) | Ocho Actions fijadas a SHA, permisos mínimos por job, despliegue por `workflow_run` sobre el SHA validado. Cierra D2 |
| LAB-005 — Metadatos de build | Pendiente | Depende de LAB-003 |
| LAB-006 — Feature flags tipadas | **Terminada** (2026-08-09) | `src/lib/features/flags.ts` con las 9 capacidades del documento 03, default seguro y 17 pruebas. Nada la consume aún: la primera será `labShell` en la Fase 1 |
| LAB-007 — Baseline E2E de rutas actuales | **Terminada** (2026-08-09) | `e2e/navigation-current.spec.ts` + `e2e/helpers.ts`. Las ocho rutas, redirecciones legacy, modo sin Supabase, rail y barra móvil |
| LAB-008 — Presupuesto de bundle y lazy loading baseline | Pendiente | Depende de LAB-003 |

## 4. Decisiones abiertas registradas

Ninguna resuelta todavía. Ver [README.md §5](./README.md) para la lista completa de decisiones pendientes (proveedor de clasificaciones, motor de optimización, alcance jurídico, tratamiento fiscal, cobertura geográfica) y sus plazos límite.

## 5. ADR registrados

| ADR | Título | Estado | Fecha |
|---|---|---|---|
| ADR-001 | Arquitectura del Laboratorio y límites entre navegador, Supabase y cálculo | Aceptado | 2026-08-08 |
| ADR-002 | Modelo de política de inversión y regla de riesgo efectiva | Aceptado | 2026-08-10 |

Ubicación: `docs/adr/` en la raíz del repositorio. Lista objetivo completa en [00-plan-maestro-laboratorio.md §17](./00-plan-maestro-laboratorio.md).

## 5 bis. Divergencias entre plan y repositorio

Detectadas al auditar el commit base. Registradas, **no** corregidas. Detalle y evidencia en `docs/lab/current-baseline.md` §10.

| # | Resumen | Efecto sobre el backlog |
|---|---|---|
| D1 | ~~El paquete del plan vive en `Markovitz/`~~ **Resuelta el 2026-08-08** | El plan está en `docs/laboratorio-plan/` con `phases/`, y `CLAUDE.md` en la raíz. La copia antigua de `Markovitz/` se ha eliminado: fuente de verdad única. Nada está aún commiteado |
| D7 | `sharpeRatio` con volatilidad nula y `correlation` frente a serie constante devuelven `reason: 'insufficient_data'` con `observations: 40 ≥ required: 30`, estado internamente contradictorio | Detectado en la revisión de LAB-002. La métrica no está indefinida por muestra, sino por división por cero. Merece una razón propia; fuera del alcance de LAB-002 |
| D2 | ~~`deploy-pages.yml` no dependía de CI~~ **Resuelta el 2026-08-08 por `LAB-004`** | El despliegue se dispara por `workflow_run` tras CI en verde sobre `main` y publica `workflow_run.head_sha`. Surte efecto **solo cuando el workflow esté en `main`** |
| D3 | ~~`LoginGate` cubre toda la app~~ **Resuelta el 2026-08-09 por decisión del propietario** | El Laboratorio es accesible **sin cuenta**: el router pasa a estar por encima de `LoginGate`, que deja pasar los prefijos públicos sin dejar de inicializar caché y sesión. El resto de la aplicación sigue tras la puerta; quien quiera sincronizar entra desde Perfil |
| D4 | Segundo destino de despliegue (`vercel.json`, `DEPLOY_TARGET`) no contemplado en el plan | Validar cambios de `base` y rutas en ambos destinos |
| D5 | El router es `HashRouter` con redirecciones legacy ya implementadas | La migración de navegación parte de URLs con `#`, no de un diseño nuevo |
| D6 | ~~No hay pgTAP ni pruebas de RLS en CI~~ **Cerrada el 2026-08-10** | `supabase-ci.yml` levanta Postgres, aplica las migraciones desde cero y ejecuta 28 aserciones pgTAP, la mayoría **negativas**. No usa credenciales ni toca ningún proyecto real. Desbloquea el criterio «RLS negativa» de G2 |
| D8 | ~~El arnés E2E levanta `npm run dev` y el timeout queda al borde del arranque en frío~~ **Resuelta el 2026-08-08 por `LAB-003`** | Playwright sirve ahora el build con `vite preview`. Las pruebas bajaron de 6,8–29,5 s a 0,7–2,4 s |
| D13 | El plan añade una **tercera** carpeta de código del Laboratorio: `src/lib/lab/` (LAB-202), junto a `src/lib/features/` (LAB-006) y `src/features/lab/` (LAB-101) | Se siguen las rutas del plan al pie de la letra, pero conviven tres raíces para lo mismo. Unificar es una decisión de estructura pendiente; no afecta al comportamiento |
| D15 | La escritura de una política son **varios pasos sin transacción**: PostgREST no ofrece transacciones multi-tabla. Si fallan los hijos se borra la política recién creada y la cascada limpia el resto, pero no es atomicidad real | Una función RPC en la base lo resolvería. No bloquea: el caso es poco frecuente y la compensación deja la base coherente |
| D17 | El **paso 6 del asistente, «necesidad de rentabilidad»**, aparece en la especificación de producto (§8.1) pero **ninguna tarea del backlog lo reclama**: `LAB-209` cubre los pasos 7 a 9 y no lo menciona, y no hay ningún otro `LAB-xxx` que derive `riskNeed` | Sin `need`, la maquinaria de conflicto de ADR-002 §4 no puede dispararse nunca: `assessPolicy` devuelve siempre `need_not_assessed` y las cinco salidas del conflicto quedan inalcanzables. El asistente lo dice en pantalla en vez de renumerar y fingir que está completo. Derivarlo exige el valor actual de la cartera, que hoy vive fuera de la IPS: encaja con `LAB-213` (cabecera de contexto real) o con una tarea propia |
| D16 | La base acepta `effective_risk` con capacidad medida pero **sin banda de tolerancia**; desde `LAB-208` la aplicación lo rechaza. La regla de ADR-002 §3 bajó a la base solo por el lado de la capacidad (`LAB-205`) | El esquema zod y el repositorio lo cortan antes de escribir, así que no se puede colar desde la aplicación. Cerrar la asimetría exige una migración aditiva con un `check` nuevo, y añadir una restricción sobre una tabla que ya existe puede fallar si hubiera filas antiguas que la incumplan. Se hace cuando pueda comprobarse contra una base con datos, no a ciegas |
| D14 | Los tipos de fila de Supabase están **escritos a mano**, no generados: `supabase gen types` necesita una base en marcha y no hay Docker en el entorno | Apuntar el generador a producción para escribir un archivo de tipos no era motivo suficiente. El riesgo se acota validando con zod al leer y probando el viaje de ida y vuelta. Conviene regenerar y comparar cuando haya base local |
| D12 | El plan sitúa las flags en `src/lib/features/flags.ts` (LAB-006) y los contratos de ruta en `src/features/lab/…` (LAB-101): **dos carpetas «features» distintas**, una dentro de `lib/` y otra en la raíz de `src/` | Se han seguido ambas rutas literalmente, como se hizo con `__tests__`. Conviene unificar antes de que la Fase 1 llene `src/features/`; es una decisión de estructura, no funcional |
| D11 | **Resuelta en parte el 2026-08-09**: `e2e/` y `playwright.config.ts` ya se lintan y comprueban de tipos con `tsconfig.e2e.json`, con la misma severidad que la aplicación; se verificó que ambas puertas atrapan un error deliberado. Quedan abiertos: `seriesCache.test.ts` restaura `vi.useFakeTimers()` dentro del `it` y no en un `afterEach`; el `asyncUtilTimeout` de Testing Library sigue en 1 s pese a que D10 concluyó que el problema es la saturación de CPU; y la conversión FX de series históricas (`convertDemoPriceSeries`) no tiene fixture ni aparece declarada como hueco en `golden-fixtures.md` | Ninguno bloquea G0. El primero es el más relevante: el entregable que sostiene el criterio de rutas es justo el código que las puertas de calidad no revisan |
| D9 | El número de workers por defecto de Playwright (4) satura esta máquina: acciones de ~1 s agotaban el timeout de 30 s. Medido: 1 worker 10/10 · 2 workers 10/10 · 4 workers 6/10 | Fijado `workers: 2`. **Confirmado en CI**: 10/10 en 9,3 s en el runner. Si algún día resultara conservador, subir con medición, no a ojo |
| D10 | ~~Fallo intermitente de la suite unitaria bajo carga~~ **Diagnosticada y resuelta el 2026-08-09** | Reproducida de forma determinista bajo carga de CPU y corregida en `vite.config.ts`. Diagnóstico completo abajo |

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
| 2026-08-09 | D10 reproducida de forma determinista bajo carga de CPU, diagnosticada como coste de arranque y corregida en `vite.config.ts`. |
| 2026-08-09 | `LAB-007` terminada. Baseline E2E de las ocho rutas, redirecciones antiguas, modo sin Supabase y navegación de escritorio y móvil. |
| 2026-08-09 | Revisión previa a la fusión. El `security-reviewer` detectó que el filtro `branches` de `workflow_run` compara contra la rama **de origen**, de modo que un PR desde un fork llamado `main` habría desplegado código no confiable; corregido antes de fusionar. El `test-reviewer` detectó que el acta de G0 declaraba el criterio de despliegue sin evaluar el segundo destino (D4); acotado. |
| 2026-08-09 | `LAB-006` terminada. Feature flags tipadas con default seguro, para poder fusionar capacidades de la Fase 1 sin exponerlas. |
| 2026-08-11 | `LAB-211` terminada. Adaptador que traduce al modelo de calidad lo que la aplicación ya tiene: cotizaciones, tipos de cambio, series en caché y las posiciones ya construidas. **No hace ninguna llamada de red y no lee el reloj**, y las dos cosas están comprobadas recorriendo el fuente en vez de prometidas en un comentario. La frescura se declara como convención de la herramienta —cuatro días para precios y cambios, que cubren un fin de semana largo— y queda escrito que **no es el `QUOTE_TTL_MS` de cinco minutos de la caché**, que responde a otra pregunta. Dos correcciones sobre LAB-210 que solo se vieron con datos reales: la falta de historia avisa en la fila pero no la tiñe de rojo —quien bloquea es el cálculo que la necesita— y «cero observaciones alineadas» es un hecho, no un desconocido. 45 pruebas nuevas. |
| 2026-08-11 | `LAB-210` terminada. Modelo de calidad de datos: las ocho dimensiones y los cinco estados del documento 02 §8, la cobertura ponderada de §8.3 y la matriz de umbrales de §8.4 centralizada y versionada. Dos decisiones sostienen el módulo: **una posición sin valor conocido no entra en la cobertura como un cero** —se aparta y se cuenta, porque tratarla como cero subiría el porcentaje cubierto fingiendo que no hay nada que cubrir—, y **el tipo impide que exista un bloqueo sin acción para desbloquearlo**: un `severity: 'blocking'` sin `remediation` no compila, que es el criterio de aceptación de la tarea garantizado por construcción y no por acordarse. Donde el plan no da número no se ha inventado ninguno: el suelo de muestra del CVaR y el universo mínimo de las señales sectoriales quedan explícitamente sin calibrar. Nada consume todavía estos módulos —el bundle no cambia—: los adaptadores son `LAB-211`. 39 pruebas nuevas. |
| 2026-08-11 | `LAB-209` terminada. Pasos 7 a 9 del asistente y el ciclo de vida completo de la política. **La vigente es inmutable**: editarla abre la versión siguiente en borrador, la anterior sigue rigiendo hasta que la nueva se active y luego se conserva como `superseded` en vez de borrarse. Un comprobador de contradicciones detecta los límites que ninguna cartera puede cumplir a la vez —mínimos que suman más del 100 %, lo bloqueado más la liquidez, reglas sobre activos fuera del universo— y bloquea la activación mientras existan; deja claro que **no es una prueba de factibilidad completa**, solo las contradicciones que se explican en una frase. Registrada D17: el paso 6 del asistente no lo reclama ninguna tarea del backlog. 82 pruebas nuevas. |
| 2026-08-10 | `LAB-208` terminada. Pasos 3 a 5 del asistente y las dos reglas que faltaban para que ADR-002 sea ejecutable: la **banda de capacidad** sale del techo más bajo de los cinco hechos —no de su media, porque un horizonte largo no compensa la falta de colchón— y la **banda de tolerancia** de la mediana de cinco respuestas, que en una escala ordinal es el estadístico que corresponde. Ninguna se deduce de la otra, y ahora **tampoco la tolerancia se inventa**: `emptyPolicyDraft` dejaba una banda 3 de relleno que habría entrado en `min()`; ahora nace sin banda y `computeEffectiveRisk` devuelve `null` si falta cualquiera de las dos. La banda migrada del perfil antiguo se marca con su procedencia para que el recálculo no la borre. Registrada D16. 63 pruebas nuevas. |
| 2026-08-10 | `LAB-207` terminada. Dos primeros pasos del asistente de IPS (objetivos y horizonte), alojados en la sección Perfil y detrás de `labIpsV2`. El borrador se guarda en cada cambio: comprobado con una recarga real del navegador, no solo en pruebas. El horizonte entra como **hecho de capacidad** y rellenarlo no produce ninguna banda: siguen faltando cuatro hechos y el asistente lo dice en todo momento. 31 pruebas. |
| 2026-08-10 | `LAB-206` terminada. Repositorio como **única capa** que habla con las tablas de política, con una prueba que recorre el árbol de fuentes para comprobarlo. Todo lo que se lee se valida con zod antes de entrar al dominio. Registradas D14 y D15. |
| 2026-08-10 | `LAB-205` terminada. Migración **aditiva**: tres tablas nuevas, ninguna de las cuatro anteriores tocada. Dos reglas de ADR-002 bajan a la base: no hay riesgo efectivo sin capacidad medida, y una clave ajena compuesta impide colgar un objetivo de la política de otro usuario. Verificada con 23 aserciones pgTAP: **51 en total entre las dos suites, todas en verde en CI**. |
| 2026-08-10 | **D6 cerrada.** Arnés de RLS automatizado: `supabase-ci.yml` con pgTAP sobre una base local del runner. El script manual anterior no podía ejecutarse en CI, así que la RLS nunca se comprobaba sola. Se añade también `supabase/config.toml`, que declara `verify_jwt` de la Edge Function en vez de dejarlo al valor por defecto. |
| 2026-08-10 | `LAB-204` terminada. `STORE_VERSION` pasa de 2 a 3 con migrador explícito. El perfil de riesgo antiguo **se conserva intacto** y de él se deriva un borrador de política que nace sin capacidad y sin activar. Una prueba comprueba clave por clave que el estado v2 se abre sin perder nada. |
| 2026-08-10 | `LAB-203` terminada. Motor de riesgo efectivo puro y determinista, con códigos de razón estables. El conflicto se distingue del error, y ninguna de sus cinco salidas sube el riesgo. La fecha entra como argumento: sin reloj implícito, el resultado se reproduce meses después. |
| 2026-08-10 | `LAB-202` terminada. Dominio puro y validación en frontera de la IPS. El esquema **impide estructuralmente** que exista riesgo efectivo sin capacidad medida, y rechaza NaN, infinitos y pesos fuera de 0–1. |
| 2026-08-10 | **Fase 2 iniciada.** `LAB-201` cierra por ADR-002 dos decisiones que el plan dejaba abiertas: la escala de bandas de riesgo (cinco, ordinales) y la validez temporal de la IPS (doce meses). Separa tolerancia, capacidad y necesidad, y fija que **la capacidad nunca se deduce de la tolerancia**. |
| 2026-08-10 | **G1 superada.** `LAB-110` cierra la Fase 1 con una E2E de migración de ocho casos. La Fase 2 queda autorizada y sin iniciar. |
| 2026-08-10 | `LAB-109` terminada. Portada con las dos mitades y el estado real de la cartera. **No muestra hallazgos**: las conclusiones las producen los motores de la Fase 3, e insinuarlas ahora sería inventar. Una prueba comprueba que sin cartera no aparece ningún dígito. |
| 2026-08-10 | `LAB-108` terminada. Las tres URL antiguas redirigen al Laboratorio conservando la cadena de consulta, con aviso cerrable y sin bucle al volver atrás. Con la capacidad apagada siguen sirviendo la pantalla de siempre. |
| 2026-08-09 | `LAB-107` terminada. El simulador vive en Escenarios, con los shocks declarados como deterministas y sin añadir Monte Carlo. Tres pantallas migradas: Riesgo, Exposición y Escenarios. |
| 2026-08-09 | `LAB-106` terminada. Diversificación se ve dentro del Laboratorio como **Exposición**, reutilizando la misma implementación. Paridad comprobada en E2E. |
| 2026-08-09 | `LAB-105` terminada. Riesgo se ve ya dentro de Estabilidad reutilizando la **misma** implementación: no hay lógica duplicada y la paridad es por construcción. Una E2E compara las cifras de ambas rutas. |
| 2026-08-09 | Cerrado el hueco principal de D11: `e2e/` entra en las puertas de lint y tipos. Ya había mordido dos veces (un error de tipos invisible a 234 unitarias y un landmark `banner` que solo vio la E2E). |
| 2026-08-09 | `LAB-104` terminada. Laboratorio entra en el rail y sustituye a Riesgo en la barra móvil, según §3.1. Se añade un menú «Más» que cierra un hueco **anterior**: Diversificación, Simular e Importar ya solo eran alcanzables por URL en móvil. |
| 2026-08-09 | `LAB-103` terminada. El Laboratorio ya es navegable en `/laboratorio/*`, en un chunk diferido y tras la capacidad `labShell`. Por decisión del propietario, **accesible sin cuenta**: cierra D3. |
| 2026-08-09 | `LAB-102` terminada. Shell del Laboratorio con cabecera de contexto, áreas, subnavegación responsive y migas. |
| 2026-08-09 | **Fase 1 iniciada.** `LAB-101` terminada: contratos de ruta con las 16 rutas del documento 01, ID estable, padre, migas y las tres redirecciones. Registrada D12. |
| 2026-08-09 | **G0 superada.** Protección de `main` aplicada, PR #9 fusionada en `569e2a8`, encadenado CI→despliegue demostrado en producción y smoke test del sitio publicado correcto. La Fase 1 queda autorizada y **sin iniciar**. |

## 6 bis-0. Última tarea cerrada — LAB-007

**Archivos** (3): `e2e/navigation-current.spec.ts` (nuevo), `e2e/helpers.ts` (nuevo), `e2e/core-flows.spec.ts` (pasa a usar los helpers, sin cambiar ninguna aserción).

**Cobertura añadida**, toda contra el build servido con `vite preview` y sin variables de Supabase:

| Prueba | Qué protege |
|---|---|
| Las ocho rutas cargan con su encabezado numerado | Cada ruta con `HashRouter`, su `h1`, ausencia del fallback del `ErrorBoundary` y cero excepciones no capturadas |
| Landmark de navegación en todas las rutas | La shell sigue exponiendo su `nav`: `Secciones` en escritorio, `Navegacion principal` en móvil |
| Rutas antiguas | `/#/portfolio` → Cartera, `/#/escenarios` → Simular y una ruta inexistente → Resumen |
| Modo local sin cuenta | Sin Supabase no se ofrece registro ni inicio de sesión, solo la puerta de demostración |
| Barra inferior del móvil | Las cinco secciones de `MOBILE_SECTIONS` abren su pantalla |
| Rail de escritorio | Las ocho secciones abren su pantalla |

Las dos últimas se excluyen mutuamente por viewport con `test.skip(isMobile)`, de ahí que cada ejecución muestre 2 pruebas saltadas: son las que no aplican a ese proyecto.

**Total E2E**: 22 pruebas (11 por proyecto), 20 ejecutadas y 2 saltadas por diseño, en 25 s con 2 workers.

**Corrección durante el desarrollo**: la primera versión asumía que el landmark `Secciones` existía también en móvil. Falla real capturada: el rail queda oculto por CSS y sale del árbol de accesibilidad, así que en móvil el landmark es `Navegacion principal`. Corregido diferenciando por `isMobile`.

## 6 bis-A. Diagnóstico de D10 (cerrada el 2026-08-09)

**Prueba afectada**: `src/pages/ImportarPage.test.tsx > ImportarPage > nada se escribe hasta que se confirma`.

**Alcance de la observación.** D10 se observó **solo en local**. Las ejecuciones remotas con el umbral de 5 s todavía vigente dieron 181/181, así que la inestabilidad nunca llegó a manifestarse en CI: el arreglo es una mitigación demostrada de la máquina de desarrollo, no la corrección de un fallo observado en la puerta.

**Descartado por inspección.** La prueba es **enteramente síncrona**: no tiene `await`, `waitFor`, `userEvent`, temporizadores ni mocks que restaurar. (Esto vale para *esta* prueba; en la suite sí hay un `vi.useFakeTimers()` que `seriesCache.test.ts` restaura dentro del `it` y no en un `afterEach`, de modo que un fallo intermedio lo filtraría a la prueba siguiente. Es un riesgo distinto y anterior, anotado como D11.) `ImportarPage` no contiene `useEffect`, `fetch` ni temporizadores. El único estado compartido es el store, que `beforeEach` reinicia por completo, y la prueba es la primera del archivo, así que no depende del orden. Los avisos de `act(...)` proceden del `.click()` en crudo: son higiene de test, no un cuelgue.

**Reproducción determinista.** La duración de la *misma* prueba, con el *mismo* código y entrada, escala de forma monótona con la carga de CPU:

| Condición | Duración | Resultado |
|---|---:|---|
| Máquina ociosa (4 pasadas) | 148 · 150 · 167 · 190 ms | pasa |
| Máquina con trabajo de fondo | 3903 ms | pasa |
| Carga deliberada, 8 procesos | 4434 ms | pasa |
| **Carga deliberada, 16 procesos** | **7499 ms** | **falla: «Test timed out in 5000ms»** |

**Causa raíz.** No es una carrera: es el **coste único de arranque** que absorbe la primera prueba de un archivo de componente —el primer render de React y la primera pasada por `schema.ts` y `convert.ts`—. La prueba siguiente del mismo archivo hace **estrictamente más trabajo** (valida, confirma la importación y comprueba que no se duplica) y tarda **41-55 ms bajo esa misma carga de 16 procesos**. El coste no está en lo que la prueba comprueba, sino en calentar el módulo. Con la CPU saturada, ese arranque cruza el umbral de 5 s que Vitest trae por defecto para pruebas de lógica pura.

**Corrección**: `testTimeout: 20_000` en el bloque `test` de `vite.config.ts`, con la medición anotada. No se relaja ninguna aserción y un cuelgue real seguiría detectándose, porque nunca terminaría.

**Verificación**: con la **misma carga de 16 procesos** que provocó el fallo, la prueba pasa en 5016 ms y la suite da 181/181. Con el umbral anterior habría vuelto a fallar, porque 5016 ms > 5000 ms.

**Observación no aplicada**: el pool de hilos (`--pool=threads`) recorta la suite de 6,96 s a 4,77 s en reposo. Atenúa la sensibilidad, pero no es la causa y cambia el aislamiento entre archivos, así que se deja fuera de este arreglo.

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
| YAML + permisos + fijación a SHA | Correcto: los 3 workflows parsean, ninguna Action sin fijar a SHA de 40 hex, ningún `pull_request_target` |

**Verificación remota** — rama `lab/fase-0`, commit `91f8df0`, PR draft [#9](https://github.com/IgnacioR04/RiskCalculator/pull/9):

| Ejecución | Resultado |
|---|---|
| CI [`31310321001`](https://github.com/IgnacioR04/RiskCalculator/actions/runs/31310321001) | **success** — `quality` 32 s · `build` 25 s · `e2e-core` 42 s |
| CodeQL [`31310320982`](https://github.com/IgnacioR04/RiskCalculator/actions/runs/31310320982) | **success** |

El encadenado de jobs quedó demostrado en el runner: `e2e-core` arrancó a las 11:15:32, después de que `build` terminara a las 11:15:30; descargó el artefacto `dist` de ese job y ejecutó **10/10 pruebas en 9,3 s con 2 workers**. Es decir, las pruebas end-to-end corrieron sobre el mismo bundle que auditó `build`, y el `workers: 2` de D9 se confirma también fuera de esta máquina.

`deploy-pages.yml` **no se disparó**, como corresponde: su `workflow_run` se resuelve contra `main`.

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
