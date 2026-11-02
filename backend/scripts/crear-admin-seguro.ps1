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

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$username = (Read-Host 'Usuario del primer administrador').Trim().ToLowerInvariant()
$fullName = (Read-Host 'Nombre completo').Trim()
$databaseSecret = Read-Host 'Contrasena de PostgreSQL para epen_app' -AsSecureString
$adminSecret = Read-Host 'Clave inicial del administrador del dashboard' -AsSecureString
$adminConfirmation = Read-Host 'Repite la clave inicial del administrador' -AsSecureString

$databasePassword = ConvertFrom-SecureValue $databaseSecret
$adminPassword = ConvertFrom-SecureValue $adminSecret
$confirmationPassword = ConvertFrom-SecureValue $adminConfirmation

try {
    if ($username -notmatch '^[a-z0-9._-]{3,30}$') {
        throw 'El usuario debe tener entre 3 y 30 caracteres: letras, numeros, punto, guion o guion bajo.'
    }
    if ([string]::IsNullOrWhiteSpace($fullName)) {
        throw 'El nombre completo es obligatorio.'
    }
    if ($adminPassword.Length -lt 12) {
        throw 'La clave del administrador debe tener al menos 12 caracteres.'
    }
    if ($adminPassword -cne $confirmationPassword) {
        throw 'Las dos claves del administrador no coinciden.'
    }

    $env:PGHOST = '127.0.0.1'
    $env:PGPORT = '5432'
    $env:PGDATABASE = 'epen_codificacion'
    $env:PGUSER = 'epen_app'
    $env:PGPASSWORD = $databasePassword
    $env:ADMIN_USERNAME = $username
    $env:ADMIN_FULL_NAME = $fullName
    $env:ADMIN_PASSWORD = $adminPassword

    Push-Location $projectRoot
    try {
        & node 'backend/scripts/migrate.js'
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar la migracion de PostgreSQL. Revisa el error mostrado por Node justo arriba.' }
        & node 'backend/scripts/create-admin.js'
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el administrador. Revisa el error mostrado por Node justo arriba.' }
    }
    finally {
        Pop-Location
    }

    Write-Host 'Administrador creado y migracion verificada. Las contrasenas no se guardaron en archivos.' -ForegroundColor Green
}
finally {
    Remove-Item Env:PGHOST -ErrorAction SilentlyContinue
    Remove-Item Env:PGPORT -ErrorAction SilentlyContinue
    Remove-Item Env:PGDATABASE -ErrorAction SilentlyContinue
    Remove-Item Env:PGUSER -ErrorAction SilentlyContinue
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_USERNAME -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_FULL_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $databasePassword = $null
    $adminPassword = $null
    $confirmationPassword = $null
}

