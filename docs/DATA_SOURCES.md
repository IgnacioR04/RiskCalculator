# Fuentes de datos de mercado

Toda la lógica de datos pasa por la abstracción `MarketDataProvider`
(`src/lib/market/provider.ts`). Ningún componente de UI llama a un proveedor
directamente. Ninguna clave vive en el navegador: las llamadas con clave se
hacen desde Supabase Edge Functions (proxy) — ver «Seguridad».

## Cadena de proveedores

| Prioridad | Proveedor | Cobertura | Clave | Uso |
|---|---|---|---|---|
| 1 | Twelve Data | Acciones, ETF, forex, cripto, índices | Sí (env `TWELVE_DATA_API_KEY`, solo servidor) | Cotización, OHLC diario e intradía, búsqueda |
| 2 | CoinGecko (API pública) | Criptoactivos | No (rate limit bajo) | Respaldo cripto: precio actual y OHLC diario |
| 3 | BCE vía Frankfurter (`api.frankfurter.dev`) | EUR ↔ USD | No | Cambios EUR de referencia del BCE, diarios (~16:00 CET) |
| 4 | Datos demo (`demoProvider`) | Conjunto fijo ficticio | No | Funcionamiento sin claves; siempre etiquetado «demo» |
| 5 | Entrada manual | Todo | No | Respaldo universal; el usuario teclea el precio |

Notas y limitaciones conocidas:

- **Twelve Data plan gratuito**: límites de peticiones/minuto y /día;
  intradía limitado según plan. El adaptador respeta rate limit por usuario y
  cachea. Requiere una sesión Supabase válida: el navegador envía el JWT del
  usuario y la Edge Function mantiene la clave privada. Si el plan no permite intradía, la estimación histórica usa cierre
  diario y muestra el rango mín–máx del día (regla de la especificación).
- **CoinGecko público**: sin clave, límites estrictos (~10-30 req/min);
  solo respaldo. Datos diarios; sin precisión horaria garantizada.
- **BCE**: un cambio por día hábil; es el cambio de referencia, no un precio
  ejecutable. Para valoración intradía se etiqueta como «estimado (BCE
  diario)». **Mecanismo de acceso:** el feed XML oficial del BCE no envía
  cabeceras CORS y no puede consultarse desde el navegador; se usa
  Frankfurter (`api.frankfurter.dev`), API abierta y mantenida que republica
  exactamente los tipos de referencia del BCE. No es scraping ni un endpoint
  no oficial encubierto: es un servicio público documentado. Si se despliega
  el proxy de servidor, puede sustituirse por el feed oficial del BCE
  directamente (decisión reversible, registrada en DECISIONS.md).
- **Índices**: se pueden consultar como referencia/benchmark; la UI aclara
  que un índice no es directamente invertible y ofrece elegir el instrumento
  real (ETF/fondo) al registrar posiciones.
- **Datos demo**: la cartera de demostración es completamente ficticia y
  reproducible. Su valoración actual redondea a 23.049,26 € y se compone de
  BTC, SXR8, VWCE, oro y efectivo EUR. Las cotizaciones y el cambio EUR/USD
  están fijados en `src/state/demoData.ts`.
- **Históricos sintéticos demo**: `src/state/demoHistory.ts` genera series
  deterministas para BTC, SXR8, VWCE y oro. Se usan solo cuando `isDemo` es
  `true`, se etiquetan como «Demo sintetico» en la UI y permiten probar
  volatilidad, covarianza, correlación, drawdown, Sharpe/Sortino, beta/alpha y
  contribución al riesgo sin red ni claves. No se mezclan con proveedores
  reales ni se presentan como datos de mercado observados.
- Sin scraping ni endpoints no oficiales.
- GitHub Pages no puede guardar una clave privada. Por eso las acciones y ETF
  en vivo se activan al desplegar `market-proxy`; hasta entonces la entrada
  manual sigue disponible.

## Política de resiliencia

Implementado en la capa `MarketDataProvider`:

- Proxy de servidor (Edge Function `market-proxy`) para claves.
- Caché de cotizaciones y OHLC (`price_cache`) y de FX (`fx_rates`).
- Caché negativa para símbolos no encontrados.
- Deduplicación de solicitudes concurrentes idénticas.
- Timeout y reintentos limitados (máx. 2, backoff).
- JWT obligatorio y rate limiting por usuario en el proxy.
- Estados de carga y error en UI; indicador «actualizado a las …» y etiqueta
  real / demorado / estimado / demo / manual en cada dato.
- Si una cotización no llega casi instantáneamente, la UI permite continuar
  con entrada manual. Un fallo del proveedor **nunca** bloquea la creación
  del portfolio.

## Interfaz mínima

```ts
interface MarketDataProvider {
  searchAssets(query): Promise<AssetMatch[]>
  resolveAsset(identifier): Promise<AssetMatch | null>
  getQuote(asset): Promise<Quote>            // última cotización + timestamp + calidad
  getDailyOHLC(asset, range): Promise<Candle[]>
  getIntradayOHLC?(asset, range): Promise<Candle[]>  // si el plan lo permite
  getFxRate(base, quote, date?): Promise<FxRate>
}
```

Cada respuesta informa `provider`, `timestamp`, `delaySeconds` (si se conoce)
y `quality: 'real' | 'delayed' | 'estimated' | 'demo' | 'manual'`.

## Estimación histórica de operaciones

- Si existe precio histórico intradía → punto temporal más cercano.
- Si solo hay datos diarios → cierre diario como estimación principal +
  rango mín–máx del día; **no se inventa precisión horaria**.
- Todo resultado estimado se etiqueta `source_type: 'historical_estimate'`
  con `confidence` y `estimation_notes` (fuente e instante consultado).
- Si los datos del usuario son incompatibles entre sí (p. ej. importe,
  unidades y precio que no cuadran), la UI muestra la discrepancia y pide
  elegir cuál prevalece.

## Seguridad

- `TWELVE_DATA_API_KEY` solo en variables de entorno del servidor (Supabase
  Edge Functions / Vercel env). Jamás en el bundle ni en Git.
- `.env.example` documenta las variables sin valores.
- El frontend solo conoce la URL del proxy y la anon key de Supabase (pública
  por diseño, protegida por RLS).
- CORS se limita a los orígenes configurados en `ALLOWED_ORIGINS`.
