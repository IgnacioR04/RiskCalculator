# Inventario del componente histórico (LAB-301)

`src/components/analytics/HistoricalRiskSection.tsx` tenía **919 líneas** que mezclaban
red, aritmética de divisas, cálculo financiero y presentación. Este documento fija a
dónde va cada bloque, y es lo que ordena las tareas LAB-302 a LAB-308.

## Mapa original y destino

| Líneas | Qué era | Destino | Estado |
|---:|---|---|---|
| 44–54 | Tipos locales (`Period`, `RiskView`, `AssetSeries`) | `lab/stability/contracts.ts` y `twr.ts` | Parcial |
| 55–72 | `rateAt`, `convertPriceSeries` — aritmética de divisa, **pura** | `lab/stability/fx.ts` | ✅ Movido |
| 73–165 | `convertDemoPriceSeries`, `fetchSeries` — **tocan red y caché** | `lab/stability/acquisition.ts` | ✅ Movido |
| 166–295 | `transactionCashFlow`, `quantityOn`, `calculatePortfolioTwr` | `lab/stability/twr.ts` | ✅ Movido |
| 296–919 | Componente React: estado y orquestación | `lab/stability/useStabilityAnalysis.ts` | ✅ Movido (LAB-306) |
| — | Tarjetas y tablas | `features/lab/stability/*.tsx` | ✅ Movido (LAB-307/308) |

El archivo baja de **919 a 371 líneas**. Lo que queda es un adaptador: construye la vista de
cartera, decide qué activos tienen histórico, llama al hook y compone cinco bloques.

## Los cinco bloques (LAB-307)

| Componente | Qué pinta |
|---|---|
| `StabilityKpis` | Las cuatro cifras de cabecera |
| `DiversificationBlock` | ¿Estás diversificando de verdad? |
| `RelationsBlock` | Matriz de correlación o covarianza, y conclusiones de pares |
| `ContributionBlock` | Quién aporta el riesgo |
| `PerAssetBlock` | Activo por activo, con beta y alpha |

Ninguno toca el store, ni descarga nada, ni calcula métricas: **reciben datos ya resueltos**.
Por eso se prueban con un objeto fijo, que es el criterio de aceptación de LAB-307. El cálculo
de las filas vive en el adaptador, donde ya estaba.

## Por qué se separa red de aritmética

`fx.ts` es puro y `acquisition.ts` no. Estaban juntos, y eso obligaba a levantar mocks de
proveedor para probar una división. Separados, la aritmética se prueba con números.

## Regla del refactor

**Mover, no mejorar.** Ninguna línea de lógica se ha tocado al extraerla. Si además se
corrigiera algo, cualquier diferencia numérica posterior sería imposible de atribuir: no
se sabría si viene del arreglo o del movimiento. Lo que haya que arreglar se arregla
después, con la paridad ya demostrada.

La prueba de que no se ha cambiado nada son los **27 fixtures dorados de LAB-002** más las
725 unitarias, todas en verde antes y después.

## Lo que queda del monolito

371 líneas de adaptador. No desaparece del todo a propósito: alguien tiene que juntar el store
con los bloques, y ese pegamento es más honesto en un sitio que repartido por cinco.

**Cero cambio numérico.** Los 27 fixtures dorados, las 760 unitarias y los 58 E2E pasan igual
antes y después. Es lo que exige el criterio de aceptación de LAB-308.
