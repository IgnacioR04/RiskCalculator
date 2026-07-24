# RiskCalculator

Calculadora y gestor de inversiones para inversores particulares (MVP web,
interfaz en español). Su núcleo responde a la pregunta que casi ninguna app
responde bien: **si mi activo ha bajado, ¿cuánto necesito aportar para
recuperarme — y qué significa exactamente «recuperarme»?**

La aplicación distingue siempre dos objetivos que no deben confundirse:

| | Restaurar el valor inicial | Punto de equilibrio real |
|---|---|---|
| Pregunta | «¿Cuánto aporto para que la posición vuelva a *mostrar* 100?» | «¿Cuánto aporto para *no perder dinero*, contando también lo nuevo?» |
| Ejemplo (BTC a 58.000, comprado con 100 a 70.000, objetivo 62.000) | ≈ 10,69 | ≈ 165,71 |

> ⚠️ RiskCalculator ofrece cálculos y análisis educativos. No es
> asesoramiento financiero, no recomienda comprar ni vender y no predice
> precios.

## Funcionalidad

- **Calculadora** con ambos modos, comparación explícita, desglose matemático
  expandible, gráfica precio–resultado, curva aportación–subida, tabla de
  escenarios y comparador de aportaciones. Funciona sin registro ni claves.
- **Portfolio local**: cuentas/brókeres, activos (acciones, ETF, cripto,
  materias primas, efectivo, manuales), múltiples compras y ventas (coste
  medio), posiciones siempre derivadas de las operaciones, EUR/USD con
  conversión FX real (tipo, fecha y fuente visibles).
- **Datos de mercado**: Twelve Data (vía proxy seguro), CoinGecko (cripto,
  sin clave), BCE para FX EUR/USD, precios manuales y datos demo etiquetados.
- **Importar con IA**: prompt listo para copiar en un LLM externo, validación
  Zod estricta del JSON devuelto, previsualización y confirmación explícita.
- **Analítica**: distribución, concentración (HHI, nº efectivo), rentabilidad
  simple y XIRR, volatilidad/drawdown/Sharpe/Sortino/correlaciones/beta con
  mínimos de muestra declarados, escenarios de estrés deterministas y
  simulador antes/después de aportaciones.
- **Perfil de riesgo** (5 preguntas, orientativo), exportación y borrado de
  datos.
- **Cuenta opcional** con Supabase (enlace mágico) y guardado en la nube con
  Row Level Security.

## Arranque rápido

Requisitos: Node.js ≥ 20.

```bash
npm install
npm run dev        # http://localhost:5173
```

La aplicación funciona completa sin configurar nada (modo local + datos demo
+ CoinGecko/BCE sin clave). Pulsa «Cargar datos de demostración» en Resumen.

### Acceso de prueba

La app abre con una pantalla de login. Credenciales de demo:

- Usuario: **admin1**
- Contraseña: **1234**

> ⚠️ Esta puerta de acceso **no es seguridad real**: la app es de
> solo-navegador (GitHub Pages), así que cualquier credencial embebida es
> visible en el bundle. Sirve como pantalla de acceso del piloto. La
> autenticación real es el enlace mágico de Supabase (dentro, en Perfil), que
> protege los datos con RLS. Puedes cambiar el usuario/contraseña de demo con
> `VITE_DEMO_USER` / `VITE_DEMO_PASSWORD`.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (Vitest): motor financiero, importador, componentes |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript estricto |
| `npm run build` | Build de producción (`dist/`) |
| `npm run preview` | Sirve el build |

## Variables de entorno

Copia `.env.example` a `.env` (nunca se commitea):

| Variable | Ámbito | Descripción |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend (pública) | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Frontend (pública) | Anon key (los datos se protegen con RLS) |
| `TWELVE_DATA_API_KEY` | **Solo servidor** | Clave de Twelve Data para la Edge Function; jamás con prefijo `VITE_` |

## Supabase (opcional: cuentas y nube)

1. Crea un proyecto en supabase.com y copia URL + anon key al `.env`.
2. Aplica las migraciones: `supabase link && supabase db push`
   (esquema completo con RLS en `supabase/migrations/`).
3. Despliega el proxy de mercado con la clave en secretos:

```bash
supabase secrets set TWELVE_DATA_API_KEY=tu_clave
supabase functions deploy market-proxy
```

4. Verifica las políticas RLS con `supabase/tests/rls_verification.sql`
   (dos usuarios de prueba; resultados esperados anotados en el fichero).

## Despliegue

### GitHub Pages (sin backend, más rápido)

Ya configurado. La app usa `HashRouter` y, en el build de Pages, `base`
`/RiskCalculator/` (workflow `.github/workflows/deploy-pages.yml`).

Para activarlo, **una sola vez**: en el repo → **Settings → Pages →
Build and deployment → Source: GitHub Actions**. A partir de ahí, cada push
a `main` publica en:

```
https://ignacior04.github.io/RiskCalculator/
```

Funciona en modo local (datos demo + CoinGecko/BCE sin clave). Para cuentas y
nube, define los secretos de Supabase (abajo). No pongas nunca
`TWELVE_DATA_API_KEY` en Pages: es un sitio estático público.

### Vercel (recomendado si se usa Supabase)

Importa el repositorio en Vercel (framework: Vite). `vercel.json` ya incluye
la rewrite de SPA. Define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el
proyecto. La clave de Twelve Data NO va en Vercel: vive en los secretos de la
Edge Function de Supabase.

## Documentación

- [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) — alcance y criterios de aceptación
- [docs/CALCULATIONS.md](docs/CALCULATIONS.md) — todas las fórmulas y su análisis de dominio
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) — proveedores, límites y política de resiliencia
- [docs/DECISIONS.md](docs/DECISIONS.md) — registro de decisiones y suposiciones reversibles

## Estado del piloto

Hecho y verificado: motor financiero (73 tests, con los casos de aceptación
numéricos), calculadora, portfolio local, importador JSON, proveedores
CoinGecko/BCE en vivo, analítica histórica y de estrés, migraciones con RLS.

Pendiente (requiere credenciales/decisión del propietario): aplicar
migraciones a un proyecto Supabase real y ejecutar la verificación RLS,
desplegar la Edge Function con la clave de Twelve Data, conectar Vercel,
y pruebas end-to-end con Playwright.
