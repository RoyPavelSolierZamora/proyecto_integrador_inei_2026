# -*- coding: utf-8 -*-
"""Baseline R2 reproducible con TF-IDF y casos históricos (solo stdlib)."""

from __future__ import annotations

import csv
import hashlib
import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path


MODEL_FAMILY = "r2-tfidf-hibrido-0.2"
ALIASES = {
    "id_registro": ("id_registro", "ID_C200"),
    "p309": ("p309", "C309"),
    "p308": ("p308", "C308"),
    "p308a": ("p308a", "C308A"),
    "codigo": ("codigo_ciiu_esperado", "codigo_ciiu", "C309_COD"),
}

ABREVIATURAS = {
    "adm": "administracion",
    "admin": "administracion",
    "ambul": "ambulante",
    "comerc": "comercio",
    "elab": "elaboracion",
    "fab": "fabricacion",
    "fabric": "fabricacion",
    "mant": "mantenimiento",
    "repar": "reparacion",
    "rest": "restaurante",
    "serv": "servicio",
    "transp": "transporte",
    "vta": "venta",
    "vtas": "ventas",
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
    text = re.sub(r"([a-z])\1{2,}", r"\1\1", text)
    words = [ABREVIATURAS.get(word, word) for word in text.split()]
    return " ".join(words)


def firma_fonetica(value):
    """Firma española aproximada; se usa con poco peso y nunca sustituye el texto."""
    text = normalizar(value)
    text = text.replace("qu", "k").replace("ll", "y").replace("rr", "r")
    text = text.replace("v", "b").replace("z", "s").replace("h", "")
    text = re.sub(r"c(?=[ei])", "s", text)
    text = text.replace("j", "g")
    return text


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
    return {
        "nivel": "baja" if any(reason in reasons for reason in (
            "p309_vacio", "p309_demasiado_corto", "exceso_de_simbolos",
            "caracteres_repetidos", "respuesta_no_informativa", "texto_sin_sentido",
        )) else ("media" if reasons else "alta"),
        "motivos": reasons,
    }


def _campo(row, name):
    for alias in ALIASES[name]:
        if alias in row and str(row[alias] or "").strip():
            return str(row[alias]).strip()
    return ""


def _ngramas(text, minimum, maximum):
    compact = f"_{normalizar(text).replace(' ', '_')}_"
    for size in range(minimum, maximum + 1):
        for index in range(max(0, len(compact) - size + 1)):
            yield compact[index:index + size]


def extraer_caracteristicas(record):
    features = Counter()
    fields = (("p309", 1.0), ("p308", 0.35), ("p308a", 0.45))
    for field, weight in fields:
        text = normalizar(record.get(field, ""))
        if not text:
            continue
        words = text.split()
        for word in words:
            features[f"{field}:w:{word}"] += weight
        for first, second in zip(words, words[1:]):
            features[f"{field}:b:{first}_{second}"] += weight
        for ngram in _ngramas(text, 3, 5):
            features[f"{field}:c:{ngram}"] += weight * 0.22
        phonetic = firma_fonetica(text)
        for ngram in _ngramas(phonetic, 3, 4):
            features[f"{field}:f:{ngram}"] += weight * 0.08

    combined = normalizar(" ".join(str(record.get(field) or "") for field in ("p309", "p308", "p308a")))
    for word in set(combined.split()):
        features[f"global:w:{word}"] += 0.18
    return features


def _normalize_vector(vector):
    norm = math.sqrt(sum(value * value for value in vector.values()))
    if not norm:
        return {}
    return {key: value / norm for key, value in vector.items()}


def _dot(left, right):
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(key, 0.0) for key, value in left.items())


@dataclass(frozen=True)
class CasoHistorico:
    id_registro: str
    p309: str
    p308: str
    p308a: str
    codigo: str


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
        identifier = _campo(row, "id_registro")
        p309 = _campo(row, "p309")
        code = _campo(row, "codigo")
        if not any(str(value or "").strip() for value in row.values()):
            continue
        if not identifier or not p309 or not code:
            raise ValueError(f"Caso histórico incompleto en fila {line}: requiere ID, C309 y C309_COD.")
        if identifier in seen:
            raise ValueError(f"Identificador duplicado en entrenamiento (fila {line}): {identifier}")
        if code not in catalog:
            raise ValueError(f"Código CIIU fuera del catálogo en fila {line}: {code}")
        seen.add(identifier)
        cases.append(CasoHistorico(identifier, p309, _campo(row, "p308"), _campo(row, "p308a"), code))
    if len(cases) < 2:
        raise ValueError("Se requieren al menos dos casos históricos completos.")
    return cases


class MotorR2:
    def __init__(self, catalog, min_similarity=0.18, top_k=3):
        self.catalog = dict(catalog)
        self.min_similarity = float(min_similarity)
        self.top_k = max(1, min(5, int(top_k)))
        self.cases = []
        self.document_vectors = []
        self.idf = {}
        self.centroids = {}
        self.cases_by_code = defaultdict(list)
        self.model_version = MODEL_FAMILY

    def fit(self, cases):
        self.cases = list(cases)
        raw_vectors = [extraer_caracteristicas({"p309": c.p309, "p308": c.p308, "p308a": c.p308a}) for c in self.cases]
        document_frequency = Counter()
        for vector in raw_vectors:
            document_frequency.update(vector.keys())
        total = len(raw_vectors)
        self.idf = {key: math.log((1 + total) / (1 + count)) + 1.0 for key, count in document_frequency.items()}
        self.document_vectors = [self._tfidf(vector) for vector in raw_vectors]
        sums = defaultdict(Counter)
        for case, vector in zip(self.cases, self.document_vectors):
            sums[case.codigo].update(vector)
        self.centroids = {code: _normalize_vector(vector) for code, vector in sums.items()}
        self.cases_by_code = defaultdict(list)
        for index, case in enumerate(self.cases):
            self.cases_by_code[case.codigo].append(index)
        digest = hashlib.sha256()
        digest.update(MODEL_FAMILY.encode("utf-8"))
        digest.update(f"|{self.min_similarity}|{self.top_k}".encode("ascii"))
        for code, description in sorted(self.catalog.items()):
            digest.update(f"|catalogo|{code}|{normalizar(description)}".encode("utf-8"))
        for case in sorted(self.cases, key=lambda item: item.id_registro):
            digest.update(
                f"|{case.id_registro}|{case.codigo}|{normalizar(case.p309)}|"
                f"{normalizar(case.p308)}|{normalizar(case.p308a)}".encode("utf-8")
            )
        self.model_version = f"{MODEL_FAMILY}+{digest.hexdigest()[:10]}"
        return self

    def _tfidf(self, raw):
        weighted = {key: (1.0 + math.log(value)) * self.idf.get(key, 0.0) for key, value in raw.items() if value > 0}
        return _normalize_vector(weighted)

    def _query_vector(self, record):
        return self._tfidf(extraer_caracteristicas(record))

    def _rank_similar_cases(self, query):
        return sorted(
            ((_dot(query, vector), case) for case, vector in zip(self.cases, self.document_vectors)),
            key=lambda item: (-item[0], item[1].id_registro),
        )

    def _similar_cases(self, query, limit=3, allowed_codes=None):
        allowed = set(allowed_codes or [])
        ranked = sorted(
            ((_dot(query, vector), case) for case, vector in zip(self.cases, self.document_vectors)),
            key=lambda item: (-item[0], item[1].id_registro),
        )
        return [
            {
                "id_registro": case.id_registro,
                "codigo": case.codigo,
                "p309": case.p309[:240],
                "p308": case.p308[:160],
                "p308a": case.p308a[:240],
                "similitud": round(score, 6),
            }
            for score, case in ranked if score > 0 and (not allowed or case.codigo in allowed)
        ][:limit]

    def _class_scores(self, query):
        neighbor_scores = defaultdict(list)
        for score, case in self._rank_similar_cases(query):
            neighbor_scores[case.codigo].append(score)
        ranked = []
        for code, centroid in self.centroids.items():
            centroid_score = _dot(query, centroid)
            neighbors = neighbor_scores.get(code, [])
            nearest = neighbors[0] if neighbors else 0.0
            agreement = sum(neighbors[:3]) / max(1, min(3, len(neighbors)))
            score = 0.62 * centroid_score + 0.28 * nearest + 0.10 * agreement
            ranked.append((score, code, centroid_score, nearest))
        return sorted(ranked, key=lambda item: (-item[0], item[1]))

    def predict(self, record):
        identifier = str(record.get("id_registro") or "").strip()
        quality = evaluar_calidad(record)
        if quality["nivel"] == "baja":
            return {
                "id_registro": identifier,
                "revision_manual": True,
                "motivo": "La respuesta P309 no contiene texto suficiente o presenta demasiado ruido.",
                "calidad_entrada": quality,
            }
        query = self._query_vector(record)
        if not query:
            return {"id_registro": identifier, "revision_manual": True, "motivo": "Texto vacío o insuficiente para clasificar."}
        ranked = self._class_scores(query)
        if not ranked or ranked[0][0] < self.min_similarity:
            return {
                "id_registro": identifier,
                "revision_manual": True,
                "motivo": "No existe similitud suficiente con los casos históricos disponibles.",
                "casos_similares": self._similar_cases(query),
                "calidad_entrada": quality,
            }
        selected = ranked[: self.top_k]
        temperature = 0.10
        maximum = selected[0][0]
        weights = [math.exp((score - maximum) / temperature) for score, *_ in selected]
        total_weight = sum(weights) or 1.0
        probabilities = [weight / total_weight for weight in weights]
        top_similarity = selected[0][0]
        margin = top_similarity - (selected[1][0] if len(selected) > 1 else 0.0)
        nearest_cases = self._rank_similar_cases(query)[:5]
        top_code = selected[0][1]
        neighbor_agreement = sum(score for score, case in nearest_cases if case.codigo == top_code) / max(0.000001, sum(score for score, _ in nearest_cases))
        confidence_proxy = min(0.69, 0.10 + 0.48 * top_similarity + 0.24 * margin + 0.18 * neighbor_agreement)
        confidence_proxy = min(0.69, confidence_proxy)  # Sin calibración independiente no habilita decisión automática con τ=0.70.
        candidates = []
        for index, ((score, code, centroid_score, nearest), probability) in enumerate(zip(selected, probabilities), start=1):
            candidates.append({
                "codigo": code,
                "descripcion": self.catalog[code],
                "prob": round(confidence_proxy if index == 1 else min(probability, confidence_proxy - 0.000001), 6),
                "rank": index,
                "similitud": round(score, 6),
                "similitud_centroide": round(centroid_score, 6),
                "similitud_vecino": round(nearest, 6),
            })
        candidate_codes = [candidate[1] for candidate in selected]
        return {
            "id_registro": identifier,
            "confianza_ml": round(confidence_proxy, 6),
            "candidatos": candidates,
            "calibracion": "provisional-no-productiva",
            "calidad_entrada": quality,
            "casos_similares": self._similar_cases(query, allowed_codes=candidate_codes),
        }
