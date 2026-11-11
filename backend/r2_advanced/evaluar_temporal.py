# -*- coding: utf-8 -*-
"""Evalúa R2 con un histórico anterior y un periodo posterior etiquetado."""

import argparse
import csv
from pathlib import Path

from motor import cargar_catalogo
from servicio_r2 import DEFAULT_CACHE, load_or_train


def read(path):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def field(row, *names):
    for name in names:
        if str(row.get(name) or "").strip():
            return str(row[name]).strip()
    return ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrenamiento", required=True)
    parser.add_argument("--prueba", required=True)
    parser.add_argument("--catalogo", required=True)
    parser.add_argument("--cache", default=str(DEFAULT_CACHE))
    args = parser.parse_args()
    catalog = cargar_catalogo(args.catalogo)
    engine = load_or_train(args.entrenamiento, args.catalogo, args.cache)
    rows = read(args.prueba)
    records = [{
        "id_registro": field(row, "id_registro", "ID_C200"),
        "p309": field(row, "p309", "C309"),
        "p308": field(row, "p308", "C308"),
        "p308a": field(row, "p308a", "C308A"),
        "c310": field(row, "c310", "C310"),
        "c311": field(row, "c311", "C311"),
        "c366": field(row, "c366", "C366"),
    } for row in rows]
    expected = [field(row, "codigo_ciiu_esperado", "codigo_ciiu", "C309_COD").zfill(4) for row in rows]
    results = engine.predict_batch(records)
    total = top1 = top3 = derived = 0
    selective = {threshold: {"automatic": 0, "correct": 0} for threshold in (0.70, 0.80, 0.90, 0.95)}
    for truth, result in zip(expected, results):
        total += 1
        if result.get("revision_manual"):
            derived += 1
            continue
        codes = [candidate["codigo"] for candidate in result["candidatos"]]
        top1 += int(codes[0] == truth)
        top3 += int(truth in codes)
        confidence = float(result["confianza_ml"])
        for threshold, counters in selective.items():
            if confidence >= threshold:
                counters["automatic"] += 1
                counters["correct"] += int(codes[0] == truth)
    print(f"modelo={engine.model_version}")
    print(f"registros={total} top1={top1/total:.3%} top3={top3/total:.3%} derivacion={derived/total:.3%}")
    for threshold, counters in selective.items():
        automatic = counters["automatic"]
        coverage = automatic / total
        precision = counters["correct"] / automatic if automatic else 0
        print(f"tau={threshold:.2f} cobertura_r2={coverage:.3%} precision_automatica={precision:.3%} qwen_o_revision={1-coverage:.3%}")
    print(f"catalogo={len(catalog)} clases; prueba temporal independiente recomendada.")


if __name__ == "__main__":
    main()
