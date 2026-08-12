# Validación de exposición y dependencia — v1

> `LAB-416`. Informe de cierre de la Fase 4 y acta de la puerta **G4**.
> Fecha: 2026-08-12.

## 1. Qué se ha construido

| Módulo | Tarea | Qué contesta |
|---|---|---|
| `identity/instrumentIdentity.ts` | LAB-402 | ¿Esto y aquello son la misma empresa? |
| `holdings/lookThrough.ts` | LAB-405, 407 | ¿Cuánto tengo de verdad de cada empresa? |
| `holdings/lookThrough.ts` (overlap) | LAB-408 | ¿Cuánto se repiten mis fondos? |
| `holdings/observations.ts` | LAB-406 | ¿Qué llevaba este fondo **entonces**? |
| `dependency/dependencyMatrix.ts` | LAB-410 | ¿Qué se mueve junto con qué? |
| `dependency/rollingDependency.ts` | LAB-411 | ¿Y cuando el mercado cae? |
| `dependency/dependencyClustering.ts` | LAB-412 | ¿Cuántas apuestas tengo en realidad? |
| `LabExposurePage.tsx` | LAB-409 | Pantalla de Exposición |
| `LabDependencyPage.tsx` | LAB-413 | Pantalla de Dependencia |

Decisiones cerradas sin implementar: `LAB-401` ([ADR-004](../adr/ADR-004-classification-holdings-provider.md)),
`LAB-414` y `LAB-415` ([ADR-005](../adr/ADR-005-tail-dependence-and-factors.md)).

## 2. Criterios de G4

| Criterio | Estado | Evidencia |
|---|---|---|
| Identidad de instrumentos canónica | **Cumplido** | `LAB-402`. ISIN sobre mercado sobre ticker. Un ticker que encaja con dos instrumentos **no se autoasigna**: 19 pruebas, incluida la de que la respuesta ambigua no contiene ninguna clave elegida |
| Proveedor y licencia decididos | **Cumplido** *(con alcance reducido)* | ADR-004: ningún proveedor externo. Entrada manual hoy, EDGAR posible, UCITS europeos pospuestos. La decisión es «no», y está motivada |
| Cobertura visible | **Cumplido** | La pantalla de Exposición abre con el porcentaje mirado por dentro, **antes** de cualquier cifra. La de Dependencia declara observaciones y periodo por pareja |
| El look-through parcial se representa correctamente | **Cumplido** | Lo no cubierto no se reparte: engorda `unresolvedValue` y se nombra. 21 pruebas de `lookThrough` |
| Las correlaciones muestran su muestra | **Cumplido** | `N` y periodo **por celda**, no por matriz. No se fuerza la intersección global |
| Los clusters tienen estabilidad | **Cumplido** | Permutar las entradas no cambia los grupos (3 permutaciones probadas). Empates resueltos por identificador. Método versionado `hclust-avg-v1` |
| No se afirma causalidad | **Cumplido** | Etiquetas «Grupo 1», nunca temáticas. Aviso explícito de que correlación no es causa |

**G4 se declara superada.**

## 3. Verificación con la cartera de demostración

Cartera: BTC, IWDA, SXR8, AAPL, TSLA y efectivo en euros.

### Exposición

- Cobertura mirada por dentro: **73,6 %**.
- Apple aparenta 3.687,88 € y su exposición real es **4.090,69 € (17,7 %)**,
  sumando lo que llevan dentro IWDA y SXR8.
- IWDA y SXR8 comparten un **18,2 %** de lo declarado, presentado como suelo.

### Dependencia (periodo de 1 año)

- **5 posiciones → 2 apuestas.** AAPL, IWDA, SXR8 y TSLA forman un grupo que se
  mueve un 88 % igual; BTC va por libre.
- IWDA y SXR8 correlacionan **1,00** sobre 364 días comunes. Es lo esperable
  entre un índice mundial y un S&P 500 con la ponderación actual, y es
  exactamente el hallazgo que justifica la pantalla: dos productos distintos,
  una sola apuesta.
- La correlación en días de caída **no empeora** en esta cartera (AAPL–SXR8 pasa
  de 0,93 a 0,89). Se informa igual: la ausencia del patrón es un resultado.

## 4. Rendimiento

Medido con `npm run bench:dependency`, que **calienta el JIT antes de medir**:
sin ese calentamiento la primera ejecución domina la muestra y sale un número
falso, que es el error que se cometió y se corrigió en `LAB-313`.

| Caso | Matriz (p50 / p95) | Clustering | Downside |
|---|---|---|---|
| 5 activos · 364 días *(la cartera de demostración)* | 0,44 / 1,62 ms | 0,01 ms | 0,08 ms |
| 20 activos · 364 días | 6,84 / 7,12 ms | 0,16 ms | 0,07 ms |
| 50 activos · 1.260 días *(caso extremo)* | **149 / 152 ms** | 4,45 ms | 0,26 ms |

El coste crece con el cuadrado de los activos y con la longitud de las series,
que es lo esperable: son `n(n−1)/2` pares y cada uno recorre su solape.

**No se introduce ningún Web Worker.** En el caso realista el cálculo es
imperceptible, y en el extremo —50 activos con cinco años de historial, que hoy
la aplicación ni siquiera puede descargar— son 150 ms **una sola vez**, al
pulsar un botón que ya espera por una descarga de segundos. El coste dominante
sigue siendo la red, igual que concluyó `LAB-313`. Si algún día se ofrecen
series de cinco años, este número es el que hay que volver a mirar.

## 5. Limitaciones declaradas

1. **La cobertura de look-through depende de lo que el usuario anote.** Sin
   composiciones declaradas, la pantalla dice honestamente que no ha mirado
   nada, pero no puede mirar por su cuenta (ADR-004).
2. **El solapamiento es un suelo**, no una medida exacta: se calcula sobre lo
   declarado, y el real solo puede ser mayor.
3. **La identidad canónica solo distingue dentro de la cartera del usuario.** No
   hay catálogo global; dos usuarios podrían escribir el mismo valor distinto.
4. **La correlación de la cartera se aproxima con la media de los retornos
   disponibles cada día**, no con los pesos históricos. Coincide con la
   limitación ya declarada para estabilidad en `stability-v1-validation.md`.
5. **No hay dependencia de cola ni factores** (ADR-005). La muestra no da para
   la primera y no hay series con licencia para la segunda.
6. **El efectivo se excluye del análisis de dependencia.** Su serie es plana por
   definición: no es un dato que falte, es una pregunta que no aplica.

## 6. Cero cifras inventadas

Ninguna pantalla de esta fase rellena un hueco. Se ha comprobado que:

- un fondo sin composición se nombra y su valor cuenta como no mirado;
- un ticker ambiguo no se asigna a ningún candidato;
- una pareja sin días en común no aparece como correlación cero;
- un activo sin historial suficiente no entra en ningún grupo;
- sin días malos suficientes no se publica correlación bajista, aunque sobren
  datos en total.
