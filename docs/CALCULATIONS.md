# Fórmulas financieras

Todas implementadas como funciones puras en `src/lib/finance/` con
`decimal.js` (28 dígitos significativos) y probadas en `*.test.ts`.
La aplicación distingue **dos objetivos que nunca se mezclan**.

## 1. Restaurar el valor inicial de referencia

> «Invertí 100, ahora vale 90. ¿Cuánto añado hoy para que, si sube un 5 %,
> la posición vuelva a valer 100?»

Variables:

- `C_ref` — valor inicial de referencia que se quiere restaurar.
- `V_actual` — valor actual de la posición antes de la nueva aportación.
- `g` — subida esperada desde el precio actual hasta el objetivo (g > −1).
- `A` — aportación adicional.

Sin comisiones ni variación de divisa:

```
A = max(0, C_ref / (1 + g) − V_actual)
```

**Caso de aceptación:** C_ref=100, V_actual=90, g=0,05 →
A = 100/1,05 − 90 = **5,238095…**; valor en el objetivo = 100; capital
histórico total = 105,238095…; **pérdida neta en ese objetivo = −5,238095…**

La UI llama a este resultado «capital para restaurar el valor inicial»,
**no** «punto de equilibrio», y explica que volver a ver 100 en pantalla no
significa recuperar todo el dinero aportado, porque se añadió capital nuevo.

Función: `restoreValueContribution()` en `recovery.ts`.

## 2. Punto de equilibrio económico real

Incluye TODO el capital aportado, también la aportación nueva. Para una
posición de `q` unidades, coste histórico `C`, precio actual `P_actual`,
precio objetivo `P_obj` y aportación `A` (comprada a `P_actual`):

```
(q + A / P_actual) · P_obj = C + A
```

Despejando cuando es resoluble:

```
A = (C − q · P_obj) / (P_obj / P_actual − 1)
```

### Análisis de dominio (implementado en `breakevenContribution()`)

Sea `net(A) = q·P_obj − C + A·(P_obj/P_actual − 1)` el resultado neto en el
objetivo en función de la aportación.

- **P_obj > P_actual** (denominador > 0):
  - Si `C ≤ q·P_obj`: el objetivo ya está alcanzado con A=0
    (estado `already_achieved`); la fórmula daría A ≤ 0 y **nunca se muestra
    una aportación negativa**.
  - Si `C > q·P_obj`: A > 0 válida (estado `achievable`).
- **P_obj = P_actual**: la aportación nueva vale exactamente lo aportado, no
  cambia el neto. Alcanzado si `q·P_actual ≥ C`; inalcanzable en caso
  contrario (`unreachable`: ninguna aportación lo logra).
- **P_obj < P_actual** (denominador < 0): cada euro nuevo pierde valor en el
  objetivo. Alcanzado solo si `q·P_obj ≥ C` con A=0; si no, `unreachable`.
  (La raíz positiva de la ecuación en este caso es el punto donde las
  pérdidas del capital nuevo agotan el excedente previo; no es una
  aportación útil y no se presenta como tal.)

**Caso de aceptación (BTC):** inversión 100 a 70.000 → q = 1/700;
P_actual = 58.000; P_obj = 62.000.

- Restaurar valor inicial: V_actual = 58.000/700 = 82,857142…;
  g = 62.000/58.000 − 1; A = 100·(58.000/62.000) − 82,857142… =
  **10,691244…** (≈ 10,69)
- Equilibrio real: A = (100 − 62.000/700) / (62.000/58.000 − 1) =
  11,428571… / 0,068965… = **165,714285…** (≈ 165,71)

No son equivalentes: restaurar solo pide que la posición vuelva a mostrar
100; el equilibrio real exige recuperar además los ~10,69/165,71 nuevos.

## 3. Precio de equilibrio con presupuesto conocido

Si el usuario aporta un presupuesto `A`:

```
P_equilibrio = (C + A) / (q + A / P_actual)
```

Coincide con el **nuevo precio medio** de la posición (por definición:
equilibrio ⇔ precio = coste medio). Función: `targetPriceWithBudget()`.

## 4. Resultado en un objetivo posterior

Para un segundo precio `P_2` y aportación `A`:

```
q_nueva        = q + A / P_actual
valor_futuro   = q_nueva · P_2
capital_total  = C + A
resultado_neto = valor_futuro − capital_total
rentab_neta_%  = resultado_neto / capital_total
precio_medio   = capital_total / q_nueva
P&L posición previa    = q · P_2 − C
P&L aportación nueva   = (A / P_actual) · P_2 − A
```

Se presentan por separado (función `outcomeAtPrice()`).

## 5. Agregación de posiciones desde transacciones

Las posiciones se derivan del registro de transacciones, en orden temporal,
con **método de coste medio**:

- Compra: `q += q_i`; `C += importe_i`.
- Venta: `P&L realizado += q_venta · (precio_venta − coste_medio)`;
  `C −= q_venta · coste_medio`; `q −= q_venta`.
- Coste medio = `C / q` (si q > 0).
- P&L no realizado = `q · P_actual − C`.

Ventas por encima de la cantidad disponible se rechazan con error explícito.

## 6. Divisas

- Cada transacción registra divisa de inversión y divisa de cotización.
- Valoración actual: cambio más reciente disponible.
- Resultados históricos: cambio de la fecha de la operación cuando exista.
- Siempre se muestra: divisa original, importe convertido, tipo aplicado,
  fecha y fuente del cambio, y si es actual/histórico/estimado.
- Cuando es posible se separa: rendimiento del activo, efecto divisa y
  rendimiento total en divisa del usuario:
  `(1 + r_total) = (1 + r_activo) · (1 + r_fx)`.

## 7. Métricas de portfolio

- Concentración: HHI = Σ w_i²; número efectivo de posiciones = 1/HHI.
- Rentabilidad simple = (valor − capital aportado neto) / capital aportado.
- XIRR: TIR de los flujos con fechas reales (Newton con bisección de respaldo);
  requiere al menos un flujo negativo y uno positivo; si no converge se
  informa, no se muestra un número.
- Volatilidad anualizada, drawdown máximo, Sharpe/Sortino, beta/alpha/R²,
  correlación: solo con muestra suficiente (mínimo declarado en la UI, no se
  rellenan huecos silenciosamente; se muestra nº de observaciones).
- Tasa libre de riesgo usada: declarada junto a Sharpe/Sortino (0 % por
  defecto, configurable).

## 8. Escenarios de estrés

Shocks deterministas (no predicciones): caída porcentual general, shocks por
clase, caída de un activo concreto, movimiento EUR/USD, combinaciones.
Se aplican sobre la valoración actual y se recalculan métricas.
