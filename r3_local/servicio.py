# -*- coding: utf-8 -*-
"""API local mínima de R3 para el dashboard EPEN.

El backend R4 conserva la persistencia y la auditoría en PostgreSQL. Este
microservicio tiene una sola responsabilidad: validar la entrada R2 y consultar
Qwen mediante Ollama. Solo usa la biblioteca estándar de Python.

Endpoints:
  GET  /salud      estado de Ollama, modelo, catálogo y contrato
  GET  /contrato   esquema del contrato R2 -> R3 -> R4
  POST /codificar  clasifica uno o varios registros
"""
import argparse
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import clasificador as clf
import contrato


BASE = os.path.dirname(os.path.abspath(__file__))
PROMPT_FILE = os.path.join(BASE, "prompts", "prompt_v3_breve.txt")
MAX_BODY_BYTES = 2 * 1024 * 1024

CATALOGO = None
PROMPT = None
FORMATO = None


def send_json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    server_version = "EPEN-R3/1.0"

    def log_message(self, fmt, *args):
        print(f"R3 {self.address_string()} {fmt % args}", flush=True)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/salud":
            ok, message = clf.verificar_ollama()
            return send_json(self, {
                "estado": "ok" if ok else "degradado",
                "ollama": message,
                "modelo": clf.MODEL,
                "catalogo_clases": len(CATALOGO),
                "contrato_version": contrato.CONTRATO_VERSION,
            })
        if path == "/contrato":
            return send_json(self, {
                "contrato_version": contrato.CONTRATO_VERSION,
                "entrada": contrato.ESQUEMA_ENTRADA,
                "salida": contrato.ESQUEMA_SALIDA,
            })
        return send_json(self, {"error": "Ruta no encontrada."}, 404)

    def do_POST(self):
        if urlparse(self.path).path != "/codificar":
            return send_json(self, {"error": "Ruta no encontrada."}, 404)

        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length < 1 or length > MAX_BODY_BYTES:
                return send_json(self, {"error": "Tamaño de solicitud inválido."}, 413)
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            return send_json(self, {"error": f"JSON inválido: {error}"}, 400)

        wrapped = payload.get("registro", payload)
        if isinstance(wrapped, dict) and "registros" in wrapped:
            records = wrapped["registros"]
        else:
            records = [wrapped]
        if not isinstance(records, list) or not 1 <= len(records) <= 100:
            return send_json(self, {"error": "Se requieren entre 1 y 100 registros."}, 400)

        run_id = str(payload.get("run_id") or "r3_api")
        results = [classify_record(item, run_id) for item in records]
        return send_json(self, results[0] if len(results) == 1 else {"resultados": results})


def classify_record(item, run_id):
    if not isinstance(item, dict):
        return {"id_registro": None, "error": "El registro debe ser un objeto."}
    normalized, errors = contrato.normalizar_entrada(item, CATALOGO)
    if errors:
        return {"id_registro": item.get("id_registro"), "error": "; ".join(errors)}

    started = time.time()
    try:
        response = clf.clasificar(
            normalized["p309"], normalized["candidatos"], prompt=PROMPT, formato=FORMATO,
        )
    except Exception as error:  # La salida contractual deriva los fallos a revisión humana.
        response = {"error": f"Fallo de conexión con Ollama: {error}"}
    return contrato.construir_salida(
        normalized["id_registro"], response, clf.MODEL, time.time() - started, run_id,
        confianza_ml=normalized.get("confianza_ml"),
    )


def main():
    global CATALOGO, PROMPT, FORMATO
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1", help="Mantener 127.0.0.1 para uso local seguro.")
    parser.add_argument("--puerto", type=int, default=8000)
    parser.add_argument("--prompt", default=PROMPT_FILE)
    args = parser.parse_args()

    CATALOGO = clf.cargar_catalogo()
    PROMPT = clf.cargar_prompt(args.prompt)
    FORMATO = clf.FORMAT_BREVE

    _, message = clf.verificar_ollama()
    print(message, flush=True)
    server = ThreadingHTTPServer((args.host, args.puerto), Handler)
    print(
        f"R3 listo en http://{args.host}:{args.puerto} | "
        f"{len(CATALOGO)} clases CIIU | contrato v{contrato.CONTRATO_VERSION}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
