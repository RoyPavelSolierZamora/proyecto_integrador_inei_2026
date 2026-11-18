"""Crea el índice de fragmentos oficiales que usa el chat, solo con documentos del INEI y del EPEN.

Fuentes (carpeta Bibliografía/Doc_EPEN):
- Notas explicativas CIIU Rev.4 (ya extraídas en backend/src/data/notas-ciiu.json).
- Tabla oficial CIIU Rev.4 (PDF).
- Clasificador Nacional de Ocupaciones 2015 (PDF).
- Listado de Ocupaciones (xlsx, leído sin dependencias externas).

Uso:
  python backend/scripts/indexar-documentos.py "<carpeta Bibliografía/Doc_EPEN>"

Escribe .runtime/conocimiento/fragmentos.json (carpeta ignorada por Git). No envía nada a internet.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from pypdf import PdfReader

WINDOW = 900
OVERLAP = 150
ROOT = Path(__file__).resolve().parents[2]
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def windows(text, size=WINDOW, overlap=OVERLAP):
    start = 0
    while start < len(text):
        chunk = text[start:start + size].strip()
        if chunk:
            yield chunk
        start += size - overlap


def pdf_text(path):
    reader = PdfReader(path)
    lines = [' '.join(line.split()) for page in reader.pages for line in (page.extract_text() or '').splitlines()]
    return '\n'.join(line for line in lines if line)


def ciiu_notes_fragments():
    data = json.loads((ROOT / 'backend' / 'src' / 'data' / 'notas-ciiu.json').read_text(encoding='utf-8'))
    fragments = []
    for kind, label in [('divisiones', 'División'), ('grupos', 'Grupo'), ('clases', 'Clase')]:
        for item in data[kind]:
            body = f"{label} {item['codigo']} · {item['nombre']}. {item['notas']}".strip()
            for part in windows(body, overlap=0):
                fragments.append({'fuente': 'Notas explicativas CIIU Rev.4 (INEI)', 'codigo': item['codigo'], 'texto': part})
    return fragments


def ciiu_table_fragments(folder):
    path = folder / 'Tabla_Oficial_CIIU_Rev4.pdf'
    if not path.is_file():
        return []
    text = pdf_text(path)
    return [{'fuente': 'Tabla oficial CIIU Rev.4 (INEI)', 'codigo': None, 'texto': part} for part in windows(text)]


def cno_fragments(folder):
    path = folder / 'Clasificador Nacional de Ocupaciones 2015.pdf'
    if not path.is_file():
        return []
    text = pdf_text(path)
    fragments, last_code = [], None
    for part in windows(text):
        codes = re.findall(r'(?m)^(\d{4})\s', part)
        if codes:
            last_code = codes[-1]
        fragments.append({'fuente': 'Clasificador Nacional de Ocupaciones 2015 (INEI)', 'codigo': last_code, 'texto': part.replace('\n', ' ')})
    return fragments


def xlsx_rows(path):
    """Lee la primera hoja de un .xlsx con la biblioteca estándar (zip + XML)."""
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            for item in root.findall('m:si', NS):
                shared.append(''.join(node.text or '' for node in item.iter(f'{{{NS["m"]}}}t')))
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        for row in sheet.iter(f'{{{NS["m"]}}}row'):
            values = []
            for cell in row.findall('m:c', NS):
                node = cell.find('m:v', NS)
                if node is None or node.text is None:
                    continue
                value = shared[int(node.text)] if cell.get('t') == 's' else node.text
                values.append(str(value).strip())
            if values:
                yield ' | '.join(values)


def listado_fragments(folder):
    path = folder / 'Listado de Ocupaciones.xlsx'
    if not path.is_file():
        return []
    rows = list(xlsx_rows(path))
    fragments = []
    for index in range(0, len(rows), 25):
        block = ' ; '.join(rows[index:index + 25])
        for part in windows(block, overlap=0):
            fragments.append({'fuente': 'Listado de Ocupaciones (INEI)', 'codigo': None, 'texto': part})
    return fragments


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Indica la carpeta Bibliografía/Doc_EPEN.')
    folder = Path(sys.argv[1])
    fragments = ciiu_notes_fragments() + ciiu_table_fragments(folder) + cno_fragments(folder) + listado_fragments(folder)
    out = ROOT / '.runtime' / 'conocimiento' / 'fragmentos.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fragments, ensure_ascii=False), encoding='utf-8')
    by_source = {}
    for item in fragments:
        by_source[item['fuente']] = by_source.get(item['fuente'], 0) + 1
    print(f'{len(fragments)} fragmentos escritos en {out}')
    for source, count in by_source.items():
        print(f'  {count:5d}  {source}')


if __name__ == '__main__':
    main()
