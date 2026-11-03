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
| `backend/seeds/` | Base pequeña y archivos exclusivamente sintéticos |
| `r3_local/` | API mínima de Qwen/Ollama, contrato y catálogo CIIU |
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

## Flujo operativo

1. Un operador carga un CSV original con `id_registro,p309,p308,p308a`.
2. El backend crea un trabajo reanudable y envía lotes al servicio R2.
3. R2 devuelve candidatos CIIU Top-K y confianza.
4. Los registros sobre τ se resuelven con R2; los difíciles pasan a Qwen manual o automático.
5. Qwen solo puede seleccionar códigos suministrados por R2.
6. Discrepancias, ambigüedades y fallos técnicos pasan a revisión humana.
7. Cada versión conserva trazabilidad y puede exportarse como CSV.

El umbral τ debe calibrarse con datos EPEN reales etiquetados. La confianza declarada por Qwen
no se usa como umbral estadístico.

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
