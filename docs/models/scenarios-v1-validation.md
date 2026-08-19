# Validación del motor de escenarios — v1

> `LAB-512`. Informe de cierre de la Fase 5 y acta de la puerta **G5**.
> Fecha: 2026-08-19.

## 1. Qué se ha construido

| Módulo | Tarea | Qué contesta |
|---|---|---|
| `scenarios/contracts.ts` + `schema.ts` | LAB-501 | Qué es un escenario y qué no puede faltarle |
| `scenarios/deterministicScenario.ts` | LAB-502 | «¿Y si la bolsa cae un 30 %?» |
| `scenarios/historicalScenario.ts` | LAB-503 | «¿Y si volviera a pasar marzo de 2020?» |
| `scenarios/portfolioPath.ts` | LAB-504 | Cómo evoluciona la cartera con flujos y costes |
| `scenarios/blockBootstrap.ts` | LAB-505 | Muchos futuros posibles, remuestreando el pasado |
| `scenarios/scenarioSensitivity.ts` | LAB-506 | De qué supuesto depende el resultado |
| `scenarios/library.ts` | LAB-507 | Catálogo de fábrica y del usuario |
| `scenarios/scenarioRuns.ts` | LAB-511 | Guardar y comparar lo comparable |
| `LabScenariosPage.tsx` | LAB-508 | La pantalla |

Decisiones cerradas sin implementar: `LAB-509` y `LAB-510`
([ADR-006](../adr/ADR-006-scenario-persistence-and-execution.md)).

## 2. Criterios de G5

| Criterio | Estado | Evidencia |
|---|---|---|
| Cada escenario tiene definición y versiones | **Cumplido** | El tipo hace imposible construir uno sin tipo ni horizonte, y el esquema lo impide también en la frontera. Editar uno propio sube su versión; uno de fábrica no se edita, se deriva |
| Determinismo o semilla | **Cumplido** | Los deterministas e históricos son puros y se comprueban con `toEqual` sobre dos ejecuciones. El bootstrap exige semilla **en el esquema**, no en el motor: si dependiera del motor, cualquier ruta que se olvidara produciría resultados irreproducibles en silencio |
| Sensibilidad | **Cumplido** | `LAB-506`, una variable cada vez. Coste `variables × 4 + 1`, con una prueba que cuenta las llamadas al ejecutor |
| Costes y aportaciones definidos | **Cumplido** | `LAB-504`, con orden explícito y conservación comprobada a 1e-9 en cada periodo |
| Resultados etiquetados | **Cumplido** | Cada resultado lleva `definitionId`, `definitionVersion`, `modelVersion`, `asOf`, semilla si la hubo y los supuestos copiados en el momento del cálculo |
| Persistencia idempotente | **Cumplido** *(alcance reducido)* | Local, sobre `LAB-311`: un identificador repetido no duplica. La nube se pospone con motivo en ADR-006 |

**G5 se declara superada.**

## 3. Verificación con la cartera de demostración

Escenario «Corrección de mercado» sobre la cartera de demostración
(23.049,26 €):

- Resultado: **−12,4 %**, de 23.049,26 € a 20.181,47 €.
- El supuesto que manda es el **shock de cripto**, con 9,7 puntos de recorrido
  entre la mitad y el doble. Los de acciones y fondos mueven 4,0 y 5,0.
- **BTC aporta el 52 % del golpe** teniendo el 36 % de la cartera.
- Dos supuestos del escenario —materias primas e índices— no afectan a esta
  cartera: se cuentan y se explican en vez de llenar la tabla de ceros.

## 4. Rendimiento, y la decisión que cambió

Medido con `npm run bench:scenarios`, con calentamiento de JIT:

| Caso | p50 | p95 |
|---|---:|---:|
| Determinista, 20 activos | 0,23 ms | 0,39 ms |
| `portfolioPath`, 20 activos × 252 periodos | 0,44 ms | 1,05 ms |
| Bootstrap, 5 activos × 1.000 trayectorias | 173 ms | 182 ms |
| Bootstrap, 20 activos × 1.000 trayectorias | 378 ms | 387 ms |
| Bootstrap, 20 activos × 2.000 trayectorias | 758 ms | 788 ms |

En `LAB-313` y `LAB-416` se decidió **no** introducir un Web Worker, y las dos
veces era correcto. Aquí no: **378 ms bloquean el hilo principal de forma
perceptible** y el caso de 10.000 trayectorias (~3,8 s) llegó a tumbar el canal
RPC del propio banco de pruebas.

De ahí la regla que queda establecida en ADR-006:

> El bootstrap no se expone en la interfaz hasta que se ejecute en un Web
> Worker, con cancelación y progreso.

Hoy no bloquea a nadie porque la pantalla solo ofrece escenarios deterministas.

## 5. Limitaciones declaradas

1. **El bootstrap y los escenarios históricos no están en la pantalla.** Los
   motores están construidos y probados; lo que falta es la ejecución fuera del
   hilo principal (bootstrap) y la adquisición de series (histórico).
2. **La sensibilidad no ve interacciones** entre supuestos, por variar uno cada
   vez. Está declarado en el propio resultado.
3. **Los multiplicadores de sensibilidad son una rejilla fija**, no un rango de
   confianza: no dicen qué valores son probables.
4. **Un escenario histórico no dice que el usuario tuviera esa cartera
   entonces**, y el cambio se calcula sobre la parte con historial, no sobre el
   patrimonio entero.
5. **El bootstrap pierde la dependencia *entre* bloques.** Conserva la de dentro
   del bloque y la que hay entre activos, que es la que importa aquí.
6. **Los resultados no viajan a la nube** (ADR-006).

## 6. Cero cifras inventadas

- Un escenario sin resultado calculable devuelve `null`, no un cero.
- Una posición sin valoración se nombra en `notCovered` y no se cuenta como
  intacta.
- Un activo sin historial en el periodo histórico no se sustituye por su índice
  ni por la media de los demás.
- Sin cambio total, el reparto entre posiciones es `null` en vez de una división
  entre cero.
- Dos ejecuciones que no vienen de la misma definición y versión **no se
  comparan**: se devuelve el motivo.
