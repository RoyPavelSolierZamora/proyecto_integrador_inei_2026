# -*- coding: utf-8 -*-
"""Compara grupos de variables del R2 sin contaminar la prueba temporal 2026.

Protocolo:
  - entrenamiento: 2022-2024
  - calibracion: enero-junio de 2025
  - seleccion de variables: julio-diciembre de 2025
  - prueba final: 2026, solo para la variante ganadora
"""

from __future__ import annotations

import argparse
import csv
import gc
import json
import time
import unicodedata
import re
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import SGDClassifier
from sklearn.svm import LinearSVC


VARIANTS = {
    "A_p309": ("C309",),
    "B_texto_contextual": ("C309", "C308", "C308A"),
    "C_mas_c310": ("C309", "C308", "C308A", "C310"),
    "D_mas_c311_c309_1": ("C309", "C308", "C308A", "C310", "C311", "C309_1"),
}

C310_LABELS = {
    "1": "empleador patrono",
    "2": "trabajador independiente",
    "3": "empleado",
    "4": "obrero",
    "5": "trabajador familiar no remunerado",
    "6": "trabajador del hogar",
    "7": "otro practicante",
    "8": "otra categoria",
    "9": "no especificado",
}

C311_LABELS = {
    "1": "fuerzas armadas policia",
    "2": "administracion publica estado",
    "3": "empresa publica",
    "4": "empresa especial de servicios",
    "5": "empresa patrono privado",
    "6": "otra entidad",
}

C309_1_LABELS = {
    "1": "actividad agropecuaria pesquera identificada",
    "2": "actividad no agropecuaria ni pesquera",
    "3": "actividad agropecuaria pesquera no precisada",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    required = {"ANIO", "MES", "C309", "C309_COD"}
    missing = required.difference(rows[0] if rows else {})
    if missing:
        raise ValueError(f"Faltan columnas obligatorias: {sorted(missing)}")
    return rows


def compose_text(row: dict[str, str], fields: tuple[str, ...]) -> str:
    parts: list[str] = []
    if "C309" in fields:
        value = normalize(row.get("C309"))
        parts.extend((f"actividad {value}", f"actividad {value}"))
    if "C308" in fields:
        parts.append(f"ocupacion {normalize(row.get('C308'))}")
    if "C308A" in fields:
        parts.append(f"tareas {normalize(row.get('C308A'))}")
    if "C310" in fields:
        raw = normalize(row.get("C310"))
        parts.append(f"categoria {C310_LABELS.get(raw, raw)}")
    if "C311" in fields:
        raw = normalize(row.get("C311"))
        parts.append(f"entidad {C311_LABELS.get(raw, raw)}")
    if "C309_1" in fields:
        raw = normalize(row.get("C309_1"))
        parts.append(f"actividad estructurada {C309_1_LABELS.get(raw, raw)}")
    return " ".join(parts)


def build_features() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.998,
                    sublinear_tf=True,
                    max_features=80_000,
                    dtype=np.float32,
                ),
            ),
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    min_df=2,
                    max_df=0.999,
                    sublinear_tf=True,
                    max_features=120_000,
                    dtype=np.float32,
                ),
            ),
        ],
        transformer_weights={"word": 0.55, "char": 0.45},
    )


def split_rows(rows: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    splits = {"train": [], "calibration": [], "validation": [], "test": []}
    for row in rows:
        year = int(str(row.get("ANIO") or "0"))
        month = int(str(row.get("MES") or "0"))
        if 2022 <= year <= 2024:
            splits["train"].append(row)
        elif year == 2025 and 1 <= month <= 6:
            splits["calibration"].append(row)
        elif year == 2025 and 7 <= month <= 12:
            splits["validation"].append(row)
        elif year == 2026:
            splits["test"].append(row)
    if any(not part for part in splits.values()):
        sizes = {name: len(part) for name, part in splits.items()}
        raise ValueError(f"La particion temporal quedo incompleta: {sizes}")
    return splits


def labels(rows: list[dict[str, str]]) -> np.ndarray:
    return np.asarray([str(row.get("C309_COD") or "").strip().zfill(4) for row in rows])


def scores_2d(model, matrix) -> np.ndarray:
    scores = model.decision_function(matrix)
    if scores.ndim == 1:
        scores = np.column_stack((-scores, scores))
    return scores


def ranked_codes(model, scores: np.ndarray, top_k: int = 3) -> np.ndarray:
    count = min(top_k, scores.shape[1])
    indices = np.argpartition(scores, -count, axis=1)[:, -count:]
    local_scores = np.take_along_axis(scores, indices, axis=1)
    order = np.argsort(local_scores, axis=1)[:, ::-1]
    ranked_indices = np.take_along_axis(indices, order, axis=1)
    return model.classes_[ranked_indices]


def margins(scores: np.ndarray) -> np.ndarray:
    top2 = np.partition(scores, -2, axis=1)[:, -2:]
    return top2[:, 1] - top2[:, 0]


def fit_calibrator(model, scores: np.ndarray, truth: np.ndarray) -> IsotonicRegression | None:
    ranked = ranked_codes(model, scores, 1)[:, 0]
    correct = (ranked == truth).astype(float)
    if len(np.unique(correct)) < 2:
        return None
    calibrator = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    calibrator.fit(margins(scores), correct)
    return calibrator


def calibrated_confidence(calibrator: IsotonicRegression | None, score_matrix: np.ndarray) -> np.ndarray:
    margin = margins(score_matrix)
    if calibrator is None:
        return np.minimum(0.69, 1.0 / (1.0 + np.exp(-3.0 * (margin - 0.35))))
    return np.clip(calibrator.predict(margin), 0.01, 0.995)


@dataclass
class Metrics:
    records: int
    known_class_records: int
    unseen_class_records: int
    top1: float
    top3: float
    f1_macro: float
    f1_weighted: float
    selective: dict[str, dict[str, float | int]]


def evaluate(model, score_matrix: np.ndarray, truth: np.ndarray, confidence: np.ndarray) -> Metrics:
    ranking = ranked_codes(model, score_matrix, 3)
    predicted = ranking[:, 0]
    known = np.isin(truth, model.classes_)
    top1 = float(accuracy_score(truth, predicted))
    top3 = float(np.mean([value in candidates for value, candidates in zip(truth, ranking)]))
    selective: dict[str, dict[str, float | int]] = {}
    for threshold in (0.70, 0.80, 0.90, 0.95):
        accepted = confidence >= threshold
        count = int(accepted.sum())
        correct = int(((predicted == truth) & accepted).sum())
        selective[f"{threshold:.2f}"] = {
            "automaticos": count,
            "cobertura": count / len(truth),
            "correctos": correct,
            "precision": correct / count if count else 0.0,
        }
    return Metrics(
        records=len(truth),
        known_class_records=int(known.sum()),
        unseen_class_records=int((~known).sum()),
        top1=top1,
        top3=top3,
        f1_macro=float(f1_score(truth, predicted, average="macro", zero_division=0)),
        f1_weighted=float(f1_score(truth, predicted, average="weighted", zero_division=0)),
        selective=selective,
    )


def print_metrics(label: str, metrics: Metrics) -> None:
    print(
        f"{label}: n={metrics.records} top1={metrics.top1:.3%} top3={metrics.top3:.3%} "
        f"f1_macro={metrics.f1_macro:.3%} f1_weighted={metrics.f1_weighted:.3%} "
        f"clases_no_vistas={metrics.unseen_class_records}",
        flush=True,
    )
    for threshold, values in metrics.selective.items():
        print(
            f"  tau={threshold} cobertura={values['cobertura']:.3%} "
            f"precision={values['precision']:.3%} automaticos={values['automaticos']}",
            flush=True,
        )


def train_variant(
    name: str,
    fields: tuple[str, ...],
    splits: dict[str, list[dict[str, str]]],
    include_test: bool,
) -> dict:
    started = time.perf_counter()
    print(f"\nEntrenando {name} con {', '.join(fields)}...", flush=True)
    features = build_features()
    train_text = [compose_text(row, fields) for row in splits["train"]]
    x_train = features.fit_transform(train_text)
    y_train = labels(splits["train"])
    # Preseleccion multiclase paralelizable. El ganador se confirma despues con
    # el LinearSVC exacto del motor operativo.
    model = SGDClassifier(
        loss="hinge",
        alpha=1e-5,
        max_iter=35,
        tol=1e-3,
        n_jobs=-1,
        random_state=2026,
        average=True,
    )
    model.fit(x_train, y_train)

    x_cal = features.transform([compose_text(row, fields) for row in splits["calibration"]])
    y_cal = labels(splits["calibration"])
    cal_scores = scores_2d(model, x_cal)
    calibrator = fit_calibrator(model, cal_scores, y_cal)

    x_val = features.transform([compose_text(row, fields) for row in splits["validation"]])
    y_val = labels(splits["validation"])
    val_scores = scores_2d(model, x_val)
    val_confidence = calibrated_confidence(calibrator, val_scores)
    validation = evaluate(model, val_scores, y_val, val_confidence)
    print_metrics("validacion_2025_s2", validation)

    result = {
        "variante": name,
        "variables": list(fields),
        "clases_entrenamiento": int(len(model.classes_)),
        "validacion_2025_s2": asdict(validation),
        "duracion_s": round(time.perf_counter() - started, 3),
    }
    if include_test:
        x_test = features.transform([compose_text(row, fields) for row in splits["test"]])
        y_test = labels(splits["test"])
        test_scores = scores_2d(model, x_test)
        test_confidence = calibrated_confidence(calibrator, test_scores)
        test = evaluate(model, test_scores, y_test, test_confidence)
        result["prueba_2026"] = asdict(test)
        print_metrics("prueba_2026", test)
    return result


def train_final_winner(
    name: str,
    fields: tuple[str, ...],
    rows: list[dict[str, str]],
) -> dict:
    """Reajusta el ganador con todo lo disponible antes de diciembre de 2025."""
    final_splits = {"train": [], "calibration": [], "test": []}
    for row in rows:
        year = int(str(row.get("ANIO") or "0"))
        month = int(str(row.get("MES") or "0"))
        if 2022 <= year <= 2024 or (year == 2025 and 1 <= month <= 11):
            final_splits["train"].append(row)
        elif year == 2025 and month == 12:
            final_splits["calibration"].append(row)
        elif year == 2026:
            final_splits["test"].append(row)

    started = time.perf_counter()
    print(
        f"\nReentrenamiento final de {name}: "
        f"train={len(final_splits['train'])}, calibracion={len(final_splits['calibration'])}, "
        f"prueba={len(final_splits['test'])}",
        flush=True,
    )
    features = build_features()
    x_train = features.fit_transform([compose_text(row, fields) for row in final_splits["train"]])
    y_train = labels(final_splits["train"])
    model = LinearSVC(C=1.6, class_weight=None, tol=1e-3, max_iter=2000)
    model.fit(x_train, y_train)

    x_cal = features.transform([compose_text(row, fields) for row in final_splits["calibration"]])
    y_cal = labels(final_splits["calibration"])
    calibrator = fit_calibrator(model, scores_2d(model, x_cal), y_cal)

    x_test = features.transform([compose_text(row, fields) for row in final_splits["test"]])
    y_test = labels(final_splits["test"])
    test_scores = scores_2d(model, x_test)
    test = evaluate(model, test_scores, y_test, calibrated_confidence(calibrator, test_scores))
    print_metrics("prueba_final_2026", test)
    return {
        "variante": name,
        "variables": list(fields),
        "entrenamiento": len(final_splits["train"]),
        "calibracion": len(final_splits["calibration"]),
        "prueba": len(final_splits["test"]),
        "clases_entrenamiento": int(len(model.classes_)),
        "prueba_2026": asdict(test),
        "duracion_s": round(time.perf_counter() - started, 3),
    }


def selection_key(result: dict) -> tuple[float, float, float]:
    metrics = result["validacion_2025_s2"]
    tau = metrics["selective"]["0.90"]
    # Entre variantes que alcanzan 98 % de precision, prioriza cobertura.
    safe = 1.0 if tau["precision"] >= 0.98 else 0.0
    return (safe, tau["cobertura"] if safe else tau["precision"], metrics["f1_macro"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", required=True, type=Path)
    parser.add_argument("--salida", required=True, type=Path)
    args = parser.parse_args()

    rows = read_rows(args.datos)
    splits = split_rows(rows)
    print("Particion temporal:", {name: len(part) for name, part in splits.items()}, flush=True)
    print("La prueba 2026 no participa en la seleccion de variables.", flush=True)

    results = []
    for name, fields in VARIANTS.items():
        result = train_variant(name, fields, splits, include_test=False)
        results.append(result)
        gc.collect()

    winner = max(results, key=selection_key)
    winner_name = winner["variante"]
    print(f"\nGanador segun validacion 2025 S2: {winner_name}", flush=True)
    exact_variants = ["B_texto_contextual"]
    if winner_name not in exact_variants:
        exact_variants.append(winner_name)
    exact_results = [train_final_winner(name, VARIANTS[name], rows) for name in exact_variants]
    final_result = next(result for result in exact_results if result["variante"] == winner_name)

    report = {
        "protocolo": {
            "entrenamiento": "2022-2024",
            "calibracion": "2025-01 a 2025-06",
            "seleccion": "2025-07 a 2025-12",
            "prueba_final": "2026",
            "reentrenamiento_final": "2022-01 a 2025-11; calibracion diciembre 2025",
            "criterio_ganador": "precision a tau=0.90, luego cobertura, luego F1 macro",
        },
        "particiones": {name: len(part) for name, part in splits.items()},
        "comparacion_validacion": results,
        "ganador": final_result,
        "confirmacion_linearsvc": exact_results,
    }
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nInforme guardado en {args.salida.resolve()}", flush=True)


if __name__ == "__main__":
    main()
