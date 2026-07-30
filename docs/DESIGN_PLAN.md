# Plan de afinado visual — RiskCalculator

Estado: cada fase se marca [x] al completarse. Los prompts se pegan tal cual.

- [x] F0 Instalación de skills (10 skills en .claude/skills/; taste pendiente de Playwright MCP)
- [x] F1 Contexto (PRODUCT.md + DESIGN.md escritos en la raíz)
      Direcciones confirmadas pendientes de ejecutar: sombra ambiental en
      overlays, más movimiento, y auditoría de jerarquía/color por zonas.
- [x] F2 Referencia visual → docs/TASTE_REFERENCES.md
      8 cambios de token propuestos, sin aplicar. Se aplican en F4.
- [x] F3 Diagnóstico → docs/AUDIT_F3.md · 13/20 · P0:2 P1:6 P2:5 P3:2
      P0-1 cerrado: ErrorBoundary por ruta con resetKey (App.tsx).
      P0-2 cerrado: breakevenFromValues() + comparación en modo restaurar.
      Pendientes: P1 x6, P2 x6, P3 x2.
- [x] F4 Estructura: tokens F2 aplicados, piso de 12px, título unificado en las
      8 rutas, .big-figure a serif, contraste 35 fallos -> 0.
      Colorize decidido: un solo acento, jerarquía por superficie (no por color).
      Pendiente: 3 fontSize inline en JSX (veredicto de riesgo y P&L).
- [x] F5 Gráficos: chartTheme.ts como tema único de las 6 gráficas Recharts.
      Paleta re-escalonada a 6 slots, validador 5/5 PASS (antes 4 fallos).
      Corregidos: --chart-ink inexistente, ciclado de color, polaridad con
      colores categóricos, ejes de 8,5px.
- [x] F6 Movimiento: 4 de 5 entradas implementadas (.enter-rise, .enter-aside,
      .empty-state con escalonado). Fila 2 (apertura del desplegable) revertida:
      ::details-content no funciona en Chrome 148 y clipaba el contenido.
      Reduced-motion: apagado global sustituido por reglas por caso.
      review-animations: sin hallazgos en el diff.
- [x] F7 Robustez: tap targets a 24px (P1-6 cerrado), piso tipográfico
      completado (etiquetas de campo y cabeceras de tabla estaban a 8,5px),
      cerrojo contra doble clic en la importación + 2 tests, tildes y
      naming. P2-6 retirado: era un falso hallazgo del entorno.
      Medición final: 0 contraste, 0 bajo 11px, 0 táctil, 0 overflow.
- [x] F8 Cierre: global.css 3138 -> 2967 lineas con cero cambio visual probado
      (huella de estilos computados). Colores literales 12 -> 0. Detector
      89 -> 63. Eliminado el resplandor azul heredado de todos los botones
      primarios. RE-AUDITORIA: 13/20 -> 17/20.
      Deuda documentada: 7 breakpoints, 3 fontSize inline, 63 avisos.

Páginas objetivo (src/pages): Resumen, Calculadora, Portfolio, Riesgo,
Diversificacion, Simular, Importar, Perfil.
Orden de prioridad: Resumen > Calculadora > Portfolio > Riesgo > resto.

Reglas de ejecución (para el agente):
- Leer DESIGN.md/PRODUCT.md antes de cualquier fase >= F3.
- Dev server: preview_start con la config "riskcalculator-dev". Nunca Bash.
- No pasar de fase sin confirmación del usuario.
- No animar antes de F4 cerrada.
