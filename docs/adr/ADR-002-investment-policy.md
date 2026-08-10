# ADR-002 — Modelo de política de inversión y regla de riesgo efectiva

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-10 |
| Commit base | `b02017d` |
| Tarea | `LAB-201` |
| Documentos relacionados | [ADR-001](./ADR-001-lab-architecture.md), [02-arquitectura-cuantitativa-datos.md §6](../laboratorio-plan/02-arquitectura-cuantitativa-datos.md) |

## Contexto

El Laboratorio necesita saber **para quién** analiza antes de poder decir nada útil sobre
si una cartera encaja. Hoy el repositorio resuelve eso con una sola cifra: `RiskProfile`
guarda un `score` de 0 a 10 y lo traduce a tres categorías —conservador, moderado,
dinámico— con dos umbrales fijos
([`src/pages/PerfilPage.tsx`](../../src/pages/PerfilPage.tsx)).

Ese modelo tiene un defecto que no se arregla afinando los umbrales: **mezcla en un único
número tres cosas que no son la misma**. Alguien puede tolerar bien las caídas y a la vez
no poder permitírselas; o poder permitírselas y no necesitarlas para llegar a su objetivo.
Un solo número obliga a elegir cuál de las tres gana, y lo hace en silencio.

El plan exige separarlas y fija la regla efectiva
([§6.5](../laboratorio-plan/02-arquitectura-cuantitativa-datos.md)), pero deja
explícitamente abierta «la escala exacta de bandas de riesgo y la validez temporal de la
IPS» (§25), con la instrucción de que ninguna decisión se entierre en una constante sin
ADR. Este documento las cierra.

**Alcance jurídico.** RiskCalculator es una herramienta educativa. Nada de lo que sigue
convierte la aplicación en asesoramiento regulado, y la decisión sobre el alcance legal de
la personalización sigue abierta en el plan, con fecha límite antes de publicar señales.
Este ADR fija estructura de datos y reglas de coherencia; no autoriza recomendaciones
personalizadas.

## Decisión

### 1. `RiskBand`: cinco bandas ordinales

```ts
type RiskBand = 1 | 2 | 3 | 4 | 5
```

| Banda | Nombre | Lectura |
|---:|---|---|
| 1 | Muy baja | Preservar el capital por encima de todo |
| 2 | Baja | Aceptar oscilaciones pequeñas |
| 3 | Media | Aceptar caídas relevantes a cambio de crecimiento |
| 4 | Alta | Aceptar caídas grandes y prolongadas |
| 5 | Muy alta | Aceptar la posibilidad de pérdidas severas |

**Por qué cinco y no tres.** La regla efectiva es un mínimo entre dos bandas. Con tres
niveles, el mínimo colapsa a «conservador» en cuanto una de las dos dimensiones lo es, y se
pierde toda diferencia entre perfiles distintos. Cinco bandas dan resolución suficiente
para que el mínimo siga siendo informativo sin caer en una falsa precisión.

**Por qué ordinales y no una puntuación continua.** `min()` exige un orden total, y un
número con decimales invitaría a interpretarlo como una medida cuando es una clasificación
declarada por el usuario. Las bandas se comparan; no se promedian, no se interpolan y no se
suman.

**Migración desde el modelo actual.** `conservador → 2`, `moderado → 3`, `dinamico → 4`.
Se mapea al centro del rango y **nunca a los extremos**: el cuestionario actual no
distingue «muy baja» de «baja», así que asignar 1 o 5 afirmaría más de lo que se preguntó.
El perfil migrado se marca como derivado y pide confirmación antes de considerarse activo.

### 2. Tres dimensiones que se miden por separado

| Dimensión | Qué mide | De dónde sale |
|---|---|---|
| `riskTolerance` | Qué está dispuesto a soportar | Respuestas de actitud ante pérdidas |
| `lossCapacity` | Qué **puede** soportar sin romper su plan | Hechos objetivos: horizonte, colchón de liquidez, estabilidad de ingresos, dependientes, porcentaje del patrimonio invertido |
| `riskNeed` | Qué riesgo exigiría alcanzar sus objetivos | Se **deriva** de los objetivos, aportaciones y plazo declarados |

**Regla innegociable: la capacidad no se deduce de la tolerancia.** Son preguntas
distintas, con respuestas distintas, y el sistema no rellena una con la otra ni en el
cálculo ni en la interfaz. Es el criterio de aceptación de esta tarea, y hay un motivo de
fondo: la tolerancia es una preferencia declarada y la capacidad es una restricción
material. Confundirlas es exactamente el error que produce carteras que el usuario aguanta
en la encuesta y no en la práctica.

**Si falta capacidad, no hay riesgo efectivo.** Cuando los campos objetivos de capacidad
están incompletos, `lossCapacity` queda **desconocida** y la IPS no puede pasar a `active`.
No se estima, no se toma la tolerancia como sustituto y no se asume un valor por defecto:
la aplicación sigue funcionando en modo educativo y lo dice.

### 3. Regla de riesgo efectivo

```
effectiveRisk = min(riskTolerance, lossCapacity)
```

`riskNeed` **no entra en el mínimo y nunca sube el riesgo efectivo**. Necesitar más
rentabilidad no aumenta lo que alguien puede permitirse perder.

La regla se guarda versionada (`effectiveRiskRuleVersion: 1`) junto a la política, de modo
que un resultado antiguo pueda reproducirse aunque la regla cambie después.

### 4. Conflicto cuando la necesidad supera lo efectivo

Si `riskNeed > effectiveRisk`, la IPS es válida pero **conflictiva**. No se resuelve solo,
y desde luego no subiendo el riesgo. Se declara y se ofrecen las cinco salidas del plan:

1. aumentar la aportación;
2. ampliar el horizonte;
3. reducir el objetivo;
4. aceptar explícitamente una revisión del perfil, que queda registrada;
5. buscar asesoramiento profesional.

El conflicto se muestra siempre que se presenten resultados que dependan del perfil. Una
cartera candidata calculada bajo conflicto lo arrastra en su presentación.

### 5. Caducidad: doce meses, con aviso a los diez

| Estado | Cuándo | Efecto |
|---|---|---|
| `vigente` | Antes de `nextReviewAt` | Personalización disponible |
| `por revisar` | Dos meses antes de `nextReviewAt` | Se avisa; nada se bloquea |
| `caducada` | Pasado `nextReviewAt` | **Se suspende la personalización**; el análisis descriptivo sigue disponible |

`nextReviewAt = effectiveFrom + 12 meses`. Doce meses es el intervalo habitual de revisión
de idoneidad y encaja con el ritmo al que cambian ingresos, objetivos y patrimonio. Además
se recomienda revisión inmediata ante un cambio declarado por el usuario.

Una IPS caducada **no se borra ni se corrige sola**: se conserva tal cual, porque es el
contexto bajo el que se calcularon los resultados anteriores.

### 6. Campos obligatorios para pasar a `active`

- moneda base;
- `riskTolerance` respondida;
- los campos objetivos de `lossCapacity` completos;
- al menos un objetivo con importe y fecha;
- política de rebalanceo elegida, aunque sea «no rebalancear»;
- confirmación explícita del usuario (`acknowledgements`).

Sin todos ellos la política permanece en `draft`. Un borrador **no personaliza nada**.

### 7. Versionado

Cada cambio material crea una versión nueva con `version + 1`; la anterior pasa a
`superseded` y se conserva. Los resultados guardan la versión de IPS bajo la que se
calcularon. Cambios cosméticos —renombrar un objetivo— no crean versión.

## Alternativas consideradas

| Alternativa | Por qué se descarta |
|---|---|
| **Mantener la puntuación única 0–10 y tres categorías** | Es el problema, no la solución: mezcla tolerancia, capacidad y necesidad en un número y decide en silencio cuál gana |
| **Siete o diez bandas** | Falsa precisión. Un cuestionario declarativo no distingue de forma fiable entre diez niveles, y el usuario no percibe la diferencia entre la banda 6 y la 7 |
| **`effectiveRisk` como media ponderada de las tres** | Permitiría que una necesidad alta compensara una capacidad baja. Es justo lo que no debe ocurrir: perder dinero que no se puede perder no se justifica por necesitarlo |
| **Incluir `riskNeed` en el mínimo** | Bajaría el riesgo efectivo de quien no necesita rentabilidad, obligándole a una cartera más conservadora de lo que quiere y puede. La necesidad informa objetivos, no límites |
| **Inferir capacidad a partir de la edad** | Es un atajo tentador y equivocado: dos personas de la misma edad pueden tener capacidades opuestas. La edad entra, si acaso, a través del horizonte declarado |
| **IPS sin caducidad** | Un perfil de hace cinco años describe a otra persona. Sin caducidad, la personalización se degrada sin que nadie lo note |
| **Caducidad de seis meses** | Genera fatiga de revisión y empuja a confirmar sin leer, que es peor que no preguntar |

## Consecuencias

**Positivas**

- El conflicto entre lo que alguien quiere, puede y necesita se hace visible en vez de
  resolverse por dentro.
- `effectiveRisk` es reproducible: misma entrada y misma versión de regla, mismo resultado.
- Los resultados quedan atados a la versión de IPS bajo la que se calcularon.
- Se puede degradar con dignidad: sin capacidad medida, la herramienta sigue siendo útil
  como análisis descriptivo.

**Negativas y costes aceptados**

- El cuestionario se alarga: son tres bloques, no uno. Se mitiga repartiéndolo en el
  asistente de `LAB-207` a `LAB-209` y permitiendo guardar borradores.
- Habrá usuarios en `draft` indefinidamente, sin personalización. Es deliberado: es
  preferible a personalizar sobre datos inventados.
- La migración desde el perfil actual exige una confirmación del usuario, con la fricción
  que eso supone.
- Cinco bandas obligan a redactar cinco lecturas en lenguaje llano, no tres.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Que la interfaz acabe autocompletando capacidad con la tolerancia «para ayudar» | La regla es explícita aquí y `LAB-203` debe probar el caso: tolerancia alta con capacidad ausente **no** produce riesgo efectivo |
| Que el conflicto se muestre una vez y se pierda | El conflicto viaja con el resultado, no con la pantalla |
| Que cinco bandas se lean como una medida precisa | Se presentan con nombre y lectura, nunca como puntuación |
| Que la caducidad bloquee a alguien en mal momento | Caducar suspende la personalización, no el acceso ni el análisis descriptivo |
| Que la migración asigne bandas extremas sin fundamento | El mapeo va al centro del rango y pide confirmación |

## Criterio de revisión

Se revisa este ADR si: se decide el alcance jurídico de la personalización y exige otra
estructura; se observa que una banda concreta no discrimina en los datos reales de uso; el
conflicto entre necesidad y riesgo efectivo resulta ser el caso mayoritario, lo que
indicaría que el cuestionario de capacidad está mal calibrado; o se introduce un modelo de
probabilidad de alcanzar objetivos que permita derivar `riskNeed` de forma cuantitativa en
vez de declarativa.
