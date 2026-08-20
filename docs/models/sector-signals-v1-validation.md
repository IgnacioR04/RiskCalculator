# Validación de señales sectoriales — v1

> `LAB-710`. Informe de validación de las tres señales aprobadas en
> [`ADR-008`](../adr/ADR-008-sector-signals.md). Fecha: 2026-08-20.

## Conclusión, primero

**Las dos señales de momentum no se pueden validar, y por tanto no se publican.**
No es que salgan malas: es que **no se pueden ni calcular** con el historial que
la aplicación puede obtener.

La tercera señal —diversificación marginal— **sí se sostiene** y sí se publica,
porque no predice nada: describe la cartera de hoy.

ADR-008 previó exactamente este desenlace y dejó escrita la respuesta: *«si
LAB-710 concluye que ninguna hipótesis se sostiene, la decisión correcta es no
publicar el ranking»*. Se aplica a las dos que no se sostienen.

## 1. La aritmética que decide

No hace falta ejecutar ningún backtest para llegar aquí. Basta contar.

| Magnitud | Valor |
|---|---:|
| Historial máximo que descarga la aplicación | **365 días naturales** |
| Sesiones bursátiles en ese periodo | ~252 |
| Observaciones que necesita el momentum 12-1 para dar **un solo valor** | **253** |
| Periodos mensuales que necesita el backtest para concluir algo | **24** |
| Meses de historial que eso exige (12 de ventana + 24 de evaluación) | **36** |
| Meses de historial disponibles | **12** |

Dos conclusiones, y las dos son aritmética:

1. **Con 252 sesiones no sale ni un valor de momentum.** Falta una observación
   para la primera. La señal no produce nada que evaluar.
2. **Aunque saliera, harían falta 36 meses para validarla y hay 12.** La brecha
   es de tres a uno, no un margen estrecho que se pueda cerrar afinando.

Esta aritmética está fijada en `src/lib/lab/sectors/dataSufficiency.test.ts`. Si
algún día la aplicación descarga más historial, esas pruebas empezarán a fallar,
y ese fallo es la señal de revisar esta decisión.

## 2. Veredicto por señal

### Momentum 12-1 — `insufficient_sample`

> **Hipótesis:** los sectores que más han subido en doce meses, excluyendo el
> último, tienden a subir más los tres meses siguientes.

**No evaluada.** No se puede calcular la señal ni una vez. El veredicto **no es
«la hipótesis es falsa»**: es que no hay datos para pronunciarse, ni a favor ni
en contra.

Registro de modelos: se queda en `draft`. No se activa, así que no es publicable
por construcción (`isPublishable` devuelve `false`).

### Momentum ajustado por volatilidad — `insufficient_sample`

> **Hipótesis:** produce un ranking más estable que el momentum simple, con
> menos rotación.

**No evaluada**, por el mismo motivo: se calcula sobre el momentum 12-1, así que
hereda su falta de muestra. Se queda en `draft`.

Nótese que esta hipótesis era la más medible de las dos —habla de estabilidad,
no de rentabilidad— y aun así no llega: sin dos series de rankings no hay
rotación que comparar.

### Diversificación marginal — `supported`

> **Hipótesis:** añadir un sector poco correlacionado con la cartera reduce más
> su volatilidad que añadir uno muy correlacionado, para el mismo importe.

**Sostenida.** Su validación no es un backtest porque **no predice nada**: es
aritmética sobre la covarianza, y se comprueba en casos construidos a mano.

| Caso | Esperado | Medido |
|---|---|---|
| Correlación 0 frente a 0,95, mismo peso | La primera reduce más | Se cumple |
| Sector idéntico a la cartera (ρ = 1) | No cambia nada | 0,000 |
| Dos opuestos perfectos al 50 % (ρ = −1) | Volatilidad cero | −0,200 sobre 0,200 |
| Sector muy volátil pero descorrelacionado | Puede subir la volatilidad | Se cumple |

Se activa en el registro de modelos y **es lo único que la Fase 7 publica**.

## 3. Qué se hace con esto

- **No hay pantalla de ranking sectorial.** `LAB-713` se implementa como la
  pantalla que corresponde a este resultado: explica qué señales existen, cuál
  está activa y **por qué las otras dos no se muestran**. Una pantalla vacía con
  un «próximamente» sería peor que no tenerla.
- **La diversificación marginal sí llega al usuario**, integrada donde tiene
  sentido: contesta «¿qué le falta a mi cartera?», que es la misma pregunta que
  ya hace la pantalla de Reparar.
- **Los motores de momentum se conservan**, probados y en `draft`. No son código
  muerto: son código que espera datos, y la condición para activarlos está
  escrita y automatizada.

## 4. Por qué esto es un resultado y no un fracaso

Tres razones por las que este informe vale lo que ha costado:

1. **Sabemos exactamente qué falta**: 24 meses más de historial. No es una
   incógnita, es una cifra.
2. **La condición de reapertura está automatizada.** Nadie tiene que acordarse
   de revisar esto: las pruebas fallarán solas cuando cambie el supuesto.
3. **No se ha publicado un ranking que no se sostiene.** Con doce observaciones
   se puede producir un top de sectores con muy buena pinta, y habría sido
   indistinguible de la suerte. Publicarlo habría sido el error más caro de
   todo el proyecto, porque es la pantalla que más se parece a un consejo de
   inversión.

## 5. Limitaciones de esta propia validación

1. **La diversificación marginal se valida con aritmética, no con datos.**
   Comprueba que la fórmula es correcta, no que la covarianza que la alimenta
   sea buena. Esa limitación es la de la Fase 4 y ya está declarada allí.
2. **No se ha probado el momentum ni siquiera con datos sintéticos largos.**
   Habría sido posible y no aporta: demostrar que un motor funciona sobre datos
   inventados no dice nada sobre si la señal existe en los mercados.
3. **El umbral de 24 periodos es una convención declarada**, no un contraste
   formal. Está en `MIN_PERIODS` para poder discutirlo.

## 6. Cómo reabrir esto

Se cumple **cualquiera** de estas condiciones:

- La aplicación pasa a descargar 36 meses o más de historial diario.
- Se contrata un proveedor con series sectoriales largas.
- Alguien baja `MIN_PERIODS` de forma justificada y documentada — en cuyo caso
  la carga de la prueba es suya, y las pruebas de suficiencia se lo recordarán.
