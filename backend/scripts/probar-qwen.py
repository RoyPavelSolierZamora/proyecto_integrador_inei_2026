# -*- coding: utf-8 -*-
"""Prueba de humo local de la API R3 con un caso sintético difícil."""

import json
import urllib.request


payload = {
    "run_id": "qa_dashboard",
    "registro": {
        "id_registro": "EPEN-SYN-2027T1-0002-QA",
        "p309": "Realiza servicio de mototaxi para trasladar pasajeros por el distrito.",
        "confianza_ml": 0.46,
        "candidatos": [
            {
                "codigo": "4922",
                "descripcion": "OTRAS ACTIVIDADES DE TRANSPORTE POR VÍA TERRESTRE",
                "prob": 0.46,
            },
            {
                "codigo": "4921",
                "descripcion": "TRANSPORTE URBANO Y SUBURBANO DE PASAJEROS POR VÍA TERRESTRE",
                "prob": 0.42,
            },
            {
                "codigo": "4923",
                "descripcion": "TRANSPORTE DE CARGA POR CARRETERA",
                "prob": 0.05,
            },
        ],
    },
}

request = urllib.request.Request(
    "http://127.0.0.1:8000/codificar",
    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    headers={"Content-Type": "application/json; charset=utf-8"},
)

with urllib.request.urlopen(request, timeout=120) as response:
    result = json.loads(response.read().decode("utf-8"))

print(json.dumps(result, ensure_ascii=False, indent=2))
