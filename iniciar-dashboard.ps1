<#
.SYNOPSIS
    Arranca el dashboard EPEN completo (R3 + R2 + backend + frontend).

.DESCRIPTION
    Usa la configuracion guardada en .env por instalar.ps1. No pide contrasenas.
    Abre el backend y el frontend en ventanas separadas para que se vean los registros.

.PARAMETER SinNavegador
    No abre el navegador al terminar.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar-dashboard.ps1
#>
[CmdletBinding()]
param([switch]$SinNavegador)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$frontendUrl = 'http://127.0.0.1:5174'
$backendUrl = 'http://127.0.0.1:8080/api/health'

function Write-Paso([string]$Texto) {
    Write-Host ''
    Write-Host ('== ' + $Texto) -ForegroundColor Cyan
}
function Write-Ok([string]$Texto) { Write-Host ('   OK  ' + $Texto) -ForegroundColor Green }
function Write-Aviso([string]$Texto) { Write-Host ('   !   ' + $Texto) -ForegroundColor Yellow }

function Test-Port([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(800, $false)) { return $false }
        $client.EndConnect($async)
        return $true
    }
    catch { return $false }
    finally { $client.Close() }
}

function Get-HttpJson([string]$Uri) {
    try { return Invoke-RestMethod -Uri $Uri -TimeoutSec 4 } catch { return $null }
}

function Wait-Port([int]$Port, [int]$Attempts = 60) {
    for ($i = 0; $i -lt $Attempts; $i++) {
        if (Test-Port $Port) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Find-Python {
    $command = Get-Command 'python.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $fallback = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    return $null
}

Push-Location $projectRoot
try {
    Write-Host ''
    Write-Host '  DASHBOARD EPEN' -ForegroundColor White
    Write-Host ''

    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
        throw 'No existe .env. Ejecuta primero instalar.bat.'
    }

    $python = Find-Python
    if (-not $python) { throw 'No se encontro Python. Ejecuta instalar.bat.' }

    # --- Ollama -------------------------------------------------------------
    Write-Paso 'Ollama'
    if (-not (Get-HttpJson 'http://127.0.0.1:11434/api/tags')) {
        $ollama = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue
        if (-not $ollama) { throw 'Ollama no esta instalado. Ejecuta instalar.bat.' }
        Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -WindowStyle Hidden
        for ($i = 0; $i -lt 40 -and -not (Get-HttpJson 'http://127.0.0.1:11434/api/tags'); $i++) { Start-Sleep -Milliseconds 500 }
    }
    Write-Ok 'Ollama respondiendo'

    # --- R3 -----------------------------------------------------------------
    Write-Paso 'Motor R3 (Python + Qwen)'
    if (-not (Get-HttpJson 'http://127.0.0.1:8000/salud')) {
        $r3Root = Join-Path $projectRoot 'r3_local'
        if (-not (Test-Path -LiteralPath (Join-Path $r3Root 'servicio.py'))) { throw 'Falta r3_local/servicio.py.' }
        Start-Process -FilePath $python -ArgumentList @('servicio.py', '--puerto', '8000') -WorkingDirectory $r3Root -WindowStyle Hidden
        for ($i = 0; $i -lt 40 -and -not (Get-HttpJson 'http://127.0.0.1:8000/salud'); $i++) { Start-Sleep -Milliseconds 500 }
    }
    $r3 = Get-HttpJson 'http://127.0.0.1:8000/salud'
    if (-not $r3) { throw 'R3 no respondio en http://127.0.0.1:8000.' }
    Write-Ok ('R3 operativo con ' + $r3.catalogo_clases + ' clases CIIU')

    # --- R2 -----------------------------------------------------------------
    Write-Paso 'Microservicio R2'
    if (-not (Get-HttpJson 'http://127.0.0.1:8100/salud')) {
        $r2Root = Join-Path $projectRoot 'backend\r2_mock'
        Start-Process -FilePath $python -ArgumentList @('servicio_r2.py') -WorkingDirectory $r2Root -WindowStyle Hidden
        for ($i = 0; $i -lt 20 -and -not (Get-HttpJson 'http://127.0.0.1:8100/salud'); $i++) { Start-Sleep -Milliseconds 500 }
    }
    if (-not (Get-HttpJson 'http://127.0.0.1:8100/salud')) { throw 'R2 no respondio en http://127.0.0.1:8100.' }
    Write-Ok 'R2 operativo (simulador contractual)'

    # --- Backend ------------------------------------------------------------
    Write-Paso 'Backend (PostgreSQL)'
    if (Test-Port 8080) {
        Write-Aviso 'El puerto 8080 ya estaba ocupado; se reutiliza el backend existente.'
    }
    else {
        Start-Process -FilePath 'powershell.exe' -WorkingDirectory $projectRoot -ArgumentList @(
            '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'node backend/src/server.js'
        )
        if (-not (Wait-Port 8080 60)) { throw 'El backend no arranco. Revisa su ventana para ver el error.' }
    }
    $health = Get-HttpJson $backendUrl
    if ($health) { Write-Ok ('Backend operativo (' + $health.status + ')') }
    else { Write-Aviso 'El backend responde, pero /api/health no devolvio datos. Revisa su ventana.' }

    # --- Frontend -----------------------------------------------------------
    Write-Paso 'Interfaz web'
    if (Test-Port 5174) {
        Write-Aviso 'El puerto 5174 ya estaba ocupado; se reutiliza la interfaz existente.'
    }
    else {
        Start-Process -FilePath 'powershell.exe' -WorkingDirectory $projectRoot -ArgumentList @(
            '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'npm.cmd run dev'
        )
        if (-not (Wait-Port 5174 90)) { throw 'La interfaz no arranco. Revisa su ventana para ver el error.' }
    }
    Write-Ok 'Interfaz disponible'

    Write-Host ''
    Write-Host ('  Abre: ' + $frontendUrl) -ForegroundColor Green
    Write-Host '  Usa la cuenta administradora que creaste en la instalacion.' -ForegroundColor White
    Write-Host '  Para detener todo: detener-dashboard.bat' -ForegroundColor DarkGray
    Write-Host ''

    if (-not $SinNavegador) { Start-Process $frontendUrl }
}
finally {
    Pop-Location
}
