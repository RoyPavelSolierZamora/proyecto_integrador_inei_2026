# -*- coding: utf-8 -*-
"""
simulacion.py  --  SUSTITUTO TEMPORAL del clasificador de R2.

POR QUE EXISTE
  La capa LLM (R3) necesita un Top-K de candidatos para trabajar, pero el
  clasificador supervisado de R2 todavia no esta conectado. Este modulo GENERA
  candidatos artificiales para poder desarrollar y evaluar R3 hoy.

QUE CAMBIA CUANDO R2 ESTE LISTO
  Nada de R3. Solo se deja de llamar a `candidatos_simulados()` y se le pasa a
  `lote.py` el CSV/JSON que produzca R2 (ver contrato.py: ESQUEMA_ENTRADA).

  La interfaz de salida ya es la definitiva:
      [{"codigo": "0146", "descripcion": "...", "prob": 0.62, "rank": 1}, ...]

AVISO METODOLOGICO
  Cualquier metrica calculada sobre candidatos simulados NO es evidencia del
  desempeno real del sistema. Sirve solo para depurar el pipeline.
"""
import random

AVISO = "CANDIDATOS SIMULADOS: sustituir por la salida de R2 antes de reportar metricas."


def candidatos_simulados(codigo_real, catalogo, k=3, rng=None, con_prob=True):
    """
    Genera un Top-K artificial: el codigo verdadero + distractores.
    Los distractores se priorizan de la MISMA division CIIU (2 primeros digitos)
    para que la tarea sea dificil y realista.

    Devuelve la estructura del contrato (lista de dicts), no tuplas.
    """
    rng = rng or random.Random(42)
    codigo_real = str(codigo_real).strip()
    misma_div = [c for c in catalogo if c[:2] == codigo_real[:2] and c != codigo_real]
    otros = [c for c in catalogo if c[:2] != codigo_real[:2]]

    n_dist = k - 1
    distractores = rng.sample(misma_div, min(n_dist, len(misma_div)))
    if len(distractores) < n_dist:
        distractores += rng.sample(otros, n_dist - len(distractores))

    codigos = [codigo_real] + distractores
    rng.shuffle(codigos)

    cands = []
    for i, c in enumerate(codigos):
        cands.append({
            "codigo": c,
            "descripcion": catalogo[c],
            "prob": round(1.0 / k, 3) if con_prob else None,
            "rank": i + 1,
        })
    return cands


def a_tuplas(candidatos):
    """Compatibilidad con el codigo antiguo que usaba [(codigo, descripcion), ...]."""
    return [(c["codigo"], c["descripcion"]) for c in candidatos]


def simular_entrada(id_registro, p309, codigo_real, catalogo, k=3, rng=None):
    """Arma una entrada completa del contrato (la que producira R2)."""
    return {
        "id_registro": id_registro,
        "p309": p309,
        "candidatos": candidatos_simulados(codigo_real, catalogo, k=k, rng=rng),
        "confianza_ml": round(1.0 / k, 3),
    }


# --------------------------------------------------------------------------
# Sugerencia lexica: simula el Top-K de R2 a partir del texto (para el panel)
# --------------------------------------------------------------------------
def _palabras(txt):
    """Minusculas, sin tildes, solo palabras de 4+ letras."""
    import re
    import unicodedata

    txt = unicodedata.normalize("NFD", (txt or "").lower())
    txt = "".join(c for c in txt if unicodedata.category(c) != "Mn")
    return {p for p in re.findall(r"[a-z]{4,}", txt)}


def sugerir_candidatos(texto, catalogo, k=3):
    """
    Top-K aproximado por solapamiento de palabras con las descripciones CIIU.

    ES UN SUSTITUTO MUY SIMPLE DEL MODELO DE R2 y falla seguido: la CIIU usa
    vocabulario formal ("aves de corral") y la gente escribe coloquial ("pollos").
    Si no hay coincidencias devuelve [] a proposito: es preferible que el usuario
    busque el codigo a mano antes que inventarle candidatos equivocados.
    """
    pal = _palabras(texto)
    puntajes = []
    for cod, desc in catalogo.items():
        comunes = len(pal & _palabras(desc))
        if comunes:
            puntajes.append((comunes, cod, desc))
    if not puntajes:
        return []

    puntajes.sort(key=lambda x: (-x[0], x[1]))
    top = puntajes[:k]
    total = sum(p[0] for p in top) or 1
    return [{"codigo": c, "descripcion": d, "prob": round(n / total, 3), "rank": i + 1}
            for i, (n, c, d) in enumerate(top)]


def buscar_en_catalogo(texto, catalogo, limite=12):
    """
    Busca clases cuya DESCRIPCION contenga todas las palabras del texto.
    Sirve para que el usuario encuentre el codigo correcto a mano en el panel.
    """
    pal = _palabras(texto)
    if not pal:
        return []
    res = []
    for cod, desc in catalogo.items():
        if pal <= _palabras(desc):
            res.append({"codigo": cod, "descripcion": desc})
    if not res:                            # si es muy estricto, relajar a "alguna palabra"
        for cod, desc in catalogo.items():
            if pal & _palabras(desc):
                res.append({"codigo": cod, "descripcion": desc})
    return res[:limite]
