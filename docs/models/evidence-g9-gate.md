# Acta de la puerta G9

> `LAB-910`. Cierre de la Fase 9 — evidencia, explicaciones y auditoría.
> Fecha: 2026-08-20.

## 1. Qué se ha construido

| Módulo | Tarea | Qué resuelve |
|---|---|---|
| `evidence/contracts.ts` | LAB-901 | Qué es, de dónde sale, de cuándo es, cómo se calcula, qué no cubre |
| `evidence/reasonCodes.ts` | LAB-902 | Ningún motivo llega al usuario sin traducir |
| `evidence/explanations.ts` | LAB-903 | Explicaciones deterministas, sin LLM |
| `EvidenceDrawer.tsx` | LAB-904 | Componente compartido, accesible |
| `LabRunsPage.tsx` | LAB-905 | Historial: abrir no recalcula |
| `evidence/exportRun.ts` | LAB-907 | Sacar un análisis con su contexto pegado |
| `ADR-009` | LAB-906, 908, 909 | Auditoría local; sin LLM |

## 2. Criterios de G9

| Criterio | Estado | Evidencia |
|---|---|---|
| Cada resultado enlaza inputs, datos, modelo y versión | **Cumplido** | `EvidenceItem` exige afirmación, método, fuentes con fecha y `modelVersion`; sin cualquiera de ellos no se construye |
| Reason codes deterministas | **Cumplido** | Catálogo cerrado y estable. Un código desconocido se traduce de forma segura **y se registra** |
| Historial | **Cumplido** | `LAB-905`. Abrir no recalcula: si hay datos nuevos, se ofrece crear otro |
| Auditoría privada | **Cumplido** *(alcance reducido)* | El historial local **es** la auditoría. ADR-009 explica por qué no una tabla |
| Exportaciones correctas | **Cumplido** | JSON estable y Markdown legible, ambos con el aviso **dentro del fichero** |
| LLM opcional no altera números | **Cumplido** *(por ausencia)* | No hay LLM. ADR-009 |

**G9 se declara superada.**

## 3. Lo que encontró el guardián de LAB-902

La prueba de exhaustividad recorre el fuente buscando los motivos que devuelven
los motores y comprueba que cada uno sea presentable. Encontró **doce códigos
que habrían llegado al usuario como «la aplicación no sabe explicar por qué»**
teniendo explicación:

`insufficient_data`, `no_losses`, `duplicate_asOf`, `invalid_asOf`,
`invalid_block`, `invalid_horizon`, `block_longer_than_history`,
`too_many_paths`, `duplicate_id`, `builtin_not_editable`, `not_found`,
`no_usable_periods`.

No los encontró una revisión: los encontró una prueba. Y el guardián se afinó
dos veces antes de servir —la primera versión marcaba 36 códigos que ya tenían
mapa de texto propio, y la segunda tenía un patrón que no veía los textos que
empiezan en la línea siguiente—, lo cual dice algo sobre cuánto cuesta escribir
un guardián que mida lo que dice medir.

## 4. La propiedad que sostiene la fase

> **Una explicación es una función pura del resultado.**

Mismo dato, misma frase, siempre. La consecuencia práctica es que si dos
ejecuciones se describen distinto, **cambió el dato** — y esa inferencia es lo
que hace auditable la aplicación entera.

Se comprueba de tres formas:

1. `explain(x)` es igual a `explain(x)` para el mismo `x`.
2. El generador se declara en el resultado y siempre es `deterministic-template`.
3. **Ninguna cifra del texto deja de aparecer en la evidencia**: la explicación
   deriva del resultado, no lo amplía.

ADR-009 rechaza el LLM precisamente para no perder esto. No porque redactara
peor —redactaría mejor— sino porque haría imposible saber si cambió el número o
la redacción.

## 5. Limitaciones declaradas

1. **La evidencia se construye a mano en cada pantalla.** El contrato existe y
   está probado, pero no hay nada que obligue a una pantalla nueva a usarlo. Es
   una convención, no una garantía estructural.
2. **El historial guarda un resumen, no el cálculo entero.** Se puede explicar y
   comparar; no se puede reconstruir la serie completa desde él.
3. **El catálogo de razones se escribe a mano.** El guardián avisa de los huecos,
   pero alguien tiene que rellenarlos.
4. **La auditoría no sobrevive a borrar los datos del navegador.** Es la
   contrapartida declarada de que no viajen a ningún servidor.
5. **La exportación no está firmada.** Un fichero exportado se puede editar; no
   pretende ser un documento probatorio.

## 6. Cero cifras inventadas

- Una explicación no contiene ninguna cifra que no venga en la evidencia.
- Un motivo desconocido dice que es un fallo de la aplicación, **no de los datos
  del usuario**.
- Un valor nulo se exporta como «No disponible», nunca como celda vacía.
- Abrir un cálculo guardado no lo recalcula: se enseña lo que salió entonces.
- Los datos de demostración se avisan **antes** que el número.
