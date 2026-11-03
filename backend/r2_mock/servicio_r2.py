# -*- coding: utf-8 -*-
"""Microservicio R2 simulado. Solo prueba el contrato; no es un modelo estadístico."""

import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


MODEL_VERSION = "r2-mock-contract-0.1"

RULES = [
    (("restaurante", "almuerzo", "comida", "menú"), [("5610", "ACTIVIDADES DE RESTAURANTES Y DE SERVICIO MÓVIL DE COMIDAS", .78), ("5621", "SUMINISTRO DE COMIDAS POR ENCARGO", .14), ("5630", "ACTIVIDADES DE SERVICIO DE BEBIDAS", .05)]),
    (("mototaxi", "pasajero", "transporte"), [("4922", "OTRAS ACTIVIDADES DE TRANSPORTE POR VÍA TERRESTRE", .55), ("4921", "TRANSPORTE URBANO Y SUBURBANO DE PASAJEROS", .36), ("4923", "TRANSPORTE DE CARGA POR CARRETERA", .04)]),
    (("fruta", "verdura", "mercado", "puesto"), [("4781", "VENTA DE ALIMENTOS EN PUESTOS Y MERCADOS", .68), ("4721", "VENTA DE ALIMENTOS EN COMERCIOS ESPECIALIZADOS", .20), ("4711", "COMERCIO NO ESPECIALIZADO CON PREDOMINIO DE ALIMENTOS", .08)]),
    (("constru", "vivienda", "edificio"), [("4100", "CONSTRUCCIÓN DE EDIFICIOS", .82), ("4390", "OTRAS ACTIVIDADES ESPECIALIZADAS DE CONSTRUCCIÓN", .10), ("4210", "CONSTRUCCIÓN DE CARRETERAS Y VÍAS", .03)]),
    (("limpieza", "limpia", "oficina"), [("8121", "LIMPIEZA GENERAL DE EDIFICIOS", .76), ("9700", "HOGARES COMO EMPLEADORES DE PERSONAL DOMÉSTICO", .16), ("8129", "OTRAS ACTIVIDADES DE LIMPIEZA", .04)]),
    (("hogar", "familia", "cocina", "casa particular"), [("9700", "HOGARES COMO EMPLEADORES DE PERSONAL DOMÉSTICO", .66), ("8121", "LIMPIEZA GENERAL DE EDIFICIOS", .18), ("5610", "ACTIVIDADES DE RESTAURANTES", .05)]),
    (("web", "program", "sistema", "software"), [("6201", "PROGRAMACIÓN INFORMÁTICA", .84), ("6202", "CONSULTORÍA INFORMÁTICA", .09), ("6311", "PROCESAMIENTO DE DATOS", .03)]),
    (("hospital", "clínica", "paciente"), [("8610", "ACTIVIDADES DE HOSPITALES", .64), ("8620", "ACTIVIDADES DE MÉDICOS Y ODONTÓLOGOS", .24), ("8690", "OTRAS ACTIVIDADES DE ATENCIÓN DE LA SALUD", .07)]),
    (("pollo", "gallina", "aves"), [("0146", "CRÍA DE AVES DE CORRAL", .81), ("0149", "CRÍA DE OTROS ANIMALES", .08), ("0150", "CULTIVO DE PRODUCTOS AGRÍCOLAS EN COMBINACIÓN CON CRÍA", .04)]),
    (("automóvil", "auto", "freno", "motor"), [("4520", "MANTENIMIENTO Y REPARACIÓN DE VEHÍCULOS AUTOMOTORES", .75), ("4530", "VENTA DE PARTES DE VEHÍCULOS", .12), ("4510", "VENTA DE VEHÍCULOS AUTOMOTORES", .05)]),
    (("cabello", "belleza", "salón", "tinte"), [("9602", "PELUQUERÍA Y OTROS TRATAMIENTOS DE BELLEZA", .79), ("9609", "OTRAS ACTIVIDADES DE SERVICIOS PERSONALES", .09), ("4772", "VENTA DE PRODUCTOS FARMACÉUTICOS Y COSMÉTICOS", .04)]),
]


def normalize(value):
    replacements = str.maketrans("áéíóúüñ", "aeiouun")
    return re.sub(r"\s+", " ", str(value or "").lower().translate(replacements)).strip()


def predict(record):
    text = normalize(" ".join((record.get("p309", ""), record.get("p308", ""), record.get("p308a", ""))))
    best = None
    best_hits = 0
    for keywords, candidates in RULES:
        hits = sum(normalize(word) in text for word in keywords)
        if hits > best_hits:
            best, best_hits = candidates, hits
    if not best:
        return {"id_registro": record.get("id_registro"), "revision_manual": True, "motivo": "El simulador R2 no encontró una regla léxica aplicable."}
    return {
        "id_registro": record.get("id_registro"),
        "confianza_ml": best[0][2],
        "candidatos": [
            {"codigo": code, "descripcion": description, "prob": probability, "rank": index + 1}
            for index, (code, description, probability) in enumerate(best)
        ],
    }


def send_json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("R2", fmt % args)

    def do_GET(self):
        if self.path == "/salud":
            return send_json(self, {"estado": "ok", "servicio": "r2-mock", "modelo": MODEL_VERSION, "simulado": True, "contrato_version": "1.0"})
        return send_json(self, {"error": "Ruta no encontrada."}, 404)

    def do_POST(self):
        if self.path != "/v1/predict-batch":
            return send_json(self, {"error": "Ruta no encontrada."}, 404)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            records = payload.get("records")
            if payload.get("contract_version") != "1.0" or not isinstance(records, list) or not 1 <= len(records) <= 500:
                return send_json(self, {"error": "Se requiere contrato v1.0 y entre 1 y 500 registros."}, 400)
            if any(not item.get("id_registro") or not item.get("p309") for item in records):
                return send_json(self, {"error": "Cada registro requiere id_registro y p309."}, 400)
            return send_json(self, {"contract_version": "1.0", "model_version": MODEL_VERSION, "run_id": payload.get("run_id"), "results": [predict(item) for item in records]})
        except (ValueError, UnicodeDecodeError, AttributeError) as error:
            return send_json(self, {"error": f"Solicitud inválida: {error}"}, 400)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8100), Handler)
    print("R2 SIMULADO listo en http://127.0.0.1:8100")
    print("Solo prueba el contrato; reemplazar por el modelo real del equipo R2.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

