@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" %*
set "EPEN_EXIT=%ERRORLEVEL%"
echo.
if "%EPEN_EXIT%"=="0" (
  echo Instalacion finalizada. Revisa y anota las credenciales mostradas arriba.
) else (
  echo La instalacion no termino correctamente. Revisa el error mostrado arriba.
)
echo Presiona una tecla para cerrar esta ventana.
pause >nul
exit /b %EPEN_EXIT%
