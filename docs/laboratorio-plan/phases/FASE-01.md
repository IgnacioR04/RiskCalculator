# Fase 01 — Shell y migración de navegación

> Archivo operativo para Claude Code. Ejecutar una sola tarea LAB por conversación.

## Control de fase

| Campo | Valor |
|---|---|
| Importancia | ALTA |
| Sensibilidad | MEDIA-BAJA |
| Esfuerzo predeterminado | medium |
| Entrada/autorización | Requiere G0 superada. |
| Funcionalidad a posponer | No cambiar cálculos, dominio, Supabase ni resultados. |

## Política de esfuerzo

- Usar **medium** como punto de partida de la fase.
- Escalar a **xhigh**: No previsto. Subir a high para integración de rutas, compatibilidad y cierre G1.
- Uso de **max**: No usar max.
- El esfuerzo alto no sustituye pruebas, fixtures ni revisión independiente.
- Si la sesión tiene un esfuerzo inferior al requerido, detenerse antes de editar.

## Contexto que debe leer el agente

Siempre:

- [Estado de implementación](../IMPLEMENTATION_STATUS.md)
- [Índice del plan](../README.md)
- [Backlog completo](../04-backlog-fases-y-tareas-ia.md)

Específico de esta fase:

- [../00-plan-maestro-laboratorio.md](../00-plan-maestro-laboratorio.md)
- [../01-especificacion-producto-ux.md](../01-especificacion-producto-ux.md)
- [../03-arquitectura-sistema-infraestructura-ci-cd.md](../03-arquitectura-sistema-infraestructura-ci-cd.md)
- [../05-pruebas-seguridad-gobierno-modelos.md](../05-pruebas-seguridad-gobierno-modelos.md)

No leer los documentos completos si basta con localizar las secciones relacionadas con la tarea.

## Regla de ejecución

1. Leer estado y localizar la tarea actual.
2. Verificar dependencias y gate.
3. Inspeccionar código real y cambios existentes.
4. Presentar microplan.
5. Ejecutar una sola tarea.
6. Probar.
7. Actualizar este checklist y el estado.
8. Detenerse.

El checklist de este archivo ayuda a navegar, pero `IMPLEMENTATION_STATUS.md` tiene prioridad si existe una discrepancia.

## Checklist de tareas

- [x] LAB-101 — Definir contratos de ruta *(2026-08-09)* — `src/features/lab/routes/labRoutes.ts`: 16 rutas con ID estable, padre, migas y redirecciones
- [x] LAB-102 — Crear LabShell *(2026-08-09)* — cabecera de contexto, áreas, subnavegación responsive y migas; 17 pruebas
- [x] LAB-103 — Registrar rutas lazy *(2026-08-09)* — `/laboratorio/*` en un chunk diferido, portadas informativas y **acceso sin cuenta** (cierra D3)
- [x] LAB-104 — Actualizar navegación global *(2026-08-09)* — Laboratorio en rail y barra móvil, y menú «Más» para que ninguna sección quede sin entrada visible
- [x] LAB-105 — Adaptar Riesgo dentro de Estabilidad *(2026-08-09)* — misma implementación reutilizada; paridad numérica comprobada en E2E
- [ ] LAB-106 — Adaptar Diversificación
- [ ] LAB-107 — Adaptar Simular
- [ ] LAB-108 — Crear redirecciones legacy
- [ ] LAB-109 — Portada inicial del Laboratorio
- [ ] LAB-110 — E2E de migración

---

## Backlog detallado de la fase

## Objetivo

Introducir Laboratorio sin perder funciones actuales.

## Entrada

G0 superada.

## Salida

- rutas nuevas;
- shell;
- navegación móvil;
- vistas existentes adaptadas;
- redirecciones legacy.

## Puerta G1

- todos los recorridos actuales siguen disponibles;
- rutas nuevas están lazy-loaded;
- no se han cambiado resultados numéricos;
- desktop/móvil pasan E2E.

### LAB-101 — Definir contratos de ruta

**Dependencias:** G0.
**Objetivo:** centralizar paths, etiquetas y breadcrumbs.

**Archivos esperados:**

- `src/features/lab/routes/labRoutes.ts`;
- pruebas de rutas.

**Pasos:**

1. Codificar mapa de rutas del documento 01.
2. Definir helpers y metadata.
3. Evitar strings duplicados.
4. Preparar legacy mapping.

**Pruebas:** generación de paths y breadcrumbs.
**Aceptación:** toda ruta del Laboratorio tiene ID estable y padre.

### LAB-102 — Crear LabShell

**Dependencias:** LAB-101, LAB-006.
**Objetivo:** shell con cabecera y dos áreas, inicialmente sin datos avanzados.

**Archivos esperados:**

- `src/features/lab/components/LabShell.tsx`;
- `src/features/lab/components/LabContextHeader.tsx`;
- estilos/pruebas.

**Pasos:**

1. Implementar landmarks.
2. Tabs Estabilidad/Futuro.
3. Subnavegación responsive.
4. Slots para cartera, asOf, IPS y calidad.
5. Skeletons sin métricas ficticias.

**Pruebas:** render, teclado, móvil.
**Aceptación:** foco, tab seleccionada y breadcrumbs correctos.

### LAB-103 — Registrar rutas lazy

**Dependencias:** LAB-102.
**Objetivo:** integrar el shell en `App.tsx`.

**Archivos esperados:**

- `src/App.tsx`;
- páginas placeholder;
- pruebas de routing.

**Pasos:**

1. Añadir entrada `/laboratorio`.
2. Añadir subrutas con lazy import.
3. Crear portadas mínimas informativas.
4. Respetar base y HashRouter.

**Pruebas:** navegación directa y recarga.
**Aceptación:** no aumenta el chunk inicial más allá del presupuesto.

### LAB-104 — Actualizar navegación global

**Dependencias:** LAB-103.
**Objetivo:** incorporar Laboratorio en side rail y móvil.

**Archivos esperados:**

- `src/components/shell/sections.ts`;
- `src/components/shell/AppShell.tsx`;
- pruebas.

**Pasos:**

1. Añadir destino Laboratorio.
2. Cambiar los cinco destinos móviles a Resumen, Calculadora, Cartera, Laboratorio, Perfil.
3. Mantener Importar accesible desde menú/contexto.
4. Definir icono y estado activo.

**Pruebas:** navegación teclado y móvil.
**Aceptación:** ninguna sección queda inaccesible.

### LAB-105 — Adaptar Riesgo dentro de Estabilidad

**Dependencias:** LAB-103.
**Objetivo:** renderizar la vista actual sin copiar lógica.

**Archivos esperados:**

- adaptador/página `LabRiskLegacyPage.tsx`;
- cambios mínimos en `RiesgoPage.tsx`.

**Pasos:**

1. Extraer contenido reutilizable si es necesario.
2. Evitar AppShell anidado.
3. Conservar tabs y resultados.
4. Etiquetar como versión actual.

**Pruebas:** paridad visual/numérica y E2E.
**Aceptación:** mismo input produce mismo resultado.

### LAB-106 — Adaptar Diversificación

**Dependencias:** LAB-103.
**Objetivo:** reutilizar distribución, concentración y overlap.

**Archivos esperados:**

- adaptador de página;
- mínimos cambios en `DiversificacionPage.tsx`.

**Pasos:** equivalentes a LAB-105; mapear a Exposición.
**Pruebas:** tabs y métricas actuales.
**Aceptación:** ningún cálculo duplicado.

### LAB-107 — Adaptar Simular

**Dependencias:** LAB-103.
**Objetivo:** alojar estrés/aportaciones actuales en Escenarios.

**Archivos esperados:**

- adaptador de página;
- cambios mínimos en `SimularPage.tsx`.

**Pasos:**

1. Montar la simulación actual.
2. Etiquetar shocks como escenarios deterministas.
3. Mantener escenarios guardados.
4. No añadir Monte Carlo todavía.

**Pruebas:** presets y aportaciones.
**Aceptación:** resultados idénticos a ruta anterior.

### LAB-108 — Crear redirecciones legacy

**Dependencias:** LAB-105, LAB-106, LAB-107.
**Objetivo:** preservar enlaces.

**Archivos esperados:**

- rutas/redirect component;
- pruebas.

**Pasos:**

1. Mapear las tres rutas.
2. Preservar parámetros si existen.
3. Mostrar aviso temporal cerrable.
4. Registrar evento agregado opcional.

**Pruebas:** acceso directo, back/forward.
**Aceptación:** enlaces antiguos no producen 404 ni bucle.

### LAB-109 — Portada inicial del Laboratorio

**Dependencias:** LAB-102, LAB-104.
**Objetivo:** crear portada que explique las dos mitades.

**Archivos esperados:**

- `LabHomePage.tsx`;
- `TwoWorldsCard.tsx`;
- estados demo/vacío.

**Pasos:**

1. Presentar Estabilidad y Futuro.
2. Detectar cartera vacía.
3. Ofrecer demo/importar/manual.
4. Evitar findings simulados.

**Pruebas:** sin cartera, demo y cartera real.
**Aceptación:** no se muestra una cifra que no provenga de datos.

### LAB-110 — E2E de migración

**Dependencias:** LAB-104 a LAB-109.
**Objetivo:** cerrar G1.

**Archivos esperados:** `e2e/lab-shell.spec.ts`.

**Casos:**

- abrir nueva ruta;
- cambiar de área;
- acceder a vistas heredadas;
- redirecciones;
- móvil;
- demo;
- sin backend.

**Aceptación:** G1 completa y documentada.
