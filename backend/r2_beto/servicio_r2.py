"""BETO V2 EPEN: servicio experimental del contrato R2, solo para modelos de confianza."""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from http.server import ThreadingHTTPServer

import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE.parent / 'r2_advanced'))
from motor import cargar_catalogo, evaluar_calidad  # noqa: E402
from servicio_r2 import build_handler  # noqa: E402

SECTOR = {'1': 'AGROPECUARIA AGRICOLA O PECUARIA', '2': 'NO AGROPECUARIA NI PESCA', '3': 'PESCA'}
C310 = dict(enumerate(['EMPLEADOR O PATRONO', 'TRABAJADOR INDEPENDIENTE', 'EMPLEADO U OBRERO', 'AYUDANTE EN NEGOCIO DE LA FAMILIA', 'AYUDANTE EN EMPLEO DE UN FAMILIAR', 'TRABAJADOR DEL HOGAR', 'APRENDIZ O PRACTICANTE REMUNERADO', 'PRACTICANTE SIN REMUNERACION', 'AYUDANTE EN NEGOCIO DE FAMILIA DE OTRO HOGAR', 'AYUDANTE EN EMPLEO DE FAMILIAR DE OTRO HOGAR'], 1))
C311 = dict(enumerate(['FUERZAS ARMADAS O POLICIA NACIONAL', 'ADMINISTRACION PUBLICA ESTADO', 'EMPRESA PUBLICA', 'EMPRESA ESPECIAL DE SERVICIOS SERVICE', 'EMPRESA O PATRONO PRIVADO', 'OTRA ENTIDAD'], 1))
C366 = dict(enumerate(['SIN NIVEL', 'INICIAL', 'PRIMARIA INCOMPLETA', 'PRIMARIA COMPLETA', 'SECUNDARIA INCOMPLETA', 'SECUNDARIA COMPLETA', 'BASICA ESPECIAL', 'SUPERIOR NO UNIVERSITARIA INCOMPLETA', 'SUPERIOR NO UNIVERSITARIA COMPLETA', 'SUPERIOR UNIVERSITARIA INCOMPLETA', 'SUPERIOR UNIVERSITARIA COMPLETA', 'MAESTRIA O DOCTORADO'], 1))

def categorical(value, mapping, fallback):
    value = str(value or '').strip().removesuffix('.0')
    return mapping.get(value, mapping.get(int(value), fallback) if value.isdigit() else fallback)

def input_text(record):
    def text(name):
        return str(record.get(name) or 'SIN DATO').strip().upper()
    return ('RAMA: ' + text('p309') + ' | SECTOR PRIMARIO: ' + categorical(record.get('c309_1'), SECTOR, 'NO ESPECIFICADO')
            + ' | OCUPACION: ' + text('p308') + ' | TAREAS: ' + text('p308a')
            + ' | CATEGORIA: ' + categorical(record.get('c310'), C310, 'NO ESPECIFICADO')
            + ' | ENTIDAD: ' + categorical(record.get('c311'), C311, 'INDEPENDIENTE O HOGAR')
            + ' | EDUCACION: ' + categorical(record.get('c366'), C366, 'NO ESPECIFICADO'))

class BetoEngine:
    def __init__(self, folder, catalog):
        self.catalog = catalog
        self.tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True)
        self.model = AutoModelForSequenceClassification.from_pretrained(folder, local_files_only=True).eval()
        # Este archivo pickle debe proceder exclusivamente del equipo autorizado.
        self.classes = np.load(folder / 'clases_ciiu.npy', allow_pickle=True)
        self.classes = [str(x).strip().removesuffix('.0').zfill(4) for x in self.classes]
        if len(self.classes) != self.model.config.num_labels or len(set(self.classes)) != len(self.classes):
            raise ValueError('El mapa de clases no coincide con el modelo.')
        if any(code not in catalog for code in self.classes):
            raise ValueError('El modelo contiene clases que no están en el catálogo CIIU.')
        digest = hashlib.sha256((folder / 'model.safetensors').read_bytes()).hexdigest()[:12]
        self.model_version = 'beto-v2-experimental-no-calibrado+' + digest
        self.training_count = 0
        self.training_classes = len(self.classes)
        self.calibration_count = 0
        self.calibration_label = 'softmax-sin-calibrar'
        self.history_cases = []

    def predict_batch(self, records):
        results = []
        for start in range(0, len(records), 8):
            chunk = records[start:start + 8]
            inputs = self.tokenizer([input_text(r) for r in chunk], padding='max_length', truncation=True, max_length=128, return_tensors='pt')
            with torch.inference_mode():
                scores = torch.softmax(self.model(**inputs).logits, dim=-1)
                probabilities, indices = torch.topk(scores, k=3, dim=-1)
            for record, probs, ids in zip(chunk, probabilities.tolist(), indices.tolist()):
                quality = evaluar_calidad(record)
                item = {'id_registro': str(record.get('id_registro') or ''), 'calibracion': self.calibration_label, 'calidad_entrada': quality}
                if quality['nivel'] == 'baja':
                    item.update(revision_manual=True, motivo='Respuesta insuficiente para clasificar.')
                else:
                    item['confianza_ml'] = float(probs[0])
                    item['candidatos'] = [{'codigo': self.classes[idx], 'descripcion': self.catalog[self.classes[idx]], 'prob': float(prob), 'rank': rank} for rank, (prob, idx) in enumerate(zip(probs, ids), 1)]
                results.append(item)
        return results

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--modelo', default=os.environ.get('R2_BETO_MODEL_PATH'), help='Carpeta local del modelo facilitado por el equipo')
    parser.add_argument('--puerto', type=int, default=8100)
    args = parser.parse_args()
    if not args.modelo:
        parser.error('Indica --modelo o R2_BETO_MODEL_PATH.')
    folder = Path(args.modelo).resolve()
    catalog = cargar_catalogo(BASE.parent.parent / 'r3_local' / 'datos' / 'catalogo_ciiu.csv')
    engine = BetoEngine(folder, catalog)
    # Salud distinta evita que el iniciador confunda este motor con R2 avanzado.
    handler = build_handler(engine)
    original = handler.do_GET
    def health(self):
        if self.path == '/salud':
            from servicio_r2 import send_json
            return send_json(self, {'estado': 'ok', 'servicio': 'r2-beto', 'modelo': engine.model_version, 'contrato_version': '1.0', 'calibracion': engine.calibration_label})
        return original(self)
    handler.do_GET = health
    print(f'BETO experimental listo en 127.0.0.1:{args.puerto}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.puerto), handler).serve_forever()

if __name__ == '__main__':
    main()
