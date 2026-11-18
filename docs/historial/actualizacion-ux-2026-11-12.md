# Actualización de experiencia de usuario EPEN

Implementación del 12 de noviembre de 2026 sobre main, commit base d1d6f94, en proyecto_integrador_inei_2026_git. El repositorio estaba limpio antes de los cambios. El usuario confirmó esta carpeta durante la intervención. No se hicieron commits, pulls, merges ni pushes.

## Cambios implementados

Bases de datos presenta la carga principal a ancho completo, sin «Flujo del proceso» ni «Ver cómo funciona el procesamiento completo». Mantiene seguimiento, cancelación, resultados parciales, versiones, filtros, exportación, activación de bases e importación avanzada. Las ayudas nativas desplegables explican archivo, periodo, confianza, modalidades de asistencia y estados; funcionan mediante teclado, clic y toque, y Escape devuelve el foco al control.

La ayuda de CSV se verificó contra src/services/csvImport.js y backend/src/raw-csv.js: columnas id_registro/id_c200 y p309/c309 obligatorias; identificadores únicos de hasta 120 caracteres; respuestas vacías admitidas para revisión; ocupación, tareas, c310, c311 y c366 opcionales. Las tres últimas admiten 160 caracteres en el servidor. No se cambió el importador ni la política de clasificación.

Usuarios inicia en «Lista de usuarios», con tabla única, búsqueda por nombre/usuario y filtro por los cinco roles reales. Incluye estados, fecha creada por la API, restablecimiento de filtros y confirmación para desactivar/retirar. «Crear usuario» contiene el formulario existente reorganizado; conserva los campos y servicios, evita envíos simultáneos y vuelve a la lista tras una respuesta satisfactoria. No se añade edición ni correo, que no están disponibles en la API actual. Los errores de carga se diferencian de una lista vacía. Las contraseñas permanecen solo en el formulario y se limpian tras crear o cancelar.

El estilo compartido conserva la identidad, cabecera, sidebar y rutas. Unifica controles y tablas en azul, permite desplazamiento horizontal dentro de las tablas y evita que la barra de decisiones cubra la evidencia histórica. Inicio conserva sus enlaces; detalle conserva respuesta, códigos, selección, asistencia, decisiones y antecedentes. Solo se presentan etiquetas más comprensibles; códigos, datos almacenados y contratos permanecen intactos. Las advertencias de métricas y datos sintéticos se conservan.

## Archivos

| Archivo | Cambio |
| --- | --- |
| src/pages/DatasetsPage.jsx | Retirada de bloques, ayudas y etiquetas; sin cambios en solicitudes de procesamiento |
| src/components/epen/DatasetCsvUpload.jsx | Ayuda del formato real y límites de carga |
| src/components/epen/ProcessFlowCard.jsx | Eliminado tras verificar que solo se usaba en Bases |
| src/pages/UsersPage.jsx | Subpestañas accesibles, filtros, tabla y formulario; confirmaciones y mensajes |
| src/components/ContextHelp.jsx | Nuevo componente de ayuda nativa con cierre por Escape |
| src/epen-theme.css | Estilos compartidos, tablas desplazables, subpestañas, formulario y ayudas |
| src/components/AppShell.jsx | Dos textos visibles simplificados; navegación y permisos intactos |
| src/pages/CasesPage.jsx | Ayuda de vistas, etiquetas claras y tabla accesible |
| src/pages/CaseDetailPage.jsx | Ayuda CIIU/confianza y lenguaje de presentación |
| src/pages/HistoryPage.jsx | Presentación y búsqueda coherentes; estado sin coincidencias y tabla accesible |
| src/pages/MetricsPage.jsx | «Tiempo de respuesta de IA» sustituye a «Latencia de IA» |
| src/pages/LoginPage.jsx | Texto de acceso comprensible, sin cambiar autenticación |
| src/utils/operationalText.js | Presentación de nombres internos en explicaciones, sin alterar valores originales |
| epen.playwright.config.js | Configuración que faltaba para el script test:ui existente; Edge, puerto de prueba 5178 |
| tests/ui/ux.spec.js | Pruebas de interacción y capturas responsive, API completamente interceptada |
| docs/actualizacion-ux-2026-11-12.md | Este informe |

No se modificaron backend, SQL, servicios Python, rutas React, contextos, clientes HTTP, configuración de Vite, variables de entorno, scripts de inicio ni dependencias.

## Validación

- npm test: 41 pruebas existentes pasan, incluidas políticas de IA, procesamiento, CSV, seguridad y distribución.
- npm run build: compilación frontend correcta.
- npm run test:ui: 14 pruebas pasan.
- Pruebas de interfaz: tabla, filtros combinados, estados vacíos/error, teclado en subpestañas, creación y error de nombre duplicado, protección contra doble envío, confirmación/cancelación de desactivación, activación/retiro, restricciones por roles y conservación de CSRF/cookies.
- Bases: carga/arrastre, validación de columnas, retención del archivo tras error, contenido y parámetros originales de solicitud, seguimiento/cancelación, exportación, filtros/paginación, activación, importación avanzada y simulación restringida a datos sintéticos.
- Navegación: destinos de Inicio, detalle del registro correcto, cambio a base histórica sin mezclar registros, envío a revisión de esa base y búsqueda en historial.
- Capturas en 1366, 768 y 390 px de Inicio, Bases, lista/creación de usuarios, Codificación, Historial, Detalle y Métricas. Se comprobó ausencia de desbordamiento de documento y de solapamiento de antecedentes con la barra de decisiones. Archivos locales en .runtime/ux-results.

## Alcance de las pruebas

Todas las peticiones API de las pruebas de navegador se interceptan con fixtures exclusivamente dentro de tests/ui. La aplicación sigue utilizando sus servicios reales. No se crearon cuentas reales, no se cargaron bases reales y no se ejecutaron procesos reales de PostgreSQL/R2/Ollama. La comprobación integral de esos servicios queda pendiente en un entorno de pruebas autorizado; las pruebas realizadas verifican el comportamiento del frontend y los contratos enviados, no la disponibilidad productiva de esos servicios.

No fue necesario agregar endpoints ni dependencias.
