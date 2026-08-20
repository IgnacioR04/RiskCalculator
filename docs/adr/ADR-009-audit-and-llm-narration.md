# ADR-009 — Auditoría y narración con LLM

- **Estado:** aceptada
- **Fecha:** 2026-08-20
- **Tareas:** `LAB-906` (auditoría), `LAB-908` (spike de LLM), `LAB-909` (narración opcional)

## Contexto

La Fase 9 contemplaba tres cosas más allá de la trazabilidad: un registro de
auditoría en Supabase, un estudio sobre usar un LLM para redactar explicaciones,
y su implementación opcional.

## Decisión 1 — La auditoría es el historial de cálculos, no una tabla nueva

`LAB-906` pedía una tabla `lab_audit_events` con escritura de servicio y RLS.

**No se implementa.** La auditoría que este producto necesita ya existe:
`LAB-905` lista cada cálculo con su fecha de datos, su instante de ejecución, su
versión de modelo, sus entradas y su resultado. Eso es exactamente lo que un
registro de auditoría contiene.

### Por qué no una tabla

1. **Un registro de auditoría en servidor es un rastro de uso.** Guardaría
   cuándo el usuario mira su cartera y qué mira, que es información que hoy no
   sale de su navegador. `ADR-006` estableció que la cartera no viaja; su patrón
   de uso tampoco debería.
2. **Con un solo usuario, la auditoría protege de uno mismo, no de terceros.**
   Su función aquí es poder explicar un resultado meses después, y para eso el
   historial local basta.
3. **Añadir una tabla más sobre D14 y D15 sin resolver** —tipos de Supabase
   escritos a mano, escrituras multi-tabla no atómicas— multiplica un problema
   abierto.

### Qué se hace en su lugar

- El historial local es la auditoría, con retención acotada a 50 registros
  (`LAB-311`) y borrado explícito por el usuario.
- La exportación de `LAB-907` permite sacar un registro fuera para conservarlo,
  con su contexto pegado.

### Cuándo reabrir

Si la aplicación llega a tener más de un usuario por cuenta, o si un requisito
externo exige conservar un rastro fuera del dispositivo.

## Decisión 2 — El LLM **no redacta explicaciones**

`LAB-908` pedía un spike. Este es el resultado.

### Lo que se evaluó

Usar un modelo de lenguaje para convertir un resultado en prosa, en lugar de las
plantillas deterministas de `LAB-903`.

### La razón por la que no, y no es la que parece

No es que un LLM redacte mal: redactaría mejor. Es que **rompería una propiedad
que la aplicación tiene ahora y que no puede permitirse perder**.

Hoy la explicación es una función pura del resultado: mismo dato, misma frase,
siempre. Eso significa que si dos ejecuciones se describen distinto, **cambió el
dato**. Con un LLM en medio, esa inferencia deja de valer: el usuario ve dos
textos distintos y no puede saber si cambió el número o la redacción.

En una aplicación cuyo principio de diseño es que se pueda comprobar todo lo que
dice, perder eso a cambio de mejor prosa es un mal cambio.

### Los otros tres motivos, en orden de peso

1. **Enviaría la cartera a un tercero.** Explicar un resultado exige mandarle el
   resultado, y un resultado contiene la cartera implícitamente. Es la misma
   razón que cerró ADR-006 y ADR-007.
2. **Un LLM añade cifras.** Es su comportamiento normal: redondea, compara,
   contextualiza. Cualquier número que aparezca y no venga del cálculo es un
   número que nadie ha calculado. `LAB-903` tiene una prueba que lo impide por
   construcción; con un LLM habría que confiar.
3. **`CLAUDE.md` §3 lo prohíbe para pesos, rentabilidades y puntuaciones.** No
   prohíbe redactar, pero la frontera entre «redactar» y «interpretar» es
   precisamente donde un modelo se desliza sin avisar.

## Decisión 3 — `LAB-909` no se implementa

La narración opcional dependía de que el spike saliera favorable. No ha salido.

Implementarla como opción apagada por defecto tampoco se hace: sería mantener
código, una superficie de red y un interruptor para una función que la decisión
anterior desaconseja usar.

### Lo que sí queda

`explanations.ts` está diseñado para que una capa de narración se pueda añadir
**encima** sin tocarlo: recibe una evidencia y devuelve líneas con su papel
(`claim`, `method`, `limitation`…). Si algún día se reabre esto, el punto de
enganche existe y la garantía de determinismo se mantiene para la capa de
debajo.

## Consecuencias

- La Fase 9 entrega trazabilidad completa **sin ninguna dependencia externa
  nueva**: ni tabla, ni servicio, ni modelo.
- La explicación de cualquier número es reproducible, y eso es comprobable.
- G9 puede cerrarse: las tres tareas eran decisiones, y decidir «no» con
  argumentos es cerrarlas.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Tabla de auditoría en Supabase | Sería un rastro de uso fuera del dispositivo, para un solo usuario |
| LLM redactando explicaciones | Rompe el determinismo, envía la cartera fuera y añade cifras |
| LLM local en el navegador | Resolvería la privacidad, no el determinismo ni las cifras añadidas, y pesaría más que toda la aplicación |
| Narración opcional apagada por defecto | Mantener código y superficie de red para algo que no conviene encender |
