"""Evalúa un R2 por HTTP con códigos de referencia retenidos localmente."""
import argparse
import csv
import json
import time
import urllib.request
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True)
    parser.add_argument('--url', default='http://127.0.0.1:8100')
    parser.add_argument('--salida', required=True)
    parser.add_argument('--limite', type=int, default=0)
    args = parser.parse_args()
    destination = Path(args.salida)
    if destination.exists():
        raise SystemExit('La salida ya existe; indique un nombre nuevo para no sobrescribirla.')
    if not args.url.startswith('http://127.0.0.1:'):
        raise SystemExit('La evaluación solo admite el servicio privado de esta computadora.')
    with open(args.csv, encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        required = {'ID_C200', 'C309', 'C309_COD', 'C308', 'C308A'}
        if not required.issubset(reader.fieldnames or []):
            raise SystemExit('Faltan columnas necesarias en el CSV.')
        raw = list(reader)
    if args.limite:
        raw = raw[:args.limite]
    ids = [str(row['ID_C200']).strip() for row in raw]
    if not all(ids) or len(ids) != len(set(ids)):
        raise SystemExit('Hay identificadores vacíos o repetidos.')
    expected = {str(r['ID_C200']).strip(): str(r['C309_COD']).strip().removesuffix('.0').zfill(4) for r in raw}
    if any(len(code) != 4 or not code.isdigit() for code in expected.values()):
        raise SystemExit('Hay códigos de referencia inválidos.')
    records = [{'id_registro': str(r['ID_C200']).strip(), 'p309': r.get('C309', ''), 'p308': r.get('C308', ''),
                'p308a': r.get('C308A', ''), 'c309_1': r.get('C309_1', ''), 'c310': r.get('C310', ''),
                'c311': r.get('C311', ''), 'c366': r.get('C366', '')} for r in raw]
    outputs, versions = [], set()
    start = time.perf_counter()
    for offset in range(0, len(records), 50):
        batch = records[offset:offset + 50]
        payload = json.dumps({'contract_version':'1.0', 'run_id':'evaluacion-septiembre-local', 'records':batch}, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(args.url.rstrip('/') + '/v1/predict-batch', data=payload, headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=240) as response:
            result = json.load(response)
        rows = result.get('results', [])
        if result.get('contract_version') != '1.0' or len(rows) != len(batch) or {str(r.get('id_registro')) for r in rows} != {r['id_registro'] for r in batch}:
            raise ValueError('El servicio devolvió resultados incompletos o identificadores distintos.')
        versions.add(str(result.get('model_version')))
        for r in rows:
            identifier = str(r['id_registro'])
            candidates = r.get('candidatos') or []
            codes = [str(c.get('codigo') or '') for c in candidates]
            outputs.append({'id_registro': identifier, 'esperado': expected[identifier], 'top1': codes[0] if codes else '',
                            'top3': codes[:3], 'confianza': r.get('confianza_ml'), 'revision': bool(r.get('revision_manual'))})
        print(f'Procesados {min(offset + len(batch), len(records))}/{len(records)}', flush=True)
    if len(versions) != 1:
        raise ValueError('Cambió la versión del modelo durante la prueba.')
    count = len(outputs)
    if not count:
        raise ValueError('El CSV no tiene registros evaluables.')
    correct = sum(r['top1'] == r['esperado'] for r in outputs)
    top3 = sum(r['esperado'] in r['top3'] for r in outputs)
    thresholds = {}
    for threshold in (.90, .95):
        chosen = [r for r in outputs if not r['revision'] and r['confianza'] is not None and float(r['confianza']) >= threshold]
        thresholds[str(threshold)] = {'casos':len(chosen), 'cobertura':len(chosen) / count,
            'precision':sum(r['top1'] == r['esperado'] for r in chosen) / len(chosen) if chosen else None}
    report = {'modelo':next(iter(versions)), 'n':count, 'aciertos_top1':correct, 'top1':correct / count,
              'aciertos_top3':top3, 'top3':top3 / count, 'revision_directa':sum(r['revision'] for r in outputs),
              'umbrales':thresholds, 'segundos':round(time.perf_counter() - start, 2), 'resultados':outputs}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('x', encoding='utf-8') as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
    print(json.dumps({k:v for k,v in report.items() if k != 'resultados'}, ensure_ascii=False, indent=2), flush=True)

if __name__ == '__main__':
    main()
