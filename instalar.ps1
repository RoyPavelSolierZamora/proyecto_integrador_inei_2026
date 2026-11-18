<#
.SYNOPSIS
    Instalador del dashboard EPEN para Windows.

.DESCRIPTION
    Deja lista una maquina nueva para ejecutar el flujo real R2 -> R3 -> R4:

      1. Comprueba (y si falta instala con winget) Node.js, Python, PostgreSQL y Ollama.
      2. Crea el usuario epen_app y la base epen_codificacion.
      3. Escribe un .env sin secretos y cifra la clave interna para el usuario de Windows.
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
# Carpeta donde el usuario copia el modelo BETO (no viene en Git). Si existe, BETO se activa sin editar .env.
$betoRelativo = 'modelos\modelo_beto_multivariado_final_v2'
$betoDisponible = Test-Path -LiteralPath (Join-Path $projectRoot (Join-Path $betoRelativo 'model.safetensors')) -PathType Leaf
$runtimeRoot = Join-Path $projectRoot '.runtime'
$credentialPath = Join-Path $runtimeRoot 'postgres.credential'

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

function Save-AppCredential([string]$PlainText) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $secure = ConvertTo-SecureString $PlainText -AsPlainText -Force
    $protected = ConvertFrom-SecureString $secure
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($credentialPath, ($protected + "`r`n"), $utf8)
}

function Read-AppCredential {
    if (-not (Test-Path -LiteralPath $credentialPath)) { return $null }
    try {
        $secure = ConvertTo-SecureString (Get-Content -LiteralPath $credentialPath -Raw).Trim()
        return ConvertFrom-SecureValue $secure
    }
    catch { return $null }
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

function Write-DotEnv([hashtable]$Values, [hashtable]$Forzados = @{}) {
    # Conserva lo que el usuario ya configuró (por ejemplo, R3 remoto de Colab). Los valores por defecto
    # solo completan las claves que faltan; $Forzados sí reemplaza el valor existente.
    $final = @{}
    if (Test-Path -LiteralPath $envPath) {
        foreach ($line in (Get-Content -LiteralPath $envPath)) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $final[$Matches[1]] = $Matches[2] }
        }
    }
    foreach ($key in $Values.Keys) { if (-not $final.ContainsKey($key)) { $final[$key] = $Values[$key] } }
    foreach ($key in $Forzados.Keys) { $final[$key] = $Forzados[$key] }
    $lines = @(
        '# Archivo generado por instalar.ps1.',
        '# No contiene contrasenas. La credencial de epen_app se protege con DPAPI en .runtime/.',
        '# Es configuracion local y esta excluida de Git.'
    )
    foreach ($key in ($final.Keys | Sort-Object)) { $lines += ($key + '=' + $final[$key]) }
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
$adminCreated = $false
$generated = $false
$verifyProcesses = @()
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

    # BETO corre en esta computadora: si el modelo está en modelos\, se instalan sus librerías automáticamente.
    if ($betoDisponible) {
        Write-Host ('   Modelo BETO encontrado en ' + $betoRelativo + '. Instalando sus librerias de Python...') -ForegroundColor DarkGray
        & $python -m pip install --disable-pip-version-check -q -r (Join-Path $projectRoot 'motores\r2\avanzado\requirements.txt')
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las librerias de R2 avanzado con pip.' }
        & $python -m pip install --disable-pip-version-check -q torch 'transformers>=4.48,<5' safetensors
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar torch, transformers y safetensors para BETO.' }
        Write-Ok 'Librerias de BETO instaladas'
    }
    else {
        Write-Aviso ('Modelo BETO no encontrado en ' + $betoRelativo + '. El sistema usara el clasificador de prueba; BETO se puede agregar despues.')
    }

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

    # Si la instalación anterior sigue en esta carpeta, la base y el usuario de la aplicación ya existen:
    # no hace falta la contraseña del superusuario postgres.
    $savedApp = if ($Reconfigurar) { $null } else { Read-AppCredential }
    $reutilizarApp = $false
    if ($savedApp) {
        $env:PGPASSWORD = $savedApp
        $probeApp = & $psql -h 127.0.0.1 -p 5432 -U epen_app -d epen_codificacion -tAc 'SELECT 1' 2>$null
        $reutilizarApp = ($LASTEXITCODE -eq 0 -and ($probeApp | Out-String).Trim() -eq '1')
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }

    if (-not $superPassword -and -not $reutilizarApp) {
        Write-Host ''
        Write-Host '   Se necesita la contrasena del usuario "postgres" para crear la base y el usuario de la aplicacion.' -ForegroundColor White
        Write-Host '   Es la que elegiste al instalar PostgreSQL. No se guarda en ningun archivo.' -ForegroundColor DarkGray
        $superPassword = ConvertFrom-SecureValue (Read-Host '   Contrasena de postgres' -AsSecureString)
        if (-not $superPassword) { throw 'La contrasena de postgres no puede estar vacia.' }
    }

    if ($reutilizarApp) {
        $appPassword = $savedApp
        Write-Ok 'La base y el usuario de la aplicacion ya existen; se reutilizan.'
    }
    else {
    $env:PGPASSWORD = $superPassword
    try {
        $probe = & $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -tAc 'SELECT 1' 2>$null
        if ($LASTEXITCODE -ne 0 -or ($probe | Out-String).Trim() -ne '1') {
            throw 'No se pudo conectar como postgres. Verifica la contrasena y que el servicio este iniciado.'
        }

        # Reutiliza la clave de un .env anterior para no invalidar configuraciones existentes.
        $appPassword = $null
        if ((Test-Path -LiteralPath $envPath) -and -not $Reconfigurar) {
            $existing = Get-Content -LiteralPath $envPath -Raw
            if ($existing -match 'DATABASE_URL=postgresql://epen_app:([^@\r\n]+)@') { $appPassword = $Matches[1] }
        }
        if (-not $appPassword -and -not $Reconfigurar) { $appPassword = Read-AppCredential }
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
    }

    # ------------------------------------------------------------------ 3. .env
    Write-Paso '3/7 Escribiendo la configuracion local (.env)'
    Save-AppCredential $appPassword
    $valoresEnv = @{
        PGHOST            = '127.0.0.1'
        PGPORT            = '5432'
        PGDATABASE        = 'epen_codificacion'
        PGUSER            = 'epen_app'
        BACKEND_PORT      = '8080'
        APP_ORIGIN        = 'http://127.0.0.1:5174'
        SESSION_HOURS     = '8'
        DB_SSL            = 'disable'
        QWEN_MODE         = 'real'
        QWEN_MODEL        = $Modelo
        R3_MODE           = 'local'
        R3_BASE_URL       = 'http://127.0.0.1:8000'
        R2_BASE_URL       = 'http://127.0.0.1:8100'
        R2_FEATURE_SET    = 'basic'
        R2_BATCH_SIZE     = '100'
        R2_TIMEOUT_SECONDS = '120'
    }
    $forzadosEnv = @{}
    if ($betoDisponible) {
        $forzadosEnv['R2_MODE'] = 'beto'
        $forzadosEnv['R2_BETO_MODEL_PATH'] = $betoRelativo
    }
    Write-DotEnv $valoresEnv $forzadosEnv
    Write-Ok ('Configuracion guardada en ' + $envPath)

    # ------------------------------------------------------------------ 4. dependencias
    Write-Paso '4/7 Instalando dependencias de Node'
    $dashboardPorts = @(5174, 8080) | Where-Object { Test-Port $_ }
    if ($dashboardPorts.Count -gt 0) {
        throw ('El dashboard esta en ejecucion (puertos ' + ($dashboardPorts -join ', ') +
            '). Ejecuta detener-dashboard.bat, cierra cualquier ventana anterior y repite la instalacion.')
    }
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
    $env:PGPASSWORD = $appPassword
    & $node.Source 'backend/scripts/migrate.js'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones.' }
    & $node.Source 'backend/scripts/seed-synthetic.js' '--si-vacio'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar los datos sinteticos.' }
    Write-Ok 'Esquema y catalogo CIIU listos; semilla sintetica instalada si la base estaba vacia'

    # ------------------------------------------------------------------ 6. administrador
    Write-Paso '6/7 Comprobando la cuenta administradora'
    $adminResult = & $psql -h 127.0.0.1 -p 5432 -U epen_app -d epen_codificacion -tAc `
        "SELECT username FROM epen.users WHERE role = 'admin' AND active = true AND deleted_at IS NULL ORDER BY id LIMIT 1" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar si ya existe una cuenta administradora.' }
    $adminUser = ($adminResult | Out-String).Trim()

    if ($adminUser) {
        Write-Ok ('Administrador existente: ' + $adminUser + ' (no se modifico su contrasena)')
    }
    else {
        $adminUser = Read-Host '   Usuario (Enter para "admin")'
        if (-not $adminUser) { $adminUser = 'admin' }
        $adminName = Read-Host '   Nombre completo (Enter para "Administrador EPEN")'
        if (-not $adminName) { $adminName = 'Administrador EPEN' }

        $adminPassword = ConvertFrom-SecureValue (Read-Host '   Contrasena (Enter para generar una automatica)' -AsSecureString)
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
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la cuenta administradora. Revisa el mensaje anterior.' }
            $adminCreated = $true
            Write-Ok ('Administrador creado: ' + $adminUser)
        }
        finally {
            Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_FULL_NAME, Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
        }
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
    $env:QWEN_MODEL = $Modelo

    $r3Root = Join-Path $projectRoot 'motores/r3'
    if (-not (Get-HttpJson 'http://127.0.0.1:8000/salud')) {
        if (-not (Test-Path -LiteralPath (Join-Path $r3Root 'servicio.py'))) { throw 'Falta motores/r3/servicio.py en el repositorio.' }
        $verifyProcesses += Start-Process -FilePath $python -ArgumentList @('servicio.py', '--puerto', '8000') -WorkingDirectory $r3Root -WindowStyle Hidden -PassThru
        if (-not (Wait-Http 'http://127.0.0.1:8000/salud' 40)) { throw 'La API R3 no respondio en http://127.0.0.1:8000.' }
    }
    $r3Health = Get-HttpJson 'http://127.0.0.1:8000/salud'
    if ($r3Health.catalogo_clases -ne 417 -or $r3Health.modelo -ne $Modelo) {
        throw ('El puerto 8000 no corresponde al R3 esperado o usa otro modelo. Deten el servicio anterior y repite. Modelo detectado: ' + $r3Health.modelo)
    }
    Write-Ok ('R3 operativo: ' + $r3Health.catalogo_clases + ' clases CIIU, modelo ' + $r3Health.modelo)

    $r2Root = Join-Path $projectRoot 'motores\r2\simulador'
    if (-not (Get-HttpJson 'http://127.0.0.1:8100/salud')) {
        $verifyProcesses += Start-Process -FilePath $python -ArgumentList @('servicio_r2.py') -WorkingDirectory $r2Root -WindowStyle Hidden -PassThru
        if (-not (Wait-Http 'http://127.0.0.1:8100/salud' 20)) { throw 'El simulador R2 no respondio en http://127.0.0.1:8100.' }
    }
    $r2Health = Get-HttpJson 'http://127.0.0.1:8100/salud'
    if ($r2Health.servicio -ne 'r2-simulator' -or $r2Health.contrato_version -ne '1.0') {
        throw 'El puerto 8100 esta ocupado por un servicio que no es el simulador contractual R2 esperado.'
    }
    Write-Ok 'Simulador contractual R2 operativo'

    # ------------------------------------------------------------------ resumen
    Write-Host ''
    Write-Host '  INSTALACION COMPLETA' -ForegroundColor Green
    Write-Host ''
    Write-Host ('  Usuario administrador : ' + $adminUser) -ForegroundColor White
    if (-not $adminCreated) {
        Write-Host '  Contrasena            : se conserva la que ya tenia' -ForegroundColor White
    }
    elseif ($generated) {
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
    foreach ($process in $verifyProcesses) {
        if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
    Remove-Item Env:QWEN_MODEL -ErrorAction SilentlyContinue
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Pop-Location
    $adminPassword = $null
}
