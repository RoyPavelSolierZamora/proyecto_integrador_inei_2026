# -*- coding: utf-8 -*-
"""API HTTP del R2 avanzado, compatible con el contrato R2 v1.0."""

import argparse
import hashlib
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import joblib

from motor import MODEL_FAMILY, MotorR2Avanzado, cargar_catalogo, cargar_casos


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[2]
DEFAULT_CATALOG = PROJECT / "motores" / "r3" / "datos" / "catalogo_ciiu.csv"
DEFAULT_CACHE = PROJECT / ".runtime" / "r2-models"
MAX_BODY_BYTES = 4 * 1024 * 1024


def send_json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def cache_key(data_path, catalog_path):
    digest = hashlib.sha256(MODEL_FAMILY.encode("utf-8"))
    for path in (Path(data_path).resolve(), Path(catalog_path).resolve()):
        stat = path.stat()
        digest.update(f"|{path}|{stat.st_size}|{stat.st_mtime_ns}".encode("utf-8"))
    return digest.hexdigest()[:20]


def load_or_train(data_path, catalog_path, cache_dir):
    catalog = cargar_catalogo(catalog_path)
    cache_root = Path(cache_dir)
    cache_root.mkdir(parents=True, exist_ok=True)
    cache_path = cache_root / f"{cache_key(data_path, catalog_path)}.joblib"
    if cache_path.exists():
        engine = joblib.load(cache_path)
        if isinstance(engine, MotorR2Avanzado) and engine.model_version.startswith(MODEL_FAMILY):
            print(f"R2 ADVANCED cargado desde cache local: {cache_path}")
            return engine
    cases = cargar_casos(data_path, catalog)
    print(f"Entrenando R2 ADVANCED con {len(cases)} casos; el primer inicio puede tardar varios minutos...")
    engine = MotorR2Avanzado(catalog).fit(cases)
    temporary = cache_path.with_suffix(".tmp")
    joblib.dump(engine, temporary, compress=3)
    os.replace(temporary, cache_path)
    print(f"Modelo local guardado en cache: {cache_path}")
    return engine


def build_handler(engine):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print("R2-ADVANCED", fmt % args)

        def do_GET(self):
            if self.path == "/salud":
                return send_json(self, {
                    "estado": "ok",
                    "servicio": "r2-advanced",
                    "modelo": engine.model_version,
                    "simulado": False,
                    "contrato_version": "1.0",
                    "casos_entrenamiento": engine.training_count,
                    "casos_historicos": len(engine.history_cases),
                    "clases_observadas": engine.training_classes,
                    "casos_calibracion": engine.calibration_count,
                    "calibracion": engine.calibration_label,
                })
            return send_json(self, {"error": "Ruta no encontrada."}, 404)

        def do_POST(self):
            if self.path != "/v1/predict-batch":
                return send_json(self, {"error": "Ruta no encontrada."}, 404)
            try:
                length = int(self.headers.get("Content-Length") or 0)
                if length < 1 or length > MAX_BODY_BYTES:
                    return send_json(self, {"error": "Tamaño de solicitud inválido."}, 413)
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                records = payload.get("records")
                if payload.get("contract_version") != "1.0" or not isinstance(records, list):
                    return send_json(self, {"error": "Se requiere el contrato v1.0."}, 400)
                if not 1 <= len(records) <= 500:
                    return send_json(self, {"error": "El lote debe contener entre 1 y 500 registros."}, 413)
                if any(not isinstance(item, dict) or not str(item.get("id_registro") or "").strip() for item in records):
                    return send_json(self, {"error": "Cada registro requiere id_registro."}, 422)
                results = engine.predict_batch(records)
                return send_json(self, {
                    "contract_version": "1.0",
                    "model_version": engine.model_version,
                    "run_id": payload.get("run_id"),
                    "results": results,
                })
            except (ValueError, UnicodeDecodeError, AttributeError, json.JSONDecodeError) as error:
                return send_json(self, {"error": f"Solicitud inválida: {error}"}, 400)
            except Exception as error:
                print(f"R2-ADVANCED error interno: {error}")
                return send_json(self, {"error": "El modelo R2 no pudo completar la predicción."}, 500)

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Servicio R2 avanzado EPEN")
    parser.add_argument("--datos", default=os.getenv("R2_TRAINING_CSV"), help="CSV histórico con C309 y C309_COD")
    parser.add_argument("--catalogo", default=os.getenv("R2_CATALOG_CSV", str(DEFAULT_CATALOG)))
    parser.add_argument("--cache", default=os.getenv("R2_MODEL_CACHE", str(DEFAULT_CACHE)))
    parser.add_argument("--puerto", type=int, default=int(os.getenv("R2_PORT", "8100")))
    args = parser.parse_args()
    if not args.datos:
        parser.error("Indica --datos o la variable R2_TRAINING_CSV.")
    engine = load_or_train(args.datos, args.catalogo, args.cache)
    server = ThreadingHTTPServer(("127.0.0.1", args.puerto), build_handler(engine))
    print(f"R2 ADVANCED listo en http://127.0.0.1:{args.puerto}")
    print(
        f"Modelo: {engine.model_version}; entrenamiento={engine.training_count}; "
        f"historicos={len(engine.history_cases)}; clases={engine.training_classes}; "
        f"calibracion={engine.calibration_label}"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
