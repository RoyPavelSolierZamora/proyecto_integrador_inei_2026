# -*- coding: utf-8 -*-
"""
clasificador.py
Capa LLM (Qwen3 via Ollama) para la codificacion asistida P309 -> CIIU Rev.4.

Solo libreria estandar. No requiere el paquete `ollama`.

Responsabilidad UNICA: dado un texto P309 y un Top-K de candidatos (que vienen
de R2), devolver una decision validada. No decide politica de derivacion ni
escribe en base de datos: eso lo hacen contrato.py / lote.py / servicio.py.

Contiene:
  - cargar_catalogo()  : lee catalogo_ciiu.csv -> {codigo: descripcion}
  - clasificar()       : llama a Qwen3, valida anti-alucinacion, mide tiempos
  - verificar_ollama() : comprueba que el servicio y el modelo esten disponibles
"""
import json
import os
import urllib.error
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
DATOS = os.path.join(BASE, "datos")
PROMPTS = os.path.join(BASE, "prompts")
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_TAGS = "http://127.0.0.1:11434/api/tags"
MODEL = os.environ.get("QWEN_MODEL", "qwen3:4b-instruct-2507-q4_K_M").strip()
CATALOGO = os.path.join(DATOS, "catalogo_ciiu.csv")
PROMPT_FILE = os.path.join(PROMPTS, "prompt_v1.txt")

# Defaults de rendimiento (ajustados con bench_latencia.py y bench_lote.py)
#  - num_ctx: 1024 basta para system prompt + 3-5 candidatos + salida. Ojo: si el
#    contexto es menor que el prompt, Ollama recorta tokens en silencio.
#  - num_predict: la salida JSON cabe en ~60 tokens; 96 deja margen. Si se corta,
#    clasificar() reintenta automaticamente con el doble.
NUM_CTX = 1024
NUM_PREDICT = 64
KEEP_ALIVE = "10m"

# Schema JSON: Ollama obliga al modelo a devolver exactamente esta estructura
FORMAT = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["seleccionar", "revision_humana"]},
        "codigo": {"type": ["string", "null"]},
        "confianza": {"type": "number"},
        "justificacion": {"type": "string"},
    },
    "required": ["decision", "codigo", "justificacion"],
}

# Variante "breve": sin 'confianza' (el modelo devuelve ~0.95 siempre, no aporta).
# Ahorra ~8 tokens de GENERACION por registro, que a 4 tok/s son ~2 s.
FORMAT_BREVE = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["seleccionar", "revision_humana"]},
        "codigo": {"type": ["string", "null"]},
        "justificacion": {"type": "string"},
    },
    "required": ["decision", "codigo", "justificacion"],
}

USER_TEMPLATE = """Respuesta P309:
"{respuesta}"

Candidatos:
{candidatos}

Devuelve solo este JSON:
{{
  "decision": "seleccionar" o "revision_humana",
  "codigo": "codigo de la lista o null",
  "confianza": 0.0,
  "justificacion": "explicacion breve"
}}"""

USER_TEMPLATE_BREVE = """Datos de la respuesta actual:
<P309>{respuesta}</P309>
<P308>{p308}</P308>
<P308A>{p308a}</P308A>

Candidatos:
{candidatos}

Antecedentes validados parecidos (pueden contener ruido y solo orientan):
{ejemplos}

Devuelve solo este JSON:
{{
  "decision": "seleccionar" o "revision_humana",
  "codigo": "codigo de la lista o null",
  "justificacion": "maximo 6 palabras"
}}"""


def cargar_catalogo(path=CATALOGO):
    """Devuelve {codigo: descripcion} desde el CSV oficial."""
    import csv

    catalogo = {}
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            catalogo[str(row["codigo"]).strip()] = row["descripcion"].strip()
    return catalogo


def cargar_prompt(path=PROMPT_FILE):
    with open(path, encoding="utf-8") as f:
        return f.read().strip()


def _a_pares(candidatos):
    """Acepta [(codigo, desc), ...] o [{'codigo','descripcion'}, ...]."""
    pares = []
    for c in candidatos:
        if isinstance(c, dict):
            pares.append((str(c["codigo"]).strip(), str(c.get("descripcion") or "").strip()))
        else:
            cod, desc = c
            pares.append((str(cod).strip(), str(desc or "").strip()))
    return pares


def construir_mensaje_usuario(p309, candidatos, p308="", p308a="", casos_similares=None,
                              desc_max=None, breve=True):
    pares = _a_pares(candidatos)
    lineas = []
    for index, (code, description) in enumerate(pares, start=1):
        if desc_max:
            description = description[:desc_max]
        source = candidatos[index - 1] if isinstance(candidatos[index - 1], dict) else {}
        rank = source.get("rank", index)
        try:
            score = float(source.get("prob"))
        except (TypeError, ValueError):
            score = None
        score_text = f", puntaje R2 {score:.3f}" if score is not None else ""
        lineas.append(f"- rango {rank}: {code}: {description}{score_text}")

    allowed = {code for code, _ in pares}
    examples = []
    for example in (casos_similares or [])[:3]:
        code = str(example.get("codigo") or "").strip()
        text = " ".join(str(example.get("p309") or "").split())[:180]
        if code in allowed and text:
            occupation = " ".join(str(example.get("p308") or "").split())[:100]
            tasks = " ".join(str(example.get("p308a") or "").split())[:160]
            try:
                similarity = float(example.get("similitud"))
            except (TypeError, ValueError):
                similarity = None
            details = [f'P309="{text}"']
            if occupation:
                details.append(f'P308="{occupation}"')
            if tasks:
                details.append(f'P308A="{tasks}"')
            similarity_text = f", similitud {similarity:.3f}" if similarity is not None else ""
            examples.append(f"- código {code}{similarity_text}: " + "; ".join(details))
    example_text = "\n".join(examples) if examples else "- Sin antecedentes suficientemente parecidos."

    if breve:
        return USER_TEMPLATE_BREVE.format(
            respuesta=str(p309).strip(),
            p308=str(p308 or "").strip() or "No informado",
            p308a=str(p308a or "").strip() or "No informado",
            candidatos="\n".join(lineas),
            ejemplos=example_text,
        )
    return USER_TEMPLATE.format(respuesta=p309, candidatos="\n".join(lineas))


def verificar_ollama(modelo=MODEL, timeout=5):
    """Devuelve (ok, mensaje). Util como pre-chequeo antes de un lote largo."""
    try:
        with urllib.request.urlopen(OLLAMA_TAGS, timeout=timeout) as r:
            body = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError) as e:
        return False, f"Ollama no responde en 127.0.0.1:11434 ({e}). Ejecuta: ollama serve"
    disponibles = [m.get("name") for m in body.get("models", [])]
    if modelo not in disponibles:
        return False, f"Modelo '{modelo}' no descargado. Ejecuta: ollama pull {modelo}"
    return True, f"Ollama OK | modelo {modelo} disponible"


def _peticion(modelo, system, user, num_ctx, num_predict, seed, keep_alive, timeout, formato=None):
    """Una llamada HTTP a Ollama con salida forzada a JSON."""
    payload = {
        "model": modelo,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "format": formato or FORMAT,
        "stream": False,
        "think": False,
        "keep_alive": keep_alive,
        "options": {
            "temperature": 0.0,
            "top_p": 0.8,
            "seed": seed,
            "num_ctx": num_ctx,
            "num_predict": num_predict,
        },
    }
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _meta_de(body, intento=0, limite=None):
    ns = lambda k: round(body.get(k, 0) / 1e9, 2)  # noqa: E731
    return {
        "tok_in": body.get("prompt_eval_count"),
        "tok_out": body.get("eval_count"),
        "prefill_s": ns("prompt_eval_duration"),
        "gen_s": ns("eval_duration"),
        "total_s": ns("total_duration"),
        "limite_tokens": limite,
        "intentos": intento + 1,
        "fin": body.get("done_reason"),
    }


def clasificar(p309, candidatos, timeout=300, num_ctx=NUM_CTX, num_predict=NUM_PREDICT,
               seed=42, prompt=None, modelo=MODEL, keep_alive=KEEP_ALIVE,
               desc_max=None, reintentos_truncado=1, formato=None, p308="", p308a="",
               casos_similares=None):
    """
    Pide a Qwen3 que elija UN candidato (o derive a revision humana).

    candidatos : [(codigo, descripcion), ...] o [{'codigo','descripcion'}, ...]
    desc_max   : si se indica, trunca las descripciones a N caracteres (menos tokens)
    prompt     : texto del system prompt (por defecto prompt_v1.txt)
    reintentos_truncado : si la respuesta se corta por num_predict, reintenta con el DOBLE.
                          Esto permite usar num_predict bajo (rapido) sin perder registros.

    Devuelve el dict del modelo + '_meta' con conteos y tiempos de Ollama.
    Si el modelo devuelve un codigo que NO esta entre los candidatos, agrega
    'error' = "codigo fuera de los candidatos" (validacion anti-alucinacion).
    """
    pares = _a_pares(candidatos)
    if not pares:
        return {"error": "sin candidatos", "_meta": {}}

    system = prompt if prompt is not None else cargar_prompt()
    user = construir_mensaje_usuario(
        p309, candidatos, p308=p308, p308a=p308a, casos_similares=casos_similares,
        desc_max=desc_max, breve=formato == FORMAT_BREVE,
    )

    codigos = {c for c, _ in pares}
    limite = num_predict

    for intento in range(reintentos_truncado + 1):
        body = _peticion(modelo, system, user, num_ctx, limite, seed, keep_alive, timeout,
                         formato=formato)
        meta = _meta_de(body, intento, limite)

        raw = body.get("message", {}).get("content", "")
        truncado = body.get("done_reason") == "length" or \
            (body.get("eval_count") is not None and body["eval_count"] >= limite)

        try:
            out = json.loads(raw)
        except json.JSONDecodeError:
            if truncado and intento < reintentos_truncado:
                limite *= 2          # se corto la salida: reintentar con mas espacio
                continue
            return {"error": "JSON invalido", "raw": raw, "_meta": meta}

        out["_meta"] = meta

        # Validacion anti-alucinacion: solo puede elegir de la lista
        if out.get("decision") == "seleccionar" and str(out.get("codigo") or "").strip() not in codigos:
            out["error"] = "codigo fuera de los candidatos"
        return out

    return {"error": "sin respuesta", "_meta": {}}
