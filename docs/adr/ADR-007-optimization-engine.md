# ADR-007 — Motor de optimización

- **Estado:** aceptada
- **Fecha:** 2026-08-20
- **Tarea:** `LAB-603`
- **Condiciona:** `LAB-606` (mínima varianza), `LAB-607` (ERC)

## Contexto

Las carteras candidatas de la Fase 6 necesitan resolver problemas de
optimización con restricciones: minimizar varianza sujeta a límites por activo y
por grupo, o igualar contribuciones al riesgo.

La pregunta del plan era binaria: **TypeScript en el navegador o un servicio
Python** con `cvxpy`/`scipy`.

## Decisión

**TypeScript en el navegador**, con algoritmos elegidos por ser resolubles sin
librería de optimización general.

En concreto:

- **Mínima varianza**: descenso por gradiente proyectado sobre el símplex, con
  proyección a las cajas de las restricciones. Convergencia comprobada, y
  **sin pesos si no converge**.
- **ERC**: iteración de punto fijo sobre las contribuciones al riesgo, que para
  covarianzas definidas positivas converge de forma monótona.
- **Covarianza regularizada** con shrinkage hacia la diagonal, porque una
  matriz estimada con 252 observaciones y 20 activos está mal condicionada y el
  optimizador se agarra al ruido.

## Motivos

1. **Un servicio Python exigiría enviar la cartera fuera.** `ADR-006` acaba de
   rechazar exactamente eso para el bootstrap: la cartera es el dato más
   sensible de la aplicación y la aplicación funciona sin cuenta. La misma razón
   vale aquí y con más fuerza, porque una candidata se calcula más a menudo que
   un escenario.
2. **No hay servidor que operar.** El despliegue es GitHub Pages más una Edge
   Function. Añadir un servicio Python con `cvxpy` significa un contenedor, un
   proceso que vigilar, una superficie de ataque y un coste mensual, para un
   proyecto de un solo usuario.
3. **El tamaño del problema no lo justifica.** Una cartera particular tiene
   entre 5 y 30 posiciones. Los solvers industriales existen para miles de
   variables; aquí el cuello de botella no es el solver.
4. **El determinismo es más fácil de garantizar dentro.** Un servicio
   introduce versiones de BLAS, de `scipy` y del propio contenedor entre el
   usuario y su resultado. En el navegador la versión del algoritmo es la del
   bundle, y ya viaja en `modelVersion`.

## Límites aceptados, y son reales

- **No hay solver de programación cuadrática general.** Restricciones que no se
  puedan expresar como cajas y una suma total —por ejemplo, un límite de
  rotación exacto simultáneo a mínimos por grupo— no se resuelven de forma
  exacta. Se acotan por proyección, y cuando no se puede, **no se devuelve una
  candidata**.
- **La convergencia no está garantizada para cualquier entrada.** De ahí la
  regla que se establece aquí: si el algoritmo no converge dentro de su tope de
  iteraciones, se devuelve el estado del solver y **ningún vector de pesos**.
  Devolver la última iteración sería presentar un resultado a medio cocer como
  si fuera la solución.
- **El shrinkage introduce sesgo a propósito.** Reduce la varianza del
  estimador a cambio de acercar la matriz a la diagonal. Es la decisión
  estándar y queda declarada en el resultado, no escondida.

## Consecuencias

- `LAB-606` y `LAB-607` se implementan en `src/lib/lab/candidates/`, puros y
  deterministas, como el resto del Laboratorio.
- Cada candidata devuelve **estado del solver, iteraciones y error de
  convergencia**, no solo pesos. Sin eso no se puede saber si fiarse.
- Los casos que este motor no puede resolver se nombran en la interfaz en vez de
  resolverse mal.
- El coste se medirá con `bench` antes de exponer nada, igual que en las fases
  3, 4 y 5. Si un optimizador resulta bloquear el hilo, se aplica la misma regla
  que estableció ADR-006 para el bootstrap: fuera del hilo principal antes de
  llegar a pantalla.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Servicio Python con `cvxpy` | Enviaría la cartera fuera, y hay que operarlo |
| Librería JS de programación cuadrática | Las mantenidas son pesadas para el presupuesto de bundle, y añaden una dependencia de cálculo que habría que auditar |
| WebAssembly con OSQP | Resolvería bien el problema, pero añade una cadena de compilación y ~200 KB para 20 variables |
| Devolver la última iteración cuando no converge | Presentar un resultado a medio cocer como si fuera la solución. Prohibido por lo mismo que no se inventan datos |

## Revisión

Reabrir si el universo de instrumentos crece más allá de unas decenas, o si
aparece una restricción que exija de verdad programación cuadrática y sea
imprescindible para el producto.
