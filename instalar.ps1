<#
.SYNOPSIS
    Instalador del dashboard EPEN para Windows.

.DESCRIPTION
    Deja lista una maquina nueva para ejecutar el flujo real R2 -> R3 -> R4:

      1. Comprueba (y si falta instala con winget) Node.js, Python, PostgreSQL y Ollama.
      2. Crea el usuario epen_app y la base epen_codificacion.
      3. Escribe un .env local (ignorado por git) con toda la configuracion.
      4. Aplica las migraciones, instala los 6 casos sinteticos y el catalogo CIIU.
      5. Crea la cuenta administradora.
      6. Descarga el modelo de Qwen si no esta presente.
      7. Comprueba que R3 y el simulador contractual R2 responden.

.PARAMETER Modelo
    Modelo de Ollama que se usara. Por defecto qwen3:4b-instruct-2507-q4_K_M (2,5 GB).

.PARAMETER SinWinget
    No instala nada. Solo comprueba y avisa de lo que falta.

.PARAMETER SinModelo
    No descarga el modelo de Qwen (util si ya se descargo antes).

.PARAMETER Reconfigurar
    Genera una contrasena nueva para epen_app aunque ya exista un .env.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar.ps1
#>
[CmdletBinding()]
param(
    [string]$Modelo = 'qwen3:4b-instruct-2507-q4_K_M',
    [switch]$SinWinget,
    [switch]$SinModelo,
    [switch]$Reconfigurar
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'

# --------------------------------------------------------------------------- utilidades

function Write-Paso([string]$Texto) {
    Write-Host ''
    Write-Host ('== ' + $Texto) -ForegroundColor Cyan
}
function Write-Ok([string]$Texto) { Write-Host ('   OK  ' + $Texto) -ForegroundColor Green }
function Write-Aviso([string]$Texto) { Write-Host ('   !   ' + $Texto) -ForegroundColor Yellow }
function Write-Fallo([string]$Texto) { Write-Host ('   X   ' + $Texto) -ForegroundColor Red }

function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = @($machine, $user, $env:Path) -join ';'
}

function New-RandomPassword([int]$Length = 18) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $builder = New-Object System.Text.StringBuilder
    foreach ($byte in $bytes) { [void]$builder.Append($chars[$byte % $chars.Length]) }
    return $builder.ToString()
}

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
    if (-not $Value) { return '' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Test-Port([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(1200, $false)) { return $false }
        $client.EndConnect($async)
        return $true
    }
    catch { return $false }
    finally { $client.Close() }
}

function Get-HttpJson([string]$Uri) {
    try { return Invoke-RestMethod -Uri $Uri -TimeoutSec 4 } catch { return $null }
}

function Wait-Http([string]$Uri, [int]$Attempts = 40) {
    for ($i = 0; $i -lt $Attempts; $i++) {
        if (Get-HttpJson $Uri) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Find-Psql {
    $command = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $bases = @((Join-Path $env:ProgramFiles 'PostgreSQL'), (Join-Path ${env:ProgramFiles(x86)} 'PostgreSQL'))
    foreach ($base in $bases) {
        if (-not $base -or -not (Test-Path -LiteralPath $base)) { continue }
        $found = Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName 'bin\psql.exe' } |
            Where-Object { Test-Path -LiteralPath $_ } |
            Select-Object -First 1
        if ($found) { return $found }
    }
    return $null
}

function Find-Python {
    $command = Get-Command 'python.exe' -ErrorAction SilentlyContinue
    if ($command) {
        $version = & $command.Source -c "import sys;print(sys.version_info[0]*100+sys.version_info[1])" 2>$null
        if ($LASTEXITCODE -eq 0 -and [int]$version -ge 310) { return $command.Source }
    }
    $fallback = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    return $null
}

function Install-Package([string]$Id, [string]$Override) {
    if ($SinWinget) { return $false }
    $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Aviso 'winget no esta disponible en esta sesion.'
        return $false
    }
    $wingetArgs = @('install', '--id', $Id, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements')
    if ($Override) { $wingetArgs += @('--override', $Override) }
    Write-Host ('   instalando ' + $Id + ' (puede tardar varios minutos)...') -ForegroundColor DarkGray
    & $winget.Source @wingetArgs
    return ($LASTEXITCODE -eq 0)
}

function Write-DotEnv([hashtable]$Values) {
    $lines = @(
        '# Archivo generado por instalar.ps1.',
        '# Contiene la contrasena local de PostgreSQL y esta excluido por .gitignore.',
        '# No lo compartas ni lo subas a GitHub.'
    )
    foreach ($key in ($Values.Keys | Sort-Object)) { $lines += ($key + '=' + $Values[$key]) }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($envPath, (($lines -join "`r`n") + "`r`n"), $utf8)
}

# --------------------------------------------------------------------------- inicio

Write-Host ''
Write-Host '  DASHBOARD EPEN - INSTALADOR PARA WINDOWS' -ForegroundColor White
Write-Host '  Proyecto Integrador PEU-CD (INEI)' -ForegroundColor DarkGray
Write-Host ''

if ($env:OS -ne 'Windows_NT') { throw 'Este instalador esta pensado para Windows.' }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Aviso 'No se ejecuta como administrador. Si falta PostgreSQL, Windows pedira permiso (UAC).'
}

Push-Location $projectRoot
$adminPassword = $null
try {
    # ------------------------------------------------------------------ 1. programas
    Write-Paso '1/7 Comprobando Node.js, Python, PostgreSQL y Ollama'
    Update-SessionPath

    # Node.js
    $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    if ($node) {
        $nodeMajor = [int](& $node.Source -p "process.versions.node.split('.')[0]")
        if ($nodeMajor -lt 20) { $node = $null }
    }
    if (-not $node) {
        Write-Aviso 'Node.js 20 o posterior no esta disponible.'
        if (-not (Install-Package 'OpenJS.NodeJS.LTS' $null)) {
            throw 'Instala Node.js 20+ desde https://nodejs.org y vuelve a ejecutar este script.'
        }
        Update-SessionPath
        $node = Get-Command 'node.exe' -ErrorAction Stop
    }
    Write-Ok ('Node.js ' + (& $node.Source -v))

    # Python
    $python = Find-Python
    if (-not $python) {
        Write-Aviso 'Python 3.10 o posterior no esta disponible.'
        if (-not (Install-Package 'Python.Python.3.12' $null)) {
            throw 'Instala Python 3.10+ desde https://www.python.org y vuelve a ejecutar este script.'
        }
        Update-SessionPath
        $python = Find-Python
        if (-not $python) { throw 'Python se instalo pero no se encontro. Abre una terminal nueva y repite.' }
    }
    Write-Ok ('Python ' + (& $python -c "import sys;print('.'.join(map(str,sys.version_info[:3])))"))

    # Ollama
    $ollama = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue
    if (-not $ollama) {
        Write-Aviso 'Ollama no esta instalado.'
        if (-not (Install-Package 'Ollama.Ollama' $null)) {
            throw 'Instala Ollama desde https://ollama.com/download y vuelve a ejecutar este script.'
        }
        Update-SessionPath
        $ollama = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue
        if (-not $ollama) { throw 'Ollama se instalo pero no se encontro. Abre una terminal nueva y repite.' }
    }
    Write-Ok 'Ollama disponible'

    # ------------------------------------------------------------------ 2. PostgreSQL
    Write-Paso '2/7 Preparando PostgreSQL'
    $psql = Find-Psql
    $superPassword = $null

    if (-not $psql) {
        Write-Aviso 'PostgreSQL no esta instalado. Se instalara PostgreSQL 18 en modo desatendido.'
        $superPassword = New-RandomPassword 20
        $override = '--mode unattended --unattendedmodeui none --serverport 5432 ' +
                    '--servicename postgresql-x64-18 --enable-components server,commandlinetools ' +
                    '--superpassword ' + $superPassword
        if (-not (Install-Package 'PostgreSQL.PostgreSQL.18' $override)) {
            Write-Fallo 'La instalacion automatica de PostgreSQL fallo.'
            throw 'Instala PostgreSQL 18 desde https://www.postgresql.org/download/windows/ (elige tu propia contrasena) y vuelve a ejecutar este script.'
        }
        Write-Host ''
        Write-Host '   PostgreSQL se instalo con una contrasena generada para el usuario postgres:' -ForegroundColor White
        Write-Host ('   ' + $superPassword) -ForegroundColor Yellow
        Write-Host '   Anotala: la necesitaras para administrar PostgreSQL.' -ForegroundColor Yellow
        Write-Host ''
        Update-SessionPath
        $psql = Find-Psql
        if (-not $psql) { throw 'PostgreSQL se instalo pero no se encontro psql.exe. Abre una terminal nueva y repite.' }
    }

    if (-not (Test-Port 5432)) {
        $service = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like '*x64*' } | Select-Object -First 1
        if ($service) {
            Write-Host ('   iniciando el servicio ' + $service.Name + '...') -ForegroundColor DarkGray
            Start-Service -Name $service.Name -ErrorAction SilentlyContinue
        }
        for ($i = 0; $i -lt 20 -and -not (Test-Port 5432); $i++) { Start-Sleep -Milliseconds 500 }
    }
    if (-not (Test-Port 5432)) { throw 'PostgreSQL no responde en 127.0.0.1:5432. Revisa el servicio postgresql-x64-18.' }
    Write-Ok 'PostgreSQL escuchando en 127.0.0.1:5432'

    if (-not $superPassword) {
        Write-Host ''
        Write-Host '   Se necesita la contrasena del usuario "postgres" para crear la base y el usuario de la aplicacion.' -ForegroundColor White
        Write-Host '   Es la que elegiste al instalar PostgreSQL. No se guarda en ningun archivo.' -ForegroundColor DarkGray
        $superPassword = ConvertFrom-SecureValue (Read-Host '   Contrasena de postgres' -AsSecureString)
        if (-not $superPassword) { throw 'La contrasena de postgres no puede estar vacia.' }
    }

    $env:PGPASSWORD = $superPassword
    try {
        $probe = & $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -tAc 'SELECT 1' 2>&1
        if ($LASTEXITCODE -ne 0 -or ($probe | Out-String).Trim() -ne '1') {
            throw 'No se pudo conectar como postgres. Verifica la contrasena y que el servicio este iniciado.'
        }

        # Reutiliza la clave de un .env anterior para no invalidar configuraciones existentes.
        $appPassword = $null
        if ((Test-Path -LiteralPath $envPath) -and -not $Reconfigurar) {
            $existing = Get-Content -LiteralPath $envPath -Raw
            if ($existing -match 'DATABASE_URL=postgresql://epen_app:([^@\r\n]+)@') { $appPassword = $Matches[1] }
        }
        if (-not $appPassword) { $appPassword = New-RandomPassword 20 }

        $roleTemplate = @'
DO $do$
BEGIN
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'epen_app') THEN
      ALTER ROLE epen_app WITH LOGIN PASSWORD '__PWD__';
   ELSE
      CREATE ROLE epen_app WITH LOGIN PASSWORD '__PWD__';
   END IF;
END
$do$;
'@
        $roleSql = $roleTemplate.Replace('__PWD__', $appPassword)
        & $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c $roleSql
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear o actualizar el usuario epen_app.' }

        $dbExists = (& $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'epen_codificacion'" | Out-String).Trim()
        if ($dbExists -ne '1') {
            & $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE epen_codificacion OWNER epen_app ENCODING 'UTF8' TEMPLATE template0"
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base epen_codificacion.' }
        }
        Write-Ok 'Usuario epen_app y base epen_codificacion listos'
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        $superPassword = $null
    }

    # ------------------------------------------------------------------ 3. .env
    Write-Paso '3/7 Escribiendo la configuracion local (.env)'
    Write-DotEnv @{
        DATABASE_URL      = ('postgresql://epen_app:' + $appPassword + '@127.0.0.1:5432/epen_codificacion')
        BACKEND_PORT      = '8080'
        APP_ORIGIN        = 'http://127.0.0.1:5174'
        SESSION_HOURS     = '8'
        DB_SSL            = 'disable'
        QWEN_MODE         = 'real'
        R3_BASE_URL       = 'http://127.0.0.1:8000'
        R2_BASE_URL       = 'http://127.0.0.1:8100'
        R2_BATCH_SIZE     = '100'
        R2_TIMEOUT_SECONDS = '120'
        VITE_AUTH_MODE    = 'real'
        VITE_DATA_MODE    = 'real'
    }
    Write-Ok ('Configuracion guardada en ' + $envPath)

    # ------------------------------------------------------------------ 4. dependencias
    Write-Paso '4/7 Instalando dependencias de Node'
    $npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if (-not $npm) {
        Update-SessionPath
        $npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    }
    if (-not $npm) {
        $candidate = Join-Path $env:ProgramFiles 'nodejs\npm.cmd'
        if (Test-Path -LiteralPath $candidate) { $npm = Get-Item $candidate } else { throw 'No se encontro npm.cmd.' }
    }
    & $npm.Source ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci fallo. Revisa la conexion a Internet.' }
    Write-Ok 'Dependencias instaladas'

    # ------------------------------------------------------------------ 5. base de datos
    Write-Paso '5/7 Aplicando migraciones y datos iniciales'
    & $node.Source 'backend/scripts/migrate.js'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones.' }
    & $node.Source 'backend/scripts/seed-demo.js'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar los datos sinteticos.' }
    Write-Ok 'Esquema, catalogo CIIU y 6 casos sinteticos instalados'

    # ------------------------------------------------------------------ 6. administrador
    Write-Paso '6/7 Creando la cuenta administradora'
    $adminUser = Read-Host '   Usuario (Enter para "admin")'
    if (-not $adminUser) { $adminUser = 'admin' }
    $adminName = Read-Host '   Nombre completo (Enter para "Administrador EPEN")'
    if (-not $adminName) { $adminName = 'Administrador EPEN' }

    $adminPassword = ConvertFrom-SecureValue (Read-Host '   Contrasena (Enter para generar una automatica)' -AsSecureString)
    $generated = $false
    if (-not $adminPassword) {
        $adminPassword = New-RandomPassword 14
        $generated = $true
    }
    elseif ($adminPassword.Length -lt 12) {
        Write-Aviso 'La contrasena debe tener al menos 12 caracteres. Se generara una automatica.'
        $adminPassword = New-RandomPassword 14
        $generated = $true
    }

    $env:ADMIN_USERNAME = $adminUser
    $env:ADMIN_FULL_NAME = $adminName
    $env:ADMIN_PASSWORD = $adminPassword
    try {
        & $node.Source 'backend/scripts/create-admin.js'
        if ($LASTEXITCODE -ne 0) {
            Write-Aviso ('El usuario "' + $adminUser + '" ya existia; no se cambio su contrasena.')
        }
        else {
            Write-Ok ('Administrador creado: ' + $adminUser)
        }
    }
    finally {
        Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_FULL_NAME, Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
    }

    # ------------------------------------------------------------------ 7. Qwen
    Write-Paso '7/7 Preparando Qwen local'
    if (-not (Get-HttpJson 'http://127.0.0.1:11434/api/tags')) {
        Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -WindowStyle Hidden
        if (-not (Wait-Http 'http://127.0.0.1:11434/api/tags' 40)) {
            throw 'Ollama no respondio en http://127.0.0.1:11434.'
        }
    }

    if ($SinModelo) {
        Write-Aviso 'Descarga del modelo omitida (-SinModelo).'
    }
    else {
        $installed = (& $ollama.Source list 2>&1 | Out-String)
        if ($installed -notmatch [regex]::Escape($Modelo)) {
            Write-Aviso ('Se descargara ' + $Modelo + ' (unos 2,5 GB). Puede tardar segun tu conexion.')
            & $ollama.Source pull $Modelo
            if ($LASTEXITCODE -ne 0) { throw ('No se pudo descargar el modelo ' + $Modelo + '.') }
        }
        Write-Ok ('Modelo disponible: ' + $Modelo)
    }

    # ------------------------------------------------------------------ verificacion
    Write-Paso 'Comprobando los servicios internos'

    $r3Root = Join-Path $projectRoot 'r3_local'
    if (-not (Get-HttpJson 'http://127.0.0.1:8000/salud')) {
        if (-not (Test-Path -LiteralPath (Join-Path $r3Root 'servicio.py'))) { throw 'Falta r3_local/servicio.py en el repositorio.' }
        Start-Process -FilePath $python -ArgumentList @('servicio.py', '--puerto', '8000') -WorkingDirectory $r3Root -WindowStyle Hidden
        if (-not (Wait-Http 'http://127.0.0.1:8000/salud' 40)) { throw 'La API R3 no respondio en http://127.0.0.1:8000.' }
    }
    $r3Health = Get-HttpJson 'http://127.0.0.1:8000/salud'
    Write-Ok ('R3 operativo: ' + $r3Health.catalogo_clases + ' clases CIIU, modelo ' + $r3Health.modelo)

    $r2Root = Join-Path $projectRoot 'backend\r2_mock'
    if (-not (Get-HttpJson 'http://127.0.0.1:8100/salud')) {
        Start-Process -FilePath $python -ArgumentList @('servicio_r2.py') -WorkingDirectory $r2Root -WindowStyle Hidden
        if (-not (Wait-Http 'http://127.0.0.1:8100/salud' 20)) { throw 'El simulador R2 no respondio en http://127.0.0.1:8100.' }
    }
    Write-Ok 'Simulador contractual R2 operativo'

    # ------------------------------------------------------------------ resumen
    Write-Host ''
    Write-Host '  INSTALACION COMPLETA' -ForegroundColor Green
    Write-Host ''
    Write-Host ('  Usuario administrador : ' + $adminUser) -ForegroundColor White
    if ($generated) {
        Write-Host ('  Contrasena            : ' + $adminPassword) -ForegroundColor Yellow
        Write-Host '  Anotala ahora: no se vuelve a mostrar.' -ForegroundColor Yellow
    }
    else {
        Write-Host '  Contrasena            : la que escribiste' -ForegroundColor White
    }
    Write-Host ''
    Write-Host '  Para trabajar, ejecuta:  iniciar-dashboard.bat' -ForegroundColor Cyan
    Write-Host '  Para detener todo:       detener-dashboard.bat' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  Recuerda: los datos incluidos son SINTETICOS, no resultados reales del INEI.' -ForegroundColor DarkGray
    Write-Host ''
}
finally {
    Pop-Location
    $adminPassword = $null
}
