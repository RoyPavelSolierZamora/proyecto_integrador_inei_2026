$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $projectRoot

try {
    $node = Get-Command 'node.exe' -ErrorAction Stop
    $major = [int](& $node.Source -p "process.versions.node.split('.')[0]")
    if ($major -lt 20) {
        throw 'La demo requiere Node.js 20 o una version posterior.'
    }

    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
        Write-Host 'Preparando la demo por primera vez...' -ForegroundColor Cyan
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
    }

    $env:VITE_AUTH_MODE = 'demo'
    $env:VITE_DATA_MODE = 'demo'
    Write-Host ''
    Write-Host 'Demo EPEN lista. Se abrira http://127.0.0.1:5174' -ForegroundColor Green
    Write-Host 'Usuario: admin  |  Clave: demo2026' -ForegroundColor Yellow
    Write-Host 'Cierra esta ventana para detener la demo.' -ForegroundColor DarkGray
    & npm.cmd run demo
}
finally {
    Remove-Item Env:VITE_AUTH_MODE, Env:VITE_DATA_MODE -ErrorAction SilentlyContinue
    Pop-Location
}
