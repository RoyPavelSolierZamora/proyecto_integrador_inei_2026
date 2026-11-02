<#
.SYNOPSIS
    Crea (o reactiva) la cuenta de solo lectura para la demostracion publica.

.DESCRIPTION
    Pide la contrasena de PostgreSQL sin mostrarla y la mantiene solo en memoria.
    La clave de la cuenta demo se genera aleatoriamente y se imprime una unica vez
    en esta ventana.

    Roles permitidos: auditor (solo lectura) o analista (puede codificar).
    Nunca crea supervisor ni admin, para que un invitado no pueda importar bases,
    simular umbrales ni administrar credenciales.

.EXAMPLE
    .\crear-usuario-demo-seguro.ps1
    .\crear-usuario-demo-seguro.ps1 -Rol analista
#>
param(
    [ValidateSet('auditor', 'analista')]
    [string]$Rol = 'auditor',

    [string]$Usuario = 'demo',

    [string]$Nombre = 'Invitado de demostracion'
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

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$databaseSecret = Read-Host 'Contrasena de PostgreSQL para epen_app' -AsSecureString
$databasePassword = ConvertFrom-SecureValue $databaseSecret

try {
    $env:PGHOST = '127.0.0.1'
    $env:PGPORT = '5432'
    $env:PGDATABASE = 'epen_codificacion'
    $env:PGUSER = 'epen_app'
    $env:PGPASSWORD = $databasePassword
    $env:DEMO_USERNAME = $Usuario
    $env:DEMO_FULL_NAME = $Nombre
    $env:DEMO_ROLE = $Rol

    Push-Location $projectRoot
    try {
        & node 'backend/scripts/create-demo-user.js'
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la cuenta demo.' }
    }
    finally {
        Pop-Location
    }

    Write-Host ''
    Write-Host "Comparte solo el usuario '$Usuario' y la clave temporal de arriba." -ForegroundColor Green
    Write-Host 'Al terminar la demostracion, desactiva la cuenta desde Usuarios.' -ForegroundColor Green
}
finally {
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:DEMO_USERNAME, Env:DEMO_FULL_NAME, Env:DEMO_ROLE -ErrorAction SilentlyContinue
    $databasePassword = $null
}
