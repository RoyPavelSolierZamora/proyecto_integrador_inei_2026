<#
.SYNOPSIS
    Arranca el dashboard EPEN completo (R3 + R2 + backend + frontend).

.DESCRIPTION
    Usa la configuracion creada por instalar.ps1. En una instalacion normal no pide contrasenas.
    Ejecuta los servicios en segundo plano y guarda sus PID en .runtime/processes.json.
    Los registros quedan en .runtime/logs/.

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
$runtimeRoot = Join-Path $projectRoot '.runtime'
$logsRoot = Join-Path $runtimeRoot 'logs'
$statePath = Join-Path $runtimeRoot 'processes.json'
$credentialPath = Join-Path $runtimeRoot 'postgres.credential'

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

function Get-HttpJson([string]$Uri, [hashtable]$Headers = @{}, [int]$TimeoutSec = 4) {
    try { return Invoke-RestMethod -Uri $Uri -Headers $Headers -TimeoutSec $TimeoutSec } catch { return $null }
}

function Get-HttpText([string]$Uri) {
    try { return (Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 4).Content } catch { return $null }
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

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Import-PostgresCredential {
    if (Test-Path -LiteralPath $credentialPath) {
        try {
            $secure = ConvertTo-SecureString (Get-Content -LiteralPath $credentialPath -Raw).Trim()
            $env:PGPASSWORD = ConvertFrom-SecureValue $secure
            return
        }
        catch {
            throw 'La credencial cifrada de PostgreSQL no pertenece a este usuario de Windows. Ejecuta instalar.bat con tu propia cuenta.'
        }
    }
    if (-not (Get-DotEnvValue 'DATABASE_URL')) {
        $secure = Read-Host 'Contrasena local de PostgreSQL para epen_app (solo esta sesion)' -AsSecureString
        $env:PGPASSWORD = ConvertFrom-SecureValue $secure
        New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
        $encrypted = ConvertFrom-SecureString $secure
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [IO.File]::WriteAllText($credentialPath, ($encrypted + "`r`n"), $utf8)
        Write-Ok 'Credencial local cifrada para futuros inicios'
    }
}

function Get-DotEnvValue([string]$Name) {
    foreach ($line in Get-Content -LiteralPath (Join-Path $projectRoot '.env')) {
        if (-not $line -or $line.TrimStart().StartsWith('#')) { continue }
        $parts = $line -split '=', 2
        if ($parts.Count -eq 2 -and $parts[0].Trim() -eq $Name) { return $parts[1].Trim() }
    }
    return $null
}

function Read-ProcessState {
    if (-not (Test-Path -LiteralPath $statePath)) { return @() }
    try { return @((Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).processes) }
    catch { return @() }
}

function Write-ProcessState([array]$Processes) {
    New-Item -ItemType Directory -Path $runtimeRoot, $logsRoot -Force | Out-Null
    $payload = [ordered]@{ version = 1; processes = @($Processes) } | ConvertTo-Json -Depth 4
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($statePath, ($payload + "`r`n"), $utf8)
}

function Start-ManagedProcess([string]$Name, [string]$FilePath, [array]$Arguments,
                              [string]$WorkingDirectory, [int]$Port) {
    New-Item -ItemType Directory -Path $runtimeRoot, $logsRoot -Force | Out-Null
    $stdout = Join-Path $logsRoot ($Name + '.out.log')
    $stderr = Join-Path $logsRoot ($Name + '.err.log')
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

    $live = @()
    foreach ($record in @(Read-ProcessState)) {
        $current = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
        if ($current -and $current.StartTime.ToUniversalTime().ToString('o') -eq $record.startedAtUtc) { $live += $record }
    }
    $live += [pscustomobject]@{
        name = $Name
        pid = $process.Id
        port = $Port
        startedAtUtc = $process.StartTime.ToUniversalTime().ToString('o')
    }
    Write-ProcessState $live
    return $process
}

function Assert-FreeOrExpected([int]$Port, [bool]$Expected, [string]$ServiceName) {
    if ((Test-Port $Port) -and -not $Expected) {
        throw ('El puerto ' + $Port + ' esta ocupado por un servicio distinto de ' + $ServiceName + '. Cierra ese programa o cambia su puerto.')
    }
}

Push-Location $projectRoot
try {
    Write-Host ''
    Write-Host '  DASHBOARD EPEN' -ForegroundColor White
    Write-Host ''

    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
        throw 'No existe .env. Ejecuta primero instalar.bat.'
    }

    $configuredModel = Get-DotEnvValue 'QWEN_MODEL'
    if (-not $configuredModel) { $configuredModel = 'qwen3:4b-instruct-2507-q4_K_M' }
    $env:QWEN_MODEL = $configuredModel

    $r3Mode = Get-DotEnvValue 'R3_MODE'
    if (-not $r3Mode) { $r3Mode = 'local' }
    $r3Mode = $r3Mode.Trim().ToLowerInvariant()
    if ($r3Mode -notin @('local', 'remote')) { throw 'R3_MODE debe ser local o remote.' }
    $r3BaseUrl = Get-DotEnvValue 'R3_BASE_URL'
    if (-not $r3BaseUrl) { $r3BaseUrl = 'http://127.0.0.1:8000' }
    $r3BaseUrl = $r3BaseUrl.Trim().TrimEnd('/')
    $r3ApiToken = Get-DotEnvValue 'R3_API_TOKEN'
    $r3Headers = @{}
    if ($r3Mode -eq 'remote') {
        if (-not $r3BaseUrl.StartsWith('https://')) { throw 'R3 remoto requiere R3_BASE_URL con HTTPS.' }
        if (-not $r3ApiToken -or $r3ApiToken.Length -lt 24) { throw 'R3 remoto requiere R3_API_TOKEN de al menos 24 caracteres.' }
        $r3Headers['Authorization'] = 'Bearer ' + $r3ApiToken
    }

    $r2Mode = Get-DotEnvValue 'R2_MODE'
    # Sin R2_MODE, si el modelo BETO está en modelos\ se usa BETO; así no hace falta editar .env.
    if (-not $r2Mode) {
        $betoLocal = Join-Path $projectRoot 'modelos\modelo_beto_multivariado_final_v2\model.safetensors'
        if (Test-Path -LiteralPath $betoLocal -PathType Leaf) { $r2Mode = 'beto' } else { $r2Mode = 'simulator' }
    }
    $r2Mode = $r2Mode.Trim().ToLowerInvariant()
    if ($r2Mode -notin @('simulator', 'baseline', 'advanced', 'beto')) {
        throw 'R2_MODE debe ser simulator, baseline, advanced o beto.'
    }
    $r2FeatureSet = Get-DotEnvValue 'R2_FEATURE_SET'
    if (-not $r2FeatureSet) { $r2FeatureSet = 'basic' }
    $r2FeatureSet = $r2FeatureSet.Trim().ToLowerInvariant()
    if ($r2FeatureSet -notin @('basic', 'multivariate')) { throw 'R2_FEATURE_SET debe ser basic o multivariate.' }
    $env:R2_FEATURE_SET = $r2FeatureSet

    Import-PostgresCredential

    $python = Find-Python
    if (-not $python) { throw 'No se encontro Python. Ejecuta instalar.bat.' }

    if ($r3Mode -eq 'local') {
        # --- Ollama ---------------------------------------------------------
        Write-Paso 'Ollama local'
        if (-not (Get-HttpJson 'http://127.0.0.1:11434/api/tags')) {
            $ollama = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue
            if (-not $ollama) { throw 'Ollama no esta instalado. Ejecuta instalar.bat.' }
            Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -WindowStyle Hidden
            for ($i = 0; $i -lt 40 -and -not (Get-HttpJson 'http://127.0.0.1:11434/api/tags'); $i++) { Start-Sleep -Milliseconds 500 }
        }
        Write-Ok 'Ollama respondiendo'

        # --- R3 local -------------------------------------------------------
        Write-Paso 'Motor R3 local (Python + Qwen)'
        $r3 = Get-HttpJson 'http://127.0.0.1:8000/salud'
        $r3Expected = [bool]($r3 -and $r3.catalogo_clases -eq 417 -and $r3.modelo -eq $configuredModel)
        Assert-FreeOrExpected 8000 $r3Expected 'R3'
        if (-not $r3Expected) {
            $r3Root = Join-Path $projectRoot 'motores/r3'
            if (-not (Test-Path -LiteralPath (Join-Path $r3Root 'servicio.py'))) { throw 'Falta motores/r3/servicio.py.' }
            $null = Start-ManagedProcess 'r3' $python @('servicio.py', '--puerto', '8000') $r3Root 8000
            for ($i = 0; $i -lt 40 -and -not (Get-HttpJson 'http://127.0.0.1:8000/salud'); $i++) { Start-Sleep -Milliseconds 500 }
        }
        $r3 = Get-HttpJson 'http://127.0.0.1:8000/salud'
    }
    else {
        # --- R3 remoto ------------------------------------------------------
        Write-Paso 'Motor R3 remoto (Colab / GPU)'
        $r3 = Get-HttpJson ($r3BaseUrl + '/salud') $r3Headers 15
    }
    if (-not $r3 -or $r3.catalogo_clases -ne 417 -or $r3.modelo -ne $configuredModel) {
        throw ('R3 no respondio con el modelo esperado en ' + $r3BaseUrl + '.')
    }
    if ($r3.estado -ne 'ok') { throw ('R3 esta degradado: ' + $r3.ollama) }
    Write-Ok ('R3 ' + $r3Mode + ' operativo con 417 clases CIIU y ' + $r3.modelo)

    # --- R2 -----------------------------------------------------------------
    Write-Paso 'Microservicio R2'
    $r2Service = switch ($r2Mode) {
        'beto' { 'r2-beto' }
        'advanced' { 'r2-advanced' }
        'baseline' { 'r2-baseline' }
        default { 'r2-simulator' }
    }
    $r2Root = switch ($r2Mode) {
        'beto' { Join-Path $projectRoot 'motores\r2\beto' }
        'advanced' { Join-Path $projectRoot 'motores\r2\avanzado' }
        'baseline' { Join-Path $projectRoot 'motores\r2\baseline' }
        default { Join-Path $projectRoot 'motores\r2\simulador' }
    }
    if ($r2Mode -in @('baseline', 'advanced')) {
        $r2TrainingCsv = Get-DotEnvValue 'R2_TRAINING_CSV'
        if (-not $r2TrainingCsv) {
            throw ('R2_MODE=' + $r2Mode + ' requiere R2_TRAINING_CSV en .env.')
        }
        $r2TrainingCsv = $r2TrainingCsv.Trim().Trim('"')
        if (-not [IO.Path]::IsPathRooted($r2TrainingCsv)) {
            $r2TrainingCsv = Join-Path $projectRoot $r2TrainingCsv
        }
        if (-not (Test-Path -LiteralPath $r2TrainingCsv -PathType Leaf)) {
            throw ('No existe el historico etiquetado R2: ' + $r2TrainingCsv)
        }
        $env:R2_TRAINING_CSV = [IO.Path]::GetFullPath($r2TrainingCsv)
    }
    if ($r2Mode -in @('advanced', 'beto')) {
        & $python -c 'import joblib, numpy, scipy, sklearn'
        if ($LASTEXITCODE -ne 0) {
            throw 'Faltan librerias de R2 avanzado. Vuelve a ejecutar instalar.bat para instalarlas.'
        }
    }
    if ($r2Mode -eq 'beto') {
        $betoPath = Get-DotEnvValue 'R2_BETO_MODEL_PATH'
        if (-not $betoPath) { $betoPath = 'modelos\modelo_beto_multivariado_final_v2' }
        if (-not [IO.Path]::IsPathRooted($betoPath)) { $betoPath = Join-Path $projectRoot $betoPath }
        if (-not (Test-Path -LiteralPath (Join-Path $betoPath 'model.safetensors') -PathType Leaf)) {
            throw 'No se encontro el modelo BETO. Copia la carpeta modelo_beto_multivariado_final_v2 dentro de modelos\ y vuelve a ejecutar.'
        }
        $env:R2_BETO_MODEL_PATH = [IO.Path]::GetFullPath($betoPath)
        & $python -c 'import torch, transformers, safetensors'
        if ($LASTEXITCODE -ne 0) { throw 'Faltan librerias de BETO. Vuelve a ejecutar instalar.bat para instalarlas.' }
    }
    $r2 = Get-HttpJson 'http://127.0.0.1:8100/salud'
    $r2Expected = [bool]($r2 -and $r2.servicio -eq $r2Service -and $r2.contrato_version -eq '1.0')
    Assert-FreeOrExpected 8100 $r2Expected 'R2'
    if (-not $r2Expected) {
        $null = Start-ManagedProcess 'r2' $python @('servicio_r2.py') $r2Root 8100
        $r2Attempts = if ($r2Mode -in @('advanced', 'beto')) { 720 } else { 40 }
        for ($i = 0; $i -lt $r2Attempts -and -not (Get-HttpJson 'http://127.0.0.1:8100/salud'); $i++) { Start-Sleep -Milliseconds 500 }
    }
    $r2 = Get-HttpJson 'http://127.0.0.1:8100/salud'
    if (-not $r2 -or $r2.servicio -ne $r2Service -or $r2.contrato_version -ne '1.0') {
        throw ('R2 no respondio correctamente. Revisa ' + (Join-Path $logsRoot 'r2.err.log'))
    }
    if ($r2Mode -eq 'beto') {
        Write-Ok 'BETO experimental operativo; sin cierre automatico del clasificador'
    } elseif ($r2Mode -eq 'advanced') {
        Write-Ok ('R2 avanzado operativo con ' + $r2.casos_historicos + ' antecedentes y calibracion ' + $r2.calibracion)
    } elseif ($r2Mode -eq 'baseline') {
        Write-Ok ('R2 baseline operativo con ' + $r2.casos_entrenamiento + ' casos historicos')
    } else {
        Write-Ok 'R2 operativo (simulador contractual)'
    }

    # --- Backend ------------------------------------------------------------
    Write-Paso 'Backend (PostgreSQL)'
    $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    if (-not $node) { throw 'No se encontro Node.js. Ejecuta instalar.bat.' }
    & $node.Source 'backend/scripts/migrate.js'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones pendientes.' }
    $health = Get-HttpJson $backendUrl
    $backendExpected = [bool]($health -and $health.status -eq 'ok' -and $health.database -eq 'postgresql')
    Assert-FreeOrExpected 8080 $backendExpected 'backend EPEN'
    if (-not $backendExpected) {
        $null = Start-ManagedProcess 'backend' $node.Source @('backend/src/server.js') $projectRoot 8080
        if (-not (Wait-Port 8080 60)) { throw ('El backend no arranco. Revisa ' + (Join-Path $logsRoot 'backend.err.log')) }
    }
    $health = Get-HttpJson $backendUrl
    if (-not $health -or $health.status -ne 'ok' -or $health.database -ne 'postgresql') {
        throw ('El backend no respondio correctamente. Revisa ' + (Join-Path $logsRoot 'backend.err.log'))
    }
    Write-Ok 'Backend operativo (PostgreSQL)'

    # --- Frontend -----------------------------------------------------------
    Write-Paso 'Interfaz web'
    $frontendHtml = Get-HttpText $frontendUrl
    $frontendExpected = [bool]($frontendHtml -and $frontendHtml.Contains('<title>Codificación asistida EPEN</title>'))
    Assert-FreeOrExpected 5174 $frontendExpected 'interfaz EPEN'
    if (-not $frontendExpected) {
        $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
        if (-not $node) { throw 'No se encontro Node.js. Ejecuta instalar.bat.' }
        $viteScript = 'node_modules/vite/bin/vite.js'
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $viteScript))) { throw 'Falta Vite. Ejecuta instalar.bat.' }
        $null = Start-ManagedProcess 'frontend' $node.Source @($viteScript, '--host', '127.0.0.1') $projectRoot 5174
        if (-not (Wait-Port 5174 90)) { throw ('La interfaz no arranco. Revisa ' + (Join-Path $logsRoot 'frontend.err.log')) }
    }
    $frontendHtml = Get-HttpText $frontendUrl
    if (-not $frontendHtml -or -not $frontendHtml.Contains('<title>Codificación asistida EPEN</title>')) {
        throw ('La interfaz no respondio correctamente. Revisa ' + (Join-Path $logsRoot 'frontend.err.log'))
    }
    Write-Ok 'Interfaz disponible'

    Write-Host ''
    Write-Host ('  Abre: ' + $frontendUrl) -ForegroundColor Green
    Write-Host '  Usa la cuenta administradora que creaste en la instalacion.' -ForegroundColor White
    Write-Host ('  Registros tecnicos: ' + $logsRoot) -ForegroundColor DarkGray
    Write-Host '  Para detener todo: detener-dashboard.bat' -ForegroundColor DarkGray
    Write-Host ''

    if (-not $SinNavegador) { Start-Process $frontendUrl }
}
finally {
    Remove-Item Env:QWEN_MODEL -ErrorAction SilentlyContinue
    Remove-Item Env:R2_FEATURE_SET -ErrorAction SilentlyContinue
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
