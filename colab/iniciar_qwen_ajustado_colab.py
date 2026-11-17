"""Arranque de Qwen ajustado en Colab con archivos persistentes en Drive.

Ejecutar desde el notebook de conexión incluido. Solo guarda el modelo y código,
no guarda tokens, encuestas ni respuestas de clasificación en Drive.
"""
import csv
import io
import os
import secrets
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path
from google.colab import files

ROOT = Path('/content/drive/MyDrive/EPEN_Qwen_Ajustado')
RUNTIME = Path('/content')
ASSETS = ROOT / 'archivos'
ADAPTER = ROOT / 'adaptador'
BASE = ROOT / 'modelo_base_qwen25_7b_4bit'
ROOT.mkdir(parents=True, exist_ok=True)
ASSETS.mkdir(exist_ok=True)

required_code = ['r3_gpu_service.py', 'r3_qwen_ft_service.py', 'r3_qwen_ft_contract.py', 'tunel_qwen_ajustado.py']
adapter_files = ['adapter_config.json', 'adapter_model.safetensors', 'tokenizer.json', 'tokenizer_config.json']

def copy_if_missing(source, target):
    if not target.exists() and source.is_file():
        shutil.copy2(source, target)

def upload_matching(names):
    print('Selecciona:', ', '.join(names), flush=True)
    uploaded = files.upload()
    for name in names:
        stem, suffix = Path(name).stem, Path(name).suffix
        options = [key for key in uploaded if (key == name or key.startswith(stem + ' (')) and key.endswith(suffix)]
        if len(options) != 1:
            raise RuntimeError(f'Selecciona una sola copia de {name} y vuelve a ejecutar la celda.')
        target = ASSETS / name
        with target.open('xb') as file:
            file.write(uploaded[options[0]])

for name in required_code + ['catalogo_ciiu.csv']:
    copy_if_missing(RUNTIME / name, ASSETS / name)
missing_code = [name for name in required_code if not (ASSETS / name).is_file()]
if missing_code:
    upload_matching(missing_code)
if not (ASSETS / 'catalogo_ciiu.csv').is_file():
    upload_matching(['catalogo_ciiu.csv'])

ADAPTER.mkdir(exist_ok=True)
existing_adapter = RUNTIME / 'modelo_qwen25_7b_finetuned_ciiu_v2'
for name in adapter_files + ['chat_template.jinja']:
    copy_if_missing(existing_adapter / name, ADAPTER / name)
missing_adapter = [name for name in adapter_files if not (ADAPTER / name).is_file()]
if missing_adapter:
    print('Selecciona el ZIP de modelo_qwen25_7b_finetuned_ciiu_v2 (solo la primera vez).', flush=True)
    uploaded = files.upload()
    archives = [name for name in uploaded if name.lower().endswith('.zip')]
    if len(archives) != 1:
        raise RuntimeError('Selecciona exactamente un ZIP del adaptador y vuelve a ejecutar.')
    with zipfile.ZipFile(io.BytesIO(uploaded[archives[0]])) as archive:
        for name in missing_adapter + ['chat_template.jinja']:
            target = ADAPTER / name
            if target.exists():
                continue
            matches = [entry for entry in archive.infolist() if not entry.is_dir() and entry.filename.replace('\\', '/').split('/')[-1] == name]
            if len(matches) > 1:
                raise RuntimeError(f'El ZIP contiene varias copias de {name}.')
            if matches:
                with archive.open(matches[0]) as source, target.open('xb') as destination:
                    shutil.copyfileobj(source, destination)
    missing_adapter = [name for name in adapter_files if not (ADAPTER / name).is_file()]
    if missing_adapter:
        raise RuntimeError('Faltan archivos del adaptador: ' + ', '.join(missing_adapter))

with (ASSETS / 'catalogo_ciiu.csv').open(encoding='utf-8-sig', newline='') as file:
    codes = {str(row['codigo']).strip().zfill(4) for row in csv.DictReader(file)}
if len(codes) != 417:
    raise RuntimeError('El catálogo no contiene 417 clases CIIU.')

print('Instalando dependencias de esta sesión...', flush=True)
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'transformers', 'accelerate', 'peft', 'bitsandbytes', 'safetensors'], check=True)
os.environ['PATH'] = '/content:' + os.environ.get('PATH', '')
if not shutil.which('cloudflared'):
    binary = RUNTIME / 'cloudflared'
    if binary.exists():
        raise RuntimeError('Existe /content/cloudflared pero no es ejecutable. Revisa el archivo antes de continuar.')
    urllib.request.urlretrieve('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64', str(binary))
    binary.chmod(0o755)

import torch
if not torch.cuda.is_available():
    raise RuntimeError('No hay GPU CUDA. Cambia el tipo de entorno a GPU y vuelve a ejecutar.')
from huggingface_hub import snapshot_download
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE.mkdir(exist_ok=True)
marker = BASE / '.descarga_completa'
if not marker.exists():
    print('Descargando el modelo base a Drive por primera vez; puede ocupar varios GB...', flush=True)
    snapshot_download(repo_id='unsloth/Qwen2.5-7B-Instruct-bnb-4bit', local_dir=str(BASE))
    marker.touch(exist_ok=False)

for name in required_code + ['catalogo_ciiu.csv']:
    source, target = ASSETS / name, RUNTIME / name
    if target.exists() and target.read_bytes() != source.read_bytes():
        raise RuntimeError(f'/content/{name} ya existe con otro contenido. Inicia una sesión limpia o revisa ese archivo.')
    copy_if_missing(source, target)

if '/content' not in sys.path:
    sys.path.insert(0, '/content')

if globals().get('servidor_qwen_ft') is not None:
    raise RuntimeError('El servicio ya está activo en esta sesión; no lo inicies dos veces.')
TOKEN = secrets.token_urlsafe(32)
os.environ['R3_API_TOKEN'] = TOKEN
import r3_qwen_ft_service
import tunel_qwen_ajustado
r3_qwen_ft_service.common.API_TOKEN = TOKEN

print('Cargando modelo y adaptador en GPU...', flush=True)
tokenizer_ft = AutoTokenizer.from_pretrained(str(ADAPTER), local_files_only=True)
modelo_base = AutoModelForCausalLM.from_pretrained(str(BASE), device_map='auto', local_files_only=True)
qwen_ft = PeftModel.from_pretrained(modelo_base, str(ADAPTER), local_files_only=True).eval()
r3_qwen_ft_service.configure(qwen_ft, tokenizer_ft, str(ASSETS / 'catalogo_ciiu.csv'))
servidor_qwen_ft = r3_qwen_ft_service.start_server(8001)
url_qwen_ft = tunel_qwen_ajustado.conectar(TOKEN)

print('\nCONEXIÓN LISTA. Usa estos valores solo en conectar-colab.bat:')
print('URL:', url_qwen_ft)
print('TOKEN:', TOKEN)
print('No compartas el token por chat y borra esta salida antes de compartir el notebook.')
