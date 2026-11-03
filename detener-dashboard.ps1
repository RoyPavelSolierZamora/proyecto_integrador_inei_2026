<#
.SYNOPSIS
    Detiene los servicios del dashboard EPEN (puertos 5174, 8080, 8000 y 8100).

.DESCRIPTION
    Solo termina procesos node y python asociados a esos puertos. Ollama se deja
    en ejecucion porque puede estar usandose para otras tareas.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'
$ports = @(5174, 8080, 8000, 8100)

Write-Host ''
Write-Host '  Deteniendo el dashboard EPEN' -ForegroundColor Cyan

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and @('node', 'python') -contains $process.ProcessName) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Write-Host ('   detenido ' + $process.ProcessName + ' (puerto ' + $port + ')') -ForegroundColor DarkGray
        }
    }
}

Write-Host '   Listo. Ollama se mantiene activo.' -ForegroundColor Green
Write-Host ''
