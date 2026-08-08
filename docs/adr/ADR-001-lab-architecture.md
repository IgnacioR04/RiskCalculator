# ADR-001 — Arquitectura del Laboratorio y límites entre navegador, Supabase y cálculo

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Commit base | `c807281ae33d81dfe075f62a9fca98b88602a6f0` |
| Tarea | `LAB-001` |
| Sustituye a | — |
| Documentos relacionados | [`docs/lab/current-baseline.md`](../lab/current-baseline.md) |

## Contexto

El Laboratorio añade a RiskCalculator dos áreas nuevas —estabilidad de cartera, y
escenarios y oportunidades— sobre una aplicación que hoy es **solo frontend estático**
publicado en GitHub Pages, con Supabase opcional para identidad y persistencia privada.

Los hechos que restringen la decisión están verificados en
[`docs/lab/current-baseline.md`](../lab/current-baseline.md) y son estos:

- GitHub Pages sirve activos estáticos: no ejecuta código de servidor ni guarda secretos.
  Cualquier variable `VITE_*` acaba en el bundle.
- Ya existe una frontera de secretos funcionando: la clave de Twelve Data vive solo en los
  secretos de la Edge Function `market-proxy`, con lista blanca de endpoints, límite por
  usuario y CORS restringido. CI falla si esa clave aparece en `dist/assets/`.
- Ya existe cálculo financiero puro en TypeScript bajo `src/lib/finance/` (volatilidad,
  covarianza, correlación, HHI, contribución al riesgo, estrés, recuperación, XIRR), sin
  React ni red, con `decimal.js`.
- Ya existe RLS en las doce tablas: nueve con políticas `*_own` por `user_id` y tres
  (`brokers`, `price_cache`, `fx_rates`) como caché compartida de solo lectura para
  usuarios autenticados.
- La aplicación funciona con Supabase sin configurar: `getSupabase()` devuelve `null` y el
  store local de Zustand sostiene todo el estado.
- No existe ningún servicio propio, ni Python, ni tareas programadas, ni tablas de runs
  analíticos. Nada de eso está presente hoy.

La pregunta que este ADR cierra es **dónde se ejecuta cada clase de cálculo** y qué se le
permite a cada capa, antes de escribir motores nuevos. Sin esa frontera fijada, el riesgo
inmediato es repetir el patrón de `HistoricalRiskSection.tsx`, donde red, transformación,
cálculo y presentación viven en un mismo archivo de 36 KB.

## Decisión

Se adoptan cinco reglas de frontera.

### 1. El navegador es el motor por defecto

Todo cálculo del Laboratorio se implementa en TypeScript puro, en módulos sin React, sin
`fetch` y sin acceso al store, bajo `src/lib/finance/` o un futuro `src/lib/analytics/`.
Un motor recibe datos ya normalizados y devuelve resultados; no los busca.

El navegador es responsable de: validación de entrada, cálculo reproducible de tamaño
razonable, visualización, caché local de resultados no sensibles, modo demo y manual, y
envío de solicitudes autenticadas. **Nunca** contiene secretos ni lógica de acceso
privilegiado.

### 2. Supabase es la única capa privilegiada

Se le asigna: identidad y autorización, RLS, persistencia privada, proxy hacia proveedores
que exigen clave, materialización y cacheado de datos permitidos, orquestación de
ejecuciones analíticas y auditoría. Se amplía por el camino ya probado por `market-proxy`
—Edge Function con JWT obligatorio, lista blanca y límite de peticiones— y por migraciones
**aditivas** con RLS y pruebas en el mismo cambio. Ninguna migración aplicada se reescribe.

### 3. Un servicio cuantitativo separado es una opción diferida, no una dependencia

Si algún requisito supera lo razonable en TypeScript —optimización convexa, universos
grandes, backtests extensos, librerías numéricas especializadas— se introduce un servicio
aparte. Ese servicio:

- **no** se despliega en GitHub Pages ni dentro de Supabase Edge Functions;
- **no** se asume capaz de ejecutar Python dentro de una Edge Function, porque el runtime es
  Deno y no lo permite;
- se invoca solo a través de una Edge Function que autentica, valida, limita el ritmo y
  usa credenciales de corta vida o un secreto en Vault;
- se decide en la fase que lo necesite (`LAB-603` como límite), no antes.

Hasta esa decisión, ninguna tarea puede apoyarse en la existencia de un servicio Python.
Registrar la alternativa aquí evita que un plan futuro la dé por hecha.

### 4. El modo local sin cuenta es un requisito, no una degradación

Las funciones esenciales —calculadora de recuperación, núcleo educativo y las métricas
calculables con datos demo o manuales— deben seguir funcionando sin proyecto Supabase
configurado. Consecuencias operativas:

- ningún motor del Laboratorio puede requerir red para producir un resultado con datos
  demo o manuales;
- toda función que dependa de Supabase se declara opcional y degrada de forma explícita,
  con estado visible, no con un fallo silencioso;
- las series de mercado no se persisten en `localStorage`; se usa la caché controlada de
  `src/lib/market/seriesCache.ts` o IndexedDB.

Este ADR registra además una discrepancia real con ese requisito: hoy `LoginGate` envuelve
toda la aplicación y ninguna ruta es accesible sin sesión de Supabase o sesión demo con
credenciales (`D3` del baseline). La demo no exige registro, pero sí una puerta. Resolver
esa discrepancia no forma parte de `LAB-001`; queda anotada para la fase de shell y
navegación.

### 5. Cada resultado se etiqueta por naturaleza y procedencia

Hecho, estimación, escenario, señal, sugerencia de investigación y cartera candidata son
categorías distintas y deben distinguirse en el contrato de datos, no solo en el texto de
la interfaz. Todo resultado del Laboratorio lleva `asOf`, origen del dato y versión del
modelo. Un LLM no produce pesos, rentabilidades esperadas ni puntuaciones de riesgo: puede
redactar explicaciones sobre números ya calculados por código determinista.

## Alternativas consideradas

| Alternativa | Por qué se descarta |
|---|---|
| **Todo el cálculo en el navegador, sin backend** | Ya no es viable con datos que exigen clave: la clave quedaría en el bundle. Además impide caché compartida entre usuarios y datos point-in-time. Se conserva sin embargo como modo degradado obligatorio, no como arquitectura única |
| **Todo el cálculo en Supabase Edge Functions** | Rompe el modo local sin cuenta, encarece cada interacción con latencia de red, agota el plan gratuito en cálculos que el navegador hace en milisegundos y hace intratable la iteración de UI |
| **Servicio Python desde el principio** | Introduce un despliegue, un runtime y una superficie de seguridad nuevos antes de saber si hacen falta. Ninguna métrica de las fases de estabilidad lo requiere. Se mantiene como opción explícita y diferida |
| **Python dentro de una Edge Function** | Técnicamente imposible: el runtime es Deno. Se documenta para que ningún plan futuro lo asuma |
| **Migrar el frontend a un framework con servidor (SSR) y abandonar Pages** | Coste alto e injustificado: el producto es una herramienta de cálculo interactiva, no un sitio que necesite SEO ni render de servidor. Rompería el despliegue actual y el modo local |
| **Calcular dentro de los componentes, como `HistoricalRiskSection.tsx`** | Es la deuda que este plan viene a corregir: impide probar fórmulas de forma aislada y acopla una métrica a la red y al estado de la UI |

## Consecuencias

**Positivas**

- Las fórmulas se prueban sin DOM, sin red y sin store, con tolerancias explícitas.
- La superficie con privilegios queda reducida a Supabase, donde ya hay RLS y una Edge
  Function endurecida que sirve de patrón.
- El modo demo sigue siendo un camino de primera clase, lo que mantiene el producto usable
  y demostrable sin infraestructura.
- Añadir un servicio cuantitativo más adelante no obliga a reescribir la interfaz: entra
  detrás de la misma frontera de Edge Function.

**Negativas y costes aceptados**

- Hay que refactorizar `HistoricalRiskSection.tsx` con paridad numérica demostrada antes de
  añadirle métricas, lo que retrasa funcionalidad visible.
- Cálculos pesados quedan limitados por el dispositivo del usuario mientras no exista
  servicio externo.
- Mantener dos caminos —local y sincronizado— duplica los estados de interfaz que hay que
  cubrir: vacío, cargando, parcial, obsoleto, error, sin conexión y demo.
- La caché de datos de mercado en el navegador crece y necesita una política de expiración
  y de tamaño.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un motor nuevo vuelve a mezclar red y cálculo | Revisión de que los módulos de cálculo no importan nada de `src/lib/market/` ni de `src/state/` |
| Una clave privada llega al bundle | La auditoría de `ci.yml` ya falla ante `TWELVE_DATA_API_KEY` en `dist/assets/`; ampliarla si aparecen más secretos |
| Un cambio se despliega sin pasar las puertas de calidad | `deploy-pages.yml` no depende de `ci.yml` hoy (`D2` del baseline); encadenarlos es trabajo de `LAB-003` |
| Se asume infraestructura inexistente (cron, runs, servicio quant) | El baseline enumera lo que existe; toda tarea debe citarlo antes de apoyarse en una pieza |
| El límite de la Edge Function se cree compartido entre instancias | El cupo de `market-proxy` vive en memoria del proceso; si hace falta un límite real, ha de moverse a la base de datos |
| El refactor cambia números sin que nadie lo note | Fixtures dorados (`LAB-002`) antes de tocar `HistoricalRiskSection.tsx` |

## Criterio de revisión

Este ADR se revisa si ocurre cualquiera de estas cosas:

- un cálculo del Laboratorio tarda más de dos segundos en un portátil de gama media con
  una cartera de tamaño realista;
- se necesita optimización convexa o un universo que el navegador no pueda sostener
  (disparador de la decisión de `LAB-603`);
- se contrata un proveedor de datos cuya licencia prohíba el cacheado que asume la
  frontera de Supabase;
- se decide exigir cuenta para funciones esenciales, lo que invalidaría la regla 4;
- GitHub Pages deja de ser el destino principal de despliegue.
