$ErrorActionPreference = 'Stop'

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$databaseSecret = Read-Host 'Contrasena de PostgreSQL para epen_app' -AsSecureString
$databasePassword = ConvertFrom-SecureValue $databaseSecret

try {
    $env:PGHOST = '127.0.0.1'
    $env:PGPORT = '5432'
    $env:PGDATABASE = 'epen_codificacion'
    $env:PGUSER = 'epen_app'
    $env:PGPASSWORD = $databasePassword
    Push-Location $projectRoot
    try {
        & node 'backend/scripts/migrate.js'
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo aplicar la migracion operativa.' }
        & node 'backend/scripts/seed-demo.js'
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar los datos sinteticos.' }
    }
    finally { Pop-Location }
    Write-Host 'Datos sinteticos y catalogo CIIU instalados en PostgreSQL.' -ForegroundColor Green
}
finally {
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGPASSWORD -ErrorAction SilentlyContinue
    $databasePassword = $null
}

