# -*- coding: utf-8 -*-
"""R2 estadístico vectorizado, calibrado temporalmente y con evidencia histórica."""

from __future__ import annotations

import csv
import hashlib
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC


FEATURE_SET = os.environ.get("R2_FEATURE_SET", "basic").strip().lower()
if FEATURE_SET not in {"basic", "multivariate"}:
    raise ValueError("R2_FEATURE_SET debe ser basic o multivariate.")
MODEL_FAMILY = "r2-multivariado-linearsvc-calibrado-0.4" if FEATURE_SET == "multivariate" else "r2-tfidf-linearsvc-calibrado-0.5"
ALIASES = {
    "id_registro": ("id_registro", "ID_C200"),
    "anio": ("anio", "ANIO"),
    "mes": ("mes", "MES"),
    "p309": ("p309", "C309"),
    "p308": ("p308", "C308"),
    "p308a": ("p308a", "C308A"),
    "c310": ("c310", "C310"),
    "c311": ("c311", "C311"),
    "c366": ("c366", "C366"),
    "codigo": ("codigo_ciiu_esperado", "codigo_ciiu", "C309_COD"),
}

C310_LABELS = {
    "1": "empleador patrono", "2": "trabajador independiente", "3": "empleado",
    "4": "obrero", "5": "trabajador familiar no remunerado", "6": "trabajador del hogar",
    "7": "otro practicante",
}
C311_LABELS = {
    "1": "fuerzas armadas policia", "2": "administracion publica estado",
    "3": "empresa publica", "4": "empresa especial de servicios",
    "5": "empresa patrono privado", "6": "otra entidad",
}
C366_LABELS = {
    "1": "sin nivel", "2": "inicial", "3": "primaria incompleta", "4": "primaria completa",
    "5": "secundaria incompleta", "6": "secundaria completa", "7": "basica especial",
    "8": "superior no universitaria incompleta", "9": "superior no universitaria completa",
    "10": "superior universitaria incompleta", "11": "superior universitaria completa",
    "12": "maestria doctorado",
}

NO_INFORMATIVO = {
    "no sabe", "no responde", "no precisa", "ninguno", "ninguna", "sin dato",
    "sin datos", "no aplica", "desconoce", "ns nr", "n a", "na",
}
SECUENCIAS_BASURA = ("qwerty", "asdf", "zxcv", "lorem ipsum", "abcxyz")


def normalizar(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def _campo(row, name):
    for alias in ALIASES[name]:
        if alias in row and str(row[alias] or "").strip():
            return str(row[alias]).strip()
    return ""


def _texto_modelo(record):
    p309 = normalizar(record.get("p309"))
    p308 = normalizar(record.get("p308"))
    p308a = normalizar(record.get("p308a"))
    basic = f"actividad {p309} actividad {p309} ocupacion {p308} tareas {p308a}"
    if FEATURE_SET == "basic":
        return basic
    c310 = normalizar(record.get("c310"))
    c311 = normalizar(record.get("c311"))
    c366 = normalizar(record.get("c366"))
    return (
        f"{basic} "
        f"categoria {C310_LABELS.get(c310, c310)} entidad {C311_LABELS.get(c311, c311)} "
        f"educacion {C366_LABELS.get(c366, c366)}"
    )


def _firma(record):
    fields = ("p309", "p308", "p308a", "c310", "c311", "c366") if FEATURE_SET == "multivariate" else ("p309", "p308", "p308a")
    return "|".join(normalizar(record.get(field)) for field in fields)


def evaluar_calidad(record):
    original = str(record.get("p309") or "").strip()
    normalized = normalizar(original)
    reasons = []
    if not normalized:
        reasons.append("p309_vacio")
    elif len(normalized) < 4:
        reasons.append("p309_demasiado_corto")
    if original and sum(char.isalnum() for char in original) / max(1, len(original)) < 0.35:
        reasons.append("exceso_de_simbolos")
    if re.search(r"(.)\1{4,}", original.lower()):
        reasons.append("caracteres_repetidos")
    if normalized in NO_INFORMATIVO or all(token in {"no", "sabe", "responde", "precisa"} for token in normalized.split()):
        reasons.append("respuesta_no_informativa")
    if any(sequence in normalized for sequence in SECUENCIAS_BASURA):
        reasons.append("texto_sin_sentido")
    missing_context = sum(not normalizar(record.get(field, "")) for field in ("p308", "p308a"))
    if missing_context == 2:
        reasons.append("sin_contexto_p308")
    critical = {
        "p309_vacio", "p309_demasiado_corto", "exceso_de_simbolos",
        "caracteres_repetidos", "respuesta_no_informativa", "texto_sin_sentido",
    }
    return {
        "nivel": "baja" if critical.intersection(reasons) else ("media" if reasons else "alta"),
        "motivos": reasons,
    }


@dataclass(frozen=True)
class CasoHistorico:
    id_registro: str
    anio: str
    mes: str
    p309: str
    p308: str
    p308a: str
    c310: str
    c311: str
    c366: str
    codigo: str

    def record(self):
        return {
            "p309": self.p309, "p308": self.p308, "p308a": self.p308a,
            "c310": self.c310, "c311": self.c311, "c366": self.c366,
        }


def cargar_catalogo(path):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    catalog = {}
    for row in rows:
        code = str(row.get("codigo") or "").strip()
        if re.fullmatch(r"\d{4}", code):
            catalog[code] = str(row.get("descripcion") or "").strip()
    if not catalog:
        raise ValueError("El catálogo CIIU está vacío o no contiene codigo,descripcion.")
    return catalog


def cargar_casos(path, catalog):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    cases = []
    seen = set()
    for line, row in enumerate(rows, start=2):
        if not any(str(value or "").strip() for value in row.values()):
            continue
        identifier = _campo(row, "id_registro")
        p309 = _campo(row, "p309")
        code = _campo(row, "codigo").zfill(4)
        if not identifier or not p309 or not code:
            raise ValueError(f"Caso histórico incompleto en fila {line}: requiere ID, C309 y C309_COD.")
        if identifier in seen:
            raise ValueError(f"Identificador duplicado en entrenamiento (fila {line}): {identifier}")
        if code not in catalog:
            raise ValueError(f"Código CIIU fuera del catálogo en fila {line}: {code}")
        seen.add(identifier)
        cases.append(CasoHistorico(
            identifier, _campo(row, "anio"), _campo(row, "mes"), p309,
            _campo(row, "p308"), _campo(row, "p308a"), _campo(row, "c310"),
            _campo(row, "c311"), _campo(row, "c366"), code,
        ))
    if len(cases) < 2:
        raise ValueError("Se requieren al menos dos casos históricos completos.")
    return cases


def _top_indices(scores, count):
    count = min(count, scores.shape[0])
    if count == scores.shape[0]:
        return np.argsort(scores)[::-1]
    selected = np.argpartition(scores, -count)[-count:]
    return selected[np.argsort(scores[selected])[::-1]]


class MotorR2Avanzado:
    def __init__(self, catalog, top_k=3, min_history_similarity=0.12):
        self.catalog = dict(catalog)
        self.top_k = max(1, min(5, int(top_k)))
        self.min_history_similarity = float(min_history_similarity)
        self.features = None
        self.classifier = None
        self.calibrator = None
        self.history_cases = []
        self.history_matrix = None
        self.exact_index = defaultdict(Counter)
        self.model_version = MODEL_FAMILY
        self.calibration_label = "provisional-sin-calibracion"
        self.training_count = 0
        self.training_classes = 0
        self.calibration_count = 0

    def _build_features(self):
        return FeatureUnion([
            ("word", TfidfVectorizer(
                analyzer="word", ngram_range=(1, 2), min_df=2, max_df=0.998,
                sublinear_tf=True, max_features=80_000, dtype=np.float32,
            )),
            ("char", TfidfVectorizer(
                analyzer="char_wb", ngram_range=(3, 5), min_df=2, max_df=0.999,
                sublinear_tf=True, max_features=120_000, dtype=np.float32,
            )),
        ], transformer_weights={"word": 0.55, "char": 0.45})

    def fit(self, cases):
        self.history_cases = list(cases)
        periods = sorted({
            (int(case.anio), int(case.mes))
            for case in self.history_cases
            if case.anio.isdigit() and case.mes.isdigit()
            and 1900 <= int(case.anio) <= 2200 and 1 <= int(case.mes) <= 12
        })
        calibration_period = periods[-1] if len(periods) >= 2 else None
        calibration_cases = [
            case for case in self.history_cases
            if calibration_period and (int(case.anio), int(case.mes)) == calibration_period
        ]
        training_cases = [
            case for case in self.history_cases
            if not calibration_period or (int(case.anio), int(case.mes)) != calibration_period
        ]
        if len(calibration_cases) < 100 or len({case.codigo for case in training_cases}) < 2:
            training_cases = list(self.history_cases)
            calibration_cases = []
            calibration_period = None

        self.features = self._build_features()
        x_train = self.features.fit_transform([_texto_modelo(case.record()) for case in training_cases])
        y_train = np.array([case.codigo for case in training_cases])
        self.classifier = LinearSVC(C=1.6, class_weight=None, tol=1e-3, max_iter=2000)
        self.classifier.fit(x_train, y_train)
        self.training_count = len(training_cases)
        self.training_classes = len(self.classifier.classes_)

        if calibration_cases:
            calibration_year, calibration_month = calibration_period
            self.calibration_count = len(calibration_cases)
            self.calibration_label = f"margen-temporal-{calibration_year}-{calibration_month:02d}"
            x_calibration = self.features.transform([_texto_modelo(case.record()) for case in calibration_cases])
            y_calibration = np.array([case.codigo for case in calibration_cases])
            scores = self.classifier.decision_function(x_calibration)
            if scores.ndim == 1:
                scores = np.column_stack((-scores, scores))
            order = np.argsort(scores, axis=1)[:, ::-1]
            predicted = self.classifier.classes_[order[:, 0]]
            margin = scores[np.arange(scores.shape[0]), order[:, 0]] - scores[np.arange(scores.shape[0]), order[:, 1]]
            correct = (predicted == y_calibration).astype(float)
            if len(set(correct.tolist())) > 1:
                self.calibrator = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
                self.calibrator.fit(margin, correct)
                self.calibration_label = f"isotonica-temporal-{calibration_year}-{calibration_month:02d}"

        self.history_matrix = self.features.transform([_texto_modelo(case.record()) for case in self.history_cases])
        self.exact_index = defaultdict(Counter)
        for case in self.history_cases:
            self.exact_index[_firma(case.record())][case.codigo] += 1

        digest = hashlib.sha256()
        digest.update(MODEL_FAMILY.encode("utf-8"))
        for case in sorted(self.history_cases, key=lambda item: item.id_registro):
            digest.update(f"|{case.id_registro}|{case.codigo}|{_firma(case.record())}".encode("utf-8"))
        self.model_version = f"{MODEL_FAMILY}+{digest.hexdigest()[:10]}"
        return self

    def _confidence(self, margin):
        if self.calibrator is not None:
            value = float(self.calibrator.predict([float(margin)])[0])
            return min(0.995, max(0.01, value))
        value = 1.0 / (1.0 + math.exp(-3.0 * (float(margin) - 0.35)))
        return min(0.69, max(0.05, value))

    def _historical_evidence(self, query, allowed_codes):
        similarities = cosine_similarity(query, self.history_matrix).ravel()
        evidence = []
        for index in _top_indices(similarities, min(40, len(self.history_cases))):
            similarity = float(similarities[index])
            case = self.history_cases[int(index)]
            if similarity <= 0 or case.codigo not in allowed_codes:
                continue
            evidence.append({
                "codigo": case.codigo,
                "p309": case.p309[:240],
                "p308": case.p308[:160],
                "p308a": case.p308a[:240],
                "similitud": round(similarity, 6),
            })
            if len(evidence) == 3:
                break
        maximum = float(similarities.max()) if similarities.size else 0.0
        return evidence, maximum

    def predict_batch(self, records):
        output = [None] * len(records)
        valid_positions = []
        valid_records = []
        qualities = {}
        for position, record in enumerate(records):
            quality = evaluar_calidad(record)
            qualities[position] = quality
            if quality["nivel"] == "baja":
                output[position] = {
                    "id_registro": str(record.get("id_registro") or "").strip(),
                    "revision_manual": True,
                    "motivo": "La respuesta no contiene información económica suficiente para clasificar.",
                    "calidad_entrada": quality,
                    "calibracion": self.calibration_label,
                }
            else:
                valid_positions.append(position)
                valid_records.append(record)

        if not valid_records:
            return output
        queries = self.features.transform([_texto_modelo(record) for record in valid_records])
        score_matrix = self.classifier.decision_function(queries)
        if score_matrix.ndim == 1:
            score_matrix = np.column_stack((-score_matrix, score_matrix))

        for local_index, position in enumerate(valid_positions):
            record = records[position]
            scores = score_matrix[local_index]
            ranked = list(_top_indices(scores, max(self.top_k, 5)))
            exact = self.exact_index.get(_firma(record))
            exact_code = None
            exact_consistent = False
            if exact:
                exact_code, _ = exact.most_common(1)[0]
                exact_consistent = len(exact) == 1
                class_matches = np.where(self.classifier.classes_ == exact_code)[0]
                if class_matches.size:
                    exact_class_index = int(class_matches[0])
                    ranked = [exact_class_index] + [item for item in ranked if item != exact_class_index]

            selected = ranked[: self.top_k]
            codes = [str(self.classifier.classes_[index]) for index in selected]
            margin_order = _top_indices(scores, 2)
            margin = float(scores[margin_order[0]] - scores[margin_order[1]])
            confidence = self._confidence(margin)
            if exact_consistent and exact_code == codes[0]:
                confidence = max(confidence, 0.95)

            structural_rules = []
            if FEATURE_SET == "multivariate" and normalizar(record.get("c310")) == "6":
                class_matches = np.where(self.classifier.classes_ == "9700")[0]
                if class_matches.size:
                    structural_rules.append("c310_trabajador_hogar_sugiere_9700")
                    rule_index = int(class_matches[0])
                    selected = [rule_index] + [item for item in selected if item != rule_index]
                    selected = selected[: self.top_k]
                    codes = [str(self.classifier.classes_[index]) for index in selected]
                    # Señal aportada por el equipo: útil, pero aún no validada para cierre automático.
                    confidence = min(max(confidence, 0.85), 0.89)

            evidence, maximum_similarity = self._historical_evidence(queries[local_index], set(codes))
            if maximum_similarity < self.min_history_similarity and confidence < 0.30:
                output[position] = {
                    "id_registro": str(record.get("id_registro") or "").strip(),
                    "revision_manual": True,
                    "motivo": "La respuesta está fuera de la evidencia histórica disponible.",
                    "calidad_entrada": qualities[position],
                    "casos_similares": evidence,
                    "calibracion": self.calibration_label,
                }
                continue

            selected_scores = np.array([scores[index] for index in selected], dtype=float)
            weights = np.exp((selected_scores - selected_scores.max()) / 0.45)
            probabilities = weights / max(1e-9, weights.sum())
            candidates = []
            for rank, (code, probability) in enumerate(zip(codes, probabilities), start=1):
                candidate_probability = confidence if rank == 1 else min(float(probability), max(0.0, confidence - 0.000001))
                candidates.append({
                    "codigo": code,
                    "descripcion": self.catalog.get(code, "Clase CIIU sin descripción"),
                    "prob": round(candidate_probability, 6),
                    "rank": rank,
                })
            output[position] = {
                "id_registro": str(record.get("id_registro") or "").strip(),
                "confianza_ml": round(confidence, 6),
                "candidatos": candidates,
                "calibracion": self.calibration_label,
                "calidad_entrada": qualities[position],
                "casos_similares": evidence,
                "reglas_estructurales": structural_rules,
            }
        return output

    def predict(self, record):
        return self.predict_batch([record])[0]
