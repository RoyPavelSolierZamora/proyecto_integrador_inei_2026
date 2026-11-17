# Gobernanza, asistente y control de calidad

## Alcance

Estos módulos trabajan sobre PostgreSQL y respetan la base, periodo y versión seleccionados. No
mezclan registros entre versiones ni sustituyen la validación metodológica del INEI.

## Permisos

| Función | Roles |
|---|---|
| Ayuda de uso del asistente | Todos los roles autenticados |
| Resumen y antecedentes de una base | Analista, supervisor, auditor y administrador |
| Comparación de periodos y calidad por codificador | Supervisor, auditor y administrador |
| Consultar criterios vigentes relacionados | Analista, supervisor, auditor y administrador |
| Crear y enviar criterios a aprobación | Supervisor y administrador |
| Aprobar o retirar criterios | Administrador |
| Proponer altas, cambios o bajas del catálogo | Supervisor y administrador |
| Aprobar y aplicar un cambio de catálogo | Administrador |
| Registrar un dictamen de calidad | Supervisor y administrador |
| Consultar dictámenes | Supervisor, auditor y administrador |

Los permisos se validan en Express; ocultar un botón en React no se considera un control de
seguridad.

## Criterios de codificación

El flujo es `borrador → pendiente → vigente → retirado`. Un criterio siempre referencia una clase
activa del catálogo CIIU. La bandeja permite documentar patrón, contexto, criterio de aplicación,
ejemplos, contraejemplos y fuente. Solo los vigentes se recuperan como apoyo contextual en el
detalle de un registro.

Los criterios no alteran automáticamente la predicción de R2 o Qwen. Incorporarlos como regla de
cierre exigiría una evaluación temporal independiente y una autorización metodológica; mientras
tanto son conocimiento gobernado para la decisión humana.

Un criterio vigente se muestra de inmediato como apoyo en los casos futuros que coinciden con su
texto ocupacional. No reabre ni recodifica bases anteriores y tampoco reentrena el clasificador.

## Cambios al catálogo CIIU

Las altas, modificaciones y desactivaciones pasan por una solicitud auditable. Una aprobación hace
que el código quede disponible para selección manual y para crear criterios, pero no lo convierte
automáticamente en una clase aprendida por los motores. Para predecir un código nuevo se debe:

1. incorporarlo en un histórico etiquetado y aprobado;
2. entrenar y calibrar una nueva versión de R2 con corte temporal;
3. actualizar el catálogo que valida la asistencia de IA;
4. ejecutar la evaluación temporal, la prueba de ruido y la aprobación metodológica;
5. desplegar la versión con su identificador y métricas, sin sobrescribir resultados anteriores.

Por diseño, ningún cambio de catálogo modifica decisiones ya registradas.

## Selección fuera del Top-K

El analista puede buscar cualquier clase activa del catálogo. Si el código no pertenece a los
candidatos del caso, el backend lo registra como corrección y exige una justificación. El código,
persona, fecha y sustento permanecen en el historial y la auditoría.

## Control de calidad

Un dictamen formal puede ser `correcto`, `incorrecto` o `incierto`. Cuando se confirma un error se
exige seleccionar el código correcto del catálogo, se agrega una decisión de corrección y se
actualiza el código final sin borrar la decisión original.

La tasa de error usa el último dictamen formal de cada decisión humana. Los desacuerdos entre R2,
IA y persona, la baja confianza o la concentración por rama son señales para seleccionar muestras,
pero no se cuentan como errores por sí solos.

## Asistente EPEN

El asistente usa intenciones cerradas y consultas SQL parametrizadas implementadas por el backend:

- ayuda de uso;
- resumen de la base seleccionada;
- comparación de dos bases completas por proporción de códigos;
- observaciones históricas relacionadas;
- calidad por codificador basada en dictámenes formales.

No ejecuta texto del usuario como SQL. La pregunta no se almacena: se conserva su huella SHA-256,
la intención, el usuario y el contexto consultado. Los resultados estadísticos describen las bases
cargadas y no deben interpretarse automáticamente como causalidad, sesgo o cambio económico.

## Auditoría paginada

La pantalla de Auditoría reemplaza al historial visual redundante. Consulta una base y versión
explícitas, muestra 30 decisiones por página y aplica búsqueda y filtros en PostgreSQL. La SPA no
descarga de una sola vez todo el historial de decisiones de la versión.
