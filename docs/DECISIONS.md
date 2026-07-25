# Registro de decisiones

Formato: fecha — decisión — quién — motivo/notas. Las suposiciones reversibles
se marcan como `[SUPOSICIÓN]` y pueden revertirse sin coste alto.

## Decisiones del propietario (2026-07-24)

- **Comisiones: se ignoran en el MVP.** El propietario eligió la opción (a)
  entre ignorar / manual / estimación opcional por bróker. El modelo de datos
  de `transactions` conserva los campos `fee`/`fee_currency` (nullable) para
  poder añadirlas después sin migración destructiva, pero ningún cálculo las
  usa y la UI no las muestra.
- **Arquitectura confirmada:** React + TypeScript + Vite, Supabase
  (Auth/PostgreSQL/Edge Functions), Vercel.
- **Proveedor de mercado:** Twelve Data como principal (clave gratuita
  aportada por el propietario), CoinGecko de respaldo cripto sin clave, BCE
  para cambios EUR diarios, entrada manual como último recurso.
- **Accesos:** autorizado push a GitHub (IgnacioR04/RiskCalculator),
  proyecto Supabase y despliegue en Vercel («acceso a lo que precises»).
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
- `[SUPOSICIÓN]` 2026-07-24 — Magic link por email como único método de login
  (indicado como preferencia en la especificación salvo instrucción contraria).
- `[SUPOSICIÓN]` 2026-07-24 — Los datos demo usan símbolos reales (BTC, ETF
  UCITS del S&P 500, oro) con precios ficticios claramente etiquetados como
  demo, para que la app funcione sin claves.

- `[SUPOSICIÓN]` 2026-07-24 — **Frankfurter como mecanismo de acceso a los
  tipos BCE** desde el navegador (el XML oficial del BCE no permite CORS).
  Reversible: con el proxy de servidor desplegado puede pasarse al feed
  oficial. Ver DATA_SOURCES.md.

## Rediseño visual (handoff «banca privada oscura», 2026-07-25)

Origen: `design_handoff_riskcalculator/` (README.md, SCREENS.md,
IMPLEMENTATION.md, tokens.css y los prototipos `.dc.html`). Rama
`feat/rediseno-visual`. **La lógica financiera no cambia**: es un rediseño de
presentación (tokens, componentes, layout, estados, copy y jerarquía).

- **`tokens.css` es la única fuente de verdad del color.** Se pegó tal cual del
  handoff y `global.css` se reescribió entero para consumir `var(--…)`. Se
  verifica que no queda ningún hexadecimal fuera de ese fichero, gráficas
  incluidas.
- **Tipografía**: cifras en `Source Serif 4` 600 con `tabular-nums`, interfaz
  en `Archivo`, `IBM Plex Mono` para unidades y números de sección. Se cargan
  de Google Fonts desde `index.html`; autoalojarlas queda pendiente.
- **Ocho secciones numeradas** (01–08) con rail de 58 px en escritorio y
  navegación inferior de 5 iconos en móvil. Las rutas antiguas
  (`/portfolio`, `/escenarios`) redirigen a las nuevas (`/cartera`,
  `/simular`) para no romper enlaces guardados.
- `[DISCREPANCIA]` **`github.md` del paquete contradice a `tokens.css`**: menciona
  `Instrument Serif` y otra paleta (#c9a862 / #6f9ac0 / #b05264). Corresponde a
  una sincronización anterior (historial del 24–25 de julio). Se ha implementado
  lo que dicen `tokens.css` + `README.md`, que el propio handoff marca como
  «alta fidelidad» y «tokens listos para pegar». Si la referencia buena fuera la
  otra, basta cambiar `src/styles/tokens.css`.
- `[SUPOSICIÓN]` **No se dibuja el valor de mercado histórico de la cartera.**
  El prototipo muestra una curva de 12 meses con datos demo; reconstruirla de
  verdad exige series históricas de precios de todos los activos, que el piloto
  no descarga. En su lugar se grafica el **capital aportado acumulado** (dato
  real derivado de las operaciones) con los puntos de cada aportación, y se
  explica la diferencia bajo la gráfica. Regla aplicada: antes «no disponible»
  que un número inventado.
- `[SUPOSICIÓN]` Las pantallas que el handoff describe pero cuyo cálculo no
  existe se entregan con **estado vacío explicativo**, no simuladas:
  Rebalanceo (06), Solapamientos ETF/acción (05) y la contribución al riesgo
  por volatilidad (04). Cada una dice qué falta para poder calcularla.
- Las métricas que dependen de series históricas (volatilidad, drawdown,
  Sharpe, Sortino, beta, correlaciones) siguen viviendo tras una descarga
  explícita en «Riesgo → Histórico y correlaciones»; en el resumen aparecen
  como «No disponible» hasta entonces.

## Decisiones técnicas

- 2026-07-24 — Toda la lógica financiera vive en `src/lib/finance/` como
  funciones puras sin dependencias de UI; los componentes solo formatean.
- 2026-07-24 — Los importes se modelan con `decimal.js`; nunca aritmética
  binaria de `number` para dinero. En los límites (UI, JSON, BD) se
  serializa como string.
- 2026-07-24 — Las posiciones se **derivan** siempre del registro de
  transacciones; no existe tabla editable de holdings como fuente de verdad.
- 2026-07-24 — El importador JSON valida con Zod, ignora y reporta campos
  desconocidos, nunca acepta `user_id`, SQL ni nada ejecutable, y no persiste
  hasta confirmación explícita.
