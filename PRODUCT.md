# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Digitadores y analistas que clasifican respuestas abiertas EPEN contra CIIU Rev.4.
- Supervisores y auditores que revisan calidad, trazabilidad y cambios de criterio.
- Operadores que cargan bases periódicas y administradores que gobiernan usuarios, catálogo y servicios.

## Product Purpose

Reducir el trabajo manual de codificación sin ocultar incertidumbre. El sistema procesa una base, automatiza casos seguros, deriva casos difíciles y conserva cada decisión para revisión y exportación.

## Positioning

La decisión no depende de un único modelo: combina una compuerta de calidad, un clasificador estadístico calibrado, asistencia de IA restringida a candidatos CIIU y revisión humana auditable.

## Operating Context

- Bases mensuales, trimestrales o corregidas con miles de registros.
- Uso prolongado en escritorio y consultas ocasionales desde tableta o móvil.
- La base seleccionada delimita codificación, métricas, calidad y auditoría; las versiones no se mezclan.
- Los usuarios necesitan completar tareas rápidamente y no deben interpretar nombres internos como R2, R3 o Qwen.

## Capabilities and Constraints

- React SPA, API Express y PostgreSQL como fuente operacional.
- Roles: operador, analista, supervisor, auditor y administrador.
- El catálogo CIIU es gobernado. Un criterio activo guía la revisión, pero no reentrena por sí mismo el clasificador.
- Un código nuevo queda disponible para selección manual tras aprobación; para predicción automática requiere ejemplos etiquetados, entrenamiento y calibración de una nueva versión de R2.
- La asistencia de IA no ejecuta SQL libre ni inventa códigos fuera de los candidatos permitidos.
- Los datos estatales reales requieren infraestructura institucional; el entorno local y Colab no son despliegue productivo.

## Brand Commitments

- Nombre de producto: Sistema de Codificación EPEN.
- Identidad institucional sobria basada en azul EPEN, sin estética promocional ni apariencia de plantilla generada.
- Lenguaje claro en español y términos comprensibles para personal no técnico.

## Evidence on Hand

- Implementación real en `src/` y `backend/src/`.
- Catálogo CIIU de 417 clases, migraciones PostgreSQL y pruebas automatizadas.
- Datos sintéticos y evaluaciones temporales documentadas; ninguna métrica sintética debe presentarse como certificación productiva.

## Product Principles

1. La tarea principal siempre aparece antes que la explicación.
2. La automatización muestra cobertura, confianza y procedencia.
3. Las acciones delicadas requieren rol, fuente y trazabilidad.
4. Una base por contexto; ninguna mezcla silenciosa entre periodos.
5. La interfaz reduce decisiones y texto, pero nunca oculta un riesgo operativo.

## Accessibility & Inclusion

Controles utilizables con teclado, objetivos táctiles de al menos 44 px, contraste WCAG AA, contenido legible a 200 % y composición sin desplazamiento horizontal desde 320 px.
