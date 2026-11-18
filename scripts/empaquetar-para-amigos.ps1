# Crea un paquete para compartir el proyecto con otra computadora.
# Incluye el codigo que Git versionaria (tambien los cambios sin confirmar) y los modelos locales.
# No incluye .env, .runtime, node_modules, bases, registros ni credenciales: esos archivos estan
# ignorados por Git o viven fuera del repositorio. Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\empaquetar-para-amigos.ps1
param(
    [string]$Destino,
    [string]$CarpetaBeto,
    [string]$ZipQwen
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$workspace = Split-Path -Parent $root
if (-not $Destino) { $Destino = Join-Path $workspace 'paquete-para-amigos' }
if (-not $CarpetaBeto) { $CarpetaBeto = Join-Path $workspace 'modelo_beto_multivariado_final_v2' }
if (-not $ZipQwen) { $ZipQwen = Join-Path $workspace 'modelo_qwen25_7b_finetuned_ciiu_v2.zip' }
$stamp = Get-Date -Format 'yyyyMMdd'

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

# 1. Codigo del proyecto: archivos que Git versionaria (incluye cambios sin confirmar).
$archivos = @(git -C $root ls-files --cached --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer la lista de archivos con Git.' }
$prohibidos = @($archivos | Where-Object { $_ -match '(^|/)\.env$' -or $_ -match '\.(zip|db|sqlite3?|pyc|safetensors|npy)$' -or $_ -match '(^|/)node_modules/' })
if ($prohibidos.Count -gt 0) { throw ('Hay archivos que no deben empaquetarse: ' + ($prohibidos -join ', ')) }

$stage = Join-Path ([IO.Path]::GetTempPath()) ('epen-codigo-' + [guid]::NewGuid().ToString('N'))
try {
    $copiados = 0
    foreach ($rel in $archivos) {
        $origen = Join-Path $root $rel
        if (-not (Test-Path -LiteralPath $origen -PathType Leaf)) { continue }
        $destinoArchivo = Join-Path $stage $rel
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destinoArchivo) | Out-Null
        Copy-Item -LiteralPath $origen -Destination $destinoArchivo
        $copiados++
    }
    $zipCodigo = Join-Path $Destino "proyecto-epen-$stamp.zip"
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipCodigo -Force
    Write-Output "Codigo: $copiados archivos -> $zipCodigo"
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}

# 2. Modelo BETO: solo los archivos que necesita el servicio, dentro de una carpeta con su nombre.
$archivosBeto = @('config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json', 'clases_ciiu.npy')
$faltanBeto = @($archivosBeto | Where-Object { -not (Test-Path -LiteralPath (Join-Path $CarpetaBeto $_) -PathType Leaf) })
if ($faltanBeto.Count -gt 0) { throw ('Faltan archivos del modelo BETO: ' + ($faltanBeto -join ', ')) }

# Carpeta lista para copiar: paquete\modelos\modelo_beto_multivariado_final_v2 -> dentro de la carpeta del proyecto
# descargada de GitHub. Sin ZIP, para que no haya que descomprimir nada.
$carpetaBetoDestino = Join-Path (Join-Path $Destino 'modelos') 'modelo_beto_multivariado_final_v2'
New-Item -ItemType Directory -Force -Path $carpetaBetoDestino | Out-Null
$rutasBeto = @($archivosBeto | ForEach-Object { Join-Path $CarpetaBeto $_ })
Copy-Item -LiteralPath $rutasBeto -Destination $carpetaBetoDestino -Force
Write-Output "BETO (carpeta): $carpetaBetoDestino"

# 3. Adaptador Qwen ajustado: se copia tal cual; el cuaderno de Colab busca sus archivos por nombre.
if (-not (Test-Path -LiteralPath $ZipQwen -PathType Leaf)) { throw "No se encontro el adaptador Qwen: $ZipQwen" }
$destinoQwen = Join-Path $Destino (Split-Path -Leaf $ZipQwen)
Copy-Item -LiteralPath $ZipQwen -Destination $destinoQwen -Force
Write-Output "Qwen: $destinoQwen"
