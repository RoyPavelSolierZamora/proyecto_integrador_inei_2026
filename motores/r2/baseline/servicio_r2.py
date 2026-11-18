# -*- coding: utf-8 -*-
"""API HTTP del baseline R2 basado en casos históricos."""

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from motor import MotorR2, cargar_catalogo, cargar_casos


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[2]
DEFAULT_CATALOG = PROJECT / "motores" / "r3" / "datos" / "catalogo_ciiu.csv"
MAX_BODY_BYTES = 4 * 1024 * 1024


def send_json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def build_handler(engine):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print("R2-BASELINE", fmt % args)

        def do_GET(self):
            if self.path == "/salud":
                return send_json(self, {
                    "estado": "ok",
                    "servicio": "r2-baseline",
                    "modelo": engine.model_version,
                    "simulado": False,
                    "contrato_version": "1.0",
                    "casos_entrenamiento": len(engine.cases),
                    "clases_observadas": len(engine.centroids),
                    "calibracion": "provisional-no-productiva",
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
                results = [engine.predict(item) for item in records]
                return send_json(self, {
                    "contract_version": "1.0",
                    "model_version": engine.model_version,
                    "run_id": payload.get("run_id"),
                    "results": results,
                })
            except (ValueError, UnicodeDecodeError, AttributeError, json.JSONDecodeError) as error:
                return send_json(self, {"error": f"Solicitud inválida: {error}"}, 400)

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Servicio baseline R2 EPEN")
    parser.add_argument("--datos", default=os.getenv("R2_TRAINING_CSV"), help="CSV histórico con C309 y C309_COD")
    parser.add_argument("--catalogo", default=os.getenv("R2_CATALOG_CSV", str(DEFAULT_CATALOG)))
    parser.add_argument("--puerto", type=int, default=int(os.getenv("R2_PORT", "8100")))
    parser.add_argument("--similitud-minima", type=float, default=float(os.getenv("R2_MIN_SIMILARITY", "0.18")))
    args = parser.parse_args()
    if not args.datos:
        parser.error("Indica --datos o la variable R2_TRAINING_CSV.")
    catalog = cargar_catalogo(args.catalogo)
    cases = cargar_casos(args.datos, catalog)
    engine = MotorR2(catalog, min_similarity=args.similitud_minima).fit(cases)
    server = ThreadingHTTPServer(("127.0.0.1", args.puerto), build_handler(engine))
    print(f"R2 BASELINE listo en http://127.0.0.1:{args.puerto}")
    print(f"Modelo: {engine.model_version}; casos={len(cases)}; clases={len(engine.centroids)}")
    print("Confianza provisional: usar para asistencia y Qwen, no para desempeño productivo.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
