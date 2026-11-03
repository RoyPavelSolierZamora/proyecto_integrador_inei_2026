# Sistema de codificación asistida EPEN

SPA local para el flujo R2 → R3 → R4 del Proyecto Integrador PEU-CD. Esta carpeta es independiente del prototipo visual recibido en `sistema-codificacion-epen/`.

**Autores:** Roy Solier, Junior Palomino, Victor Moran y Nayeli Girón.

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

La SPA usa la API del backend cuando `VITE_AUTH_MODE=real` (lo escribe `instalar.ps1`); en ese
modo no lee credenciales del navegador.

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
