"""Extrae las notas explicativas CIIU Rev.4 (INEI) a JSON: divisiones, grupos y clases.

Uso:
  python backend/scripts/extraer-notas-ciiu.py "<ruta al PDF de notas explicativas>"

Genera backend/src/data/notas-ciiu.json con las claves "divisiones", "grupos" y "clases".
Solo lee el PDF oficial; no envía nada a internet.
"""
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

# El PDF usa guiones de distintos tipos (-, –, —) y a veces parte la línea del encabezado.
DIVISION = re.compile(r'^Divisi[oó]n:\s*(\d{2})\s*[^\w\s]{0,3}\s*(.+)$')
GROUP = re.compile(r'^Grupo:\s*(\d{3})\s*[^\w\s]{0,3}\s*(.+)$')
CLASS = re.compile(r'^Clase:\s*(\d{4})\s*[^\w\s]{0,3}\s*(.+)$')
ANY_HEADER = re.compile(r'^(Clase:|Grupo:|Divisi[oó]n:|SECCI[ÓO]N|III\.|NOTAS EXPLICATIVAS)')
NOISE = re.compile(r'CLASIFICACI[ÓO]N INDUSTRIAL|^-\s*\d+\s*-$')
EXPLAIN_START = re.compile(r'^(Esta|Este|Incluye|Comprende|Se |Comprende)')
MAX_CHARS = 1500


def read_lines(pdf_path):
    reader = PdfReader(pdf_path)
    lines = []
    for page in reader.pages:
        for raw in (page.extract_text() or '').splitlines():
            line = ' '.join(raw.split())
            if line and not NOISE.search(line):
                lines.append(line)
    # Une "Clase:", "Grupo:" o "División:" con el código cuando el PDF lo parte en dos líneas.
    joined = []
    for line in lines:
        if joined and re.fullmatch(r'(Clase|Grupo|Divisi[oó]n):\s*', joined[-1]):
            joined[-1] = f'{joined[-1]} {line}'.strip()
        else:
            joined.append(line)
    return joined


def parse(lines, pattern, size):
    items = {}
    current = None
    for line in lines:
        header = pattern.match(line)
        if header:
            current = header.group(1)
            items[current] = {'codigo': current, 'nombre': header.group(2).strip(), 'notas': '', 'cuerpo': False}
            continue
        if current and ANY_HEADER.match(line):
            current = None
            continue
        if current:
            entry = items[current]
            # Las líneas antes del texto explicativo completan el nombre (título partido).
            if not entry['cuerpo'] and not EXPLAIN_START.match(line):
                entry['nombre'] = f"{entry['nombre']} {line}".strip()
                continue
            entry['cuerpo'] = True
            entry['notas'] = f"{entry['notas']} {line}".strip()
    for item in items.values():
        item.pop('cuerpo', None)
        item['notas'] = item['notas'][:MAX_CHARS]
    return [items[code] for code in sorted(items)]


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Indica la ruta del PDF de notas explicativas CIIU Rev.4.')
    pdf = Path(sys.argv[1])
    if not pdf.is_file():
        raise SystemExit(f'No existe el archivo: {pdf}')
    lines = read_lines(pdf)
    data = {
        'divisiones': parse(lines, DIVISION, 2),
        'grupos': parse(lines, GROUP, 3),
        'clases': parse(lines, CLASS, 4),
    }
    if len(data['clases']) < 300 or len(data['divisiones']) < 20:
        raise SystemExit(f"Extracción incompleta: {len(data['clases'])} clases y {len(data['divisiones'])} divisiones.")
    out = Path(__file__).resolve().parents[1] / 'src' / 'data' / 'notas-ciiu.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"{len(data['divisiones'])} divisiones, {len(data['grupos'])} grupos y {len(data['clases'])} clases en {out}")


if __name__ == '__main__':
    main()
