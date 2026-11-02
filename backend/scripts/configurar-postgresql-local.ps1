$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ejecuta este script desde PowerShell con la opción Ejecutar como administrador.'
}

$serviceName = 'postgresql-x64-18'
$configPath = 'C:\Program Files\PostgreSQL\18\data\postgresql.conf'
$readyPath = 'C:\Program Files\PostgreSQL\18\bin\pg_isready.exe'
$backupDirectory = Join-Path $PSScriptRoot '..\config-backup'
$resolvedBackupDirectory = [IO.Path]::GetFullPath($backupDirectory)

New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $resolvedBackupDirectory "postgresql.conf.$timestamp.bak"
Copy-Item -LiteralPath $configPath -Destination $backupPath

$content = Get-Content -LiteralPath $configPath -Raw
if ($content -match "(?m)^\s*listen_addresses\s*=") {
    $content = $content -replace "(?m)^\s*listen_addresses\s*=.*$", "listen_addresses = 'localhost'"
} else {
    $content += "`r`nlisten_addresses = 'localhost'`r`n"
}
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($configPath, $content, $utf8WithoutBom)

Set-Service -Name $serviceName -StartupType Automatic
Restart-Service -Name $serviceName

$service = Get-Service -Name $serviceName
$readiness = & $readyPath -h 127.0.0.1 -p 5432
$listeners = Get-NetTCPConnection -LocalPort 5432 -State Listen | Select-Object LocalAddress, LocalPort, State

Write-Host "Copia de seguridad: $backupPath"
$service | Format-Table Name, Status, StartType
Write-Host $readiness
$listeners | Format-Table -AutoSize

if ($service.Status -ne 'Running' -or $service.StartType -ne 'Automatic') {
    throw 'El servicio no quedó iniciado automáticamente.'
}
if ($listeners.LocalAddress -contains '0.0.0.0' -or $listeners.LocalAddress -contains '::') {
    throw 'PostgreSQL todavía escucha en todas las interfaces. Revisa postgresql.conf.'
}

Write-Host 'PostgreSQL quedó limitado al equipo local y con inicio automático.' -ForegroundColor Green
