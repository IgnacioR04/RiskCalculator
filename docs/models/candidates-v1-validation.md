# Validación de carteras candidatas — v1

> `LAB-614`. Comparación fuera de muestra de las candidatas frente a 1/N y a la
> cartera actual. Fecha: 2026-08-20.
> Reproducible con `npm run bench:candidates`.

## 1. Qué se valida y qué no

Se valida que **cada candidata hace lo que dice hacer**, medido fuera de
muestra. No se valida que ninguna sea buena para nadie: eso depende de la
situación de cada uno, y esta aplicación no la conoce.

**No hay ninguna afirmación de rentabilidad.** Ninguno de los motores estima
rentabilidades esperadas, así que aquí no se compara ninguna. Lo único que se
compara es el riesgo realizado y lo que cuesta llegar.

## 2. Método

- **Walk-forward.** Se estima la covarianza con 252 días, se eligen los pesos
  con esa estimación, y se mide la volatilidad **realizada en los 63 días
  siguientes**, que el optimizador no ha visto. Se avanza 63 días y se repite.
  28 ventanas.
- **Dos regímenes.** El primero con volatilidades constantes; el segundo
  permutándolas a mitad de la serie, de forma que el activo tranquilo pase a ser
  el volátil. El primero es **favorable a los optimizadores** por construcción:
  la covarianza de ayer sigue valiendo hoy.
- **Datos sintéticos**, con dos factores comunes y volatilidades escalonadas.

## 3. Resultados

### Volatilidad realizada fuera de muestra

| Candidata | Régimen estable | Régimen cambiante | Peor ventana (cambiante) |
|---|---:|---:|---:|
| A partes iguales (1/N) | 12,96 % | 13,12 % | 16,74 % |
| Riesgo repartido (ERC) | 12,21 % | 12,44 % | 15,75 % |
| **Mínima varianza** | **11,67 %** | **12,13 %** | **15,33 %** |

28 ventanas por régimen, ningún fallo de convergencia.

### Coste de cálculo

| Candidata | 5 activos | 20 activos | 50 activos |
|---|---:|---:|---:|
| 1/N | 0,00 ms | 0,01 ms | 0,01 ms |
| ERC | 0,09 ms | 0,30 ms | 0,62 ms |
| Mínima varianza | 1,09 ms | 17,95 ms | **101,39 ms** |

Medianas, con calentamiento de JIT antes de medir.

## 4. La conclusión honesta, que no es la que favorece al producto

**La mínima varianza gana, y la ventaja es pequeña y probablemente se la comen
los costes.**

Los tres hechos que hay que leer juntos:

1. **Reduce la volatilidad realizada en ~1,0 punto** frente a 1/N en el régimen
   cambiante (12,13 % contra 13,12 %). Es una mejora real y medida, no una
   afirmación de folleto.
2. **Exige mover el 53 % de la cartera**, medido con la cartera de demostración.
   Eso son comisiones y, en España, impuesto sobre la plusvalía de todo lo que
   se venda —entre un 19 % y un 28 % de la ganancia—. Un punto de volatilidad
   menos no compensa obviamente ese peaje.
3. **Sus pesos son en buena parte ruido.** El análisis de robustez de `LAB-610`
   sobre la cartera de demostración da un rango de **0 % a 83 %** para IWDA y de
   **0 % a 79 %** para SXR8 al perturbar ligeramente los datos. El optimizador
   elige entre dos fondos casi idénticos de forma arbitraria.

**1/N no queda desacreditada.** Es la peor de las tres en volatilidad y la mejor
en todo lo demás: cuesta cero calcularla, no estima nada —así que no puede
equivocarse al estimar— y sus pesos son perfectamente estables por definición.
El punto de volatilidad que pierde es el precio de no depender de una matriz
estimada.

**ERC queda en medio, y es coherente con su diseño**: recorta volatilidad menos
que la mínima varianza pero concentra mucho menos —24 % en su mayor posición
frente al 79 %— y exige mover el 16 % en vez del 53 %.

## 5. Lo que esta validación NO demuestra

1. **Los datos son sintéticos y los generé yo.** Su estructura de covarianza es
   más estable y más limpia que la de un mercado real, incluso en el régimen
   «cambiante». Ese régimen permuta las volatilidades **una vez**, y solo una de
   las 28 ventanas cruza el cambio: el efecto está diluido. La ventaja medida
   es, casi con seguridad, **un techo** de lo que se vería con datos reales.
2. **No se ha validado con la cartera del usuario**, porque una cartera de cinco
   posiciones con un año de historial no da para 28 ventanas independientes.
3. **La volatilidad no es el riesgo.** Mide oscilación, no probabilidad de
   ruina. Una cartera de mínima varianza puede acabar concentradísima —y en la
   cartera de demostración acaba con un 79 % en una posición—.
4. **No se han modelado costes en el walk-forward.** Si se incluyeran, la
   ventaja de la mínima varianza se reduciría más, porque es la que más rota.

## 6. Correspondencia con lo que dice la interfaz

El criterio de aceptación exige que lo que afirma la pantalla coincida con esta
evidencia. Lo que la pantalla afirma es:

| Afirmación en pantalla | ¿Sostenida? |
|---|---|
| «Todas medidas con el mismo código y los mismos datos» | Sí, `LAB-609`: la cartera actual entra como una candidata más |
| «Ninguna viene marcada como la mejor» | Sí. Y esta validación explica por qué sería indefendible marcar una |
| «Ese número no es una decisión del optimizador: es ruido» | Sí, `LAB-610`, con el rango medido |
| «No se sabe» en el coste | Sí, `LAB-608`: sin precio de compra no se estima el impuesto |

**La pantalla no afirma en ningún sitio que una candidata vaya a comportarse
mejor**, y esta validación confirma que hacerlo no estaría justificado.
