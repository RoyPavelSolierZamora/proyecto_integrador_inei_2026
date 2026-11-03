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

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
# La capa R3 viaja dentro del repositorio; la copia del workspace queda como respaldo.
$r3Local = Join-Path $projectRoot 'r3_local'
$r3Legacy = Join-Path $workspaceRoot 'Codigos\pipeline_llm'
$r3Root = if (Test-Path -LiteralPath (Join-Path $r3Local 'servicio.py')) { $r3Local } else { $r3Legacy }
$r2Mock = Join-Path $projectRoot 'backend\r2_mock\servicio_r2.py'
$r2BaseUrl = if ($env:R2_BASE_URL) { $env:R2_BASE_URL.TrimEnd('/') } else { 'http://127.0.0.1:8100' }

if (-not (Test-LocalEndpoint 'http://127.0.0.1:11434/api/tags')) {
    $ollama = Get-Command 'ollama.exe' -ErrorAction Stop
    Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -WindowStyle Hidden
    if (-not (Wait-LocalEndpoint 'http://127.0.0.1:11434/api/tags')) {
        throw 'Ollama no quedo disponible en http://127.0.0.1:11434.'
    }
    Write-Host 'Ollama local iniciado.'
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
    Write-Host 'API R3 local iniciada.'
}

if (-not (Test-LocalEndpoint "$r2BaseUrl/salud") -and $r2BaseUrl -eq 'http://127.0.0.1:8100') {
    if (-not (Test-Path -LiteralPath $r2Mock)) { throw "No se encontro el simulador contractual R2 en $r2Mock" }
    $python = Get-Command 'python.exe' -ErrorAction Stop
    Start-Process -FilePath $python.Source -ArgumentList @('servicio_r2.py') -WorkingDirectory (Split-Path -Parent $r2Mock) -WindowStyle Hidden
    if (-not (Wait-LocalEndpoint "$r2BaseUrl/salud")) {
        throw 'El microservicio R2 simulado no quedo disponible en http://127.0.0.1:8100.'
    }
    Write-Host 'Microservicio R2 simulado iniciado.'
}
if (-not (Test-LocalEndpoint "$r2BaseUrl/salud")) { throw "El microservicio R2 no responde en $r2BaseUrl." }

$databaseSecret = Read-Host 'Contrasena de PostgreSQL para epen_app' -AsSecureString
$databasePassword = ConvertFrom-SecureValue $databaseSecret

try {
    $env:PGHOST = '127.0.0.1'
    $env:PGPORT = '5432'
    $env:PGDATABASE = 'epen_codificacion'
    $env:PGUSER = 'epen_app'
    $env:PGPASSWORD = $databasePassword
    $env:NODE_ENV = 'development'
    $env:APP_ORIGIN = 'http://127.0.0.1:5174'
    $env:QWEN_MODE = 'real'
    $env:R3_BASE_URL = 'http://127.0.0.1:8000'
    $env:R2_BASE_URL = $r2BaseUrl
    Push-Location $projectRoot
    try {
        & node 'backend/scripts/migrate.js'
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones pendientes.' }
        & node 'backend/src/server.js'
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item Env:PGHOST -ErrorAction SilentlyContinue
    Remove-Item Env:PGPORT -ErrorAction SilentlyContinue
    Remove-Item Env:PGDATABASE -ErrorAction SilentlyContinue
    Remove-Item Env:PGUSER -ErrorAction SilentlyContinue
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
    Remove-Item Env:APP_ORIGIN -ErrorAction SilentlyContinue
    Remove-Item Env:QWEN_MODE -ErrorAction SilentlyContinue
    Remove-Item Env:R3_BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:R2_BASE_URL -ErrorAction SilentlyContinue
    $databasePassword = $null
}

