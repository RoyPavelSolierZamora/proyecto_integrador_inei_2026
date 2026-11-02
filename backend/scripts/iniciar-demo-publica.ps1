<#
.SYNOPSIS
    Arranca el dashboard EPEN en modo demostracion publica por un tunel HTTPS.

.DESCRIPTION
    No modifica el lanzador local ni la configuracion existente: solo agrega las
    tres variables que un tunel necesita.

      APP_ORIGIN  = dominio publico (el backend rechaza cualquier otro origen)
      TRUST_PROXY = 1 (la IP real del visitante, no la del tunel)
      NODE_ENV    = production (cookie Secure; el navegador ya ve HTTPS)

    Ollama (11434), R3 (8000) y PostgreSQL (5432) siguen escuchando solo en
    127.0.0.1, asi que nunca quedan publicados.

.PARAMETER Dominio
    URL exacta que imprime el tunel, por ejemplo
    https://algo-random.trycloudflare.com (sin ruta ni barra final).

.PARAMETER QwenMode
    demo = respuestas sinteticas instantaneas (recomendado para invitados).
    real = motor Qwen real (20-50 s por caso en CPU; una sola inferencia a la vez).

.PARAMETER SinFrontend
    No inicia Vite; util si ya lo tienes corriendo con DEMO_HOST configurado.

.EXAMPLE
    .\iniciar-demo-publica.ps1 -Dominio https://algo-random.trycloudflare.com
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Dominio,

    [ValidateSet('demo', 'real')]
    [string]$QwenMode = 'demo',

    [switch]$SinFrontend
)

$ErrorActionPreference = 'Stop'

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Test-LocalEndpoint([string]$Uri) {
    try {
        Invoke-RestMethod -Uri $Uri -TimeoutSec 2 | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Wait-LocalEndpoint([string]$Uri, [int]$Attempts = 30) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        if (Test-LocalEndpoint $Uri) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

$Dominio = $Dominio.Trim().TrimEnd('/')
if ($Dominio -notmatch '^https://[A-Za-z0-9.-]+$') {
    throw 'El dominio debe tener la forma https://mi-dominio.trycloudflare.com (sin ruta ni barra final).'
}
$demoHost = ([Uri]$Dominio).Host

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
$r3Root = Join-Path $workspaceRoot 'Codigos\pipeline_llm'

if (-not (Test-LocalEndpoint 'http://127.0.0.1:11434/api/tags')) {
    $ollama = Get-Command 'ollama.exe' -ErrorAction Stop
    Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -WindowStyle Hidden
    if (-not (Wait-LocalEndpoint 'http://127.0.0.1:11434/api/tags')) {
        throw 'Ollama no quedo disponible en http://127.0.0.1:11434.'
    }
    Write-Host 'Ollama local iniciado.' -ForegroundColor Green
}

if (-not (Test-Path -LiteralPath (Join-Path $r3Root 'servicio.py'))) {
    throw "No se encontro la API R3 en $r3Root"
}
if (-not (Test-LocalEndpoint 'http://127.0.0.1:8000/salud')) {
    $python = Get-Command 'python.exe' -ErrorAction Stop
    Start-Process -FilePath $python.Source -ArgumentList @('servicio.py', '--puerto', '8000') -WorkingDirectory $r3Root -WindowStyle Hidden
    if (-not (Wait-LocalEndpoint 'http://127.0.0.1:8000/salud')) {
        throw 'La API R3 no quedo disponible en http://127.0.0.1:8000.'
    }
    Write-Host 'API R3 local iniciada.' -ForegroundColor Green
}

if (-not $SinFrontend) {
    $env:DEMO_HOST = $demoHost
    if (Test-LocalEndpoint 'http://127.0.0.1:5174/') {
        Write-Host "El frontend ya estaba corriendo. Si rechaza el dominio, cierralo y vuelve a lanzar este script para que herede DEMO_HOST=$demoHost." -ForegroundColor Yellow
    }
    else {
        $npm = (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue).Source
        if (-not $npm) { throw 'No se encontro npm.cmd en PATH.' }
        Start-Process -FilePath $npm -ArgumentList @('run', 'dev') -WorkingDirectory $projectRoot -WindowStyle Normal
        if (-not (Wait-LocalEndpoint 'http://127.0.0.1:5174/')) {
            throw 'El frontend no respondio en http://127.0.0.1:5174.'
        }
        Write-Host "Frontend iniciado en otra ventana (DEMO_HOST=$demoHost)." -ForegroundColor Green
    }
}

$databaseSecret = Read-Host 'Contrasena de PostgreSQL para epen_app' -AsSecureString
$databasePassword = ConvertFrom-SecureValue $databaseSecret

try {
    $env:PGHOST = '127.0.0.1'
    $env:PGPORT = '5432'
    $env:PGDATABASE = 'epen_codificacion'
    $env:PGUSER = 'epen_app'
    $env:PGPASSWORD = $databasePassword
    $env:NODE_ENV = 'production'
    $env:APP_ORIGIN = $Dominio
    $env:TRUST_PROXY = '1'
    $env:QWEN_MODE = $QwenMode
    $env:R3_BASE_URL = 'http://127.0.0.1:8000'

    Write-Host ''
    Write-Host "Demo publica: $Dominio" -ForegroundColor Cyan
    Write-Host "  Motor Qwen: $QwenMode   Origen permitido: $Dominio"
    Write-Host '  Entra siempre por el dominio del tunel, no por 127.0.0.1.'
    Write-Host '  No compartas la cuenta de administrador: usa la cuenta demo de solo lectura.'
    Write-Host '  Ctrl+C en esta ventana apaga el backend; el frontend queda en su propia ventana.'
    Write-Host ''

    Push-Location $projectRoot
    try {
        & node 'backend/src/server.js'
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:NODE_ENV, Env:APP_ORIGIN, Env:TRUST_PROXY, Env:QWEN_MODE, Env:R3_BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:DEMO_HOST -ErrorAction SilentlyContinue
    $databasePassword = $null
}
