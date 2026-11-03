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

Write-Host '   Listo. Ollama se mantiene activo.' -ForegroundColor Green
Write-Host ''
