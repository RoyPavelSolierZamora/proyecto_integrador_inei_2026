"""Conecta un servicio Qwen ajustado ya iniciado a un túnel temporal de Cloudflare.

El modelo y el servicio deben estar activos en la misma sesión de Colab. No imprime
ni guarda el token, no sube encuestas y no detiene otros servicios o túneles.
"""
from __future__ import annotations

import json
import queue
import re
import shutil
import subprocess
import threading
import time
from urllib.request import Request, urlopen

_process = None
_url = None
_reader = None


def check_service(token: str, port: int) -> dict:
    if not isinstance(token, str) or len(token) < 24:
        raise ValueError('No se encontró un token válido de esta sesión.')
    if not isinstance(port, int) or not 1 <= port <= 65535:
        raise ValueError('Puerto local inválido.')
    request = Request(f'http://127.0.0.1:{port}/salud', headers={'Authorization': 'Bearer ' + token})
    try:
        with urlopen(request, timeout=10) as response:
            health = json.load(response)
    except Exception as error:
        raise RuntimeError('El servicio ajustado no respondió en el puerto local. Inícialo antes del túnel.') from error
    if health.get('estado') != 'ok' or health.get('servicio') != 'qwen-ft' or health.get('contrato_version') != '1.1' or health.get('catalogo_clases') != 417:
        raise RuntimeError('El servicio local no es el Qwen ajustado esperado o no está listo.')
    return health


def conectar(token: str, port: int = 8001, timeout: int = 60) -> str:
    """Comprueba el servicio y devuelve la URL HTTPS. Reutiliza solo su propio túnel."""
    global _process, _url, _reader
    check_service(token, port)
    if _process is not None and _process.poll() is None and _url:
        return _url
    executable = shutil.which('cloudflared')
    if not executable:
        raise RuntimeError('No se encontró cloudflared. Debes instalarlo o usar la sesión donde ya estaba instalado.')
    _url = None
    process = subprocess.Popen(
        [executable, 'tunnel', '--url', f'http://127.0.0.1:{port}', '--no-autoupdate'],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    _process = process
    lines = queue.Queue()
    def read_lines():
        for line in process.stdout:
            lines.put(line)
    _reader = threading.Thread(target=read_lines, daemon=True)
    _reader.start()
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('El túnel se detuvo antes de abrirse.')
        try:
            line = lines.get(timeout=1)
        except queue.Empty:
            continue
        match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
        if match:
            _url = match.group(0)
            return _url
    process.terminate()
    raise RuntimeError('El túnel no entregó una URL dentro del tiempo esperado.')
