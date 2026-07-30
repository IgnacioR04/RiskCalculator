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
  conversión FX real (tipo, fecha y fuente visibles), comisiones configurables
  por bróker y distribución real por cuenta, sector, país y divisa.
- **Datos de mercado**: Twelve Data (vía proxy seguro), CoinGecko (cripto,
  sin clave), BCE para FX EUR/USD, precios manuales y datos demo etiquetados.
- **Importar y actualizar con IA**: dos prompts listos para copiar en un LLM
  externo —crear una cartera desde capturas o convertir texto/capturas nuevos
  en compras y ventas—, validación Zod estricta, previsualización y
  confirmación explícita.
- **Analítica**: distribución, concentración (HHI, nº efectivo), rentabilidad
  total (realizado + no realizado), XIRR y TWR, volatilidad de cartera,
  correlaciones, covarianzas, contribución al riesgo, drawdown, Sharpe,
  Sortino, beta/alpha y detección de solapamientos ETF/acciones. Los mínimos
  de muestra y la cobertura se declaran en pantalla.
- **Perfil de riesgo** (5 preguntas, orientativo), exportación y borrado de
  datos.
- **Cuenta opcional** con email/contraseña de Supabase y guardado espejo en la
  nube con Row Level Security.

## Arranque rápido

Requisitos: Node.js ≥ 20.

```bash
npm install
npm run dev        # http://localhost:5173
```

Sin configurar servicios externos funcionan la calculadora, el modo local,
los datos demo, CoinGecko y los cambios EUR/USD. Pulsa «Cargar datos de
demostración» en Resumen para cargar una cartera ficticia de **23.049,26 €**
con BTC, IWDA, SXR8, Apple, Tesla y efectivo EUR. El demo incluye históricos sintéticos
para que la analítica de riesgo pueda calcular volatilidad, covarianzas,
correlaciones, drawdown y contribución al riesgo sin claves externas. Acciones
y ETF en vivo requieren Supabase + Twelve Data porque la clave privada nunca se
incluye en el navegador.

### Acceso de prueba

La app abre con una pantalla de login. Credenciales de demo:

- Usuario: **admin1**
- Contraseña: **1234**

> ⚠️ Esta puerta de acceso **no es seguridad real**: la app es de
> solo-navegador (GitHub Pages), así que cualquier credencial embebida es
> visible en el bundle. Sirve como pantalla de acceso del piloto. La
> autenticación real es Supabase (email/contraseña, confirmación de correo y
> recuperación de contraseña), que protege los datos con RLS. Puedes cambiar las
> credenciales de demo con
> `VITE_DEMO_USER` / `VITE_DEMO_PASSWORD`.

Con Supabase configurado, el acceso principal es email/contrasena con
confirmacion de correo y recuperacion de contrasena. El modo demo queda
separado y solo guarda en la cache local de invitado.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (Vitest): motor financiero, importador, componentes |
| `npm run test:e2e` | Flujos completos en escritorio y móvil (Playwright) |
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
| `ALLOWED_ORIGINS` | **Solo servidor** | Orígenes admitidos por el proxy, separados por comas |

## Supabase (opcional: cuentas y nube)

1. Crea un proyecto en supabase.com y copia URL + anon key al `.env`.
2. Aplica las migraciones: `supabase link && supabase db push`
   (esquema completo con RLS en `supabase/migrations/`).
3. Despliega el proxy de mercado con la clave en secretos:

```bash
supabase secrets set TWELVE_DATA_API_KEY=tu_clave \
  ALLOWED_ORIGINS=https://ignacior04.github.io,http://localhost:5173
supabase functions deploy market-proxy
supabase functions deploy delete-user
```

4. Verifica las políticas RLS con `supabase/tests/rls_verification.sql`
   (dos usuarios de prueba; resultados esperados anotados en el fichero).
5. En GitHub → Settings → Secrets and variables → Actions, crea
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. El workflow de Pages los
   incorpora al build como valores públicos.

### Autenticacion, cache y sincronizacion

Con Supabase configurado, la entrada principal usa email y contrasena:
registro con confirmacion por correo, inicio de sesion, recuperacion de
contrasena y sesion persistente tras recargar. Al iniciar sesion, la app carga
primero los datos remotos y solo despues muestra la cartera.

La cache local esta separada por usuario de Supabase. Al cerrar sesion se borra
la cache del usuario anterior y se limpia el estado en memoria. Los cambios se
guardan automaticamente con debounce; si no hay conexion, se conservan en la
cache local del usuario y se reintentan con cambios posteriores. Para evitar
perdida accidental, RiskCalculator no sube un estado local completamente vacio
sobre una cartera remota existente.

Desde Perfil, el usuario autenticado puede cambiar email, cambiar contrasena,
forzar subida/descarga, cerrar sesion y eliminar su cuenta. La eliminacion de
cuenta pasa por la Edge Function `delete-user`; la clave `service_role` solo
vive en los secretos de Supabase y no se incluye en el navegador.

En Supabase Auth -> URL Configuration, usa:

- Site URL: `https://ignacior04.github.io/RiskCalculator/`
- Redirect URLs:
  - `https://ignacior04.github.io/RiskCalculator/`
  - `http://localhost:5173/`
  - `http://127.0.0.1:5173/`
  - `http://127.0.0.1:4173/`

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

### Vercel (alternativa)

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

Hecho y verificado localmente: motor financiero, calculadora, portfolio
multicuenta, demo realista de 23.049,26 €, importador/actualizador JSON,
proveedores CoinGecko/BCE, analítica histórica multimoneda, históricos demo
sintéticos, comisiones, solapamientos, autenticación con Supabase, cache local
por usuario, sincronización automática, migraciones con RLS, build dividido por
páginas y suite E2E para escritorio y móvil.

El proyecto Supabase configurado para este repositorio ya tiene las migraciones
aplicadas. Pendiente manual si aún no está hecho: desplegar las Edge Functions
`market-proxy` y `delete-user`, definir `TWELVE_DATA_API_KEY` como secreto de
`market-proxy`, revisar la lista de URLs permitidas en Supabase Auth y añadir
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` como secrets de GitHub Pages.
