# Registro de decisiones

Formato: fecha — decisión — quién — motivo/notas. Las suposiciones reversibles
se marcan como `[SUPOSICIÓN]` y pueden revertirse sin coste alto.

## Decisiones del propietario (2026-07-24)

- **Comisiones opcionales y configurables por bróker.** La decisión anterior
  de ignorarlas quedó sustituida por la petición del propietario del mismo
  día. La app ofrece catálogo orientativo, regla personalizada o comisión
  manual; cada estimación debe poder revisarse. Las comisiones forman parte
  del coste, de las ventas netas y de las métricas de rentabilidad.
- **Arquitectura confirmada:** React + TypeScript + Vite, Supabase
  (Auth/PostgreSQL/Edge Functions), Vercel.
- **Proveedor de mercado:** Twelve Data como principal (clave gratuita
  aportada por el propietario), CoinGecko de respaldo cripto sin clave, BCE
  para cambios EUR diarios, entrada manual como último recurso.
- **Repositorio:** `IgnacioR04/RiskCalculator`. Los despliegues o cambios en
  servicios externos requieren las credenciales correspondientes.
- **Interpretación principal de «recuperar»:** restaurar el valor inicial de
  referencia (experiencia principal), siempre diferenciada del punto de
  equilibrio económico real. Definida en la especificación original.

## Suposiciones registradas (reversibles)

- `[SUPOSICIÓN]` 2026-07-24 — **Zustand + persistencia localStorage** para el
  estado del portfolio en fases 1–4; al llegar la Fase 5, Supabase pasa a ser
  la fuente de verdad para usuarios autenticados y el modo local queda como
  «modo invitado/demo». Motivo: permite entregar valor sin bloquear por
  credenciales.
- `[SUPOSICIÓN]` 2026-07-24 — **Recharts** como librería de gráficas (mantenida,
  ligera, declarativa). TradingView Lightweight Charts queda como opción si se
  necesitan velas; no se usa como fuente de cotizaciones.
- `[SUPOSICIÓN]` 2026-07-24 — **Método de coste medio** para ventas parciales
  (average cost). Es el criterio más común para inversores particulares en
  Europa. FIFO podría añadirse después; la tabla `transactions` conserva
  cada lote, así que el cambio es de cálculo, no de datos.
- `[SUPOSICIÓN]` 2026-07-24 — Redondeo de presentación a 2 decimales para
  importes fiat y hasta 8 para cantidades cripto; los cálculos internos usan
  decimal.js con 28 dígitos significativos, sin redondeos intermedios.
- `[SUPOSICIÓN]` 2026-07-24 — Tasa libre de riesgo por defecto 0 % (declarada
  en la UI de métricas); configurable en ajustes.
- `[SUPOSICIÓN]` 2026-07-24 — Email y contraseña de Supabase como acceso real;
  el login `admin1 / 1234` se mantiene únicamente como puerta de demo pública.
- `[SUPOSICIÓN]` 2026-07-24 — Los datos demo usan símbolos reales (BTC, ETF
  UCITS del S&P 500, oro) con precios ficticios claramente etiquetados como
  demo, para que la app funcione sin claves.

- `[SUPOSICIÓN]` 2026-07-24 — **Frankfurter como mecanismo de acceso a los
  tipos BCE** desde el navegador (el XML oficial del BCE no permite CORS).
  Reversible: con el proxy de servidor desplegado puede pasarse al feed
  oficial. Ver DATA_SOURCES.md.

## Decisiones técnicas

- 2026-07-24 — Toda la lógica financiera vive en `src/lib/finance/` como
  funciones puras sin dependencias de UI; los componentes solo formatean.
- 2026-07-24 — Los importes se modelan con `decimal.js`; nunca aritmética
  binaria de `number` para dinero. En los límites (UI, JSON, BD) se
  serializa como string.
- 2026-07-24 — Las posiciones se **derivan** siempre del registro de
  transacciones; no existe tabla editable de holdings como fuente de verdad.
- 2026-07-24 — Una posición importada sin coste conocido conserva unidades y
  valor mediante `cost_known=false`; las métricas financieras dependientes se
  bloquean hasta completar el coste.
- 2026-07-24 — Las métricas históricas convierten cada serie a la divisa de
  presentación antes de calcular retornos. Nunca se compara silenciosamente
  una serie USD con otra EUR.
- 2026-07-24 — El importador JSON valida con Zod, ignora y reporta campos
  desconocidos, nunca acepta `user_id`, SQL ni nada ejecutable, y no persiste
  hasta confirmación explícita.
