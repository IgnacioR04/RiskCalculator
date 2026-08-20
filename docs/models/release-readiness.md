# Preparación para lanzamiento

> Fase 10, tareas `LAB-1002` a `LAB-1009` y `LAB-1011`. El acta de la puerta
> está en [`launch-g10-gate.md`](./launch-g10-gate.md).
> Fecha: 2026-08-20.

## LAB-1002 — Rendimiento de frontend

### Tamaño del bundle, medido

| Chunk | gzip | Presupuesto | Margen |
|---|---:|---:|---:|
| `index` (arranque) | 91,6 KiB | 120 | 24 % |
| `chartTheme` (recharts) | 95,7 KiB | 130 | 26 % |
| `LabSection` | 39,9 KiB | 80 | 50 % |
| `PerfilPage` | 21,4 KiB | 80 | 73 % |
| `RiesgoPage` | 19,3 KiB | 80 | 76 % |

El Laboratorio entero viaja en **un chunk diferido de 40 KiB gzip** que no toca
el arranque. Ha crecido de 14,5 a 39,9 KiB en seis fases, y sigue a la mitad de
su presupuesto.

El presupuesto se comprueba en CI desde `LAB-008`, así que esto no es una foto:
es una condición.

### Coste de cálculo, medido

Todo con calentamiento de JIT antes de medir, reproducible con
`npm run bench:*`:

| Motor | 5 activos | 20 activos | 50 activos |
|---|---:|---:|---:|
| Estabilidad (`bench:stability`) | 0,45 ms | — | — |
| Dependencia (`bench:dependency`) | 0,44 ms | 6,8 ms | 149 ms |
| Candidatas · 1/N | 0,00 ms | 0,01 ms | 0,01 ms |
| Candidatas · ERC | 0,09 ms | 0,30 ms | 0,62 ms |
| Candidatas · mínima varianza | 1,09 ms | 17,9 ms | 101 ms |
| Escenario determinista | 0,23 ms | — | — |
| Bootstrap · 1.000 trayectorias | 173 ms | 378 ms | — |
| Bootstrap · 10.000 trayectorias | — | **~3,8 s** | — |

### Las dos decisiones que salieron de medir

**No hay Web Worker para nada de lo que está expuesto.** En el caso realista
—entre 5 y 20 posiciones— el peor coste es 18 ms. El extremo de 50 activos son
149 ms **una vez**, al pulsar un botón que ya espera por una descarga de
segundos.

**Sí hace falta para el bootstrap, y por eso no está expuesto.** 378 ms bloquean
el hilo de forma perceptible y 3,8 s lo congelan. `ADR-006` lo dejó como
condición de entrada: no llega a pantalla hasta que corra fuera del hilo
principal, con cancelación y progreso.

### Límite explícito

**El caso de «10 años» del plan no se puede probar**: la aplicación descarga
como máximo 365 días. Es la misma limitación que cerró la Fase 7 sin ranking.

## LAB-1003 — Carga de backend: **alcance reducido**

No hay backend que cargar. La superficie de servidor es:

- **GitHub Pages**, estático;
- **una Edge Function**, `market-proxy`, que existe para no poner la clave de
  Twelve Data en el cliente;
- **Supabase**, opcional: sin él la aplicación funciona en modo local.

Con un usuario y una función proxy, una prueba de concurrencia mediría el rate
limit de Twelve Data, no la aplicación. Los límites que sí importan están
documentados: **800 peticiones al día y 8 por minuto** en el plan gratuito, y la
aplicación cachea series para no gastarlas.

Se reevalúa si aparece más de un usuario concurrente.

## LAB-1004 — Auditoría de RLS

Cinco migraciones y **51 aserciones pgTAP** que corren en CI (`supabase-ci.yml`)
sobre una base local del runner:

| Suite | Aserciones | Qué cubre |
|---|---:|---|
| `rls_negative_test.sql` | 28 | Acceso cruzado entre usuarios, anónimo, IDs manipulados |
| `investment_policy_test.sql` | 23 | Las tres tablas de política, con clave ajena compuesta |

Dos reglas están **en la base**, no solo en el código: no hay riesgo efectivo
sin capacidad medida, y una clave ajena compuesta impide colgar un objetivo de
la política de otro usuario.

`config.toml` declara `verify_jwt` de la Edge Function en vez de dejarlo al
valor por defecto.

### Riesgos que siguen abiertos

- **D14**: los tipos de Supabase están escritos a mano. Un cambio de esquema no
  rompe la compilación.
- **D15**: las escrituras multi-tabla no son atómicas.
- **D16**: la base acepta `effective_risk` sin banda de tolerancia.

Los tres son de integridad, no de acceso: **no hay acceso cruzado**, que es el
criterio de la tarea.

## LAB-1005 — Superficie de secretos

| Secreto | Dónde vive | Comprobación |
|---|---|---|
| `TWELVE_DATA_API_KEY` | Edge Function, lado servidor | **No lleva prefijo `VITE_`**, así que Vite no puede exponerla |
| `VITE_SUPABASE_URL` / `ANON_KEY` | Bundle público | Públicas por diseño; lo que protege es la RLS |
| `VITE_LAB_FLAGS` | Bundle público | No es autorización: cualquiera puede activar una capacidad en su navegador |

CI audita el bundle buscando el nombre `TWELVE_DATA_API_KEY`. Está documentado
como **cinturón débil**: busca el nombre, no valores, y corre sobre el build de
CI, que no recibe secretos. La protección real es la ausencia del prefijo.

Las ocho Actions están fijadas a SHA completo, ningún workflow usa
`pull_request_target`, y ningún checkout persiste credenciales.

## LAB-1006 — Privacidad, retención y borrado

**La cartera no sale del dispositivo.** Es la decisión que se ha repetido en
ADR-006, ADR-007 y ADR-009, y cada vez costó una funcionalidad: sin persistencia
de escenarios en la nube, sin servicio de optimización, sin narración con LLM.

| Dato | Dónde | Retención | Cómo se borra |
|---|---|---|---|
| Cartera y transacciones | `localStorage` | Indefinida | Borrando los datos del navegador |
| Cálculos guardados | `localStorage`, clave propia | **50 más recientes** | Botón en la pantalla de Cálculos |
| Política de inversión | `localStorage`, y Supabase **solo si hay sesión** | Indefinida | Manual |
| Composiciones de fondos | `localStorage` | Indefinida | Manual |

**No se recoge telemetría de ningún tipo.** No hay analítica, ni contadores de
uso, ni registro de qué pantallas se visitan. La ausencia es deliberada:
`ADR-009` rechazó una tabla de auditoría precisamente porque habría sido eso.

### Lo que el usuario debe saber

Si borra los datos del navegador, pierde el historial. **No hay copia en ningún
servidor**, y es la contrapartida declarada de que nada viaje. La pantalla de
Cálculos lo dice con esas palabras.

## LAB-1007 — Runbooks

| Runbook | Cubre |
|---|---|
| `pages-deploy-failure.md` | El sitio roto, el despliegue que no arranca, chunks que faltan |
| `ci-required-checks.md` | Checks requeridos y protección de `main` |
| `lab-flags-release.md` | Encender y apagar capacidades en producción |

### Rollback, en una frase

Redesplegar un SHA que ya pasó CI:

```bash
gh workflow run "Deploy a GitHub Pages" --ref main -f sha=<SHA_COMPLETO>
```

Está probado en producción: el despliegue solo arranca tras CI en verde, y se
demostró con marcas de tiempo en el acta de G0.

**Apagar el Laboratorio entero** es quitar `labShell` de la lista de
`deploy-pages.yml` y fusionar. No hace falta revertir código: para eso existen
las banderas.

## LAB-1008 — Beta controlada: **decisión del propietario**

Esta tarea no la puede cerrar quien escribe el código. Exige personas usando la
aplicación y contando qué no entienden.

Lo que sí está preparado:

- el modo demo funciona **sin cuenta**, así que probar no exige registrarse;
- las capacidades se encienden y apagan por bandera sin tocar código;
- el historial de cálculos permite reproducir lo que vio quien informe de algo.

## LAB-1009 — Revisión de copy

Revisado el texto de las pantallas del Laboratorio con `grep`, no de memoria:

- **Cero apariciones** de «deberías», «te recomendamos», «lo mejor es»,
  «conviene», «Arreglar» o «Corregir» en Candidatas, Reparar y Sectores.
- **Ninguna candidata preseleccionada.** No existe función `bestCandidate`, y
  hay una prueba que lo comprueba.
- **Ninguna etiqueta es un verbo de acción**: «Aporta algo distinto», «Más de lo
  mismo», «Ya lo tienes», «Sin datos». Los enlaces dicen «Ver…».
- **El orden no recomienda**: en Sectores se agrupa por categoría y no se ordena
  por bondad, porque la primera fila de una tabla se lee como la mejor opción.
- **El aviso viaja con el dato**, no en una nota al pie, y en las exportaciones
  va **dentro del fichero**.

Cada motor declara sus supuestos como **dato**, no como comentario, de modo que
una pantalla no puede enseñar el número sin ellos: `VAR_DISCLAIMER`,
`DOWNSIDE_CONDITION`, `CANDIDATE_DISCLAIMER`, `MOMENTUM_DISCLAIMER`,
`EXPORT_DISCLAIMER`.

### Lo que no se ha hecho

**No hay revisión jurídica profesional.** La revisión es de coherencia interna
frente a los límites de `CLAUDE.md` §3. Si la aplicación pasa de uso personal a
uso público, esa revisión hace falta y no la sustituye este documento.

## LAB-1011 — Retirada de adaptadores heredados: **nada se retira**

Evaluado, y la conclusión es que no hay nada retirable:

- **`LabRiskLegacyPage`** se llama «legacy» porque envuelve la sección de riesgo
  anterior al Laboratorio, pero **es** la pantalla de Riesgo. Retirarla sería
  quitar la pantalla.
- **`deriveLabPolicyFromLegacy`** es el camino de migración del perfil antiguo.
  Retirarlo dejaría sin política a quien no haya migrado todavía.
- **`SimularContenido` y `DiversificacionContenido`** se reutilizan desde las
  pantallas nuevas, que es lo contrario de duplicar.

No son andamios: son la migración. Se retiran cuando conste que ningún usuario
tiene un perfil sin migrar, y eso hoy no se puede saber porque **no hay
telemetría** — que es una consecuencia deliberada de LAB-1006.
