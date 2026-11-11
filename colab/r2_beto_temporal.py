# -*- coding: utf-8 -*-
"""Entrena y evalúa BETO con separación temporal estricta para EPEN.

Entrena enero-noviembre de 2025, calibra diciembre de 2025 y prueba enero de
2026. Nunca incorpora C309_COD al texto de entrada.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from datasets import Dataset
from scipy.optimize import minimize_scalar
from sklearn.metrics import accuracy_score, f1_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)


MODEL_NAME = "dccuchile/bert-base-spanish-wwm-cased"
C310 = {"1": "EMPLEADOR", "2": "INDEPENDIENTE", "3": "EMPLEADO", "4": "OBRERO", "5": "FAMILIAR NO REMUNERADO", "6": "TRABAJADOR DEL HOGAR", "7": "PRACTICANTE"}
C311 = {"1": "FUERZAS ARMADAS POLICIA", "2": "ADMINISTRACION PUBLICA", "3": "EMPRESA PUBLICA", "4": "EMPRESA DE SERVICIOS", "5": "EMPRESA PRIVADA", "6": "OTRA ENTIDAD"}
C366 = {"1": "SIN NIVEL", "2": "INICIAL", "3": "PRIMARIA INCOMPLETA", "4": "PRIMARIA COMPLETA", "5": "SECUNDARIA INCOMPLETA", "6": "SECUNDARIA COMPLETA", "7": "BASICA ESPECIAL", "8": "SUPERIOR NO UNIVERSITARIA INCOMPLETA", "9": "SUPERIOR NO UNIVERSITARIA COMPLETA", "10": "SUPERIOR UNIVERSITARIA INCOMPLETA", "11": "SUPERIOR UNIVERSITARIA COMPLETA", "12": "POSGRADO"}


def clean_code(series):
    return series.fillna("").astype(str).str.strip().str.replace(r"\.0$", "", regex=True)


def normal(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower())).strip()


def text_column(frame):
    def values(name):
        return frame[name].fillna("").astype(str).str.strip().str.upper() if name in frame else pd.Series([""] * len(frame), index=frame.index)
    p309, p308, p308a = values("C309"), values("C308"), values("C308A")
    c310 = clean_code(frame["C310"]).map(C310).fillna("NO INFORMADO") if "C310" in frame else "NO INFORMADO"
    c311 = clean_code(frame["C311"]).map(C311).fillna("NO INFORMADO") if "C311" in frame else "NO INFORMADO"
    c366 = clean_code(frame["C366"]).map(C366).fillna("NO INFORMADO") if "C366" in frame else "NO INFORMADO"
    return "RAMA: " + p309 + " | OCUPACION: " + p308 + " | TAREAS: " + p308a + " | CATEGORIA: " + c310 + " | ENTIDAD: " + c311 + " | EDUCACION: " + c366


def load(path):
    frame = pd.read_csv(path, dtype=str)
    required = {"ID_C200", "MES", "C309", "C309_COD"}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Faltan columnas: {', '.join(missing)}")
    frame = frame.dropna(subset=["ID_C200", "C309", "C309_COD"]).copy()
    frame["C309_COD"] = frame["C309_COD"].str.strip().str.zfill(4)
    frame["MES_NUM"] = pd.to_numeric(frame["MES"], errors="coerce")
    frame["TEXTO"] = text_column(frame)
    frame["FIRMA"] = frame.apply(lambda row: "|".join(normal(row.get(name)) for name in ("C309", "C308", "C308A", "C310", "C311", "C366")), axis=1)
    return frame


def softmax(logits):
    shifted = logits - logits.max(axis=1, keepdims=True)
    values = np.exp(shifted)
    return values / values.sum(axis=1, keepdims=True)


def metrics(probabilities, truth, known, classes):
    order = np.argsort(probabilities, axis=1)[:, ::-1]
    predicted = classes[order[:, 0]]
    top3_codes = classes[order[:, :3]]
    correct = known & (predicted == truth)
    top3 = np.array([flag and code in rows for flag, code, rows in zip(known, truth, top3_codes)])
    confidence = probabilities[np.arange(len(probabilities)), order[:, 0]]
    result = {
        "registros": int(len(truth)), "clases_prueba": int(len(set(truth))),
        "clases_no_vistas": sorted(set(truth[~known])),
        "top1": float(correct.mean()), "top3": float(top3.mean()),
        "f1_macro": float(f1_score(truth, predicted, average="macro", zero_division=0)),
        "umbrales": {},
    }
    for threshold in (0.70, 0.80, 0.90, 0.95):
        accepted = known & (confidence >= threshold)
        result["umbrales"][str(threshold)] = {
            "cobertura": float(accepted.mean()),
            "precision_aceptada": float(correct[accepted].mean()) if accepted.any() else None,
            "derivados": int((~accepted).sum()),
        }
    return result, predicted, confidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--historico", required=True)
    parser.add_argument("--prueba", required=True)
    parser.add_argument("--salida", default="/content/r2_beto_temporal")
    parser.add_argument("--epocas", type=int, default=5)
    args = parser.parse_args()
    output = Path(args.salida)
    output.mkdir(parents=True, exist_ok=True)

    history, test = load(args.historico), load(args.prueba)
    train = history[history["MES_NUM"].between(1, 11)].copy()
    calibration = history[history["MES_NUM"] == 12].copy()
    if train.empty or calibration.empty or test.empty:
        raise ValueError("Se requieren enero-noviembre, diciembre y prueba posterior no vacíos.")
    overlap_ids = set(train["ID_C200"]).intersection(test["ID_C200"])
    if overlap_ids:
        raise ValueError(f"Fuga por ID: {len(overlap_ids)} identificadores aparecen en entrenamiento y prueba.")
    classes = np.array(sorted(train["C309_COD"].unique()))
    code_to_label = {code: index for index, code in enumerate(classes)}
    train["label"] = train["C309_COD"].map(code_to_label)
    calibration = calibration[calibration["C309_COD"].isin(code_to_label)].copy()
    calibration["label"] = calibration["C309_COD"].map(code_to_label)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    def dataset(frame):
        data = Dataset.from_pandas(frame[["TEXTO", "label"]], preserve_index=False)
        return data.map(lambda batch: tokenizer(batch["TEXTO"], padding="max_length", truncation=True, max_length=96), batched=True)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=len(classes))
    training_args = TrainingArguments(
        output_dir=str(output / "checkpoints"), eval_strategy="epoch", save_strategy="epoch",
        learning_rate=3e-5, per_device_train_batch_size=32, per_device_eval_batch_size=64,
        num_train_epochs=args.epocas, weight_decay=0.01, fp16=torch.cuda.is_available(),
        load_best_model_at_end=True, metric_for_best_model="eval_loss", save_total_limit=2,
        report_to="none", seed=42,
    )
    trainer = Trainer(
        model=model, args=training_args, train_dataset=dataset(train), eval_dataset=dataset(calibration),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2, early_stopping_threshold=0.001)],
    )
    trainer.train()

    calibration_logits = trainer.predict(dataset(calibration)).predictions
    calibration_truth = calibration["label"].astype(int).to_numpy()
    def nll(temperature):
        probs = softmax(calibration_logits / temperature)
        return float(-np.log(np.clip(probs[np.arange(len(probs)), calibration_truth], 1e-12, 1)).mean())
    temperature = float(minimize_scalar(nll, bounds=(0.25, 8.0), method="bounded").x)

    test_known = test["C309_COD"].isin(code_to_label).to_numpy()
    temporary = test.copy()
    temporary["label"] = temporary["C309_COD"].map(code_to_label).fillna(0).astype(int)
    logits = trainer.predict(dataset(temporary)).predictions
    probabilities = softmax(logits / temperature)
    report, predicted, confidence = metrics(probabilities, test["C309_COD"].to_numpy(), test_known, classes)
    report.update({
        "protocolo": "train_2025_01_11-cal_2025_12-test_2026_01",
        "entrenamiento": int(len(train)), "calibracion": int(len(calibration)),
        "clases_entrenamiento": int(len(classes)), "temperatura": temperature,
        "firmas_repetidas_entre_periodos": int(test["FIRMA"].isin(set(train["FIRMA"])).sum()),
        "advertencia_c366": "Evaluar sesgo y ablacion antes de uso productivo.",
    })
    (output / "metricas.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    predictions = test[["ID_C200", "C309", "C309_COD"]].copy()
    predictions["C309_COD_PREDICHO"] = predicted
    predictions["CONFIANZA_CALIBRADA"] = confidence
    predictions.to_csv(output / "predicciones_enero_2026.csv", index=False, encoding="utf-8-sig")
    trainer.save_model(str(output / "modelo"))
    tokenizer.save_pretrained(str(output / "modelo"))
    np.save(output / "modelo" / "clases_ciiu.npy", classes)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
