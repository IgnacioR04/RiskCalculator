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
| 3 | BCE (exchange rates, feed diario) | EUR ↔ USD y otras | No | Cambios EUR de referencia, diarios (~16:00 CET) |
| 4 | Datos demo (`demoProvider`) | Conjunto fijo ficticio | No | Funcionamiento sin claves; siempre etiquetado «demo» |
| 5 | Entrada manual | Todo | No | Respaldo universal; el usuario teclea el precio |

Notas y limitaciones conocidas:

- **Twelve Data plan gratuito**: límites de peticiones/minuto y /día;
  intradía limitado según plan. El adaptador respeta rate limit por usuario y
  cachea. Si el plan no permite intradía, la estimación histórica usa cierre
  diario y muestra el rango mín–máx del día (regla de la especificación).
- **CoinGecko público**: sin clave, límites estrictos (~10-30 req/min);
  solo respaldo. Datos diarios; sin precisión horaria garantizada.
- **BCE**: un cambio por día hábil; es el cambio de referencia, no un precio
  ejecutable. Para valoración intradía se etiqueta como «estimado (BCE
  diario)».
- **Índices**: se pueden consultar como referencia/benchmark; la UI aclara
  que un índice no es directamente invertible y ofrece elegir el instrumento
  real (ETF/fondo) al registrar posiciones.
- Sin scraping ni endpoints no oficiales.

## Política de resiliencia

Implementado en la capa `MarketDataProvider`:

- Proxy de servidor (Edge Function `market-proxy`) para claves.
- Caché de cotizaciones y OHLC (`price_cache`) y de FX (`fx_rates`).
- Caché negativa para símbolos no encontrados.
- Deduplicación de solicitudes concurrentes idénticas.
- Timeout y reintentos limitados (máx. 2, backoff).
- Rate limiting por usuario en el proxy.
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
