@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0conectar-colab.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo configurar la conexion con Colab.
  pause
  exit /b 1
)
endlocal
