# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inversores particulares. El piloto actual sirve deliberadamente a dos perfiles
a la vez, sin haber decidido todavía cuál manda:

- **El que llega en pérdidas.** Una a tres posiciones que han bajado. Llega con
  una pregunta concreta y ansiosa ("¿cuánto tengo que aportar?"), poco
  vocabulario financiero y nada de paciencia para configurar.
- **El que ya tiene cartera.** Diez o más posiciones repartidas en varias
  cuentas y divisas. Usa la app como panel de control: concentración, riesgo,
  rentabilidad real, solapamientos.

Alcance actual: piloto privado (el autor y su círculo cercano). No hay usuarios
públicos que el diseño deba asumir.

## Product Purpose

Responder bien la pregunta que casi ninguna app responde bien: si un activo ha
bajado, cuánto hay que aportar para recuperarse — y qué significa exactamente
"recuperarse". La app distingue siempre dos objetivos que no deben confundirse:

| | Restaurar el valor inicial | Punto de equilibrio real |
|---|---|---|
| Pregunta | ¿Cuánto aporto para que la posición vuelva a *mostrar* 100? | ¿Cuánto aporto para *no perder dinero*, contando también lo nuevo? |
| Ejemplo (BTC 58.000, comprado con 100 a 70.000, objetivo 62.000) | ≈ 10,69 | ≈ 165,71 |

Alrededor de ese núcleo hay un gestor de cartera local y una capa de analítica
de riesgo. Éxito = el usuario entiende la diferencia entre los dos objetivos y
toma su decisión con una cifra en la que confía.

## Positioning

La distinción explícita entre *restaurar valor mostrado* y *equilibrio real*,
calculada y comparada en la misma pantalla, con el desglose matemático
expandible. Un competidor puede copiar una calculadora de coste medio; no puede
copiar esta distinción sin adoptar la tesis del producto.

Todo el cálculo es local y verificable: sin registro, sin claves, sin caja
negra.

## Operating Context

Ocho superficies (`src/pages`): Resumen, Calculadora, Portfolio, Riesgo,
Diversificación, Simular, Importar, Perfil.

- La app abre en una pantalla de acceso; hay credenciales demo del piloto y
  autenticación real opcional vía Supabase.
- Cartera de demostración cargable desde Resumen (23.049,26 € con BTC, IWDA,
  SXR8, Apple, Tesla y efectivo) con históricos sintéticos, para que la
  analítica funcione sin claves externas.
- Importación asistida por IA: el usuario copia un prompt, lo pega en un LLM
  externo, y trae el JSON de vuelta. Validación Zod, previsualización y
  confirmación explícita antes de escribir nada.
- Múltiples cuentas/brókeres, compras y ventas con coste medio, EUR/USD con
  tipo, fecha y fuente visibles.

## Capabilities and Constraints

- Web de solo-navegador (Vite + React 19 + TypeScript, React Router, Zustand,
  Recharts, decimal.js, Zod). Persistencia local con espejo opcional en
  Supabase protegido por RLS.
- Datos de mercado: Twelve Data vía proxy servidor (la clave nunca llega al
  navegador), CoinGecko para cripto sin clave, BCE para FX, precios manuales y
  datos demo etiquetados como tales.
- La analítica declara en pantalla sus mínimos de muestra y su cobertura: una
  métrica sin datos suficientes no se muestra como si los tuviera.
- Interfaz en español, sin plan de i18n. El diseño puede asumir longitudes de
  texto en español y no reservar espacio para traducciones.
- Terminología: se muestra el nombre técnico real de cada métrica (HHI, número
  efectivo de posiciones, XIRR, TWR, volatilidad, Sharpe, Sortino, beta, alpha,
  drawdown, contribución al riesgo) acompañado de una explicación en lenguaje
  llano accesible desde la propia métrica. Ni se ocultan los términos ni se
  dejan sin explicar.
- **Undecided:** cuál de los dos perfiles de usuario tiene prioridad cuando
  entran en conflicto (guía vs densidad); si el piloto se abre al público.

## Brand Commitments

Nombre: RiskCalculator. Sin logo, sin identidad visual establecida, sin
referencias visuales declaradas como vinculantes.

Restricciones de producto que el diseño futuro no puede romper:

1. La calculadora y el modo local siguen funcionando **sin registro, sin claves
   y sin nube**.
2. "Restaurar valor" y "equilibrio real" **nunca se muestran por separado sin
   su comparación**. Es el núcleo del producto, no una vista alternativa.

## Evidence on Hand

- Documentación real del repo: `README.md`, `docs/CALCULATIONS.md`,
  `docs/DATA_SOURCES.md`, `docs/DECISIONS.md`, `docs/PROJECT_SPEC.md`.
- Cartera de demostración con cifras concretas y históricos sintéticos: es la
  fuente de contenido realista para cualquier maqueta o prototipo.
- Tests: Vitest (motor financiero, importador, componentes) y Playwright
  (flujos de escritorio y móvil).
- **No existe y no debe fabricarse:** testimonios, clientes, número de usuarios,
  precios, planes, premios, benchmarks de rendimiento, ni cifras de mercado
  inventadas. Cualquier dato numérico en pantalla viene del motor o del demo.

## Product Principles

1. **La cifra antes que el adorno.** El usuario viene por un número; todo lo
   demás se subordina a que ese número se encuentre, se entienda y se crea.
2. **Dos objetivos, nunca uno.** Enseñar la diferencia es la función, no un
   detalle de implementación.
3. **Honestidad sobre los datos.** Fuente, fecha, tipo de cambio, cobertura y
   mínimos de muestra son visibles. Un dato demo se etiqueta como demo.
4. **Explicar sin infantilizar.** Se dice el nombre técnico y se explica al
   lado. El usuario sale sabiendo más vocabulario del que traía.
5. **Utilidad sin fricción de entrada.** Nada esencial detrás de un registro.

## Accessibility & Inclusion

No se ha establecido un estándar formal ni una necesidad de usuario específica.
Por el dominio (cifras densas, semáforos de riesgo, gráficas) el diseño debe
tratar como requisito de trabajo: contraste suficiente en tablas y gráficas, y
que el color nunca sea el único portador de significado en la señalización de
riesgo. **Undecided:** nivel WCAG objetivo.
