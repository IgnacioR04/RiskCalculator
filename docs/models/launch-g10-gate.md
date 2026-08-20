# Acta de la puerta G10

> `LAB-1010` y `LAB-1012`. Cierre de la Fase 10 y del plan del Laboratorio.
> Fecha: 2026-08-20.
> Evidencia: [`release-readiness.md`](./release-readiness.md).

## 1. Criterios de G10

| Criterio | Estado | Evidencia |
|---|---|---|
| Checklist del documento 05 | **Cumplido** | Ver secciones 2 a 4 |
| Runbooks | **Cumplido** | Tres, y el rollback está probado en producción |
| Rollback | **Cumplido** | Redespliegue de un SHA validado, con su comando |
| Pruebas de carga razonables | **Cumplido** *(alcance reducido)* | No hay backend que cargar; los límites del proveedor están documentados |
| Revisión de copy | **Cumplido** *(sin revisión jurídica)* | Comprobada con grep, no de memoria |
| Beta | **Pendiente del propietario** | No la puede cerrar quien escribe el código |
| Cero incidencias críticas | **Cumplido** | Ninguna abierta; tres riesgos de integridad declarados |

**G10 se declara superada con una salvedad**: la beta controlada (`LAB-1008`)
queda abierta porque exige personas, no código.

## 2. Estado final del plan

| Fase | Puerta | Estado |
|---:|---|---|
| 0 · Base, contratos y calidad | G0 | Superada |
| 1 · Shell y migración | G1 | Superada |
| 2 · IPS y calidad de datos | G2 | Superada |
| 3 · Refactor y estabilidad | G3 | Superada |
| 4 · Exposición y dependencia | G4 | Superada |
| 5 · Escenarios | G5 | Superada |
| 6 · Carteras candidatas | G6 | Superada |
| 7 · Sectores | G7 | Superada, **sin ranking** |
| 8 · Empresas | G8 | **No iniciada** — opcional y bloqueada por defecto en el plan |
| 9 · Evidencia | G9 | Superada |
| 10 · Lanzamiento | G10 | Superada, salvo beta |

**1.552 pruebas unitarias y 92 E2E**, entre ellas 34 de accesibilidad.

## 3. Lo que la aplicación NO hace, y es deliberado

Esta lista es el resultado más valioso del plan, porque cada línea costó una
funcionalidad que sí se podría haber construido:

1. **No hay ranking de sectores.** Con doce meses de historial, el momentum no
   se puede ni calcular (`LAB-710`).
2. **No hay narración con LLM.** Rompería el determinismo de las explicaciones
   (`ADR-009`).
3. **No hay optimización en servidor.** Enviaría la cartera fuera (`ADR-007`).
4. **No hay persistencia de resultados en la nube** (`ADR-006`).
5. **No hay bootstrap en pantalla** hasta que corra en un Web Worker
   (`ADR-006`).
6. **No hay dependencia de cola ni factores.** La muestra no da (`ADR-005`).
7. **No hay proveedor de holdings.** iShares y Vanguard prohíben redistribuir
   (`ADR-004`).
8. **No hay candidata preseleccionada como la mejor** (`LAB-612`).
9. **No hay telemetría** de ningún tipo (`LAB-1006`).

## 4. Lo que encontró medir en vez de mirar

Fallos reales que ninguna revisión visual habría dado:

| Fallo | Cómo se encontró |
|---|---|
| Volatilidades del **237 %** por doble anualización | Mirando la pantalla con datos |
| `.negative` con contraste **2,96:1** | axe, en LAB-1001 |
| `opacity: 0.55` hundiendo el contraste | axe |
| Enlaces distinguidos **solo por color** | axe |
| **12 códigos** llegando sin traducir | Prueba que recorre el fuente |
| Momentum 12-1 midiendo **12 en vez de 12-1**, por un índice | Prueba dedicada |
| CVaR con **6 días de cola en vez de 5** | Coma flotante, en LAB-310 |
| El universo elegible **no se aplicaba** en 1/N | Prueba de la candidata |
| El titular contaba grupos e **ignoraba lo no agrupado** | Mirando con datos |
| El p95 del banco de estabilidad era **falso** sin calentar el JIT | Repetir la medición |
| Una prueba **caducada** llevaba días roja en `main` | Ejecutarla antes de tocarla |
| El despliegue **nunca definió** `VITE_LAB_FLAGS` | Preguntarse por qué no se veía nada |

## 5. Riesgos abiertos al lanzar

| Riesgo | Naturaleza | Quién puede cerrarlo |
|---|---|---|
| **D4** · Posible proyecto de Vercel desplegando sin esperar a CI | Infraestructura | El propietario, entrando en su panel |
| **D14** · Tipos de Supabase escritos a mano | Integridad | Generación desde el esquema |
| **D15** · Escrituras multi-tabla no atómicas | Integridad | Una función RPC transaccional |
| **D16** · La base acepta `effective_risk` sin banda | Integridad | Migración aditiva con restricción |
| **LAB-1008** · Beta sin hacer | Producto | El propietario |

Ninguno es de acceso: **no hay acceso cruzado entre usuarios**, y eso está
comprobado con 51 aserciones pgTAP en CI.

## 6. LAB-1012 — Después del lanzamiento

Tres cosas que se vigilan solas, sin que nadie tenga que acordarse:

1. **`dataSufficiency.test.ts`** falla el día que la aplicación pueda descargar
   historial suficiente para validar el momentum. Ese fallo es la señal de
   reabrir la Fase 7.
2. **`deployFlags.test.ts`** falla si las listas de capacidades de CI, E2E y
   despliegue se separan, o si un nombre es una errata.
3. **El presupuesto de bundle** falla si un chunk se pasa.

Y una que no:

4. **`unknownReasonsSeen()`** acumula los códigos de razón que llegan sin
   catalogar. Nadie los mira todavía, porque mirarlos exigiría telemetría. Queda
   como diagnóstico manual.

### Lo primero que haría al abrir el siguiente ciclo

**El Web Worker del bootstrap.** Es la única funcionalidad construida, probada y
lista que no llega al usuario, y la condición para soltarla está escrita y
medida. Todo lo demás que falta necesita datos que no hay o decisiones que no
son técnicas.
