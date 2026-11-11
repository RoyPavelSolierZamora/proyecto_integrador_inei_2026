[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $projectRoot '.env'

function Write-Title([string]$Text) {
    Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

function Set-DotEnvValue([System.Collections.Generic.List[string]]$Lines, [string]$Name, [string]$Value) {
    $replacement = "$Name=$Value"
    for ($index = 0; $index -lt $Lines.Count; $index++) {
        if ($Lines[$index] -match ('^\s*' + [regex]::Escape($Name) + '\s*=')) {
            $Lines[$index] = $replacement
            return
        }
    }
    $Lines.Add($replacement)
}

function Read-SecretText([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw 'No existe .env. Ejecuta instalar.bat antes de conectar Colab.'
}

Write-Title 'Conectar el asistente de IA con Colab'
Write-Host 'Mantén abierto el notebook de Colab y copia los valores que muestra su última celda.'
Write-Host 'El token no se mostrará en pantalla ni se enviará a Git.'

$baseUrl = (Read-Host 'URL HTTPS de Colab (R3_BASE_URL)').Trim().TrimEnd('/')
if ($baseUrl -notmatch '^https://[a-z0-9.-]+(?::\d+)?(?:/.*)?$') {
    throw 'La URL debe comenzar con https:// y no debe contener espacios.'
}

$token = (Read-SecretText 'Token de Colab (R3_API_TOKEN)').Trim()
if ($token.Length -lt 24) { throw 'El token debe tener al menos 24 caracteres.' }

Write-Host 'Comprobando la conexión pública...' -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri ($baseUrl + '/salud') -Headers @{ Authorization = 'Bearer ' + $token } -Method Get -TimeoutSec 30
if ($health.estado -ne 'ok' -or -not $health.modelo) {
    throw 'El servicio de IA remoto respondió, pero no está operativo.'
}

$lines = [System.Collections.Generic.List[string]]::new()
foreach ($line in [IO.File]::ReadAllLines($envPath)) { $lines.Add($line) }
Set-DotEnvValue $lines 'R3_MODE' 'remote'
Set-DotEnvValue $lines 'R3_BASE_URL' $baseUrl
Set-DotEnvValue $lines 'R3_API_TOKEN' $token
Set-DotEnvValue $lines 'QWEN_MODEL' ([string]$health.modelo)
[IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))

Write-Host ('Conexión guardada. Modelo detectado: ' + $health.modelo) -ForegroundColor Green
if ($health.gpu) { Write-Host ('GPU detectada: ' + $health.gpu) -ForegroundColor Green }

$restart = (Read-Host '¿Reiniciar el dashboard ahora? (S/n)').Trim().ToLowerInvariant()
if ($restart -ne 'n') {
    & (Join-Path $projectRoot 'detener-dashboard.ps1')
    & (Join-Path $projectRoot 'iniciar-dashboard.ps1')
}

Write-Host 'Listo. La interfaz usará Colab mientras el notebook permanezca activo.' -ForegroundColor Green
