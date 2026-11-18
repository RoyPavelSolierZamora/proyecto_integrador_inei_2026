"""Servicio R3 con Qwen2.5 7B ajustado. No persiste respuestas de encuesta."""
import csv
import json
import os
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

import torch
import r3_gpu_service as common
from r3_qwen_ft_contract import SYSTEM, PROMPT_VERSION, build_prompt, parse_output

# Chat: usa el mismo modelo base pero SIN el adaptador de clasificación. Comparte el candado
# de inferencia, así una respuesta de chat no se mezcla con una clasificación en curso.
CHAT_SYSTEM = (
    'Eres el asistente de codificación CIIU Rev.4 del proyecto EPEN. Responde en español, '
    'en pocas oraciones y con claridad. Usa solo el contexto oficial que se te entrega. '
    'Si la respuesta no está en el contexto, dilo y sugiere consultar las notas oficiales. '
    'No inventes códigos ni datos.'
)
MAX_CHAT_BODY = 16 * 1024

MODEL_NAME = 'qwen2.5-7b-ciiu-ajustado-v1'
model = None
tokenizer = None
catalog = None
inference_lock = threading.Lock()

def configure(loaded_model, loaded_tokenizer, catalog_path):
    global model, tokenizer, catalog
    with open(catalog_path, encoding='utf-8-sig', newline='') as file:
        rows = csv.DictReader(file)
        if not {'codigo', 'descripcion'}.issubset(rows.fieldnames or []):
            raise ValueError('El catálogo debe incluir codigo y descripcion.')
        catalog = {str(row['codigo']).strip().zfill(4) for row in rows}
    if len(catalog) != 417 or any(len(code) != 4 or not code.isdigit() for code in catalog):
        raise ValueError('El catálogo debe contener 417 clases CIIU válidas.')
    model, tokenizer = loaded_model.eval(), loaded_tokenizer

def classify(item):
    if model is None or tokenizer is None or catalog is None:
        raise RuntimeError('El modelo no ha terminado de cargar.')
    if not isinstance(item, dict) or not str(item.get('id_registro') or '').strip():
        raise ValueError('Falta id_registro.')
    candidates = common.candidates_from(item)
    if any(row['codigo'] not in catalog for row in candidates):
        raise ValueError('Se recibió un código fuera del catálogo CIIU.')
    messages = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': build_prompt(item, candidates)}]
    started = time.perf_counter()
    with inference_lock:
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, return_tensors='pt').to(model.device)
        with torch.inference_mode():
            generated = model.generate(**inputs, max_new_tokens=96, do_sample=False, pad_token_id=tokenizer.eos_token_id)
        raw = tokenizer.decode(generated[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
    result = parse_output(raw, candidates)
    return {'id_registro': str(item['id_registro']), **result,
            'requiere_revision': int(result['decision'] == 'revision_humana'),
            'modelo': f'{MODEL_NAME}|prompt={PROMPT_VERSION}', 'latencia_s': round(time.perf_counter() - started, 4)}

def chat(body):
    if model is None or tokenizer is None:
        raise RuntimeError('El modelo no ha terminado de cargar.')
    if not isinstance(body, dict):
        raise ValueError('La solicitud debe ser un objeto JSON.')
    question = str(body.get('pregunta') or '').strip()
    context = str(body.get('contexto') or '').strip()[:6000]
    if not 3 <= len(question) <= 800:
        raise ValueError('La pregunta debe tener entre 3 y 800 caracteres.')
    messages = [
        {'role': 'system', 'content': CHAT_SYSTEM},
        {'role': 'user', 'content': f'Contexto oficial:\n{context or "(sin contexto)"}\n\nPregunta: {question}'},
    ]
    started = time.perf_counter()
    with inference_lock:
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, return_tensors='pt').to(model.device)
        with model.disable_adapter(), torch.inference_mode():
            generated = model.generate(**inputs, max_new_tokens=320, do_sample=False,
                                       repetition_penalty=1.05, pad_token_id=tokenizer.eos_token_id)
        answer = tokenizer.decode(generated[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True).strip()
    return {'respuesta': answer, 'modelo': 'qwen2.5-7b-instruct-base',
            'latencia_s': round(time.perf_counter() - started, 4)}

class Handler(common.Handler):
    def do_POST(self):
        if self.path.rstrip('/') != '/chat':
            return super().do_POST()
        if not self.authorized():
            return self.send_json({'error': 'No autorizado.'}, 401)
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if not 0 < length <= MAX_CHAT_BODY:
                return self.send_json({'error': 'Tamaño de solicitud inválido.'}, 413)
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            return self.send_json(chat(body))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            return self.send_json({'error': str(error)}, 400)
        except Exception as error:
            return self.send_json({'error': f'Fallo interno del chat: {error}'}, 500)

    def do_GET(self):
        if not self.authorized():
            return self.send_json({'error': 'No autorizado.'}, 401)
        if self.path.rstrip('/') != '/salud':
            return self.send_json({'error': 'Ruta no encontrada.'}, 404)
        ready = model is not None and tokenizer is not None and catalog is not None
        return self.send_json({'estado': 'ok' if ready else 'degradado', 'servicio': 'qwen-ft',
                               'modelo': MODEL_NAME, 'contrato_version': '1.1',
                               'catalogo_clases': len(catalog) if catalog else 0,
                               'prompt_version': PROMPT_VERSION}, 200 if ready else 503)

def start_server(port=8001):
    if model is None:
        raise RuntimeError('Primero configure el modelo y el catálogo.')
    common.classify = classify
    server = ThreadingHTTPServer(('127.0.0.1', int(port)), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

if __name__ == '__main__':
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer
    base_path = os.environ.get('QWEN_FT_BASE', '').strip()
    adapter_path = os.environ.get('QWEN_FT_ADAPTER', '').strip()
    catalog_path = os.environ.get('R3_CATALOG_PATH', '').strip()
    if not base_path or not adapter_path or not catalog_path or not Path(adapter_path, 'adapter_config.json').is_file():
        raise RuntimeError('Configura QWEN_FT_BASE, QWEN_FT_ADAPTER y R3_CATALOG_PATH.')
    if not torch.cuda.is_available():
        raise RuntimeError('Este servicio requiere GPU CUDA.')
    loaded_tokenizer = AutoTokenizer.from_pretrained(adapter_path, local_files_only=True)
    base = AutoModelForCausalLM.from_pretrained(base_path, device_map='auto')
    configure(PeftModel.from_pretrained(base, adapter_path, local_files_only=True), loaded_tokenizer, catalog_path)
    server = start_server(int(os.environ.get('R3_PORT', '8001')))
    print(f'Qwen ajustado listo en {server.server_address}', flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        server.shutdown()
