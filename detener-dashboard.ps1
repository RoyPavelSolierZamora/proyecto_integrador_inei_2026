<#
.SYNOPSIS
    Detiene los servicios del dashboard EPEN (puertos 5174, 8080, 8000 y 8100).

.DESCRIPTION
    Solo termina los procesos registrados por iniciar-dashboard.ps1 y verifica
    su hora de inicio para evitar cerrar programas ajenos. Ollama se deja activo.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $PSScriptRoot '.runtime'
$statePath = Join-Path $runtimeRoot 'processes.json'

Write-Host ''
Write-Host '  Deteniendo el dashboard EPEN' -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $statePath)) {
    Write-Host '   No hay procesos registrados por este proyecto.' -ForegroundColor Yellow
    Write-Host '   Si abriste servicios manualmente, cierra sus ventanas manualmente.' -ForegroundColor DarkGray
}
else {
    try { $records = @((Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).processes) }
    catch { throw 'El archivo .runtime/processes.json esta danado. No se detuvo ningun proceso por seguridad.' }

    foreach ($record in $records) {
        $process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        $sameProcess = $process.StartTime.ToUniversalTime().ToString('o') -eq $record.startedAtUtc
        if ($sameProcess) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Write-Host ('   detenido ' + $record.name + ' (PID ' + $record.pid + ', puerto ' + $record.port + ')') -ForegroundColor DarkGray
        }
        else {
            Write-Host ('   no se toco PID ' + $record.pid + ': ahora pertenece a otro proceso') -ForegroundColor Yellow
        }
    }
    Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
}

# Respaldo: un backend o frontend iniciado fuera del registro sigue ocupando su puerto y bloquea
# la siguiente ejecución. Solo se cierran procesos de este proyecto (la ruta del proyecto debe aparecer
# en la línea de comandos), nunca otros programas que usen el mismo puerto.
$projectMarker = [IO.Path]::GetFullPath($PSScriptRoot).ToLowerInvariant()
foreach ($port in 5174, 8080, 8100, 8000) {
    $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($ownerId in $owners) {
        $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId" -ErrorAction SilentlyContinue
        if (-not $info) { continue }
        $commandLine = [string]$info.CommandLine
        if ($commandLine.ToLowerInvariant().Contains($projectMarker) -or $commandLine -match 'backend[\\/]src[\\/]server\.js|vite\.js') {
            Stop-Process -Id $ownerId -Force -ErrorAction SilentlyContinue
            Write-Host ('   detenido proceso del proyecto en el puerto ' + $port + ' (PID ' + $ownerId + ')') -ForegroundColor DarkGray
        }
    }
}

Write-Host '   Listo. Ollama se mantiene activo.' -ForegroundColor Green
Write-Host ''
