# Entrega: Métricas y calidad

Implementación sobre `proyecto_integrador_inei_2026`, partiendo del commit `aa156f4` y de un árbol de trabajo inicialmente limpio. Fecha: 19 de noviembre de 2026.

## Organización y funciones conservadas

| Apartado | Contenido |
|---|---|
| Resumen | Registros, comparados, coincidencias, diferencias, coincidencia con referencia e intervalo, codificadores, decisiones humanas, registros con referencia, coberturas resuelta y automática, revisión, estado del procesamiento, origen de resolución y distribución de confianza. |
| Desempeño | Avance de codificadores y analistas con tablas, coincidencia por analista e intervalos, bandas reales y cantidades, origen, todas las divisiones disponibles, serie diaria cuando existe, evaluación del clasificador, IA y F1 macro. |
| Comparaciones | Referencia activa, cobertura de identificadores, tablas por analista, confianza y origen, confusiones direccionales y detalle de diferencias con todos los campos anteriores. Búsqueda local y páginas de diez registros. |
| Verificación | Revisiones formales, errores confirmados, tasa sobre revisados, filtros originales de muestra, cantidad de casos, carga, código CIIU, no clasificable, omisión, registro, precisión verificada, intervalos y agrupaciones. |
| Análisis complementario | P309, contexto, clases, concentración top 5, ranking completo de códigos recibidos y resto, estadísticas de codificadores y comparación de distribuciones entre dos bases. |

`BlindVerificationPanel.jsx` y `QualityReviewPanel.jsx` mantienen su implementación y sus validaciones. La revisión formal sigue disponible desde el detalle del caso. El flujo ciego no incorpora propuestas, origen ni confianza del caso en su ficha de revisión.

## Consolidación y significado

Los indicadores generales de comparación se presentan en Resumen; el panel detallado no repite esas tarjetas cuando el resumen está disponible. Si falla el tablero, la comparación conserva sus propias tarjetas como alternativa. Registros se muestra una sola vez en Resumen. Se mantiene la información tabular detallada y los intervalos aunque complemente gráficos de otra pestaña.

Coincidencia con referencia, exactitud evaluada del clasificador, exactitud de IA, F1 macro, cobertura automática, precisión verificada y error confirmado permanecen separados. No se modificaron fórmulas, tramos ni denominadores del backend. La ausencia de muestra no se representa como 0 %.

La barra apilada representa composición del total de registros; la dona, origen de decisiones. El avance de analistas usa columnas apiladas con coincidencias y diferencias. El avance humano usa cantidades sin asumir que confirmaciones y correcciones agotan los casos. Los intervalos por analista se leen como valores, sin otro gráfico redundante. Orígenes, divisiones y códigos utilizan barras horizontales legibles; las divisiones se distribuyen en columnas según el ancho. La confianza conserva columnas y límites originales. Las confusiones son una tabla de tres columnas que cabe sin desplazamiento horizontal. La línea temporal solo usa días entregados por el servicio.

## Navegación, datos y permisos

- Una entrada en Supervisión: **Métricas y calidad**, en `/metricas`. Auditoría conserva su ruta.
- `/calidad` redirige a `/metricas?vista=verificacion`, conservando los demás parámetros. Se admiten `datasetId` y el alias `dataset` al seleccionar la base.
- Las pestañas admiten flechas, Inicio y Fin, foco visible, `aria-selected` y panel identificado.
- La selección queda en la URL. Cambiar de apartado conserva filtros y muestra, sin nuevas consultas del módulo ni escrituras. Cambiar de base reinicia su espacio de trabajo, evitando mostrar la muestra o resultados de la base anterior.
- La búsqueda de diferencias afecta solo a los registros recibidos de esa tabla. Los filtros de origen/confianza/cantidad siguen siendo exclusivamente de planificación de la muestra. El segundo selector pertenece a la comparación de bases.
- Lectura: supervisor, auditor y administrador. Verificación: supervisor y administrador. Operador y analista no ganan acceso al módulo.
- Se reutilizan los servicios existentes de resumen analítico, tablero, resumen de calidad, métricas de verificación, referencias y comparación. No se cambió `dataClient.js` ni se agregaron endpoints.
- La consulta de comparación y el tablero son contratos distintos: se conserva la primera para obtener los campos del detalle que el segundo no incluye.

El servicio dispone de `discrepancies` limitado a 200 y, según la respuesta, de `items` con todos los casos comparados. Se prioriza `items` para consultar todas las diferencias. Si solo llega el listado parcial, se muestra su cantidad frente al total y se aclara el alcance de la búsqueda. No se inventan registros ni solicitudes para paginar el backend.

## Archivos

| Archivo relativo al repositorio | Cambio |
|---|---|
| `frontend/src/app/App.jsx` | Redirección de la ruta anterior conservando parámetros y protección de roles. |
| `frontend/src/app/AppShell.jsx` | Unificación de la opción del menú. |
| `frontend/src/features/metricas/MetricsPage.jsx` | Selector común, navegación accesible y coordinación de consultas por base. |
| `frontend/src/features/metricas/OperationalMetrics.jsx` | Nuevo componente para distribuir las métricas operativas originales por apartado. |
| `frontend/src/features/metricas/QualityCharts.jsx` | Nuevas visualizaciones de composición, ranking y avance apilado. |
| `frontend/src/features/metricas/CodingDashboard.jsx` | Secciones, gráficos semánticos, divisiones completas y tabla de confusiones compacta. |
| `frontend/src/features/calidad/QualityPage.jsx` | Integración por apartado, conservación de estado y control de respuestas asíncronas. |
| `frontend/src/features/calidad/QualityMetricsPanel.jsx` | Limpieza de resultados anteriores al volver a consultar métricas. |
| `frontend/src/features/calidad/ReferenceComparisonPanel.jsx` | Consolidación de tarjetas, coincidencia correctamente rotulada, búsqueda, paginación y uso de todos los casos recibidos. |
| `frontend/src/shared/lib/csvImport.js` | Mensaje de orientación hacia la ubicación actual de importación en Bases. No cambia el procesamiento CSV. |
| `tests/ui/metrics-quality.spec.js` | Catorce pruebas específicas con datos sintéticos. |
| `tests/ui/ux.spec.js` | Expectativa del nuevo título y mensaje; capturas mediante el directorio configurado de pruebas. |
| `frontend/METRICAS_Y_CALIDAD_ENTREGA.md` | Este informe. |

## Validación y límites

- `npm test`: **89 pruebas aprobadas**.
- `npm run build`: **compilación correcta**.
- Pruebas específicas de navegador: **14 aprobadas**, incluyendo 360, 390, 768, 1024 y 1366 px, teclado, roles, estado vacío, error de consulta, carga fallida y recuperación de muestra, registro ciego, no clasificable, cambio de base, conservación al navegar y diferencias posteriores a la 200.
- Capturas generadas para los cinco apartados en los cinco tamaños. Inspección visual de escritorio, tableta y móvil; verificación del ancho de la tabla de confusiones.
- Suite general de UI ejecutada: 23 aprobadas y 8 fallidas en esa ejecución, antes de añadir las tres últimas pruebas específicas. Los ocho fallos fueron reproducidos en una copia temporal del frontend original de `aa156f4`, con las mismas causas: selectores antiguos como `.user-create-form`, `.job-card`, `.response-grid`, `.detail-history` y `.main-content`, además del texto antiguo de ayuda de Bases. No se corrigieron módulos ajenos al encargo ni se ocultaron esos fallos.
- `git diff --check`: sin errores de espacios.

Las pruebas interceptan las llamadas de API con respuestas sintéticas: no certifican una sesión real de PostgreSQL, BETO, R2, Qwen u Ollama. No se realizaron escrituras sobre datos reales.

Para evitar escribir en `.runtime`, la ejecución utilizó una configuración temporal equivalente, con resultados en `%TEMP%/epen-quality-results`. Las capturas de la comprobación original están en `%TEMP%/epen-baseline-results`.

No se modificaron backend, SQL, migraciones, autenticación, servicios, contratos, umbrales, dependencias, `modelos/`, `.env` ni `.runtime/`. No se hicieron commits, push, pull o merges. El frontend anterior de `sistema-codificacion-epen` no fue reemplazado.
