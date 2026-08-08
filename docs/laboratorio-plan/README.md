# Plan de construcción del Laboratorio de RiskCalculator

## 1. Propósito del paquete

Este paquete convierte la idea del nuevo Laboratorio en una especificación ejecutable para el repositorio público [IgnacioR04/RiskCalculator](https://github.com/IgnacioR04/RiskCalculator). Está pensado para que una persona o una IA pueda implementar el producto mediante cambios pequeños, comprobables y reversibles, sin intentar construir a la vez la interfaz, el modelo cuantitativo, el almacenamiento y la infraestructura.

El Laboratorio se divide en dos áreas:

1. **Estabilidad de la cartera**: explica la cartera actual y su comportamiento histórico mediante exposición, concentración, dependencia, riesgo, contribuciones, regímenes y pruebas de estrés.
2. **Escenarios y oportunidades**: permite explorar futuros posibles, reparar desequilibrios, comparar carteras candidatas y obtener sectores —y más adelante empresas— que merecen investigación adicional según el perfil y las restricciones del usuario.

El producto no debe prometer rentabilidad, seguridad ni capacidad predictiva. Debe distinguir siempre entre hechos observados, estimaciones, escenarios, señales y sugerencias de investigación.

## 2. Orden de lectura

| Orden | Documento | Para qué sirve |
|---:|---|---|
| 1 | [00-plan-maestro-laboratorio.md](./00-plan-maestro-laboratorio.md) | Define alcance, arquitectura global, principios, fases, dependencias y protocolo para ejecutar el plan. |
| 2 | [01-especificacion-producto-ux.md](./01-especificacion-producto-ux.md) | Especifica navegación, pantallas, componentes, estados, textos, accesibilidad y recorridos de usuario. |
| 3 | [02-arquitectura-cuantitativa-datos.md](./02-arquitectura-cuantitativa-datos.md) | Define entidades, contratos, cálculos, modelos, fuentes de datos y diseño de los motores analíticos. |
| 4 | [03-arquitectura-sistema-infraestructura-ci-cd.md](./03-arquitectura-sistema-infraestructura-ci-cd.md) | Diseña frontend, backend, procesos programados, seguridad, observabilidad y despliegues con GitHub Actions. |
| 5 | [04-backlog-fases-y-tareas-ia.md](./04-backlog-fases-y-tareas-ia.md) | Fragmenta la ejecución en épicas y tareas pequeñas con dependencias, archivos, pruebas y aceptación. |
| 6 | [05-pruebas-seguridad-gobierno-modelos.md](./05-pruebas-seguridad-gobierno-modelos.md) | Define la estrategia de calidad, validación cuantitativa, RLS, privacidad, monitorización y criterios de lanzamiento. |

## 3. Cómo debe usarlo una IA implementadora

La IA no debe interpretar este conjunto como una orden para implementar todas las fases de una vez. Para cada iteración:

1. Elegir **una sola tarea LAB-xxx** del backlog.
2. Confirmar que sus dependencias están terminadas.
3. Leer las secciones enlazadas de producto, datos, infraestructura y pruebas.
4. Inspeccionar el código real antes de proponer cambios. Los nombres de archivos del plan son objetivos razonables, no sustituyen la verificación del árbol actual.
5. Presentar el alcance del cambio, los archivos afectados y los criterios de aceptación.
6. Implementar una porción vertical pequeña. Como regla práctica, una solicitud de cambios debería modificar entre uno y cinco archivos productivos, salvo migraciones o refactorizaciones mecánicas justificadas.
7. Añadir o actualizar pruebas en el mismo cambio.
8. Ejecutar lint, comprobación de tipos, pruebas relevantes y build.
9. Documentar cualquier decisión que altere contratos, modelos, persistencia o seguridad.
10. No empezar la tarea siguiente hasta que la actual cumpla su Definition of Done.

### Límites explícitos para la IA

- No inventar datos de mercado, fundamentales, clasificaciones sectoriales ni resultados de backtest.
- No cambiar una migración SQL ya aplicada; crear una migración aditiva nueva.
- No alojar secretos en el frontend, en variables `VITE_*` privadas ni en GitHub Pages.
- No acoplar componentes de presentación a proveedores externos.
- No usar un LLM para producir pesos, rentabilidades esperadas o puntuaciones de riesgo.
- No presentar una señal como recomendación personalizada de compra o venta.
- No activar sugerencias de empresas hasta superar las puertas de calidad descritas en este plan.
- No romper el modo local/demo ni exigir registro para las funciones esenciales.

## 4. Resultado objetivo

Al finalizar todas las fases aprobadas, un usuario podrá:

- Definir objetivos, horizonte, tolerancia, capacidad de asumir pérdidas, necesidades de liquidez y restricciones.
- Ver si sus datos son suficientes y recientes.
- Entender dónde está realmente expuesto, incluso mediante el look-through de fondos cuando haya datos disponibles.
- Medir concentración, dependencia, riesgo total, riesgo a la baja y aportación marginal de cada posición.
- Explorar escenarios históricos e hipotéticos sin confundirlos con pronósticos.
- Comparar la cartera actual con carteras candidatas robustas y explicables.
- Recibir una lista priorizada de sectores para investigar, acompañada de evidencia, incertidumbre, fecha de cálculo y motivos de exclusión.
- Comprender costes, rotación, impuestos configurables y desviaciones frente a su política de inversión.
- Guardar comparaciones y revisar cómo cambian las conclusiones cuando cambian los supuestos.

## 5. Decisiones que el plan deja deliberadamente abiertas

Estas decisiones requieren un spike o una elección del propietario antes de la fase correspondiente:

| Decisión | Momento límite | Opciones |
|---|---|---|
| Proveedor de clasificaciones, fundamentales y componentes de ETF | Antes de LAB-401 | Proveedor licenciado; datos públicos con cobertura declarada; entrada manual; posponer look-through. |
| Motor de optimización avanzada | Antes de LAB-603 | TypeScript para universos pequeños; servicio Python aislado para optimización convexa y universos amplios. |
| Alcance jurídico de la personalización | Antes del lanzamiento público de señales | Herramienta educativa; sugerencias de investigación; asesoramiento regulado con revisión legal y controles adicionales. |
| Tratamiento fiscal | Antes de mostrar resultados netos | Solo estimación configurable; reglas por jurisdicción; exclusión explícita del MVP. |
| Cobertura geográfica | Antes de datos fundamentales | UE/España primero; EE. UU.; universo global con monedas y calendarios adicionales. |

## 6. Definiciones abreviadas

- **Hecho**: dato observado con fuente y marca temporal.
- **Estimación**: magnitud inferida mediante un método y acompañada de incertidumbre.
- **Escenario**: supuesto condicional; no afirma que vaya a ocurrir.
- **Señal**: transformación reproducible de datos que puede ayudar a ordenar un universo.
- **Sugerencia de investigación**: activo o sector que supera filtros explícitos; no equivale a comprar.
- **Cartera candidata**: conjunto de pesos generado bajo restricciones para comparación; no es una orden.
- **IPS**: política de inversión del usuario: objetivos, riesgo, horizonte, liquidez, restricciones y reglas de mantenimiento.
- **Run analítico**: ejecución inmutable que enlaza entradas, datos, versiones de modelo y resultados.

## 7. Fuentes de referencia

Las decisiones principales se apoyan en el estado real del repositorio y, cuando procede, en documentación primaria:

- [GitHub: uso seguro de GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub: OpenID Connect](https://docs.github.com/en/actions/concepts/security/openid-connect)
- [Supabase: despliegue y entornos](https://supabase.com/docs/guides/deployment)
- [Supabase: pruebas en CI](https://supabase.com/docs/guides/deployment/ci/testing)
- [Supabase: programación de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [ESMA: evaluación de idoneidad MiFID II](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-25-assessment-suitability-and)
- [ESMA: uso de IA en servicios de inversión](https://www.esma.europa.eu/press-news/esma-news/esma-provides-guidance-firms-using-artificial-intelligence-investment-services)

---

**Estado del documento:** especificación de construcción, versión 1.0, 8 de agosto de 2026.  
**Criterio rector:** primero corregir estructura, datos y riesgo; después añadir señales tácticas.
