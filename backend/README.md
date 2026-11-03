# Backend EPEN

API Express local para autenticación, autorización por roles, auditoría, bases versionadas,
trabajos R2, cola Qwen y exportación. PostgreSQL es la fuente de verdad del dashboard; R3 no
mantiene una segunda base operacional.

## Inicio recomendado

Desde la raíz del repositorio ejecuta `instalar.bat` y luego `iniciar-dashboard.bat`. Esos
lanzadores configuran PostgreSQL, migraciones, datos sintéticos, R2 y R3 sin exponer secretos en
la línea de comandos.

## Comandos de desarrollo

```powershell
npm ci
npm run db:migrate
npm run db:seed-synthetic
npm test
npm run backend
```

El backend necesita `PGPASSWORD` en memoria o `DATABASE_URL` proporcionado por un gestor de
secretos. El instalador de Windows usa variables `PG*` y una credencial DPAPI local; no almacena
la contraseña en `.env`.

## Controles incorporados

- Hash scrypt con sal aleatoria para contraseñas.
- Sesiones aleatorias almacenadas como huella SHA-256.
- Cookie `HttpOnly`, `SameSite=Strict` y `Secure` en producción.
- CSRF, validación de origen, bloqueo de intentos y revocación de sesiones.
- Roles comprobados en el backend y protección del último administrador activo.
- Auditoría de accesos, administración, importaciones y decisiones.
- Validación estricta de contratos R2/R3 y códigos CIIU.

## Integraciones privadas

- R2 temporal: `backend/r2_simulator/servicio_r2.py`, en `127.0.0.1:8100`.
- R3/Qwen: `r3_local/servicio.py`, en `127.0.0.1:8000`.
- PostgreSQL: `127.0.0.1:5432`.

Para conectar el motor estadístico real consulta
[`../docs/INTEGRACION_R2_DASHBOARD.md`](../docs/INTEGRACION_R2_DASHBOARD.md).

En infraestructura institucional deben emplearse TLS, secretos centralizados, cuentas de base
separadas para migración y servicio, respaldos y políticas de retención aprobadas.
