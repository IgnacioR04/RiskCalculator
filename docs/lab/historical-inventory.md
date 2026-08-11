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
| 296–919 | Componente React: estado, orquestación, tarjetas y tablas | LAB-306 a LAB-308 | Pendiente |

Tras el primer corte el archivo baja a **~670 líneas**, todas de interfaz y orquestación.

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

Las ~670 líneas restantes son el componente React: siete `useState`, dos `useEffect`, cinco
`useMemo` de orquestación y el árbol de tarjetas. Su desmontaje es LAB-306 (view model),
LAB-307 (tarjetas) y LAB-308 (sustitución final).
