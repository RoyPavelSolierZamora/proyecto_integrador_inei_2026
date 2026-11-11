# -*- coding: utf-8 -*-
"""
contrato.py
Contrato de datos de la capa LLM (R3) del Proyecto Integrador PEU-CD.

Es la pieza que permite enchufar R2 (ML) -> R3 (LLM) -> R4 (dashboard) sin
reescribir nada. Define la forma EXACTA del mensaje de entrada y de salida.

  ENTRADA  (la produce R2 y la consume R3)
  SALIDA   (la produce R3 y la consume R4)

Ninguna de las dos debe cambiar sin subir de version (CONTRATO_VERSION).

Uso:
    python contrato.py --dump      # escribe contrato_v1.json (JSON Schema de ambos)
    python contrato.py --ejemplo   # ejemplo de entrada -> salida validada
"""
import argparse
import json
import os

CONTRATO_VERSION = "1.1"

BASE = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------
# ENTRADA: Top-K del clasificador supervisado (R2)
# --------------------------------------------------------------------------
ESQUEMA_ENTRADA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "EntradaCodificacion",
    "description": "Un registro a codificar: texto P309 + candidatos propuestos por R2.",
    "type": "object",
    "required": ["id_registro", "p309", "candidatos"],
    "properties": {
        "id_registro": {
            "type": "string",
            "description": "Identificador unico del registro en la base EPEN (llave de join).",
        },
        "p309": {"type": "string", "description": "Texto abierto de la P309."},
        "p308": {"type": "string", "description": "Ocupación declarada; contexto opcional."},
        "p308a": {"type": "string", "description": "Tareas declaradas; contexto opcional."},
        "candidatos": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "description": "Top-K de R2, ordenado de mayor a menor probabilidad.",
            "items": {
                "type": "object",
                "required": ["codigo"],
                "properties": {
                    "codigo": {"type": "string", "pattern": "^[0-9]{4}$"},
                    "descripcion": {
                        "type": "string",
                        "description": "Opcional: si falta, R3 la toma de catalogo_ciiu.csv.",
                    },
                    "prob": {"type": "number", "minimum": 0, "maximum": 1},
                    "rank": {"type": "integer", "minimum": 1},
                },
            },
        },
        "confianza_ml": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confianza del clasificador de R2 (para el umbral tau).",
        },
        "casos_similares": {
            "type": "array",
            "maxItems": 3,
            "description": "Antecedentes históricos validados y limitados a los candidatos actuales.",
            "items": {
                "type": "object",
                "required": ["codigo", "p309", "similitud"],
                "properties": {
                    "codigo": {"type": "string", "pattern": "^[0-9]{4}$"},
                    "p309": {"type": "string"},
                    "p308": {"type": "string"},
                    "p308a": {"type": "string"},
                    "similitud": {"type": "number", "exclusiveMinimum": 0, "maximum": 1},
                },
            },
        },
    },
}

# --------------------------------------------------------------------------
# SALIDA: decision de la capa LLM (R3)
# --------------------------------------------------------------------------
ESQUEMA_SALIDA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "SalidaCodificacion",
    "description": "Decision de R3 para un registro: codigo elegido o derivacion a analista.",
    "type": "object",
    "required": ["id_registro", "decision", "codigo", "requiere_revision", "origen"],
    "properties": {
        "id_registro": {"type": "string"},
        "decision": {"type": "string", "enum": ["seleccionar", "revision_humana"]},
        "codigo": {
            "type": ["string", "null"],
            "description": "Codigo CIIU elegido. null si decision=revision_humana.",
        },
        "confianza_llm": {"type": ["number", "null"]},
        "justificacion": {"type": ["string", "null"]},
        "modelo": {"type": "string"},
        "latencia_s": {"type": "number"},
        "requiere_revision": {"type": "integer", "enum": [0, 1]},
        "origen": {
            "type": "string",
            "enum": ["llm", "revision_humana"],
            "description": "Quien tomo la decision final de ESTE registro.",
        },
        "run_id": {"type": "string"},
        "motivo": {
            "type": "string",
            "description": "Vacio si todo ok; explica errores (JSON invalido, codigo fuera de candidatos, timeout).",
        },
        "codigo_real": {
            "type": ["string", "null"],
            "description": "Solo en evaluacion: codigo verdadero conocido.",
        },
    },
}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def normalizar_entrada(obj, catalogo=None):
    """
    Valida y normaliza una entrada de R2.
    - Rellena 'descripcion' desde el catalogo si falta.
    - Ordena candidatos por prob desc y asigna 'rank' si falta.

    Devuelve (entrada_normalizada, errores). Si errores, la entrada se descarta.
    """
    errores = []
    if not isinstance(obj, dict):
        return None, ["la entrada no es un objeto"]
    for campo in ("id_registro", "p309", "candidatos"):
        if campo not in obj or obj[campo] in (None, ""):
            errores.append(f"falta '{campo}'")
    cands = obj.get("candidatos") or []
    if not isinstance(cands, list) or not cands:
        errores.append("'candidatos' debe ser una lista no vacia")
        cands = []
    if len(cands) > 5:
        errores.append(f"demasiados candidatos ({len(cands)} > 5)")

    limpios = []
    for i, c in enumerate(cands):
        if not isinstance(c, dict) or not str(c.get("codigo") or "").strip():
            errores.append(f"candidato #{i+1} sin 'codigo'")
            continue
        cod = str(c["codigo"]).strip()
        if not (len(cod) == 4 and cod.isdigit()):
            errores.append(f"candidato '{cod}' no es una clase CIIU de 4 digitos")
            continue
        limpios.append({
            "codigo": cod,
            "descripcion": c.get("descripcion") or (catalogo or {}).get(cod, ""),
            "prob": c.get("prob"),
            "rank": c.get("rank", i + 1),
        })

    if not limpios:
        errores.append("ningun candidato valido")
    else:
        con_prob = [c for c in limpios if c.get("prob") is not None]
        if len(con_prob) == len(limpios):
            limpios.sort(key=lambda c: -float(c["prob"]))
        if not errores:
            for i, c in enumerate(limpios, 1):
                c["rank"] = i

    if errores:
        return None, errores

    candidate_codes = {c["codigo"] for c in limpios}
    similares = []
    raw_similares = obj.get("casos_similares") or []
    if isinstance(raw_similares, list):
        for example in raw_similares[:3]:
            if not isinstance(example, dict):
                continue
            code = str(example.get("codigo") or "").strip()
            text = str(example.get("p309") or "").strip()[:240]
            try:
                similarity = float(example.get("similitud"))
            except (TypeError, ValueError):
                continue
            if code not in candidate_codes or not text or not 0 < similarity <= 1:
                continue
            similares.append({
                "codigo": code,
                "p309": text,
                "p308": str(example.get("p308") or "").strip()[:160],
                "p308a": str(example.get("p308a") or "").strip()[:240],
                "similitud": similarity,
            })

    return {
        "id_registro": str(obj["id_registro"]),
        "p309": str(obj["p309"]).strip()[:500],
        "p308": str(obj.get("p308") or "").strip()[:300],
        "p308a": str(obj.get("p308a") or "").strip()[:500],
        "candidatos": limpios,
        "confianza_ml": obj.get("confianza_ml"),
        "casos_similares": similares,
    }, []


def construir_salida(id_registro, resultado, modelo, latencia_s, run_id,
                     confianza_ml=None, codigo_real=None, umbral=None):
    """
    Convierte la respuesta cruda del LLM en la salida del contrato.
    Aplica la politica de derivacion:

      requiere_revision = 1 si
          - el LLM pidio revision humana, o
          - hubo error de formato / anti-alucinacion, o
          - la confianza del LLM quedo por debajo de `umbral` (si se pasa)

    NOTA: la 'confianza' del LLM es ~0.95 casi siempre, por eso NO se usa como
    umbral por defecto. El umbral tau pertenece al clasificador de R2.
    """
    decision = resultado.get("decision")
    codigo = resultado.get("codigo")
    motivo = resultado.get("error", "") or ""

    if decision == "seleccionar" and codigo is not None:
        codigo = str(codigo).strip()
    else:
        codigo = None
        if decision != "revision_humana":
            motivo = motivo or "respuesta no utilizable"
            decision = "revision_humana"

    conf = resultado.get("confianza")
    if umbral is not None and decision == "seleccionar" and (conf or 0) < umbral:
        motivo = motivo or f"confianza LLM {conf} < umbral {umbral}"

    hay_problema = bool(motivo)
    requiere = 1 if (decision == "revision_humana" or hay_problema) else 0

    return {
        "id_registro": str(id_registro),
        "decision": decision,
        "codigo": codigo,
        "confianza_llm": conf,
        "justificacion": resultado.get("justificacion"),
        "modelo": modelo,
        "latencia_s": round(float(latencia_s), 2),
        "requiere_revision": requiere,
        "origen": "revision_humana" if requiere else "llm",
        "run_id": run_id,
        "motivo": motivo,
        "codigo_real": str(codigo_real) if codigo_real is not None else None,
    }


def validar_salida(sal):
    """Verifica que una salida cumple el contrato. Devuelve lista de errores."""
    errores = []
    for campo in ESQUEMA_SALIDA["required"]:
        if campo not in sal:
            errores.append(f"falta '{campo}'")
    if sal.get("decision") not in ("seleccionar", "revision_humana"):
        errores.append(f"decision invalida: {sal.get('decision')!r}")
    if sal.get("decision") == "seleccionar" and not sal.get("codigo"):
        errores.append("decision=seleccionar pero 'codigo' es nulo")
    if sal.get("decision") == "revision_humana" and sal.get("codigo"):
        errores.append("decision=revision_humana pero trae 'codigo'")
    if sal.get("requiere_revision") not in (0, 1):
        errores.append("requiere_revision debe ser 0 o 1")
    if sal.get("origen") not in ("llm", "revision_humana"):
        errores.append(f"origen invalido: {sal.get('origen')!r}")
    return errores


def dump_esquemas(destino=None):
    destino = destino or os.path.join(BASE, "docs", "contrato_v1.json")
    doc = {
        "contrato_version": CONTRATO_VERSION,
        "entrada": ESQUEMA_ENTRADA,
        "salida": ESQUEMA_SALIDA,
    }
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    return destino


# --------------------------------------------------------------------------
# Ejemplo / CLI
# --------------------------------------------------------------------------
ENTRADA_EJEMPLO = {
    "id_registro": "000123",
    "p309": "Crio pollos para venderlos.",
    "candidatos": [
        {"codigo": "0150", "prob": 0.31},
        {"codigo": "0146", "prob": 0.28},
        {"codigo": "0141", "prob": 0.19},
    ],
    "confianza_ml": 0.31,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", action="store_true", help="escribir contrato_v1.json")
    ap.add_argument("--ejemplo", action="store_true", help="mostrar ejemplo validado")
    args = ap.parse_args()

    if args.dump:
        print("Escrito:", dump_esquemas())

    if args.ejemplo or not args.dump:
        from clasificador import cargar_catalogo
        cat = cargar_catalogo()
        ent, errs = normalizar_entrada(ENTRADA_EJEMPLO, cat)
        print("ENTRADA normalizada:", json.dumps(ent, ensure_ascii=False, indent=2) if ent else errs)
        sal = construir_salida("000123", {"decision": "seleccionar", "codigo": "0146",
                                          "confianza": 0.95, "justificacion": "cria de aves"},
                               "qwen3:4b", 12.3, "ejemplo_run")
        print("\nSALIDA:", json.dumps(sal, ensure_ascii=False, indent=2))
        print("\nerrores de validacion:", validar_salida(sal) or "ninguno")


if __name__ == "__main__":
    main()
