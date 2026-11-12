# -*- coding: utf-8 -*-
"""Evalúa mensualmente el R2 seleccionado sobre cada corte de 2026."""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from pathlib import Path

from sklearn.svm import LinearSVC

from evaluar_variables_temporal import (
    VARIANTS,
    build_features,
    calibrated_confidence,
    compose_text,
    evaluate,
    fit_calibrator,
    labels,
    print_metrics,
    read_rows,
    scores_2d,
)


MONTHS = {
    1: "enero",
    2: "febrero",
    3: "marzo",
    4: "abril",
    5: "mayo",
    6: "junio",
    7: "julio",
    8: "agosto",
    9: "septiembre",
    10: "octubre",
    11: "noviembre",
    12: "diciembre",
}


def partition(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], list[dict[str, str]], dict[int, list[dict[str, str]]]]:
    train: list[dict[str, str]] = []
    calibration: list[dict[str, str]] = []
    test_by_month: dict[int, list[dict[str, str]]] = {}
    for row in rows:
        year = int(str(row.get("ANIO") or "0"))
        month = int(str(row.get("MES") or "0"))
        if 2022 <= year <= 2024 or (year == 2025 and 1 <= month <= 11):
            train.append(row)
        elif year == 2025 and month == 12:
            calibration.append(row)
        elif year == 2026:
            test_by_month.setdefault(month, []).append(row)
    if not train or not calibration or not test_by_month:
        raise ValueError("La base no permite construir entrenamiento, calibración y prueba mensual 2026.")
    return train, calibration, dict(sorted(test_by_month.items()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", required=True, type=Path)
    parser.add_argument("--salida", required=True, type=Path)
    args = parser.parse_args()

    fields = VARIANTS["B_texto_contextual"]
    rows = read_rows(args.datos)
    train, calibration, test_by_month = partition(rows)
    print(
        f"Variables: {', '.join(fields)} | entrenamiento={len(train)} | "
        f"calibración={len(calibration)} | meses_2026={list(test_by_month)}",
        flush=True,
    )

    started = time.perf_counter()
    features = build_features()
    x_train = features.fit_transform([compose_text(row, fields) for row in train])
    y_train = labels(train)
    model = LinearSVC(C=1.6, class_weight=None, tol=1e-3, max_iter=2000)
    model.fit(x_train, y_train)

    x_calibration = features.transform([compose_text(row, fields) for row in calibration])
    y_calibration = labels(calibration)
    calibrator = fit_calibrator(model, scores_2d(model, x_calibration), y_calibration)

    monthly = {}
    all_test = []
    for month, month_rows in test_by_month.items():
        all_test.extend(month_rows)
        x_month = features.transform([compose_text(row, fields) for row in month_rows])
        y_month = labels(month_rows)
        month_scores = scores_2d(model, x_month)
        metrics = evaluate(
            model,
            month_scores,
            y_month,
            calibrated_confidence(calibrator, month_scores),
        )
        key = f"2026-{month:02d}"
        monthly[key] = asdict(metrics)
        print_metrics(f"{key}_{MONTHS.get(month, 'mes')}", metrics)

    x_all = features.transform([compose_text(row, fields) for row in all_test])
    y_all = labels(all_test)
    all_scores = scores_2d(model, x_all)
    aggregate = evaluate(model, all_scores, y_all, calibrated_confidence(calibrator, all_scores))
    print_metrics("total_2026", aggregate)

    report = {
        "variables": list(fields),
        "protocolo": {
            "entrenamiento": "2022-01 a 2025-11",
            "calibracion": "2025-12",
            "prueba": "cada mes disponible de 2026, sin reentrenamiento entre meses",
        },
        "registros_entrenamiento": len(train),
        "registros_calibracion": len(calibration),
        "clases_entrenamiento": int(len(model.classes_)),
        "por_mes": monthly,
        "total_2026": asdict(aggregate),
        "duracion_s": round(time.perf_counter() - started, 3),
    }
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Informe guardado en {args.salida.resolve()}", flush=True)


if __name__ == "__main__":
    main()
