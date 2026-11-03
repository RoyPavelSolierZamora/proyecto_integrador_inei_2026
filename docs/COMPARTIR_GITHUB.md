# Compartir el dashboard mediante GitHub

## Opciones para el equipo

| Modalidad | Requisitos | Qué permite probar |
|---|---|---|
| GitHub Pages | Solo un navegador | Interfaz, responsive, roles y flujo sintético |
| Demo descargada | Node.js 20+ | Lo mismo, ejecutado localmente con persistencia del navegador |
| Integración completa | Node.js, PostgreSQL, Python, Ollama y Qwen | Backend real, R2, Qwen, auditoría y exportación |

Para una revisión rápida, comparte primero el enlace de GitHub Pages. Nadie necesita descargar
Qwen para esa modalidad.

## Publicar el repositorio por primera vez

1. Crea en GitHub un repositorio vacío, sin agregar README, `.gitignore` ni licencia.
2. Desde esta carpeta, revisa que no existan archivos sensibles:

   ```powershell
   git status --short
   git diff --check
   git remote -v
   ```

3. Registra la dirección que GitHub muestre y publica la rama principal:

   ```powershell
   git remote add origin https://github.com/USUARIO/REPOSITORIO.git
   git push -u origin main
   ```

4. En GitHub abre **Settings → Pages** y selecciona **GitHub Actions** como fuente.
5. Revisa la ejecución **Demo visual en GitHub Pages** en la pestaña **Actions**.

El enlace tendrá normalmente esta forma:

```text
https://USUARIO.github.io/REPOSITORIO/
```

## Probar después de descargar el código

El compañero puede usar **Code → Download ZIP**, descomprimirlo y ejecutar:

```text
iniciar-demo-local.bat
```

También puede clonar el repositorio:

```powershell
git clone https://github.com/USUARIO/REPOSITORIO.git
cd REPOSITORIO
.\iniciar-demo-local.bat
```

Credenciales demostrativas: `admin` / `demo2026`.

## Datos que nunca deben subirse

- Archivos `.env` o contraseñas de PostgreSQL.
- Bases EPEN reales, respuestas P309 reales o archivos exportados.
- Bases `.db`, `.sqlite` o volcados de PostgreSQL.
- Tokens, cookies, túneles, claves de API o credenciales institucionales.
- Carpetas locales de carga, descarga o respaldo de configuración.
- Modelos entrenados con datos reales sin autorización institucional.

El `.gitignore` cubre los formatos locales conocidos, pero antes de cada publicación se debe
revisar `git status`. Los datos sintéticos incluidos deben conservar su etiqueta de demostración.

## Limitaciones de GitHub Pages

GitHub Pages sirve archivos estáticos. No ejecuta Express, PostgreSQL, Python, Ollama, R2 ni Qwen.
Por eso la publicación compila automáticamente con `VITE_AUTH_MODE=demo` y
`VITE_DATA_MODE=demo`. El sistema real permanece local o debe desplegarse posteriormente en una
infraestructura privada autorizada.
