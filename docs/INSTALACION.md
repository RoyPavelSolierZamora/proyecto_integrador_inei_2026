# Instalación completa del dashboard EPEN

Esta guía deja una máquina Windows ejecutando el flujo real **R2 → R3 (Qwen) → R4** con
PostgreSQL, sin depender de la carpeta `Codigos/pipeline_llm` del equipo de R3: esa capa viaja
dentro del repositorio en `r3_local/`.

## Qué se instala

| Componente | Para qué | Puerto |
|---|---|---|
| React SPA (Vite) | Interfaz del dashboard | 5174 |
| Backend Express | Autenticación, datos y API | 8080 |
| PostgreSQL 18 | Persistencia real | 5432 |
| R3 (`r3_local`) | Puente Python hacia Ollama | 8000 |
| Ollama + Qwen3 4B | Codificación con LLM local | 11434 |
| R2 simulado | Contrato HTTP del motor R2 | 8100 |

Todos los servicios escuchan **solo en 127.0.0.1**. Nada queda expuesto a la red local ni a
Internet.

## Requisitos

- Windows 10 u 11 (64 bits).
- Conexión a Internet durante la instalación.
- Unos **5 GB** de disco libre (modelo de Qwen: 2,5 GB).
- Opcional: permisos de administrador, necesarios si hay que instalar PostgreSQL.

No hace falta instalar Node.js, Python, PostgreSQL ni Ollama a mano: el instalador lo hace.

## Instalación en un paso

Descomprime o clona el repositorio y haz doble clic en:

```text
instalar.bat
```

También se puede ejecutar desde PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\instalar.ps1"
```

Durante el proceso:

1. Si falta PostgreSQL, el instalador lo instala en modo desatendido y **genera** la contraseña
   del usuario `postgres`. No necesitas recordarla.
2. Si PostgreSQL **ya estaba instalado**, te pedirá la contraseña de `postgres` una sola vez.
   Es la que elegiste al instalar PostgreSQL; no se guarda en ningún archivo.
3. Te pedirá el usuario y la contraseña de la cuenta administradora del dashboard. Si dejas la
   contraseña vacía, se genera una automática y se muestra **una única vez**.

Duración estimada: entre 5 y 15 minutos si el modelo ya está descargado, y hasta 40 minutos si
hay que bajar Qwen.

## Qué hace el instalador

1. Comprueba Node.js 20+, Python 3.10+, PostgreSQL 18 y Ollama; instala lo que falte con `winget`.
2. Crea el usuario `epen_app` y la base `epen_codificacion`.
3. Escribe `.env` en la raíz del proyecto con toda la configuración.
4. Aplica las migraciones `001`–`004` y carga el catálogo CIIU (417 clases) y los 6 casos
   sintéticos.
5. Crea la cuenta administradora con hash scrypt.
6. Descarga `qwen3:4b-instruct-2507-q4_K_M` si no está disponible.
7. Arranca R3 y R2 y verifica que respondan.

## Primer acceso

```text
iniciar-dashboard.bat
```

Abre `http://127.0.0.1:5174` e inicia sesión con la cuenta que creaste. El lanzador abre el
backend y el frontend en ventanas separadas para que puedas ver los registros si algo falla.

> Usa exactamente `http://127.0.0.1:5174`. Si abres `http://localhost:5174`, el backend rechaza
> las peticiones con un error 403 porque valida el origen de cada operación.

## Uso diario

```text
iniciar-dashboard.bat    arranca Ollama, R3, R2, backend y frontend
detener-dashboard.bat    detiene los cuatro servicios (Ollama se mantiene activo)
```

`detener-dashboard.bat` solo termina procesos `node` y `python` asociados a los puertos del
proyecto.

## Probar el flujo real completo

Los 6 casos que trae la instalación ya vienen con candidatos R2 precalculados: sirven para probar
Qwen y las decisiones humanas, pero **no** ejercitan la carga cruda ni el trabajo por lotes.

Para probar el camino completo:

1. Entra con un usuario **operador** o **admin**.
2. Ve a **Bases** y carga `public/plantilla_base_original.csv`
   (columnas `id_registro,p309,p308,p308a`).
3. Elige el umbral τ y el modo de Qwen (manual o automático).
4. El backend crea un trabajo, envía los registros a R2, aplica τ y activa la nueva versión.
5. Los casos que queden por debajo del umbral aparecen en **Codificación** para Qwen o revisión
   humana.

El contrato exacto que debe cumplir el motor R2 real está en
[`INTEGRACION_R2_DASHBOARD.md`](INTEGRACION_R2_DASHBOARD.md). El servicio incluido en
`backend/r2_mock/` es un **simulador léxico**, no un modelo estadístico: para usar el motor real
del equipo R2 basta cambiar `R2_BASE_URL` en `.env`.

## Qué es sintético

- Los 6 casos iniciales están marcados con `is_synthetic = true`.
- El microservicio R2 incluido simula el contrato.
- No hay datos reales del INEI en el repositorio.

Los porcentajes y métricas que se vean en el dashboard **no** son resultados oficiales.

## Opciones del instalador

| Opción | Efecto |
|---|---|
| `-SinWinget` | No instala nada; solo comprueba y avisa de lo que falta. |
| `-SinModelo` | No descarga Qwen (útil si ya lo tienes). |
| `-Reconfigurar` | Genera una contraseña nueva para `epen_app` y reescribe `.env`. |
| `-Modelo <nombre>` | Usa otro modelo de Ollama. |

Ejemplo:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\instalar.ps1" -SinModelo
```

## Solución de problemas

| Síntoma | Causa habitual | Solución |
|---|---|---|
| `winget` no se reconoce | Windows antiguo o sin App Installer | Instala los programas a mano (ver abajo) y ejecuta `instalar.ps1 -SinWinget`. |
| Falla la instalación de PostgreSQL | `--override` no soportado por esa versión de winget | Instala PostgreSQL 18 desde el sitio oficial, elige tu contraseña y vuelve a ejecutar `instalar.bat`. |
| `No se pudo conectar como postgres` | Contraseña incorrecta o servicio detenido | Inicia el servicio `postgresql-x64-18` y repite. |
| El backend no arranca | Puerto 8080 ocupado | Ejecuta `detener-dashboard.bat` y vuelve a intentar. |
| `Blocked request. This host is not allowed` | Quedó una ventana de Vite abierta sin `DEMO_HOST` | Cierra todas las ventanas de Vite y relanza `iniciar-dashboard.bat`. |
| Qwen tarda 20–45 s por caso | Inferencia en CPU | Es lo esperado en un portátil sin GPU. |
| `El modelo no está descargado` | Descarga interrumpida | `ollama pull qwen3:4b-instruct-2507-q4_K_M`. |
| Ollama no responde | Servicio detenido | Abre Ollama o ejecuta `ollama serve`. |
| `npm.cmd` bloqueado por la política de ejecución | PowerShell restrictivo | Usa `instalar.bat`, que invoca con `-ExecutionPolicy Bypass`. |

### Instalación manual (si `winget` no funciona)

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Python.Python.3.12 -e
winget install --id PostgreSQL.PostgreSQL.18 -e
winget install --id Ollama.Ollama -e
```

Después, desde la carpeta del proyecto:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\instalar.ps1" -SinWinget
```

## Seguridad

- `.env` contiene la contraseña local de PostgreSQL y está excluido por `.gitignore`.
- Las contraseñas de los usuarios se guardan como hash scrypt; nunca en texto plano.
- Las sesiones usan cookie `HttpOnly` y `SameSite=Strict`, con token CSRF.
- El backend valida roles y origen de cada petición.
- Nunca publiques `.env` ni el puerto 5432.

## Desinstalar o empezar de cero

```powershell
# Detener servicios
.\detener-dashboard.bat

# Borrar la base y el usuario (pide la contraseña de postgres)
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "DROP DATABASE epen_codificacion;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "DROP ROLE epen_app;"

# Borrar configuración local
Remove-Item .\.env
```

Los modelos de Ollama se eliminan con `ollama rm qwen3:4b-instruct-2507-q4_K_M`.
