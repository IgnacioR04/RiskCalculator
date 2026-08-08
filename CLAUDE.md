# CLAUDE.md — Laboratorio de RiskCalculator

Este repositorio implementa, entre otras cosas, el **Laboratorio** de RiskCalculator: estabilidad de cartera y escenarios/oportunidades. `docs/laboratorio-plan/` es la especificación completa y la fuente de verdad del plan (no un producto en sí mismo); el código real vive en `src/`, `supabase/`, etc., en la raíz de este mismo repositorio.

No implementes una fase completa de una vez. La unidad de trabajo es **una tarea `LAB-xxx`** del backlog, ejecutada como un cambio pequeño, comprobable y reversible. Para arrancar una sesión, usa el prompt de [PROMPT_UNIVERSAL_CLAUDE_CODE.md](PROMPT_UNIVERSAL_CLAUDE_CODE.md), que localiza automáticamente la fase y tarea activas.

## 1. Qué leer y cuándo

| Contexto | Cuándo leerlo |
|---|---|
| `CLAUDE.md` (este archivo) | Siempre |
| [PROMPT_UNIVERSAL_CLAUDE_CODE.md](PROMPT_UNIVERSAL_CLAUDE_CODE.md) | Al arrancar una sesión nueva sobre el Laboratorio |
| [docs/laboratorio-plan/README.md](docs/laboratorio-plan/README.md) | Siempre |
| [docs/laboratorio-plan/00-plan-maestro-laboratorio.md](docs/laboratorio-plan/00-plan-maestro-laboratorio.md) | Al comenzar una fase o tomar decisiones de alcance/arquitectura |
| [docs/laboratorio-plan/IMPLEMENTATION_STATUS.md](docs/laboratorio-plan/IMPLEMENTATION_STATUS.md) | Siempre |
| `docs/laboratorio-plan/phases/FASE-XX.md` de la fase activa | Siempre — define política de esfuerzo, checklist y regla de ejecución de esa fase |
| Tarea actual de [docs/laboratorio-plan/04-backlog-fases-y-tareas-ia.md](docs/laboratorio-plan/04-backlog-fases-y-tareas-ia.md) | Siempre (el archivo de fase resume la misma tarea; el backlog completo es la referencia si hace falta más contexto) |
| [docs/laboratorio-plan/01-especificacion-producto-ux.md](docs/laboratorio-plan/01-especificacion-producto-ux.md) | Tareas de UI/producto |
| [docs/laboratorio-plan/02-arquitectura-cuantitativa-datos.md](docs/laboratorio-plan/02-arquitectura-cuantitativa-datos.md) | Tareas de datos, cálculos, modelos y Supabase |
| [docs/laboratorio-plan/03-arquitectura-sistema-infraestructura-ci-cd.md](docs/laboratorio-plan/03-arquitectura-sistema-infraestructura-ci-cd.md) | Tareas de CI/CD, backend, despliegue y seguridad |
| [docs/laboratorio-plan/05-pruebas-seguridad-gobierno-modelos.md](docs/laboratorio-plan/05-pruebas-seguridad-gobierno-modelos.md) | Sección correspondiente a la tarea (pruebas, RLS, gobierno de modelos, checklist de PR/release) |

No leas los seis documentos enteros en cada turno. Lee `CLAUDE.md`, el `README.md` del plan, `IMPLEMENTATION_STATUS.md` y el archivo `phases/FASE-XX.md` de la fase activa; añade solo las secciones específicas de 01/02/03/05 que apliquen a esa tarea.

Cada fase tiene un archivo operativo en `docs/laboratorio-plan/phases/FASE-00.md` a `FASE-10.md`, con su propia política de esfuerzo (medium/high/xhigh/max), su checklist de tareas y su regla de ejecución. `04-backlog-fases-y-tareas-ia.md` sigue siendo el backlog íntegro y la referencia si un archivo de fase queda desactualizado; si discrepan, `IMPLEMENTATION_STATUS.md` decide.

## 2. Protocolo por tarea

1. Confirmar en `IMPLEMENTATION_STATUS.md` cuál es la tarea activa y que sus dependencias están terminadas.
2. Leer la tarea `LAB-xxx` en `04-backlog-fases-y-tareas-ia.md` y las secciones enlazadas de producto/datos/infraestructura/pruebas.
3. Inspeccionar el árbol real del repositorio (`src/`, `supabase/`, `package.json`, rutas, contratos). Los nombres de archivo del plan son objetivos razonables, no sustituyen la verificación del código actual.
4. Presentar alcance, archivos afectados y criterios de aceptación antes de implementar.
5. Implementar una porción vertical pequeña (1–5 archivos productivos, salvo migración o refactor mecánico justificado).
6. Añadir o actualizar pruebas en el mismo cambio.
7. Ejecutar lint, typecheck, tests relevantes y build.
8. Actualizar `IMPLEMENTATION_STATUS.md` (tarea, puerta, ADR, decisión resuelta si aplica).
9. No empezar la tarea siguiente hasta que la actual cumpla su Definition of Done ([00 §15](docs/laboratorio-plan/00-plan-maestro-laboratorio.md)).

### Regla de parada

Detente y pide una decisión si: falta una credencial/permiso, una migración exige destruir datos, dos documentos del plan se contradicen, una métrica no tiene tolerancia definida, el cambio convertiría una sugerencia educativa en asesoramiento personalizado, o los resultados de validación no cumplen la puerta de la fase. Detalle completo en [00 §13.4](docs/laboratorio-plan/00-plan-maestro-laboratorio.md).

## 3. Límites explícitos (nunca los cruces)

- No inventar datos de mercado, fundamentales, clasificaciones sectoriales ni resultados de backtest.
- No modificar una migración SQL ya aplicada; crear una migración aditiva nueva.
- No alojar secretos en el frontend, en `VITE_*` privadas ni en GitHub Pages.
- No acoplar componentes de presentación a proveedores externos.
- No usar un LLM para producir pesos, rentabilidades esperadas o puntuaciones de riesgo.
- No presentar una señal como recomendación personalizada de compra o venta.
- No activar sugerencias de empresas hasta superar las puertas de calidad del plan.
- No romper el modo local/demo ni exigir registro para las funciones esenciales.

## 4. Agentes especializados

No se crea un agente por fase. Se usan **cinco especialistas reutilizables**, invocados por el agente principal según la tarea:

| Agente | Rol | Cuándo usarlo |
|---|---|---|
| `repo-explorer` | Solo lectura. Busca arquitectura, dependencias y archivos afectados por la tarea. | Antes de implementar, en el paso de orientación. |
| `quant-reviewer` | Revisa fórmulas, tolerancias, sesgos y reproducibilidad. | Cualquier tarea que toque `analytics/`, cálculos financieros o modelos. |
| `security-reviewer` | Revisa Supabase, RLS, Edge Functions, secretos y CI/CD. | Cualquier tarea que toque `supabase/`, migraciones, workflows o autenticación. |
| `ux-accessibility-reviewer` | Revisa producto, estados (loading/empty/partial/stale/error), responsive y accesibilidad WCAG 2.2 AA. | Cualquier tarea de UI. |
| `test-reviewer` | Busca casos ausentes y verifica criterios de aceptación contra la tarea del backlog. | Antes de cerrar cualquier tarea. |

Reglas de uso:

- El **agente principal implementa**. Los especialistas **investigan o revisan**; no implementan por su cuenta salvo instrucción explícita.
- Un especialista se invoca cuando la tarea entra en su dominio, no en cada turno.
- Si dos agentes escriben simultáneamente, deben trabajar en worktrees y archivos claramente separados. Aislar sesiones cuando puedan tocar los mismos archivos ([guía oficial de trabajo paralelo](https://code.claude.com/docs/en/agents)).
- Ningún especialista sustituye el paso 8 (verificación con lint/typecheck/tests/build): son revisión adicional, no reemplazo de las puertas de CI.
