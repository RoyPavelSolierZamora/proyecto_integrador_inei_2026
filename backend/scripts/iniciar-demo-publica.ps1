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

.PARAMETER Tunel
    Abre el tunel con cloudflared automaticamente y usa la URL que devuelve.
    Es la forma recomendada: no hay que copiar y pegar ningun dominio.

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

.EXAMPLE
    .\iniciar-demo-publica.ps1 -Dominio https://algo-random.trycloudflare.com
#>
param(
    [string]$Dominio,

    [ValidateSet('demo', 'real')]
    [string]$QwenMode = 'demo',

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

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
$r3Root = Join-Path $workspaceRoot 'Codigos\pipeline_llm'

if (-not $Tunel -and -not $Dominio) {
    throw 'Indica -Tunel para abrir el tunel automaticamente, o -Dominio https://tu-tunel para reutilizar uno abierto.'
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

$tunnel = $null
try {
    if ($Tunel) {
        $cloudflared = Find-Cloudflared
        if (-not $cloudflared) {
            throw 'No se encontro cloudflared. Instalalo con: winget install --id Cloudflare.cloudflared'
        }
        Write-Host 'Abriendo tunel HTTPS con Cloudflare...' -ForegroundColor Cyan
        $tunnel = Start-QuickTunnel $cloudflared 'http://127.0.0.1:5174'
        $Dominio = $tunnel.Url
        Write-Host "Tunel creado: $Dominio" -ForegroundColor Green
    }

    $Dominio = $Dominio.Trim().TrimEnd('/')
    if ($Dominio -notmatch '^https://[A-Za-z0-9.-]+$') {
        throw 'El dominio debe tener la forma https://mi-dominio.trycloudflare.com (sin ruta ni barra final).'
    }
    $demoHost = ([Uri]$Dominio).Host

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

    Write-Host 'Comprobando que el link publico responda...' -ForegroundColor Cyan
    $status = Get-PublicStatus $Dominio
    if ($status -eq 200) {
        Write-Host 'El link publico responde correctamente.' -ForegroundColor Green
    }
    elseif ($status -eq 403) {
        throw 'El link responde 403: Vite no acepto el dominio. Cierra la ventana del frontend y vuelve a ejecutar este script.'
    }
    else {
        Write-Host "El link aun no responde (estado $status). Cloudflare puede tardar unos segundos; vuelve a probarlo en el navegador." -ForegroundColor Yellow
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
        Write-Host '==========================================================' -ForegroundColor Cyan
        Write-Host " LINK PARA COMPARTIR: $Dominio" -ForegroundColor Cyan
        Write-Host " Motor Qwen: $QwenMode" -ForegroundColor Cyan
        Write-Host '==========================================================' -ForegroundColor Cyan
        Write-Host '  Entra siempre por el link, no por 127.0.0.1.'
        Write-Host '  Comparte solo la cuenta demo, nunca la de administrador.'
        Write-Host '  Ctrl+C apaga el backend y el tunel; el frontend queda en su ventana.'
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
        $databasePassword = $null
    }
}
finally {
    Remove-Item Env:DEMO_HOST -ErrorAction SilentlyContinue
    if ($tunnel -and $tunnel.Process -and -not $tunnel.Process.HasExited) {
        Stop-Process -Id $tunnel.Process.Id -Force -ErrorAction SilentlyContinue
        Write-Host 'Tunel cerrado.' -ForegroundColor Yellow
    }
}
