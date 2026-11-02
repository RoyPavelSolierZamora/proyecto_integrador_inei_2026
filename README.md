# Sistema de codificación asistida EPEN

SPA local para el flujo R2 → R3 → R4 del Proyecto Integrador PEU-CD. Esta carpeta es independiente del prototipo visual recibido en `sistema-codificacion-epen/`.

## Primera entrega

- Acceso de demostración con cuatro roles.
- Navegación protegida por rol.
- Inicio, cola de casos, detalle, revisión, historial, métricas y estado técnico.
- Decisiones persistidas en el navegador durante el modo demo.
- Adaptador preparado para consultar la API R3 real.
- Diseño responsive desde 360 px.
- Administración demostrativa de credenciales: crear, activar, desactivar y eliminar.
- Importación versionada de salidas CSV de R2 y selección de la base activa.
- Backend de autenticación preparado para PostgreSQL, con sesiones, roles y auditoría.

## Ejecutar

```powershell
cd "C:\Users\Lenovo\Documents\inetgrador inei\sistema-codificacion-epen-spa"
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5174`.

Las cuentas de demostración usan la clave `demo2026`:

- `analista`
- `supervisor`
- `auditor`
- `admin`

## Modos

Por defecto, la SPA puede funcionar con datos sintéticos. En el entorno real, el navegador nunca
consulta Ollama ni el puerto 8000 directamente: envía la solicitud autenticada al backend del
puerto 8080, y ese backend se comunica con R3. El lanzador seguro del backend configura
`QWEN_MODE=real` y `R3_BASE_URL=http://127.0.0.1:8000`.

Antes de iniciar el backend real, se debe levantar Ollama y ejecutar
`Codigos\pipeline_llm\servicio.py`. La página **Estado técnico** comprueba R3 mediante un endpoint
administrativo del backend, sin publicar el servicio interno al frontend.

El acceso demo no es autenticación de producción. La autenticación institucional y los permisos definitivos deben implementarse y validarse en el backend del dashboard antes de usar datos reales.

## Acceso real con PostgreSQL

El backend real se encuentra en `backend/`. Incluye el esquema de usuarios, sesiones, encuestas, casos, decisiones y auditoría. Consulta [`backend/README.md`](backend/README.md) para iniciar PostgreSQL, ejecutar las migraciones y crear el primer administrador.

La SPA conserva `VITE_AUTH_MODE=demo` mientras PostgreSQL no esté configurado. Al cambiarlo a `real`, deja de leer credenciales del navegador y utiliza exclusivamente la API del backend.

## Compartir una demo pública (túnel)

Sirve para que otras personas vean el dashboard sin instalar nada y sin abrir puertos en el
router. El túnel publica **un solo puerto** (el 5174 del frontend) y Vite reenvía `/api/*` al
backend; PostgreSQL (5432), Ollama (11434) y R3 (8000) nunca se exponen.

1. Abre el túnel y copia la URL que imprime:

```powershell
winget install --id Cloudflare.cloudflared   # solo la primera vez
cloudflared tunnel --url http://127.0.0.1:5174
```

2. Crea la cuenta de invitado (solo lectura) en otra ventana:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\backend\scripts\crear-usuario-demo-seguro.ps1"
```

3. Arranca el dashboard apuntando al dominio del túnel:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\backend\scripts\iniciar-demo-publica.ps1" -Dominio https://algo-random.trycloudflare.com
```

El lanzador configura `APP_ORIGIN`, `TRUST_PROXY=1` y `NODE_ENV=production` solo para esa
ejecución, y por defecto arranca Vite con `DEMO_HOST` para que acepte el dominio del túnel.
Con `-QwenMode real` usa el motor Qwen real (20-50 s por caso en CPU); sin ese parámetro
responde en modo demo, que es lo recomendable cuando hay varios invitados.

Notas de seguridad: entra siempre por la URL del túnel, comparte **solo** la cuenta `demo`
(nunca `haadmin`) y desactívala al terminar. El dominio gratuito cambia en cada arranque del
túnel; si eso molesta, reserva un dominio estático.

## Actualizar la base

El administrador puede entrar a **Bases de datos**, descargar la plantilla e importar una nueva versión. El CSV respeta el contrato R2 → R3 y requiere `id_registro`, `p309` y `candidatos`; esta última columna contiene un arreglo JSON de 1 a 5 códigos CIIU. Cada carga conserva su nombre y periodo y puede activarse sin borrar las anteriores.

En producción la carga se realizará en el backend, con validación, transacción, copia de seguridad y auditoría. La importación del navegador existe para probar el flujo sin usar información real.
