"""Comparación local de dos servicios R3 existentes, con etiquetas separadas.

Los servicios reciben solo el JSONL de entrada; las etiquetas nunca se envían.
No modifica PostgreSQL ni decide códigos para el dashboard.
"""
import argparse
import csv
import json
import os
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
from collections import Counter
from pathlib import Path


def load_data(input_path, truth_path):
    records = [json.loads(line) for line in Path(input_path).read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    allowed = {'id_registro', 'p309', 'p308', 'p308a', 'candidatos', 'confianza_ml', 'casos_similares'}
    sanitized = []
    for row in records:
        if not isinstance(row, dict) or not row.get('id_registro') or not isinstance(row.get('candidatos'), list) or not row['candidatos']:
            raise ValueError('Cada línea debe contener id_registro y candidatos no vacíos.')
        # Whitelist anidada: nunca reenviar campos arbitrarios o etiquetas reales.
        item = {key: row[key] for key in allowed if key in row}
        item['candidatos'] = [{k: candidate[k] for k in ('codigo', 'descripcion', 'prob', 'rank') if k in candidate} for candidate in row['candidatos']]
        item['casos_similares'] = [{k: example[k] for k in ('codigo', 'p309', 'p308', 'p308a', 'similitud') if k in example} for example in row.get('casos_similares', [])]
        sanitized.append(item)
    ids = [str(row['id_registro']) for row in sanitized]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError('El JSONL está vacío o contiene identificadores repetidos.')
    truth = {}
    with open(truth_path, encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        if not {'id_registro', 'codigo_esperado'}.issubset(reader.fieldnames or []):
            raise ValueError('El CSV de referencia requiere id_registro,codigo_esperado.')
        for row in reader:
            key, code = row['id_registro'].strip(), row['codigo_esperado'].strip()
            if not key or key in truth or len(code) != 4 or not code.isdigit():
                raise ValueError('El CSV de referencia contiene IDs repetidos o códigos inválidos.')
            truth[key] = code
    if set(ids) != set(truth):
        raise ValueError('Los identificadores de entrada y referencia deben coincidir exactamente.')
    return sanitized, truth


def call(url, token, item, timeout):
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url.rstrip('/') + '/codificar', data=json.dumps(item, ensure_ascii=False).encode('utf-8'), headers=headers, method='POST')
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = json.load(response)
        if not isinstance(data, dict) or str(data.get('id_registro')) != str(item['id_registro']):
            raise ValueError('Respuesta o identificador inválido.')
        review = data.get('decision') == 'revision_humana' or data.get('requiere_revision') == 1
        code = str(data.get('codigo') or '').strip()
        allowed = {str(c.get('codigo') or '') for c in item['candidatos']}
        if not review and (data.get('decision') != 'seleccionar' or code not in allowed):
            raise ValueError('Respuesta fuera del contrato o candidatos.')
        return {'estado': 'revision' if review else 'seleccion', 'codigo': '' if review else code, 'segundos': round(time.monotonic() - started, 3)}
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError, OSError):
        return {'estado': 'error', 'codigo': '', 'segundos': round(time.monotonic() - started, 3)}


def summarize(rows, name):
    total = len(rows)
    selected = [r for r in rows if r[name]['estado'] == 'seleccion']
    correct = sum(r[name]['codigo'] == r['esperado'] for r in selected)
    top1 = [r for r in selected if r[name]['codigo'] == r['top1']]
    top1_correct = sum(r[name]['codigo'] == r['esperado'] for r in top1)
    states = Counter(r[name]['estado'] for r in rows)
    return {'total': total, 'selecciones': len(selected), 'revisiones': states['revision'], 'errores_tecnicos': states['error'],
            'aciertos': correct, 'cobertura_seleccion': len(selected) / total if total else None,
            'precision_seleccion': correct / len(selected) if selected else None,
            'confirmaciones_top1': len(top1), 'precision_confirmaciones_top1': top1_correct / len(top1) if top1 else None,
            'aciertos_sobre_total': correct / total if total else None,
            'latencia_promedio_s': sum(r[name]['segundos'] for r in rows) / total if total else None}


def main():
    parser = argparse.ArgumentParser(description='Compara dos endpoints R3 sobre los mismos casos.')
    parser.add_argument('--entrada', required=True, help='JSONL sin respuestas correctas')
    parser.add_argument('--referencia', required=True, help='CSV local id_registro,codigo_esperado')
    parser.add_argument('--url-a', required=True); parser.add_argument('--url-b', required=True)
    parser.add_argument('--salida', required=True, help='Archivo JSON local con resultados; contiene identificadores')
    parser.add_argument('--timeout', type=int, default=120)
    args = parser.parse_args()
    for url in (args.url_a, args.url_b):
        parsed = urlparse(url)
        if not (parsed.scheme == 'https' or (parsed.scheme == 'http' and parsed.hostname in {'127.0.0.1', 'localhost', '::1'})):
            parser.error('Los servicios remotos requieren HTTPS; HTTP solo se permite en localhost.')
    records, truth = load_data(args.entrada, args.referencia)
    rows = []
    for index, item in enumerate(records, 1):
        key = str(item['id_registro'])
        result = {'id_registro': key, 'esperado': truth[key], 'top1': str(item['candidatos'][0].get('codigo', ''))}
        for name, url in [('a', args.url_a), ('b', args.url_b)]:
            result[name] = call(url, os.environ.get(f'R3_TOKEN_{name.upper()}', ''), item, args.timeout)
        rows.append(result)
        print(f'Comparados {index}/{len(records)}', flush=True)
    result = {'aviso': 'Evaluación descriptiva; no implica habilitar cierre automático.', 'a': summarize(rows, 'a'), 'b': summarize(rows, 'b'), 'resultados': rows}
    Path(args.salida).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'a': result['a'], 'b': result['b']}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
