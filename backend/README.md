# Backend seguro EPEN

API local preparada para PostgreSQL 18. La SPA puede conservar el modo demostración o usar este backend configurando `VITE_AUTH_MODE=real`.

## Controles incorporados

- Contraseñas con `scrypt` y sal aleatoria; nunca se guardan en texto plano.
- Sesiones aleatorias almacenadas como huella SHA-256.
- Cookie `HttpOnly`, `SameSite=Strict` y `Secure` en producción.
- Token CSRF y validación estricta del origen.
- Roles comprobados por el backend.
- Bloqueo de cuenta después de cinco intentos fallidos durante 15 minutos.
- Límite adicional de intentos por dirección IP.
- Revocación de sesiones al desactivar o retirar una cuenta.
- Registro de auditoría para accesos y administración de usuarios.
- Protección para no eliminar la sesión actual ni el último administrador activo.

## Preparar PostgreSQL local

PostgreSQL crea el usuario administrador `postgres` durante su instalación. Inicia el servicio `postgresql-x64-18` desde Servicios de Windows y abre:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d postgres
```

Dentro de `psql`, elige una contraseña distinta y robusta para la aplicación:

```sql
CREATE ROLE epen_app WITH LOGIN PASSWORD 'CAMBIAR_POR_UNA_CLAVE_SEGURA';
CREATE DATABASE epen_codificacion OWNER epen_app ENCODING 'UTF8';
REVOKE ALL ON DATABASE epen_codificacion FROM PUBLIC;
GRANT CONNECT ON DATABASE epen_codificacion TO epen_app;
```

Copia `.env.example` como `.env`, cambia `DATABASE_URL` y establece `VITE_AUTH_MODE=real`. `.env` está excluido del repositorio.

## Migrar y crear el primer administrador

La opción recomendada solicita ambas contraseñas de forma oculta, las conserva solamente durante el proceso y no las escribe en archivos:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\backend\scripts\crear-admin-seguro.ps1"
```

Antes de iniciar el backend en modo real, levanta la API R3 en otra terminal:

```powershell
cd "..\Codigos\pipeline_llm"
python servicio.py --puerto 8000
```

El lanzador también inicia el simulador contractual R2 en `127.0.0.1:8100`, aplica migraciones
pendientes y reanuda trabajos interrumpidos. Para sustituirlo por el modelo estadístico real,
configura `R2_BASE_URL` y respeta [`../docs/INTEGRACION_R2_DASHBOARD.md`](../docs/INTEGRACION_R2_DASHBOARD.md).

Para iniciar el backend con el mismo criterio (PostgreSQL seguro y Qwen real mediante R3):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\backend\scripts\iniciar-backend-seguro.ps1"
```

La alternativa manual para automatización controlada es:

```powershell
npm run db:migrate

$env:ADMIN_USERNAME="administrador"
$env:ADMIN_FULL_NAME="Administrador EPEN"
$env:ADMIN_PASSWORD="UNA CLAVE TEMPORAL DE 12 O MAS CARACTERES"
npm run db:create-admin
Remove-Item Env:ADMIN_PASSWORD
```

El comando no imprime ni almacena la clave fuera de PostgreSQL. Después, inicia cada proceso en una terminal:

```powershell
npm run backend
npm run dev
```

En un servidor institucional, `DATABASE_URL` debe provenir de un gestor de secretos, la conexión debe exigir TLS y conviene separar la cuenta que ejecuta migraciones de la cuenta limitada del servicio.

