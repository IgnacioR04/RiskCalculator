# RiskCalculator — Especificación del proyecto

## Qué es

Calculadora y gestor de inversiones para inversores particulares que hacen
aportaciones periódicas u ocasionales. **No** está orientada a traders activos.

El problema central: cuando un activo ha bajado desde la compra, ayudar al
usuario a responder:

- ¿Cuánto capital adicional necesito para que, si el activo sube X % o alcanza
  un precio P, la posición vuelva a valer una cantidad de referencia?
- ¿Cuánto necesito para alcanzar el **punto de equilibrio económico real**
  (recuperar todo el capital aportado, incluida la aportación nueva)?
- Con un presupuesto A, ¿qué precio necesita el activo para cada objetivo?
- ¿Cuál sería el nuevo precio medio?
- ¿Qué beneficio/pérdida tendría en objetivos posteriores?
- ¿Cómo cambia el riesgo y la concentración de mi cartera?
- ¿Cómo se comparan varias aportaciones o estrategias de entrada?

La distinción entre **restaurar el valor inicial** y **punto de equilibrio
real** es central y no debe mezclarse nunca. Ver `CALCULATIONS.md`.

## Prioridades del piloto

1. Exactitud y utilidad de la calculadora.
2. Usabilidad y comprensión visual.
3. Portfolio general y análisis de riesgo.
4. Sistema de usuario y persistencia.
5. Ampliaciones posteriores.

## Alcance del MVP

Incluido:

- Posiciones spot long sin apalancamiento.
- Acciones, ETF, criptoactivos, oro/materias primas (vía instrumentos
  identificables), efectivo, activos manuales.
- Índices solo como referencia/benchmark (un índice no siempre es
  directamente invertible; la UI lo aclara).
- Una o múltiples compras por activo; múltiples cuentas/brókeres.
- EUR y USD (divisa de operación y divisa global de presentación).
- Entrada exacta, estimada y por importación JSON asistida por LLM externo.
- Actualización de cartera desde texto libre o capturas mediante un LLM
  externo, siempre con JSON validado y previsualización.
- Portfolio con métricas generales y análisis de riesgo.
- Comisiones manuales o estimadas mediante reglas configurables por bróker.
- Responsive escritorio y móvil. Interfaz en español.

Excluido del MVP (el modelo de datos permite ampliarlo, pero no se implementa):

- Futuros, shorts, apalancamiento, margen/liquidación, opciones.
- Conexión con brókeres o ejecución de órdenes.
- Asesoramiento financiero personalizado.
- Impuestos, spread, deslizamiento.
- Predicciones de precios mediante IA.

## Arquitectura

- **Frontend**: React 19 + TypeScript estricto + Vite. Zod para validación,
  decimal.js para cálculo financiero, Recharts para gráficas, Zustand para
  estado con persistencia local.
- **Backend**: Supabase (Auth por email/contraseña, PostgreSQL con RLS, Edge
  Functions para proveedores de mercado y secretos).
- **Despliegue**: GitHub Pages como piloto estático; Vercel queda como
  alternativa. GitHub Actions ejecuta lint, typecheck, unitarias, E2E y build.
- **Datos de mercado**: abstracción `MarketDataProvider`; Twelve Data como
  proveedor principal, CoinGecko de respaldo cripto, BCE para FX EUR,
  entrada manual y datos demo sin claves. Ver `DATA_SOURCES.md`.

## Navegación principal

1. Resumen
2. Calculadora
3. Portfolio
4. Escenarios
5. Importar
6. Perfil y ajustes

## Principios de producto

- Mobile first, lenguaje no técnico por defecto, fórmulas bajo demanda.
- Sin depender solo de rojo/verde; contraste accesible; navegación por teclado.
- Estados vacíos con ejemplos; datos demo claramente identificados.
- Máximo cuatro métricas principales simultáneas.
- Cada métrica de riesgo explica qué mide y qué no demuestra.
- Nota visible: la aplicación ofrece cálculos y análisis educativos, **no**
  asesoramiento financiero ni predicciones.

## Lenguaje financiero permitido/prohibido

Permitido: descripciones factuales de efectos («esta aportación reduciría el
precio medio de 70.000 a 62.000», «la concentración subiría del 30 % al 48 %»,
«históricamente esta modificación habría aumentado la volatilidad»).

Prohibido: órdenes o predicciones («compra», «vende», «va a subir», «esto es
un suelo», «inversión segura», «obtendrás esta rentabilidad»).

## Criterios de aceptación

Ver la lista completa en el prompt original del propietario; los numéricos
están implementados como tests en `src/lib/finance/*.test.ts`:

1. C_ref=100, V=90, g=5 % → A=5,238095…; valor futuro 100; capital total
   105,238095…; pérdida neta −5,238095…
2. BTC: 100 invertidos a 70.000; actual 58.000; objetivo 62.000 →
   restaurar ≈ 10,69; equilibrio real ≈ 165,71; la UI explica la diferencia.
3. Varias compras → cantidad, coste medio y P&L correctos.
4. Cambiar EUR↔USD recalcula con FX real, no solo el símbolo.
5. Operación estimada muestra fuente, timestamp y confianza.
6. Activo sin datos registrable manualmente.
7. JSON inválido no modifica el portfolio.
8. Preview antes de confirmar importación.
9. Métricas con datos insuficientes no muestran números engañosos.
10. RLS: un usuario no accede a datos de otro.
11. Sin claves privadas en bundle, Git ni logs.
12. Funciona en móvil y escritorio.
13. Instala, prueba y compila con comandos documentados.
14. Demo navegable con datos ficticios.
15. Si falta un FX necesario, la métrica se marca no disponible; nunca 1:1.
16. Una posición importada sin coste no fabrica rentabilidad cero.
17. Distribución por cuenta conserva correctamente el mismo activo en varios
    brókeres.
18. TWR, covarianzas, volatilidad ponderada y contribuciones al riesgo usan
    series comunes convertidas a la divisa de presentación.
