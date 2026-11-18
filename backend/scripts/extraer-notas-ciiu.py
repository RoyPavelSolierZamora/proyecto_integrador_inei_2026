"""Extrae las notas explicativas CIIU Rev.4 (INEI) a un JSON por clase de cuatro dígitos.

Uso:
  python backend/scripts/extraer-notas-ciiu.py "<ruta al PDF de notas explicativas>"

Genera backend/src/data/notas-ciiu-clases.json. Solo lee el PDF oficial; no envía nada a internet.
"""
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

# El PDF usa guiones de distintos tipos (-, –, —) y a veces parte la línea de "Clase:".
HEADER = re.compile(r'^Clase:\s*(\d{4})\s*[^\w\s]{0,3}\s*(.+)$')
STOP = re.compile(r'^(Clase:|Grupo:|Divisi[oó]n:|SECCI[ÓO]N|III\.|NOTAS EXPLICATIVAS)')
NOISE = re.compile(r'CLASIFICACI[ÓO]N INDUSTRIAL|^-\s*\d+\s*-$')
MAX_CHARS = 1500


def extract(pdf_path):
    reader = PdfReader(pdf_path)
    lines = []
    for page in reader.pages:
        for raw in (page.extract_text() or '').splitlines():
            line = ' '.join(raw.split())
            if line and not NOISE.search(line):
                lines.append(line)

    # Une "Clase:" con el código cuando el PDF lo parte en dos líneas.
    joined = []
    for line in lines:
        if joined and joined[-1] in ('Clase:', 'Clase: ') or (joined and re.fullmatch(r'Clase:\s*', joined[-1])):
            joined[-1] = f'{joined[-1]} {line}'.strip()
        else:
            joined.append(line)
    lines = joined

    classes = {}
    current = None
    for line in lines:
        header = HEADER.match(line)
        if header:
            current = header.group(1)
            classes[current] = {'codigo': current, 'nombre': header.group(2).strip(), 'notas': '', 'cuerpo': False}
            continue
        if current and STOP.match(line):
            current = None
            continue
        if current:
            entry = classes[current]
            # Antes del texto explicativo, las líneas que siguen al encabezado completan el nombre.
            if not entry['cuerpo'] and not re.match(r'^(Esta|Este|Incluye|Comprende|Se )', line):
                entry['nombre'] = f"{entry['nombre']} {line}".strip()
                continue
            entry['cuerpo'] = True
            entry['notas'] = f"{entry['notas']} {line}".strip()

    for item in classes.values():
        item.pop('cuerpo', None)
        item['notas'] = item['notas'][:MAX_CHARS]
    return [classes[code] for code in sorted(classes)]


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Indica la ruta del PDF de notas explicativas CIIU Rev.4.')
    pdf = Path(sys.argv[1])
    if not pdf.is_file():
        raise SystemExit(f'No existe el archivo: {pdf}')
    records = extract(pdf)
    if len(records) < 300:
        raise SystemExit(f'Solo se encontraron {len(records)} clases; revisa el PDF.')
    out = Path(__file__).resolve().parents[1] / 'src' / 'data' / 'notas-ciiu-clases.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(records)} clases escritas en {out}')


if __name__ == '__main__':
    main()
