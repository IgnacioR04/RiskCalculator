# ADR-005 — Correlación de cola y modelo de factores

- **Estado:** aceptada — **ambas pospuestas**
- **Fecha:** 2026-08-12
- **Tareas:** `LAB-414` (correlación de cola), `LAB-415` (factores)

## Contexto

La Fase 4 contemplaba dos análisis más allá de la correlación lineal:

- **Correlación de cola**: si dos activos se hunden *juntos* en los peores días,
  más allá de lo que predeciría su correlación media.
- **Modelo de factores**: descomponer los retornos en exposiciones a factores
  (mercado, tamaño, valor, momento) para explicar de dónde viene el riesgo.

Las dos tareas se plantearon como *spikes*: decidir con datos si la muestra y
las fuentes disponibles las permiten. Esta ADR recoge las dos decisiones.

## Decisión 1 — La correlación de cola **no se implementa**

### Método evaluado

La medida estándar es el coeficiente de dependencia de cola:

```
λ = lím P(X < F⁻¹(u) | Y < F⁻¹(u))
    u→0⁺
```

En la práctica se estima con un umbral finito: la fracción de veces que A está
en su peor `u %` **dado que** B está en el suyo.

### Por qué no

Es un problema de **muestra**, y es aritmética, no opinión:

| Periodo ofrecido | Días | Umbral 5 % | Umbral 10 % |
|---|---:|---:|---:|
| 3 meses | ~63 | **3 días** | 6 días |
| 6 meses | ~126 | **6 días** | 13 días |
| 1 año | ~252 | **13 días** | 25 días |

Una probabilidad condicionada estimada sobre 3, 6 o 13 observaciones tiene un
intervalo de confianza tan ancho que cubre casi todo el rango posible. Con 13
días en la cola, que uno más o uno menos coincida mueve el resultado en
±8 puntos porcentuales.

El problema de fondo: **la cola es rara por definición**, y estimar lo raro
exige muchos datos. La aplicación ofrece como máximo un año porque es lo que dan
los proveedores gratuitos.

Y publicar el número igualmente sería lo peor de las tres opciones: es
precisamente la cifra que un usuario usaría para tomar la decisión más grave
—«¿me protege esto en un crash?»— y la que menos sostiene la muestra.

### Qué se hace en su lugar

`LAB-411` ya entrega **correlación en días de caída**, que es la pregunta que el
usuario tiene realmente en la cabeza. Se calcula sobre todos los días en que la
cartera cerró en negativo —del orden de 100 a 120 en un año, no 13— y detecta el
patrón relevante: que la dependencia suba justo cuando el reparto tenía que
sostener la cartera. No es lo mismo que la dependencia de cola, y por eso no se
presenta como tal.

**No bloquea G4**, según el criterio de aceptación de `LAB-414`.

### Cuándo reabrir

Si la aplicación llega a disponer de series de 5 años o más. Con ~1.260 días, el
5 % son 63 observaciones, que ya permite una estimación con intervalo declarable.

## Decisión 2 — El modelo de factores **se pospone**

### Por qué

1. **No hay series de factores con licencia clara.** Las de Kenneth French son
   gratuitas y de uso académico; su redistribución dentro de un producto no está
   autorizada de forma explícita. `ADR-004` ya descartó incorporar datos que no
   podemos redistribuir.
2. **Solo cubren mercados concretos.** Las series estándar son de EE. UU.; una
   cartera europea con ETF mundiales no se explica con ellas.
3. **Una regresión de factores sobre un año de datos no identifica nada.** Con
   ~252 observaciones y 4 o 5 regresores correlacionados entre sí, los
   coeficientes salen con errores estándar del orden de su propia magnitud.
4. **El coste de equivocarse es alto.** Una exposición a factores mal estimada
   se lee como un hecho sobre la cartera, y llevaría a reorganizarla.

El criterio de aceptación de `LAB-415` lo dice directamente: *no inferir factores
sin series adecuadas*. No las hay.

### Qué se hace en su lugar

Nada que lo aparente. La pantalla de Dependencia **no menciona factores**: no hay
sección vacía ni «próximamente». Lo que sí contesta —qué se mueve junto con qué,
y qué pasa en las caídas— es una parte de lo que un modelo de factores daría, y
se presenta por lo que es.

### Cuándo reabrir

Si se contrata un proveedor de series de factores con licencia de
redistribución, o si la aplicación acumula historial propio de varios años.

## Consecuencias

- La pantalla de Dependencia queda con tres análisis y no cinco. Los tres tienen
  muestra suficiente y lo declaran celda a celda.
- `CLAUDE.md` §3 —no inventar resultados— se cumple por omisión y no por aviso:
  lo que no se sostiene no se publica, ni siquiera con una advertencia al lado.
- G4 puede cerrarse: las dos tareas eran decisiones, y decidir «no» es cerrarlas.
