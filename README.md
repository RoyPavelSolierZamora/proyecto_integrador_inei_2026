# Sistema de codificación asistida EPEN

SPA local para el flujo R2 → R3 → R4 del Proyecto Integrador PEU-CD. Esta carpeta es independiente del prototipo visual recibido en `sistema-codificacion-epen/`.

## Probar la interfaz sin PostgreSQL ni Qwen

Esta es la opción recomendada para compañeros que solo necesitan recorrer la SPA. Utiliza
exclusivamente datos sintéticos y guarda los cambios en el navegador.

Requisito: [Node.js 20 o posterior](https://nodejs.org/). Después de descargar o clonar el
repositorio, en Windows basta con hacer doble clic en:

```text
iniciar-demo-local.bat
```

La primera ejecución instala las dependencias y abre `http://127.0.0.1:5174`. Acceso:
`admin` / `demo2026`. No requiere PostgreSQL, Python, Ollama ni descargar Qwen.

También se incluye `.github/workflows/pages.yml`. Cuando el repositorio se publique en GitHub y
se seleccione **Settings → Pages → Source: GitHub Actions**, cada envío a `main` desplegará una
demo visual estática. Esa página tampoco contiene backend, credenciales reales ni datos EPEN.

La demo visual sirve para revisar navegación, roles, responsive, casos sintéticos y decisiones.
No demuestra la persistencia PostgreSQL ni ejecuta realmente R2/Qwen; para eso se usa la instalación
completa descrita más abajo.

## Instalación completa con Qwen real (para el equipo)

Si necesitas probar el flujo real (cargar una base P309 → R2 → umbral τ → Qwen → decisión humana)
en tu propia máquina, el repositorio ya incluye todo: backend, microservicio R2 simulado y la capa
R3 con su catálogo CIIU. Solo se necesita Windows 10/11 y conexión a Internet; el instalador se
encarga de Node.js, Python, PostgreSQL 18, Ollama y el modelo de Qwen.

```text
instalar.bat
```

Qué hace, en orden:

1. Comprueba e instala lo que falte con `winget`.
2. Crea el usuario `epen_app` y la base `epen_codificacion`.
3. Escribe un `.env` local (excluido por `.gitignore`) con toda la configuración.
4. Aplica las migraciones e instala el catálogo CIIU y los 6 casos sintéticos.
5. Crea tu cuenta administradora.
6. Descarga `qwen3:4b-instruct-2507-q4_K_M` (2,5 GB) si todavía no está.
7. Verifica que R3 y R2 respondan.

Después, para trabajar:

```text
iniciar-dashboard.bat     arranca todo y abre http://127.0.0.1:5174
detener-dashboard.bat     detiene backend, frontend, R3 y R2
```

Guía paso a paso y solución de problemas: [`docs/INSTALACION.md`](docs/INSTALACION.md).

> Los 6 casos incluidos son **sintéticos**. Sirven para recorrer el flujo real; no son resultados
> del INEI y no deben presentarse como tales.

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
- Carga de bases P309 originales, trabajos reanudables y conector por lotes al microservicio R2.

## Ejecutar

```powershell
cd "RUTA_DONDE_DESCARGASTE\sistema-codificacion-epen-spa"
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
`r3_local\servicio.py`. La página **Estado técnico** comprueba R3 mediante un endpoint
administrativo del backend, sin publicar el servicio interno al frontend.

El acceso demo no es autenticación de producción. La autenticación institucional y los permisos definitivos deben implementarse y validarse en el backend del dashboard antes de usar datos reales.

## Acceso real con PostgreSQL

El backend real se encuentra en `backend/`. Incluye el esquema de usuarios, sesiones, encuestas, casos, decisiones y auditoría. Consulta [`backend/README.md`](backend/README.md) para iniciar PostgreSQL, ejecutar las migraciones y crear el primer administrador.

La SPA conserva `VITE_AUTH_MODE=demo` mientras PostgreSQL no esté configurado. Al cambiarlo a `real`, deja de leer credenciales del navegador y utiliza exclusivamente la API del backend.

## Compartir una demo pública (túnel)

Sirve para que otras personas vean el dashboard sin instalar nada y sin abrir puertos en el
router. El túnel publica **un solo puerto** (el 5174 del frontend) y Vite reenvía `/api/*` al
backend; PostgreSQL (5432), Ollama (11434) y R3 (8000) nunca se exponen.

1. Instala el túnel (solo la primera vez):

```powershell
winget install --id Cloudflare.cloudflared
```

2. Crea la cuenta de invitado (solo lectura):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\backend\scripts\crear-usuario-demo-seguro.ps1"
```

3. Arranca todo y abre el túnel en un solo paso:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\backend\scripts\iniciar-demo-publica.ps1" -Tunel
```

El script abre cloudflared, detecta la URL, la usa como `APP_ORIGIN` y `DEMO_HOST`, comprueba
que el link responda y la imprime como **LINK PARA COMPARTIR**. Si ya tienes un túnel abierto,
usa `-Dominio https://tu-tunel` en lugar de `-Tunel`.

El rol de la cuenta demo es `auditor` (solo lectura) por defecto. Con `-RolDemo analista` el
invitado puede codificar; con `-RolDemo supervisor` añade revisión, historial y métricas; y con
`-RolDemo admin` obtiene acceso total. Este último pide una confirmación explícita porque un
invitado podría desactivar cuentas (incluida la cuenta administradora principal) o importar bases. La clave demo se
renueva en cada arranque, así que volver a lanzar sin `-RolDemo admin` devuelve la cuenta a
`auditor`.

El lanzador configura `APP_ORIGIN`, `TRUST_PROXY=1` y `NODE_ENV=production` solo para esa
ejecución, y por defecto arranca Vite con `DEMO_HOST` para que acepte el dominio del túnel.
Con `-QwenMode real` usa el motor Qwen real (20-50 s por caso en CPU); sin ese parámetro
responde en modo demo, que es lo recomendable cuando hay varios invitados.

Notas de seguridad: entra siempre por la URL del túnel, comparte **solo** la cuenta `demo`
(nunca una cuenta administradora personal) y desactívala al terminar. El dominio gratuito cambia en cada arranque del
túnel; si eso molesta, reserva un dominio estático.

## Actualizar la base

El administrador puede entrar a **Bases de datos**, descargar la plantilla e importar una nueva versión. El CSV respeta el contrato R2 → R3 y requiere `id_registro`, `p309` y `candidatos`; esta última columna contiene un arreglo JSON de 1 a 5 códigos CIIU. Cada carga conserva su nombre y periodo y puede activarse sin borrar las anteriores.

En producción la carga se realizará en el backend, con validación, transacción, copia de seguridad y auditoría. La importación del navegador existe para probar el flujo sin usar información real.

## Integrar el motor estadístico R2

El dashboard incluye un microservicio contractual simulado en `backend/r2_mock/servicio_r2.py` y
una cola PostgreSQL reanudable. El rol `operador` puede cargar desde **Bases de datos** un CSV
original con `id_registro,p309,p308,p308a`; el backend lo divide en lotes, consulta R2, aplica el
umbral y activa la nueva versión al terminar. Por cada carga se puede elegir **Qwen automático**
o **Qwen manual**. En automático, Qwen procesa en segundo plano solo los casos difíciles y el
backend los resuelve únicamente cuando Qwen confirma el Top-1 de R2; las discrepancias y fallos
pasan a revisión humana.

Cada base conserva nombre, periodo y versión. El campo periodo es libre (`2027-T1`, `2027-01`,
`ene-mar 2027`, etc.) para admitir entregas trimestrales, mensuales, trimestres móviles u otros
cortes sin cambiar el sistema.

El procesamiento masivo se inicia desde **Bases de datos**: el backend divide el archivo en lotes
para R2 y, según la opción elegida, procesa automáticamente con Qwen los casos difíciles. La
pantalla **Codificación** es una bandeja de excepciones para el trabajo humano, no un segundo
procesador masivo. Cada versión puede descargarse con **Exportar CSV**; el archivo contiene todos
los registros, su estado, código final, origen de la última decisión, confianza, candidatos,
modelo y justificación. Los pendientes permanecen visibles con el código final vacío.

Para mantener la pantalla operativa simple, el historial muestra cinco versiones por página con
búsqueda y filtro de estado; los trabajos muestran inicialmente los tres más recientes. La
importación de resultados generados fuera del dashboard y la simulación de umbral están dentro de
**Herramientas avanzadas**, cerradas por defecto y disponibles solo para administradores.

El simulador no mide desempeño ni sustituye el modelo de R2. Para conectar el servicio real,
sigue [`docs/INTEGRACION_R2_DASHBOARD.md`](docs/INTEGRACION_R2_DASHBOARD.md) y configura
`R2_BASE_URL`. No hace falta modificar React, PostgreSQL ni la capa Qwen si se respeta el contrato
HTTP v1.0.
