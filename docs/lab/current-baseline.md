# Baseline real del repositorio antes del Laboratorio

> Tarea `LAB-001` del backlog del Laboratorio. Este documento registra **lo que el
> repositorio contiene hoy**, verificado leyendo el código, no lo que el plan
> propone construir. Cuando el plan y el código discrepan, se anota la
> discrepancia en la sección 10 sin resolverla.

| Campo | Valor |
|---|---|
| Commit base | `c807281ae33d81dfe075f62a9fca98b88602a6f0` |
| Rama | `main`, sincronizada con `origin/main` (0 adelante / 0 atrás) |
| Fecha de la auditoría | 2026-08-08 |
| Árbol de trabajo | `.claude/launch.json` modificado, ajeno a esta tarea |

## 1. Versiones reales

Desde [`package.json`](../../package.json). El proyecto es privado, versión `0.1.0`, ESM (`"type": "module"`).

| Dependencia de producción | Rango |
|---|---|
| `react` / `react-dom` | `^19.0.0` |
| `react-router-dom` | `^7.18.1` |
| `zustand` | `^5.0.0` |
| `zod` | `^3.25.0` |
| `recharts` | `^3.0.0` |
| `decimal.js` | `^10.4.3` |
| `@supabase/supabase-js` | `^2.49.0` |

| Herramienta | Rango |
|---|---|
| `typescript` | `~5.7.2` |
| `vite` | `^6.0.0` |
| `vitest` | `^3.0.0` |
| `@playwright/test` | `^1.61.1` |
| `eslint` / `typescript-eslint` | `^10.8.0` / `^8.18.0` |
| Node en CI | 22 |

No hay dependencias de optimización numérica, ni Python, ni servicio backend propio.

## 2. Scripts disponibles

| Script | Comando real |
|---|---|
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:e2e` | `playwright test` |
| `typecheck` | `tsc -b` |
| `lint` | `eslint src` |

No existe script de cobertura ni de pruebas de base de datos. `npm test` ya ejecuta en
modo no interactivo; `npm test -- --run` funciona pero el flag es redundante.

## 3. Rutas y navegación

El router es **`HashRouter`**, elegido para servir igual en local, Vercel y el subpath
`/RiskCalculator/` de GitHub Pages sin reescrituras de servidor
([`src/main.tsx`](../../src/main.tsx)). El árbol de rutas vive en
[`src/App.tsx`](../../src/App.tsx) y cada página se carga de forma diferida con
`lazyWithReload` ([`src/lib/lazyChunk.ts`](../../src/lib/lazyChunk.ts)), que recarga una
vez cuando GitHub Pages sirve un `index.html` cacheado que pide chunks inexistentes.

| Nº | Ruta | Componente |
|---:|---|---|
| 01 | `/resumen` | `ResumenPage` |
| 02 | `/calculadora` | `CalculadoraPage` |
| 03 | `/cartera` | `PortfolioPage` |
| 04 | `/riesgo` | `RiesgoPage` |
| 05 | `/diversificacion` | `DiversificacionPage` |
| 06 | `/simular` | `SimularPage` |
| 07 | `/importar` | `ImportarPage` |
| 08 | `/perfil` | `PerfilPage` |

Compatibilidad ya existente: `/` → `/resumen`, `/portfolio` → `/cartera`,
`/escenarios` → `/simular`, y cualquier ruta desconocida → `/resumen`, todas con
`replace`. La numeración 01–08 no es decorativa: está codificada en
[`src/components/shell/sections.ts`](../../src/components/shell/sections.ts), que
también define las cinco secciones de la navegación móvil
(`/resumen`, `/calculadora`, `/cartera`, `/riesgo`, `/perfil`).

## 4. Estado y persistencia

Un único store de Zustand en [`src/state/store.ts`](../../src/state/store.ts):

- `STORE_VERSION = 2`, persistido en `localStorage` vía `persist` + `createJSONStorage`.
- Dos espacios de nombres de caché: `riskcalculator-v1:guest` y
  `riskcalculator-v1:user:<id>`, conmutados al iniciar o cerrar sesión.
- `skipHydration: true`; la hidratación la controla el flujo de acceso.
- Colecciones persistidas: `settings`, `accounts`, `assets`, `transactions`, `quotes`,
  `fxRates`, `scenarios`, `importBatches`, `riskProfile`, `riskResults`, `demoLoaded`.
- Las **posiciones no se persisten**: se derivan siempre de `transactions`.
- `cloudSync` es estado de sesión y queda deliberadamente fuera de la persistencia.
- El migrador `migratePersistedState` no transforma esquemas: si la versión guardada es
  mayor que la actual devuelve el estado tal cual, y en el resto de casos solo refresca
  las colecciones de demostración. **No hay migraciones de datos escritas todavía.**

Las series históricas de mercado no van al store: tienen su propia caché diaria en
[`src/lib/market/seriesCache.ts`](../../src/lib/market/seriesCache.ts).

## 5. Cálculos existentes y sus módulos

Todo el cálculo financiero es TypeScript puro bajo
[`src/lib/finance/`](../../src/lib/finance), sin React ni red, con `decimal.js` para las
magnitudes monetarias.

| Módulo | Funciones exportadas |
|---|---|
| `historical.ts` | `dailyReturns`, `alignReturns`, `annualizedVolatility`, `downsideVolatility`, `maxDrawdown`, `sharpeRatio`, `sortinoRatio`, `correlation`, `betaAlpha`; constante `MIN_OBSERVATIONS = 30` |
| `portfolioRisk.ts` | `alignManyReturns`, `sampleCovariance`, `covarianceMatrix`, `portfolioRisk`, `timeWeightedReturn`, `tradingDaysForAsset`, `tradingDaysForPortfolio` |
| `diversification.ts` | `diversificationMetrics`, `describeDiversification` |
| `metrics.ts` | `weights`, `concentration` (HHI), `simpleReturn` |
| `stress.ts` + `stressPresets.ts` | `applyStress`, `contributionImpact`; catálogo `STRESS_PRESETS` |
| `recovery.ts` | `growthFromPrices`, `restoreValueContribution`, `requiredGrowthToRestore`, `breakevenContribution`, `breakevenFromValues`, `targetPriceWithBudget`, `outcomeAtPrice` |
| `position.ts` | `aggregatePosition`, `unrealizedPnl` |
| `xirr.ts` | `xirr` |
| `decimal.ts` | `dec` (envoltorio de `decimal.js`) |

Fuera de `finance/` pero con lógica de dominio relevante:
[`src/lib/portfolio.ts`](../../src/lib/portfolio.ts) (`buildPortfolioView`, agregación de
la cartera), [`src/lib/fx.ts`](../../src/lib/fx.ts) (conversión de divisa),
[`src/lib/brokerFees.ts`](../../src/lib/brokerFees.ts) y
[`src/lib/domain.ts`](../../src/lib/domain.ts) (entidades y tipos).

Cada uno de los ocho módulos de `finance/` tiene su fichero `.test.ts` adyacente.

## 6. Refactor con paridad obligatoria: `HistoricalRiskSection.tsx`

[`src/components/analytics/HistoricalRiskSection.tsx`](../../src/components/analytics/HistoricalRiskSection.tsx)
son 36 KB en un solo componente y concentra cuatro responsabilidades:

1. **Red**: importa `twelveDataProvider` y `coingeckoProvider` directamente, además de
   `historicalFxSeries`, y descarga series dentro de un `useEffect` con `busy`/`missing`
   como estado local.
2. **Transformación**: `convertPriceSeries`, `convertDemoPriceSeries`, `rateAt`,
   `transactionCashFlow`, `quantityOn`.
3. **Cálculo**: `calculatePortfolioTwr` vive en el componente, no en `src/lib/finance/`.
4. **Presentación**: periodo (`90|180|365`), tres vistas (`relaciones|activos|contribucion`),
   dos tipos de matriz (`correlacion|covarianza`), `RiskMatrix`, `RiskContributionChart`.

Se consume desde [`src/pages/RiesgoPage.tsx:220`](../../src/pages/RiesgoPage.tsx) en la
pestaña `historico`. **Cualquier extracción posterior debe demostrar paridad numérica
antes de añadir métricas nuevas**, y `calculatePortfolioTwr` es el primer candidato a
mover a un módulo puro con pruebas propias.

## 7. Datos de mercado

Proveedor abstracto en [`src/lib/market/provider.ts`](../../src/lib/market/provider.ts),
orquestado por [`src/lib/market/service.ts`](../../src/lib/market/service.ts)
(`refreshQuote`, `refreshAllQuotes`, `refreshFx`, `searchAssets`,
`historicalDailyPrice`, `getQuoteForMatch`, `providerStatus`, `historicalFxSeries`).

| Fuente | Módulo | Cómo accede |
|---|---|---|
| Twelve Data | `twelvedata.ts` | Solo a través de la Edge Function `market-proxy`; la clave nunca llega al navegador |
| CoinGecko | `coingecko.ts` | Directo, endpoint público |
| BCE / Frankfurter | `ecb.ts` | Directo, tipos de cambio diarios |
| Demo | `src/state/demoData.ts`, `src/state/demoHistory.ts` | Datos locales marcados con `quality: 'demo'` / `isDemo` |
| Entrada manual | flujo de importación en `src/lib/import/` | Sin red |

Control de ritmo y caché en `seriesCache.ts`: `colaTwelveData` a 8 s entre peticiones,
`colaCoinGecko` a 1,5 s, más caché diaria de series.

## 8. Supabase

Cuatro migraciones aplicadas en [`supabase/migrations/`](../../supabase/migrations), que
**no deben modificarse**; todo cambio futuro es aditivo:

| Migración | Aporta |
|---|---|
| `20260724120000_initial.sql` | Tablas `profiles`, `risk_profiles`, `brokers`, `broker_accounts`, `assets`, `transactions`, `scenarios`, `import_batches`, `price_cache`, `fx_rates`; RLS y políticas por tabla; trigger `on_auth_user_created` |
| `20260724180000_portfolio_integrity.sql` | Restricciones de integridad y `validate_transaction_ownership()` con su trigger |
| `20260726170000_auth_data_hardening.sql` | `preferences` y `risk_results`; reafirma RLS en las doce tablas; reescribe políticas; `set_updated_at()` y triggers `*_set_updated_at`; endurece `handle_new_user()` |
| `20260726172000_foreign_key_indexes.sql` | Índices sobre claves ajenas |

Patrón de autorización: datos privados con políticas `*_own` por `user_id`
(select/insert/update/delete), y cachés compartidas `brokers`, `price_cache`, `fx_rates`
como **solo lectura para autenticados**. Verificación en
[`supabase/tests/rls_verification.sql`](../../supabase/tests/rls_verification.sql), que es
SQL de comprobación manual: **no hay pgTAP ni ejecución de estas pruebas en CI**.

Una sola Edge Function,
[`supabase/functions/market-proxy/index.ts`](../../supabase/functions/market-proxy/index.ts):
exige `Authorization: Bearer`, lista blanca de cuatro endpoints
(`symbol_search`, `quote`, `time_series`, `exchange_rate`) con parámetros permitidos por
endpoint, límite de 30 peticiones/minuto por `sub` del JWT o IP, `outputsize` acotado a
1–5000, intervalos restringidos, timeout de 9 s, CORS contra `ALLOWED_ORIGINS` y
`cache-control: public, max-age=60`. El cupo vive en memoria del proceso, de modo que
**no es un límite compartido entre instancias**.

No existen `pg_cron`, `pg_net`, tareas programadas, tablas de runs analíticos ni tablas de
auditoría. El plan las describe como objetivo, no como algo presente.

## 9. Frontera de secretos y despliegue

`import.meta.env.VITE_*` es público por definición. Según
[`.env.example`](../../.env.example), el bundle contiene `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (protegidos por RLS, públicos por diseño) y
`VITE_DEMO_USER` / `VITE_DEMO_PASSWORD`, documentados explícitamente como
**no secretos**. `TWELVE_DATA_API_KEY` y `ALLOWED_ORIGINS` son solo de servidor y
nunca llevan prefijo `VITE_`.

El cliente Supabase ([`src/lib/supabase.ts`](../../src/lib/supabase.ts)) devuelve `null`
si falta configuración, y en ese caso la aplicación funciona íntegramente en modo local.

Tres workflows en [`.github/workflows/`](../../.github/workflows):

- **`ci.yml`** — en `push: main` y en cada `pull_request`: `npm ci`, lint, `tsc -b`,
  `npm test`, Chromium, `npm run test:e2e`, `npm run build` y una auditoría que falla si
  `TWELVE_DATA_API_KEY` aparece en `dist/assets/`. `permissions: contents: read`.
- **`deploy-pages.yml`** — en `push: main` y `workflow_dispatch`: build con
  `DEPLOY_TARGET=gh-pages` (base `/RiskCalculator/`) inyectando los secretos
  `VITE_SUPABASE_*`, y publicación con `actions/deploy-pages@v4`. Concurrencia `pages`
  sin cancelación.
- **`codeql.yml`** — análisis estático de JavaScript y TypeScript con `github/codeql-action@v3`,
  en `push: main`, en cada `pull_request` y semanalmente (`cron: 24 4 * * 1`).

Dependabot está configurado y hay una rama abierta
`dependabot/npm_and_yarn/frontend-2ac24d2358` en el remoto.

## 10. Discrepancias entre el plan y el código

Se registran, no se corrigen en esta tarea.

| # | Discrepancia | Consecuencia |
|---|---|---|
| D1 | ~~El paquete del plan estaba fuera de `docs/`~~ **Resuelta el 2026-08-08** | El plan vive en `docs/laboratorio-plan/` con `phases/`, y la copia antigua se ha eliminado. Sigue sin commitear, como todo el trabajo del Laboratorio |
| D2 | `ci.yml` **ya existe** con todas las puertas que LAB-003 pide crear. Lo que falta es que **`deploy-pages.yml` no dependa de CI**: ambos disparan en `push: main` de forma independiente | LAB-003 debe reformularse: no es «crear `ci.yml`», es «encadenar el despliegue a CI». Hoy una regresión puede publicarse mientras CI está fallando |
| D3 | `LoginGate` envuelve toda la aplicación en `main.tsx`. Sin sesión de Supabase ni sesión demo, `allowed` es `false` y solo se muestra la pantalla de acceso. Lo confirma la propia suite E2E: sus cinco casos empiezan por `enterDemo()`, que rellena `admin1`/`1234` antes de poder navegar | El plan afirma que «la calculadora de recuperación y el núcleo educativo siguen funcionando sin cuenta». Es cierto que la demo no exige **registro**, pero sí credenciales (públicas en el bundle). Ninguna ruta es accesible sin pasar la puerta |
| D4 | Existe un segundo destino de despliegue: `vercel.json` y la bifurcación `DEPLOY_TARGET` en `vite.config.ts` | El plan solo describe GitHub Pages. Cualquier cambio de `base`, rutas o variables debe validarse en los dos destinos |
| D5 | El plan cita «React Router» sin precisar que es `HashRouter` y que ya existen redirecciones legacy | La estrategia de migración de navegación debe partir de URLs con `#` y del mecanismo de compatibilidad ya implementado, no diseñar uno nuevo |
| D6 | El plan menciona `pgTAP`/pruebas de RLS en CI; solo existe `rls_verification.sql` como script manual | La puerta de seguridad no está automatizada. Ninguna tarea puede declarar RLS «verificada en CI» hoy |

Confirmadas como **exactas** dos afirmaciones del plan (§2.2): la concentración de
responsabilidades en `HistoricalRiskSection.tsx` y el store único de Zustand que abarca
casi todo el dominio.

## 11. Estado de verificación en el commit base

| Comprobación | Comando | Resultado |
|---|---|---|
| Lint | `npm run lint` | Correcto, sin avisos |
| Tipos | `npx tsc -b` | Correcto, sin errores |
| Pruebas unitarias | `npx vitest run` | 153 de 154 correctas en 20 ficheros; 1 inestable (ver abajo) |
| Build | `npm run build` | Correcto en 18,13 s |
| E2E | `npx playwright test` | 10 de 10 correctas en 1,1 min (5 casos × 2 proyectos) |

Hay 20 ficheros de prueba unitaria bajo `src/` y una única especificación end-to-end,
[`e2e/core-flows.spec.ts`](../../e2e/core-flows.spec.ts), ejecutada en dos proyectos de
Playwright: `chromium` (Desktop Chrome) y `mobile` (Pixel 5), contra
`http://127.0.0.1:4173` levantado con `npm run dev`.

### Prueba inestable detectada en el commit base

`src/pages/ImportarPage.test.tsx > ImportarPage > nada se escribe hasta que se confirma`
**agota el timeout por defecto de 5 s** cuando se ejecuta la suite completa (tardó
5366 ms), pero **pasa en 169 ms al ejecutarse aislada**. No es un fallo determinista: es
inestabilidad bajo carga, con la suite entera consumiendo 99 s de tiempo de entorno jsdom.

Consecuencia para la puerta G0: «las pruebas unitarias pasan en CI» no se cumple de forma
fiable hoy. Estabilizar esa prueba —subiendo su timeout o eliminando la espera real que la
hace lenta— es trabajo de `LAB-002` o `LAB-007`, no de `LAB-001`, que excluye modificar
código.

## 12. Tamaño del bundle en el commit base

Salida real de `npm run build` (sin `DEPLOY_TARGET`), útil como punto de partida del
presupuesto de bundle de `LAB-008`:

| Chunk | Tamaño | Gzip |
|---|---:|---:|
| `assets/chartTheme-*.js` (Recharts) | 315,76 kB | 95,67 kB |
| `assets/index-*.js` (entrada) | 274,83 kB | 87,06 kB |
| `assets/ImportarPage-*.js` | 84,97 kB | 23,38 kB |
| `assets/RiesgoPage-*.js` | 55,91 kB | 18,70 kB |
| `assets/CalculadoraPage-*.js` | 49,27 kB | 14,20 kB |
| `assets/CartesianChart-*.js` | 36,49 kB | 10,26 kB |
| `assets/decimal-*.js` | 32,38 kB | 13,06 kB |
| `assets/PortfolioPage-*.js` | 31,94 kB | 9,74 kB |
| `assets/index-*.css` | 46,31 kB | 9,06 kB |

El resto de chunks queda por debajo de 21 kB. La división por rutas ya funciona: las ocho
páginas son chunks independientes. Los dos pesos dominantes son la librería de gráficos y
el chunk de entrada.
