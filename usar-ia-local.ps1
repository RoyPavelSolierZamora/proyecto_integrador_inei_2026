[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw 'No existe .env. Ejecuta instalar.bat antes de cambiar el modo de procesamiento.'
}

$lines = [System.Collections.Generic.List[string]]::new()
foreach ($line in [IO.File]::ReadAllLines($envPath)) {
    if ($line -notmatch '^\s*R3_API_TOKEN\s*=') { $lines.Add($line) }
}

function Set-DotEnvValue([string]$Name, [string]$Value) {
    $replacement = "$Name=$Value"
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match ('^\s*' + [regex]::Escape($Name) + '\s*=')) {
            $lines[$index] = $replacement
            return
        }
    }
    $lines.Add($replacement)
}

Set-DotEnvValue 'R3_MODE' 'local'
Set-DotEnvValue 'R3_BASE_URL' 'http://127.0.0.1:8000'
[IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
Write-Host 'El asistente de IA quedó configurado para ejecutarse en esta computadora.' -ForegroundColor Green

$restart = (Read-Host '¿Reiniciar el dashboard ahora? (S/n)').Trim().ToLowerInvariant()
if ($restart -ne 'n') {
    & (Join-Path $projectRoot 'detener-dashboard.ps1')
    & (Join-Path $projectRoot 'iniciar-dashboard.ps1')
}
