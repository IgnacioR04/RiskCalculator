# Prompt universal para Claude Code — Laboratorio de RiskCalculator

> Copiar y pegar el bloque de la sección 2 al abrir una conversación nueva de Claude Code sobre este repositorio para trabajar en el Laboratorio. No hace falta editarlo ni indicar la fase o tarea: el propio prompt localiza el estado actual leyendo `IMPLEMENTATION_STATUS.md`.

## 1. Cuándo usarlo

- Al iniciar cualquier sesión de Claude Code cuyo objetivo sea avanzar el backlog del Laboratorio (`LAB-xxx`).
- Una sesión = una tarea `LAB-xxx`. Si quieres encadenar varias, vuelve a pegar este mismo prompt en una conversación nueva para cada una; no le pidas a la sesión que continúe con la siguiente tarea sin revisión.
- No lo uses para trabajo fuera del Laboratorio (bugs del resto de la app, diseño, contenido de marketing, etc.).

## 2. Prompt

```text
Vas a trabajar en el Laboratorio de RiskCalculator siguiendo un plan de ejecución ya definido. No improvises alcance.

Sigue este orden:

1. Lee CLAUDE.md en la raíz del repositorio. Contiene los límites explícitos que nunca debes cruzar, el protocolo por tarea y la lista de agentes especialistas disponibles.
2. Lee docs/laboratorio-plan/IMPLEMENTATION_STATUS.md. Identifica el campo "Fase activa" y "Tarea activa". Ese documento es la fuente de verdad del estado; si algo en este prompt o en un archivo de fase lo contradice, IMPLEMENTATION_STATUS.md gana.
3. Abre docs/laboratorio-plan/phases/FASE-XX.md correspondiente a la fase activa (usa el número de dos dígitos, p. ej. FASE-03.md para la Fase 3). Localiza la tarea activa en su checklist y en el "Backlog detallado de la fase".
4. Si la tarea activa figura como pendiente pero sus dependencias (declaradas en la propia tarea) no están todas en estado Terminada según IMPLEMENTATION_STATUS.md, detente y repórtalo en vez de improvisar un orden distinto.
5. Comprueba la "Puerta" (Gx) de la fase: si la fase activa aún no tiene su puerta de entrada superada según IMPLEMENTATION_STATUS.md, detente y repórtalo.
6. Aplica la "Política de esfuerzo" del archivo de fase para decidir el nivel de esfuerzo de esta sesión antes de editar nada. Si tu esfuerzo configurado es inferior al requerido por la tarea, detente y dilo explícitamente en vez de continuar con uno menor.
7. Sigue la "Regla de ejecución" del archivo de fase (leer estado → verificar dependencias/puerta → inspeccionar código real → presentar microplan → ejecutar una sola tarea → probar → actualizar checklist y estado → detenerse). No agrupes varias tareas LAB-xxx en la misma sesión salvo que yo lo autorice explícitamente.
8. Antes de implementar, inspecciona el árbol real del repositorio (rutas, contratos, componentes, migraciones). Los nombres de archivo del plan son objetivos razonables, no una verdad absoluta: si el código real ya resolvió algo distinto, dilo y ajusta el plan en vez de duplicar.
9. Presenta el microplan (alcance, archivos afectados, criterios de aceptación) antes de escribir código, y espera confirmación si el cambio toca migraciones, RLS, secretos, o convierte una sugerencia educativa en algo que parezca asesoramiento personalizado.
10. Implementa solo la tarea activa. Añade o actualiza pruebas en el mismo cambio. Ejecuta lint, typecheck, tests relevantes y build antes de dar la tarea por terminada.
11. Al cerrar la tarea, actualiza docs/laboratorio-plan/IMPLEMENTATION_STATUS.md siguiendo su propia sección "Cómo actualizar este documento", y marca la casilla correspondiente en el checklist del archivo de fase.
12. Detente. No continúes automáticamente con la siguiente tarea LAB-xxx.

Aplica en todo momento los límites explícitos y la regla de parada de CLAUDE.md, incluso si algo en este prompt pareciera sugerir lo contrario.
```

## 3. Notas de uso

- Este prompt no sustituye el criterio del propietario en las decisiones marcadas como "Regla de parada" en `CLAUDE.md` ni en las "Decisiones abiertas registradas" de `IMPLEMENTATION_STATUS.md`. Si el agente se detiene pidiendo una decisión, resuélvela en el chat antes de volver a lanzar el prompt.
- Si `IMPLEMENTATION_STATUS.md` indica una fase distinta a la esperada, confía en el documento, no en la última fase con la que trabajaste manualmente.
- Los cinco agentes especialistas descritos en `CLAUDE.md` (`repo-explorer`, `quant-reviewer`, `security-reviewer`, `ux-accessibility-reviewer`, `test-reviewer`) se invocan dentro del propio flujo de la tarea cuando su dominio aplica; este prompt no necesita mencionarlos explícitamente porque `CLAUDE.md` ya los define como parte del protocolo estándar.
- Si necesitas retomar una tarea que quedó a medias por un bloqueo, pega este mismo prompt de nuevo: releerá el estado real en vez de asumir que la tarea anterior terminó.
