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
| `src/` | SPA React, navegación responsive y flujos por rol |
| `backend/src/` | API Express, seguridad, auditoría, trabajos R2 y persistencia |
| `backend/migrations/` | Esquema versionado de PostgreSQL |
| `backend/r2_simulator/` | Simulador léxico temporal del contrato R2; no es un modelo ML |
| `backend/r2_baseline/` | Baseline TF-IDF con casos históricos y API compatible; requiere calibración real |
| `backend/r2_advanced/` | R2 vectorizado, calibración temporal, caché local y antecedentes históricos |
| `backend/seeds/` | Base pequeña y archivos exclusivamente sintéticos |
| `r3_local/` | API mínima de Qwen/Ollama, contrato y catálogo CIIU |
| `colab/` | Qwen GPU temporal y evaluación BETO temporal sin fuga |
| `docs/` | Instalación y contrato de integración con el R2 real |
| `tests/`, `backend/tests/` | Pruebas automatizadas de importación, seguridad y políticas |

## Datos sintéticos y motor R2

La instalación vacía carga seis casos sintéticos para comprobar login, Qwen, decisiones,
historial y métricas. Para probar la carga original por lotes utiliza
`public/plantilla_base_original.csv` desde **Bases de datos**.

`backend/r2_simulator/servicio_r2.py` solo permite desarrollar y verificar el contrato mientras
el equipo R2 prepara el modelo estadístico real. Para sustituirlo se configura `R2_BASE_URL`; no
es necesario modificar React, PostgreSQL ni Qwen si se respeta el contrato documentado en
[`docs/INTEGRACION_R2_DASHBOARD.md`](docs/INTEGRACION_R2_DASHBOARD.md).

`backend/r2_baseline/` ofrece un primer motor híbrido reproducible para pruebas con históricos
etiquetados. Combina TF-IDF por clase, vecinos históricos, n-gramas de caracteres, una firma
fonética de bajo peso y controles de calidad para abreviaturas, errores y texto insuficiente.
Su confianza está limitada a 0,69 hasta calibrarla con un trimestre posterior independiente, por
lo que inicialmente genera candidatos para Qwen o revisión humana y no cierres automáticos. Puede
seleccionarse localmente con `R2_MODE=baseline` y `R2_TRAINING_CSV` en `.env`; el simulador continúa
siendo el valor predeterminado.

`backend/r2_advanced/` es la versión estadística recomendada cuando existe un histórico anual.
Entrena con n-gramas de palabras y caracteres, LinearSVC y calibración isotónica sobre el último
mes disponible. En la primera evaluación 2025 → enero de 2026 obtuvo 88,3 % Top-1 y 94,0 % Top-3.
Con `tau=0,90`, cubrió 67,7 % de los registros con 98,8 % de precisión entre los cierres de R2 y
derivó 32,3 % a Qwen o revisión. Estas cifras son experimentales y deben reproducirse antes de una
entrega. Se activa con `R2_MODE=advanced`; sus dependencias e instrucciones están en
[`backend/r2_advanced/README.md`](backend/r2_advanced/README.md).

R3 usa el contrato 1.1 y el prompt versionado `prompt_v4_robusto.txt`: recibe P309, el contexto
P308/P308A y hasta tres antecedentes validados de R2. Qwen sigue limitado al Top-K y cualquier
ambigüedad, discrepancia o salida inválida se deriva a revisión humana.

## Flujo operativo

1. Un operador carga un CSV original con `id_registro,p309,p308,p308a`.
2. El backend crea un trabajo reanudable y envía lotes al servicio R2.
3. R2 devuelve candidatos CIIU Top-K y confianza.
4. Los registros sobre τ se resuelven con R2; los difíciles pasan a Qwen manual o automático.
5. Qwen solo puede seleccionar códigos suministrados por R2.
6. Discrepancias, ambigüedades y fallos técnicos pasan a revisión humana.
7. Cada versión conserva trazabilidad y puede exportarse como CSV.

El seguimiento separa el progreso R2 del progreso Qwen, estima el tiempo restante con la latencia
observada y permite una cancelación cooperativa que conserva los resultados parciales. En
**Codificación** se puede revisar cualquier registro mediante filtros por origen (R2, Qwen o
persona), además de la cola de excepciones que se abre por defecto.

El umbral τ debe calibrarse con datos EPEN reales etiquetados. La confianza declarada por Qwen
no se usa como umbral estadístico.

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

## Desarrollo y verificación

Con las dependencias ya instaladas:

```powershell
npm ci
npm test
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
