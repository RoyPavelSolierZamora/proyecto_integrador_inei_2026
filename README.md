# Sistema de codificación asistida EPEN

Aplicación local y responsive del Proyecto Integrador PEU-CD para asistir la codificación de
respuestas abiertas P309 hacia clases CIIU Rev.4. El flujo previsto es:

```text
CSV EPEN → motor estadístico R2 → umbral τ → Qwen local R3 → revisión humana R4
```

El repositorio no contiene información real del INEI. Los registros incluidos están marcados
como **sintéticos** y el servicio R2 incluido es solamente un simulador contractual.

## Instalación recomendada en Windows

Requisitos: Windows 10/11 de 64 bits, conexión a Internet y aproximadamente 5 GB libres.
Descarga o clona la carpeta completa y ejecuta:

```text
instalar.bat
```

El instalador comprueba Node.js, Python, PostgreSQL, Ollama y Qwen; instala lo que falte, crea la
base local, aplica las migraciones y solicita la primera cuenta administradora. No muevas el
archivo `.bat` fuera de la carpeta: usa rutas relativas a este repositorio.

Si tienes el modelo BETO, copia la carpeta `modelo_beto_multivariado_final_v2` dentro de `modelos\`
antes de ejecutar `instalar.bat`. El instalador detecta el modelo, instala sus librerías y activa
BETO sin que edites `.env`. También se detecta si colocas `modelo_beto_multivariado_final_v2`
directamente en la raíz del proyecto. Ambas ubicaciones están excluidas de Git.
Las dependencias Python se instalan en `.runtime\venv` (reutilizando los paquetes ya disponibles
del sistema), para evitar escrituras en la instalación global de Python.

Después:

```text
iniciar-dashboard.bat     inicia todos los servicios y abre http://127.0.0.1:5174
detener-dashboard.bat     detiene únicamente los procesos registrados por el proyecto
```

La guía detallada, las credenciales y la solución de problemas están en
[`docs/INSTALACION.md`](docs/INSTALACION.md).

## Componentes

| Carpeta | Responsabilidad |
|---|---|
| `frontend/src/` | SPA React, navegación responsive y flujos por rol |
| `backend/src/` | API Express, seguridad, auditoría, trabajos R2 y persistencia |
| `backend/migrations/` | Esquema versionado de PostgreSQL |
| `motores/r2/simulador/` | Simulador léxico temporal del contrato R2; no es un modelo ML |
| `motores/r2/baseline/` | Baseline TF-IDF con casos históricos y API compatible; requiere calibración real |
| `motores/r2/avanzado/` | R2 vectorizado, calibración temporal, caché local y antecedentes históricos |
| `backend/seeds/` | Base pequeña y archivos exclusivamente sintéticos |
| `motores/r3/` | API mínima de Qwen/Ollama, contrato y catálogo CIIU |
| `colab/` | Qwen GPU temporal y evaluación BETO temporal sin fuga |
| `docs/` | Instalación y contrato de integración con el R2 real |
| `tests/`, `backend/tests/` | Pruebas automatizadas de importación, seguridad y políticas |

## Datos sintéticos y motor R2

La instalación vacía carga seis casos sintéticos para comprobar login, Qwen, decisiones,
historial y métricas. Para probar la carga original por lotes utiliza
`public/plantilla_base_original.csv` desde **Bases de datos**.

`motores/r2/simulador/servicio_r2.py` solo permite desarrollar y verificar el contrato mientras
el equipo R2 prepara el modelo estadístico real. Para sustituirlo se configura `R2_BASE_URL`; no
es necesario modificar React, PostgreSQL ni Qwen si se respeta el contrato documentado en
[`docs/INTEGRACION_R2_DASHBOARD.md`](docs/INTEGRACION_R2_DASHBOARD.md).

`motores/r2/baseline/` ofrece un primer motor híbrido reproducible para pruebas con históricos
etiquetados. Combina TF-IDF por clase, vecinos históricos, n-gramas de caracteres, una firma
fonética de bajo peso y controles de calidad para abreviaturas, errores y texto insuficiente.
Su confianza está limitada a 0,69 hasta calibrarla con un trimestre posterior independiente, por
lo que inicialmente genera candidatos para Qwen o revisión humana y no cierres automáticos. Puede
seleccionarse localmente con `R2_MODE=baseline` y `R2_TRAINING_CSV` en `.env`; el simulador continúa
siendo el valor predeterminado.

`motores/r2/avanzado/` es la versión estadística recomendada cuando existe un histórico anual.
La versión 0.5 usa P309/P308/P308A, n-gramas de palabras y caracteres, LinearSVC y calibración
isotónica sobre el último periodo cronológico. Entrenada hasta noviembre de 2025 y calibrada con
diciembre de 2025 obtuvo 91,4 % Top-1 y 96,6 % Top-3 sobre enero-agosto de 2026. Con `tau=0,95`
cubrió 68,0 % con 99,3 % de precisión. El umbral predeterminado del dashboard es 0,92, pero el
operador puede cambiarlo por trabajo. Se activa con `R2_MODE=advanced`; sus instrucciones están en
[`motores/r2/avanzado/README.md`](motores/r2/avanzado/README.md).

R3 usa el contrato 1.1 y el prompt versionado `prompt_v5_contexto_historico.txt`: recibe P309, el
contexto P308/P308A, rango y puntaje R2, y hasta tres antecedentes validados. Qwen sigue limitado al Top-K y cualquier
ambigüedad, discrepancia o salida inválida se deriva a revisión humana.

### Ajuste de Qwen 2.5 7B (QLoRA)

El adaptador de Qwen se entrenó con QLoRA sobre `unsloth/Qwen2.5-7B-Instruct-bnb-4bit`, cargado en
4 bits, y se usa en Colab mediante `PeftModel`. El adaptador no está en el repositorio.

- **Configuración LoRA:** r = 16, alpha = 32, dropout = 0,05, bias = none, tarea CAUSAL_LM. Módulos:
  q, k, v, o, gate, up y down proj. Parámetros entrenables: 40 370 176 de 7 655 986 688 (0,53 %).
- **Datos:** base histórica EPEN 2022–2026 con las variables C309, C309_1, C308, C308A, C310, C311 y
  C366. Se eliminaron duplicados por texto y código CIIU, y se limitó a 80 patrones por clase: 17 487
  registros de 381 clases. Partición 95 % entrenamiento y 5 % validación, con semilla 42.
- **Entrenamiento:** lote 16 con 2 pasos de acumulación (32 efectivo), tasa de aprendizaje 2e-4,
  2 épocas, 50 pasos de calentamiento, programador coseno, optimizador `paged_adamw_8bit`, precisión
  fp16 o bf16 según la GPU.
- **Pérdida:** época 1, entrenamiento 0,0311 y validación 0,0324; época 2, entrenamiento 0,0190 y
  validación 0,0265. La pérdida no equivale a exactitud de clasificación.
- **Límites:** la validación es aleatoria. El histórico no incluye septiembre de 2026, así que la
  evaluación de ese mes es fuera de muestra. El tiempo de entrenamiento y el modelo de GPU no quedaron
  registrados.

## Flujo operativo

1. Un operador carga un CSV original con `id_registro,p309,p308,p308a`.
2. El backend crea un trabajo reanudable y envía lotes al servicio R2.
3. R2 devuelve candidatos CIIU Top-K y confianza.
4. Los registros sobre τ se resuelven con R2; los difíciles pasan a Qwen manual o automático.
5. Qwen solo puede seleccionar códigos suministrados por R2.
6. Las sugerencias de Qwen, discrepancias, ambigüedades y fallos técnicos pasan a revisión humana.
7. El analista puede elegir cualquier clase del catálogo oficial cuando el Top-K no corresponda;
   debe justificar la corrección y el cambio queda auditado.
8. Cada versión conserva trazabilidad y puede exportarse como CSV.

El seguimiento separa el progreso R2 del progreso Qwen, estima el tiempo restante con la latencia
observada y permite una cancelación cooperativa que conserva los resultados parciales. En
**Codificación** se puede revisar cualquier registro mediante filtros por origen (R2, Qwen o
persona), además de la cola de excepciones que se abre por defecto.

El umbral τ debe calibrarse con datos EPEN reales etiquetados. La confianza declarada por Qwen
no se usa como umbral estadístico.

## Asistente, criterios y control de calidad

El **Asistente EPEN** responde ayuda de uso y consultas calculadas sobre las bases cargadas:
resumen de una versión, comparación de dos periodos, antecedentes relacionados y métricas de
calidad autorizadas por rol. No genera SQL, no envía datos a un proveedor externo y registra solo
la intención y la huella SHA-256 de la pregunta para auditoría.

Los supervisores pueden proponer criterios de codificación asociados a una clase CIIU oficial.
Un administrador debe aprobarlos antes de que aparezcan como criterios vigentes relacionados en
el detalle de un registro. Esta bandeja no permite inventar ni modificar clases del catálogo.

El control de calidad separa señales de revisión de errores confirmados. La tasa por codificador
solo usa dictámenes formales registrados por supervisor o administrador; una concentración en una
rama CIIU se presenta como alerta de muestreo, nunca como prueba automática de sesgo. Consulta
[`docs/GOBERNANZA_Y_CONTROL_CALIDAD.md`](docs/GOBERNANZA_Y_CONTROL_CALIDAD.md).

## Asistente de IA en GPU de Colab

`colab/R3_Qwen_EPEN_GPU.ipynb` ejecuta el mismo contrato R3 en una GPU temporal. El backend se
conecta por HTTPS con token Bearer; PostgreSQL y la auditoría permanecen locales. Consulta
[`docs/COLAB_R3_GPU.md`](docs/COLAB_R3_GPU.md). Esta modalidad es para datos sintéticos y pruebas,
no para información estatal real sin autorización institucional.

Cuando Colab muestre la URL y el token, ejecuta `conectar-colab.bat`: valida la conexión y actualiza
la configuración local sin tener que abrir `.env`. Para volver a ejecutar la IA en la laptop usa
`usar-ia-local.bat`.

El prototipo BETO del equipo se evalúa con `colab/R2_BETO_EPEN_Evaluacion_Temporal.ipynb`. La
comparación obligatoria está en [`docs/EVALUACION_R2_BETO.md`](docs/EVALUACION_R2_BETO.md).

## Estado actual

- **Base codificada de referencia:** se importa con el código de analista de cada registro. Solo una
  queda activa y las anteriores se conservan. La comparación muestra aciertos por analista y por
  confianza, y el historial identifica el origen «Base codificada».
- **Tablero de codificación:** Métricas y el resumen de Codificación muestran exactitud y confusiones
  solo con una referencia activa. Sin ella, Codificación no muestra ese bloque; si un codificador
  completó la base, sí aparece su avance.
- **Historial:** cada consulta individual a la IA se atribuye al usuario que la pidió. Las consultas
  anteriores a esta corrección aparecen como «Sistema».
- **Pruebas:** `npm test` ejecuta 83 pruebas sobre importación, reglas del asistente, políticas de
  contraseña, métricas de calidad y el tablero.
- **Pendiente antes de una entrega:** limpiar las bases de prueba y revisar el tablero con datos
  reales.

## Desarrollo y verificación

Con las dependencias ya instaladas:

```powershell
npm ci
npm test
npm run test:ui
npm run build
```

El instalador escribe la configuración local. Para desarrollo manual se puede consultar
`.env.example`, pero las credenciales reales nunca deben guardarse allí ni subirse al repositorio.

## Seguridad local

- Autenticación PostgreSQL con contraseñas scrypt.
- Sesiones con cookie `HttpOnly`, `SameSite=Strict`, CSRF y expiración.
- Autorización por rol en el backend y auditoría de acciones.
- Bloqueo después de intentos fallidos y revocación de sesiones.
- Credencial interna `epen_app` cifrada con DPAPI para el usuario actual de Windows.
- Servicios limitados a `127.0.0.1`; no se publican PostgreSQL, Ollama, R2 ni R3.
- `.env`, `.runtime`, bases, registros, cargas y compilaciones están excluidos de Git.

Antes de usar información real se requiere revisión institucional de infraestructura, TLS,
gestión centralizada de secretos, respaldos, retención y permisos.

## Autores

Roy Solier, Junior Palomino, Victor Moran y Nayeli Girón.

Proyecto académico no oficial; no representa resultados publicados por el INEI.
