# -*- coding: utf-8 -*-
"""Evalúa Top-1/Top-3 y cobertura del baseline con archivos separados."""

import argparse
import csv
from pathlib import Path

from motor import MotorR2, cargar_catalogo, cargar_casos


def read_rows(path):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrenamiento", required=True)
    parser.add_argument("--entrada", required=True)
    parser.add_argument("--esperado", required=True)
    parser.add_argument("--catalogo", required=True)
    args = parser.parse_args()
    catalog = cargar_catalogo(args.catalogo)
    engine = MotorR2(catalog).fit(cargar_casos(args.entrenamiento, catalog))
    expected = {row["id_registro"]: row["codigo_ciiu_esperado"] for row in read_rows(args.esperado)}
    total = top1 = top3 = derived = 0
    for row in read_rows(args.entrada):
        truth = expected.get(row.get("id_registro"))
        if not truth:
            continue
        total += 1
        result = engine.predict(row)
        if result.get("revision_manual"):
            derived += 1
            continue
        codes = [item["codigo"] for item in result["candidatos"]]
        top1 += int(codes[0] == truth)
        top3 += int(truth in codes)
    print(f"modelo={engine.model_version}")
    print(f"registros={total} top1={top1/total:.3%} top3={top3/total:.3%} derivacion={derived/total:.3%}")
    print("Advertencia: si entrada es una versión alterada del entrenamiento, esto mide robustez, no generalización.")


if __name__ == "__main__":
    main()
