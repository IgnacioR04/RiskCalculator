# Acta de la puerta G6

> `LAB-615`. Cierre de la Fase 6 — restricciones y carteras candidatas.
> Fecha: 2026-08-20.

## 1. Qué se ha construido

| Módulo | Tarea | Qué resuelve |
|---|---|---|
| `constraintCompiler.ts` | LAB-601 | Traduce la política a límites sobre instrumentos |
| `constraintFeasibility.ts` | LAB-602 | Explica por qué no existe solución |
| `candidateEqualWeight.ts` | LAB-604 | Baseline 1/N con topes |
| `candidateContributionsOnly.ts` | LAB-605 | Cuadrar sin vender |
| `optimizers.ts` | LAB-606, 607 | Mínima varianza y ERC |
| `costModel.ts` | LAB-608 | Comisiones, impuestos y rotación |
| `evaluateCandidate.ts` | LAB-609 | Todas medidas con el mismo motor |
| `candidateRobustness.ts` | LAB-610 | ¿Decisión o ruido? |
| `candidateRun.ts` | LAB-611 | Ejecución tipada e idempotente |
| `LabCandidatesPage.tsx` | LAB-612 | La pantalla de candidatas |
| `repair/` + `LabRepairPage.tsx` | LAB-613 | Brechas ordenadas por lo que importa |

Decisión cerrada sin implementar: `LAB-603`
([ADR-007](../adr/ADR-007-optimization-engine.md)).

## 2. Criterios de G6

| Criterio | Estado | Evidencia |
|---|---|---|
| Restricciones compiladas y factibles | **Cumplido** | `LAB-601` compila a límites sobre índices; `LAB-602` detecta seis clases de contradicción y devuelve el **conjunto mínimo culpable**, no «tu política es infactible» |
| Baselines | **Cumplido** | 1/N implementada y usada como referencia obligatoria en toda comparación. `LAB-614` la mide y **no la desacredita** |
| Costes | **Cumplido** | `LAB-608`. Un coste desconocido es `null`, nunca cero. Sin impacto de mercado inventado |
| Robustez | **Cumplido** | `LAB-610`, con semilla y repeticiones en el resultado. Rangos, no medias |
| Solver validado | **Cumplido** | Casos con respuesta analítica conocida: con covarianza diagonal, mínima varianza da la inversa de la varianza y ERC la inversa de la desviación. Ninguno devuelve pesos si no converge |
| Comparación fuera de muestra | **Cumplido** | `LAB-614`, walk-forward de 28 ventanas en dos regímenes |
| UI no prescriptiva | **Cumplido** | Sin candidata preseleccionada, sin `bestCandidate` en el código —hay una prueba que lo comprueba—, y en Reparar no hay ningún botón de comprar o vender |

**G6 se declara superada.**

## 3. Los cuatro criterios de cierre de LAB-615

### Pesos válidos

Toda candidata que devuelve pesos cumple: suman uno dentro de 1e-6, ninguno es
negativo, y respetan los topes por activo. Los límites de grupo que un
optimizador de cajas no puede acotar **se comprueban al final** y se declaran en
`violations`: la candidata se entrega con el incumplimiento a la vista.

Cuando no hay solución, `weights` es `null` y no un vector de ceros. Un cero es
una decisión; la ausencia de solución es la falta de una.

### Explicables

Cada candidata trae:

- **de qué motor sale** y en qué versión (`modelVersion`);
- **el estado del solver**, iteraciones y residuo;
- **sus supuestos escritos como dato**, no en un comentario del código;
- **qué límites incumple**, si alguno.

En la pantalla de Reparar, cada hallazgo trae **la evidencia que lo dispara**.
Sin eso un hallazgo es una opinión.

### Sensibles marcados

Es lo que hace `LAB-610`, y en la cartera de demostración cumple su función de
forma contundente: la mínima varianza propone un **79,1 % en IWDA** y el
análisis de robustez da un rango de **0 % a 83 %**. La pantalla lo llama por su
nombre: *«ese número no es una decisión del optimizador: es ruido con muchos
decimales»*.

### Sin lenguaje prescriptivo

Revisado el texto de las dos pantallas nuevas:

- No aparece «deberías», «te recomendamos», «lo mejor es» ni «conviene».
- Ninguna candidata está preseleccionada, ordenada por defecto por «mejor» ni
  destacada visualmente.
- Los enlaces de Reparar dicen **«Ver...»**, no «Arreglar» ni «Corregir».
- La frase que gobierna la comparación explica *por qué* no se elige, en vez de
  limitarse a no elegir: «depende de cosas que esta aplicación no sabe de ti».

## 4. Rendimiento

Medido con `npm run bench:candidates`:

| Candidata | 5 activos | 20 activos | 50 activos |
|---|---:|---:|---:|
| 1/N | 0,00 ms | 0,01 ms | 0,01 ms |
| ERC | 0,09 ms | 0,30 ms | 0,62 ms |
| Mínima varianza | 1,09 ms | 17,95 ms | **101,39 ms** |

**No se introduce Web Worker.** ADR-007 se comprometió a medir antes de exponer
nada, y el resultado no lo justifica: en el caso realista —entre 5 y 20
posiciones— el peor coste es 18 ms. El caso de 50 activos son 101 ms **una vez**,
al pulsar un botón que ya espera por una descarga de segundos.

Es el mismo criterio que llevó a **sí** meter un worker para el bootstrap en
ADR-006, donde eran 3,8 s. La diferencia es de dos órdenes de magnitud.

## 5. Limitaciones declaradas

1. **No hay solver de programación cuadrática general** (ADR-007). Los límites de
   grupo con mínimo no se pueden imponer, solo comprobar.
2. **La validación fuera de muestra usa datos sintéticos** que yo mismo generé.
   La ventaja medida de la mínima varianza es probablemente **un techo**.
3. **El walk-forward no incluye costes.** Con ellos, la ventaja de la mínima
   varianza se estrecharía más, porque es la que más rota.
4. **La volatilidad no es el riesgo**: mide oscilación, no ruina.
5. **El motor de brechas solo encuentra lo que sabe buscar.** «No se ha
   encontrado nada» no significa que la cartera sea buena, y la pantalla lo dice
   con esas palabras.
6. **Las dimensiones de las restricciones dependen de datos que rellena el
   usuario** (sector, país). Sin ellos, esas reglas no rigen — y `LAB-601` lo
   declara en vez de darlas por cumplidas.

## 6. Cero cifras inventadas

- Un coste desconocido es `null`, nunca cero.
- Un optimizador que no converge no devuelve pesos.
- Una restricción que no se puede comprobar no se da por cumplida.
- Una repetición de robustez que falla se descarta y se cuenta, no se rellena
  con la solución sin perturbar.
- Un hallazgo sobre menos del 5 % de la cartera no se presenta como aviso.
- La evidencia de un hallazgo cita **el umbral real**, no uno ajustado al caso
  para que la frase suene más contundente.
