# -*- coding: utf-8 -*-
"""
servicio.py  --  API HTTP local de la capa LLM (R3)

Es la puerta de entrada para R4 (dashboard) y para cualquier integracion.
Usa SOLO la libreria estandar de Python (http.server): no hay que instalar nada.

Endpoints
---------
  GET  /panel                       -> interfaz web para probar todo (abrir en el navegador)
  GET  /salud                       -> estado de Ollama, catalogo y base
  GET  /candidatos?texto=...        -> Top-3 sugerido (simula a R2; solo para pruebas)
  POST /codificar                   -> codifica 1 registro (o varios) y los guarda
  GET  /pendientes?run_id=&limite=   -> cola de revision humana
  GET  /decisiones?limite=&run_id=   -> ultimas decisiones
  POST /revisar                     -> el analista fija el codigo final de un caso
  GET  /metricas?run_id=            -> exactitud / cobertura / derivacion / latencia
  GET  /contrato                    -> JSON Schema del contrato vigente

Lo mas simple para empezar:  python panel.py   (levanta el servicio y abre el navegador)

Ejemplos
--------
  python servicio.py                       # levanta en http://127.0.0.1:8000
  python servicio.py --puerto 8080

  curl http://127.0.0.1:8000/salud

  curl -X POST http://127.0.0.1:8000/codificar -H "Content-Type: application/json" -d ^
    "{\"id_registro\":\"000123\",\"p309\":\"Crio pollos para venderlos.\",
      \"candidatos\":[{\"codigo\":\"0146\"},{\"codigo\":\"0150\"},{\"codigo\":\"0141\"}]}"

AVISO de latencia: en este equipo cada /codificar tarda ~10-40 s (CPU, sin GPU).
Para volumen, usar lote.py (batch). El servicio es para la demo y casos sueltos.
"""
import argparse
import csv
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import clasificador as clf
import contrato
import db as dbmod
import simulacion

BASE = os.path.dirname(os.path.abspath(__file__))
RUN_ID_DEFECTO = "servicio"
PROMPT_FILE = os.path.join(BASE, "prompts", "prompt_v3_breve.txt")
PANEL_HTML = os.path.join(BASE, "ui", "panel.html")

CATALOGO = None
CONN = None
PROMPT = None
FORMATO = None
CASOS_EJEMPLO = []
LOCK = threading.Lock()   # sqlite3 no es seguro entre hilos: se serializa el acceso


def cargar_casos_ejemplo(catalogo):
    """
    Casos listos para probar desde el panel: P309 + candidatos.
    Mezcla las entradas en formato R2 y los casos de prueba con candidatos simulados.
    """
    casos = []
    ruta = os.path.join(BASE, "datos", "entradas_ejemplo.csv")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                try:
                    cands = json.loads(row["candidatos"])
                except (KeyError, ValueError):
                    continue
                casos.append({"etiqueta": f"formato R2 · {row['id_registro']}",
                              "p309": row["p309"], "candidatos": cands})

    ruta = os.path.join(BASE, "datos", "casos_prueba.csv")
    if os.path.exists(ruta):
        import random
        rng = random.Random(42)
        with open(ruta, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                p309 = row.get("p309")
                cod = (row.get("c309_cod") or "").strip()
                if not (p309 and cod):
                    continue
                casos.append({
                    "etiqueta": f"prueba · {cod}",
                    "p309": p309,
                    "candidatos": simulacion.candidatos_simulados(cod, catalogo, k=3, rng=rng),
                })
    return casos


def _json(handler, obj, codigo=200):
    cuerpo = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(codigo)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(cuerpo)))
    handler.end_headers()
    handler.wfile.write(cuerpo)


def _html(handler, texto, codigo=200):
    cuerpo = texto.encode("utf-8")
    handler.send_response(codigo)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(cuerpo)))
    handler.end_headers()
    handler.wfile.write(cuerpo)


class Handler(BaseHTTPRequestHandler):
    server_version = "CodificadorCIIU/1.0"

    def log_message(self, fmt, *args):  # log compacto
        print(f"  {self.address_string()} {fmt % args}", flush=True)

    # ---------------- GET ----------------
    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}

        if u.path in ("/", "/panel"):
            with open(PANEL_HTML, encoding="utf-8") as f:
                return _html(self, f.read())

        if u.path == "/buscar":
            texto = q.get("texto", "")
            if not texto:
                return _json(self, {"error": "falta el parametro 'texto'"}, 400)
            res = simulacion.buscar_en_catalogo(texto, CATALOGO, limite=int(q.get("limite", 12)))
            return _json(self, {"resultados": res})

        if u.path == "/casos":
            return _json(self, {"casos": CASOS_EJEMPLO})

        if u.path == "/candidatos":
            texto = q.get("texto", "")
            if not texto:
                return _json(self, {"error": "falta el parametro 'texto'"}, 400)
            cands = simulacion.sugerir_candidatos(texto, CATALOGO, k=3)
            return _json(self, {"candidatos": cands,
                                "aviso": "sugerencia lexica: simula a R2, no es el modelo real"})

        if u.path == "/decisiones":
            with LOCK:
                filas = dbmod.recientes(CONN, int(q.get("limite", 20)), q.get("run_id"))
            return _json(self, {"decisiones": filas})

        if u.path in ("/salud",):
            ok, msg = clf.verificar_ollama()
            with LOCK:
                met = dbmod.metricas(CONN, q.get("run_id"))
            return _json(self, {
                "estado": "ok" if ok else "degradado",
                "ollama": msg,
                "modelo": clf.MODEL,
                "catalogo_clases": len(CATALOGO),
                "contrato_version": contrato.CONTRATO_VERSION,
                "metricas": met,
            })

        if u.path == "/contrato":
            return _json(self, {"contrato_version": contrato.CONTRATO_VERSION,
                                "entrada": contrato.ESQUEMA_ENTRADA,
                                "salida": contrato.ESQUEMA_SALIDA})

        if u.path == "/metricas":
            with LOCK:
                return _json(self, dbmod.metricas(CONN, q.get("run_id")))

        if u.path == "/pendientes":
            with LOCK:
                filas = dbmod.pendientes(CONN, q.get("run_id"),
                                         int(q["limite"]) if q.get("limite") else None)
            return _json(self, {"total": len(filas), "pendientes": [
                {"id": r[0], "id_registro": r[1], "p309": r[2], "candidatos": r[3],
                 "sugerencia_llm": r[4], "justificacion": r[5], "motivo": r[6], "run_id": r[7]}
                for r in filas]})

        return _json(self, {"error": "ruta no encontrada", "rutas": [
            "GET /panel", "GET /salud", "GET /candidatos?texto=", "GET /decisiones",
            "POST /codificar", "GET /pendientes", "POST /revisar",
            "GET /metricas", "GET /contrato"]}, 404)

    # ---------------- POST ----------------
    def do_POST(self):
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            cuerpo = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except (ValueError, UnicodeDecodeError) as e:
            return _json(self, {"error": f"JSON invalido: {e}"}, 400)

        if u.path == "/codificar":
            return self._codificar(cuerpo)
        if u.path == "/revisar":
            return self._revisar(cuerpo)
        return _json(self, {"error": "ruta no encontrada"}, 404)

    # ---------------- Acciones ----------------
    def _codificar(self, cuerpo):
        registro = cuerpo.get("registro", cuerpo)
        salida_contrato = None
        # Modo 1: una sola entrada del contrato
        if "id_registro" in registro and "p309" in registro:
            entradas = [registro]
        elif "registros" in registro:
            entradas = registro["registros"]
        else:
            return _json(self, {"error": "se espera 'id_registro'+'p309'+'candidatos' "
                                         "o {'registros': [...]}"}, 400)

        run_id = cuerpo.get("run_id", RUN_ID_DEFECTO)
        salidas = []
        for obj in entradas:
            ent, errs = contrato.normalizar_entrada(obj, CATALOGO)
            if errs:
                salidas.append({"id_registro": obj.get("id_registro"), "error": "; ".join(errs)})
                continue
            t0 = time.time()
            try:
                res = clf.clasificar(ent["p309"], ent["candidatos"], prompt=PROMPT, formato=FORMATO)
            except Exception as e:  # noqa: BLE001
                res = {"error": f"fallo de conexion: {e}"}
            sal = contrato.construir_salida(ent["id_registro"], res, clf.MODEL,
                                            time.time() - t0, run_id,
                                            confianza_ml=ent.get("confianza_ml"))
            with LOCK:
                dbmod.guardar_salida(CONN, sal, ent)
            salidas.append(sal)

        salida_contrato = salidas[0] if len(salidas) == 1 else {"resultados": salidas}
        return _json(self, salida_contrato)

    def _revisar(self, cuerpo):
        try:
            with LOCK:
                dbmod.revisar(CONN, cuerpo["id"], cuerpo["codigo"],
                              cuerpo.get("analista", "analista"))
        except (KeyError, ValueError) as e:
            return _json(self, {"error": str(e)}, 400)
        return _json(self, {"ok": True, "id": cuerpo["id"], "codigo_final": cuerpo["codigo"]})


def main():
    global CATALOGO, CONN, PROMPT, FORMATO, CASOS_EJEMPLO
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1", help="127.0.0.1 = solo local (seguro)")
    ap.add_argument("--puerto", type=int, default=8000)
    ap.add_argument("--db", default=dbmod.DB)
    ap.add_argument("--prompt", default=PROMPT_FILE)
    ap.add_argument("--formato", choices=["breve", "completo"], default="breve")
    args = ap.parse_args()

    CATALOGO = clf.cargar_catalogo()
    PROMPT = clf.cargar_prompt(args.prompt)
    FORMATO = clf.FORMAT_BREVE if args.formato == "breve" else clf.FORMAT
    CASOS_EJEMPLO = cargar_casos_ejemplo(CATALOGO)
    CONN = dbmod.conectar(args.db, check_same_thread=False)
    dbmod.cargar_catalogo(CONN, CATALOGO)

    ok, msg = clf.verificar_ollama()
    print(msg)

    srv = ThreadingHTTPServer((args.host, args.puerto), Handler)
    print(f"Catalogo: {len(CATALOGO)} clases | contrato v{contrato.CONTRATO_VERSION}")
    print(f"Escuchando en http://{args.host}:{args.puerto}")
    print("Ctrl+C para detener.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nDetenido.")
    finally:
        CONN.close()


if __name__ == "__main__":
    main()
