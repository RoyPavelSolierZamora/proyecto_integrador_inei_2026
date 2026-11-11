@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0usar-ia-local.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo restaurar el procesamiento local.
  pause
  exit /b 1
)
endlocal
