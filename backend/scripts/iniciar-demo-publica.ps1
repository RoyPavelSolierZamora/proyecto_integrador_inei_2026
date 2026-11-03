<#
.SYNOPSIS
    Arranca el dashboard EPEN en modo demostracion publica con un solo comando.

.DESCRIPTION
    Hace todo el trabajo en orden:

      1. Levanta Ollama y la API R3 si no estan corriendo.
      2. Pide una sola vez la contrasena de PostgreSQL (solo en memoria).
      3. Crea o renueva la cuenta demo de solo lectura con una clave nueva.
      4. Abre el tunel HTTPS con Cloudflare y obtiene la URL publica.
      5. Arranca el frontend aceptando ese dominio y comprueba que el link responda.
      6. Arranca el backend con APP_ORIGIN, TRUST_PROXY=1 y NODE_ENV=production.

    Al final imprime el link y las credenciales para compartir.

    Ollama (11434), R3 (8000) y PostgreSQL (5432) siguen escuchando solo en
    127.0.0.1, asi que nunca quedan publicados.

.PARAMETER Tunel
    Abre el tunel automaticamente. Es la forma recomendada.

.PARAMETER Dominio
    URL de un tunel que ya tengas abierto, por ejemplo
    https://algo-random.trycloudflare.com (sin ruta ni barra final).

.PARAMETER QwenMode
    demo = respuestas sinteticas instantaneas (recomendado para invitados).
    real = motor Qwen real (20-50 s por caso en CPU; una sola inferencia a la vez).

.PARAMETER SinFrontend
    No inicia Vite; util si ya lo tienes corriendo con DEMO_HOST configurado.

.EXAMPLE
    .\iniciar-demo-publica.ps1 -Tunel
#>
param(
    [string]$Dominio,

    [ValidateSet('demo', 'real')]
    [string]$QwenMode = 'demo',

    [ValidateSet('operador', 'auditor', 'analista', 'supervisor', 'admin')]
    [string]$RolDemo = 'auditor',

    [switch]$SinFrontend,

    [switch]$Tunel
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

function Find-Cloudflared {
    $command = Get-Command 'cloudflared' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ }
    foreach ($root in $roots) {
        $candidate = Join-Path $root 'cloudflared\cloudflared.exe'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

function Start-QuickTunnel([string]$CloudflaredPath, [string]$LocalUrl) {
    $logDirectory = Join-Path $env:TEMP 'epen-demo-tunel'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $stdout = Join-Path $logDirectory 'cloudflared-out.log'
    $stderr = Join-Path $logDirectory 'cloudflared-err.log'
    Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue

    $process = Start-Process -FilePath $CloudflaredPath `
        -ArgumentList @('tunnel', '--url', $LocalUrl, '--no-autoupdate') `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
        -WindowStyle Hidden -PassThru

    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        foreach ($file in @($stderr, $stdout)) {
            if (-not (Test-Path -LiteralPath $file)) { continue }
            $found = Select-String -Path $file -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { return [pscustomobject]@{ Process = $process; Url = $found.Matches[0].Value; Log = $stderr } }
        }
        if ($process.HasExited) { throw "cloudflared termino sin publicar el tunel. Revisa $stderr" }
    }

    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "El tunel no publico una URL en 30 segundos. Revisa $stderr"
}

function Get-PublicStatus([string]$Url, [int]$Attempts = 20) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            return [int]$response.StatusCode
        }
        catch {
            $response = $_.Exception.Response
            if ($response -and $response.StatusCode) { return [int]$response.StatusCode }
        }
        Start-Sleep -Seconds 1
    }
    return 0
}

function Get-LocalHostStatus([string]$Url, [string]$HostHeader) {
    try {
        $response = Invoke-WebRequest -Uri $Url -Headers @{ Host = $HostHeader } -UseBasicParsing -TimeoutSec 5
        return [int]$response.StatusCode
    }
    catch {
        $response = $_.Exception.Response
        if ($response -and $response.StatusCode) { return [int]$response.StatusCode }
        return 0
    }
}

function New-DemoPassword {
    $alphabet = (48..57) + (65..90) + (97..122)
    $suffix = -join ($alphabet | Get-Random -Count 10 | ForEach-Object { [char]$_ })
    return "Demo-$suffix"
}

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
# La capa R3 viaja dentro del repositorio; la copia del workspace queda como respaldo.
$r3Local = Join-Path $projectRoot 'r3_local'
$r3Legacy = Join-Path $workspaceRoot 'Codigos\pipeline_llm'
$r3Root = if (Test-Path -LiteralPath (Join-Path $r3Local 'servicio.py')) { $r3Local } else { $r3Legacy }
$r2Mock = Join-Path $projectRoot 'backend\r2_mock\servicio_r2.py'
$r2BaseUrl = if ($env:R2_BASE_URL) { $env:R2_BASE_URL.TrimEnd('/') } else { 'http://127.0.0.1:8100' }

if (-not $Tunel -and -not $Dominio) {
    throw 'Indica -Tunel para abrir el tunel automaticamente, o -Dominio https://tu-tunel para reutilizar uno abierto.'
}

if ($RolDemo -eq 'admin') {
    Write-Host ''
    Write-Host 'AVISO: vas a compartir una cuenta ADMINISTRADORA por un link publico.' -ForegroundColor Red
    Write-Host 'Un invitado podria desactivar o retirar cuentas (incluida la administradora principal),' -ForegroundColor Red
    Write-Host 'importar bases y ver el estado tecnico. Solo para una demo vigilada.' -ForegroundColor Red
    $confirmation = Read-Host 'Escribe SI para continuar'
    if ($confirmation -ne 'SI') {
        throw 'Cancelado. Usa -RolDemo supervisor para mostrar el flujo sin permisos de administracion.'
    }
}

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

if (-not (Test-LocalEndpoint "$r2BaseUrl/salud") -and $r2BaseUrl -eq 'http://127.0.0.1:8100') {
    if (-not (Test-Path -LiteralPath $r2Mock)) { throw "No se encontro el simulador contractual R2 en $r2Mock" }
    $python = Get-Command 'python.exe' -ErrorAction Stop
    Start-Process -FilePath $python.Source -ArgumentList @('servicio_r2.py') -WorkingDirectory (Split-Path -Parent $r2Mock) -WindowStyle Hidden
    if (-not (Wait-LocalEndpoint "$r2BaseUrl/salud")) {
        throw 'El microservicio R2 simulado no quedo disponible en http://127.0.0.1:8100.'
    }
    Write-Host 'Microservicio R2 simulado iniciado.' -ForegroundColor Green
}
if (-not (Test-LocalEndpoint "$r2BaseUrl/salud")) { throw "El microservicio R2 no responde en $r2BaseUrl." }

$databaseSecret = Read-Host 'Contrasena de PostgreSQL para epen_app' -AsSecureString
$databasePassword = ConvertFrom-SecureValue $databaseSecret
if (-not $databasePassword) {
    throw 'No escribiste la contrasena de PostgreSQL. Es la del usuario epen_app que definiste al configurar la base.'
}

$demoUser = 'demo'
$demoPassword = New-DemoPassword
$tunnel = $null

try {
    $env:PGHOST = '127.0.0.1'
    $env:PGPORT = '5432'
    $env:PGDATABASE = 'epen_codificacion'
    $env:PGUSER = 'epen_app'
    $env:PGPASSWORD = $databasePassword
    $env:NODE_ENV = 'production'
    $env:QWEN_MODE = $QwenMode
    $env:R3_BASE_URL = 'http://127.0.0.1:8000'
    $env:R2_BASE_URL = $r2BaseUrl
    $env:DEMO_USERNAME = $demoUser
    $env:DEMO_FULL_NAME = 'Invitado de demostracion'
    $env:DEMO_ROLE = $RolDemo
    $env:DEMO_PASSWORD = $demoPassword
    $env:DEMO_RESET_PASSWORD = '1'
    if ($RolDemo -eq 'admin') { $env:DEMO_ALLOW_ADMIN = '1' }

    Write-Host 'Preparando la cuenta demo de solo lectura...' -ForegroundColor Cyan
    Push-Location $projectRoot
    try {
        & node 'backend/scripts/migrate.js'
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones pendientes.' }
        & node 'backend/scripts/create-demo-user.js'
        if ($LASTEXITCODE -ne 0) {
            throw 'No se pudo preparar la cuenta demo. Revisa la contrasena de PostgreSQL.'
        }
    }
    finally {
        Pop-Location
    }

    if ($Tunel) {
        $cloudflared = Find-Cloudflared
        if (-not $cloudflared) {
            throw 'No se encontro cloudflared. Instalalo con: winget install --id Cloudflare.cloudflared'
        }
        Write-Host 'Abriendo tunel HTTPS con Cloudflare...' -ForegroundColor Cyan
        $tunnel = Start-QuickTunnel $cloudflared 'http://127.0.0.1:5174'
        $Dominio = $tunnel.Url
    }

    $Dominio = $Dominio.Trim().TrimEnd('/')
    if ($Dominio -notmatch '^https://[A-Za-z0-9.-]+$') {
        throw 'El dominio debe tener la forma https://mi-dominio.trycloudflare.com (sin ruta ni barra final).'
    }
    $demoHost = ([Uri]$Dominio).Host
    $env:APP_ORIGIN = $Dominio
    $env:TRUST_PROXY = '1'

    if (-not $SinFrontend) {
        $env:DEMO_HOST = $demoHost
        if (Test-LocalEndpoint 'http://127.0.0.1:5174/') {
            Write-Host 'Hay un frontend ya corriendo; comprobando si acepta el dominio...' -ForegroundColor Yellow
        }
        else {
            $npm = (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue).Source
            if (-not $npm) { throw 'No se encontro npm.cmd en PATH.' }
            Start-Process -FilePath $npm -ArgumentList @('run', 'dev') -WorkingDirectory $projectRoot -WindowStyle Normal
            if (-not (Wait-LocalEndpoint 'http://127.0.0.1:5174/')) {
                throw 'El frontend no respondio en http://127.0.0.1:5174.'
            }
        }

        $localStatus = Get-LocalHostStatus 'http://127.0.0.1:5174/' $demoHost
        if ($localStatus -ne 200) {
            throw @"
El frontend en 5174 no acepta el dominio $demoHost (respondio $localStatus).
Casi siempre es una ventana vieja de Vite abierta antes de este arranque.
Cierrala y vuelve a ejecutar el script. Para cerrarla desde aqui:
  Get-NetTCPConnection -LocalPort 5174 -State Listen | ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force }
"@
        }
        Write-Host "Frontend listo para $demoHost." -ForegroundColor Green
    }

    Write-Host 'Comprobando que el link publico responda...' -ForegroundColor Cyan
    $status = Get-PublicStatus $Dominio
    if ($status -eq 200) {
        Write-Host 'El link publico responde correctamente.' -ForegroundColor Green
    }
    elseif ($status -eq 403) {
        throw 'El link responde 403: Vite no acepto el dominio. Cierra la ventana del frontend y vuelve a ejecutar este script.'
    }
    else {
        Write-Host "El link aun no responde (estado $status). Cloudflare puede tardar unos segundos." -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host '==========================================================' -ForegroundColor Cyan
    Write-Host "  LINK PARA COMPARTIR: $Dominio" -ForegroundColor Cyan
    Write-Host "  Usuario: $demoUser" -ForegroundColor Cyan
    Write-Host "  Clave:   $demoPassword" -ForegroundColor Cyan
    Write-Host "  Rol:     $RolDemo" -ForegroundColor Cyan
    Write-Host '==========================================================' -ForegroundColor Cyan
    Write-Host '  Deja esta ventana abierta: aqui viven el backend y el tunel.'
    Write-Host '  Ctrl+C cierra ambos. El frontend queda en su propia ventana.'
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
    Remove-Item Env:NODE_ENV, Env:APP_ORIGIN, Env:TRUST_PROXY, Env:QWEN_MODE, Env:R3_BASE_URL, Env:R2_BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:DEMO_HOST, Env:DEMO_USERNAME, Env:DEMO_FULL_NAME, Env:DEMO_ROLE, Env:DEMO_PASSWORD, Env:DEMO_RESET_PASSWORD, Env:DEMO_ALLOW_ADMIN -ErrorAction SilentlyContinue
    $databasePassword = $null
    if ($tunnel -and $tunnel.Process -and -not $tunnel.Process.HasExited) {
        Stop-Process -Id $tunnel.Process.Id -Force -ErrorAction SilentlyContinue
        Write-Host 'Tunel cerrado.' -ForegroundColor Yellow
    }
}
