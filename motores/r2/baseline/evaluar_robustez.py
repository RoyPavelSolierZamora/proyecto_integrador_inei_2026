# -*- coding: utf-8 -*-
"""Prueba determinista de robustez. No mide generalización a personas nuevas."""

import argparse
import re
from collections import Counter

from motor import MotorR2, cargar_catalogo, cargar_casos


REEMPLAZOS = {
    "venta": "vta", "ventas": "vtas", "servicio": "serv",
    "transporte": "transp", "fabricacion": "fab", "mantenimiento": "mant",
    "restaurante": "rest", "comercio": "comerc",
}


def abreviar(text):
    return " ".join(REEMPLAZOS.get(word.lower().strip(".,;:"), word) for word in str(text).split())


def quitar_vocales_parcial(text):
    words = str(text).split()
    result = []
    for index, word in enumerate(words):
        if index % 3 == 1 and len(word) > 4:
            word = re.sub(r"[aeiouáéíóú]", "", word, count=1, flags=re.IGNORECASE)
        result.append(word)
    return " ".join(result)


def fragmentar(text):
    words = str(text).split()
    return " ".join(words[::2])


def variantes(case):
    yield "control", {"p309": case.p309, "p308": case.p308, "p308a": case.p308a}
    yield "sin_contexto", {"p309": case.p309, "p308": "", "p308a": ""}
    yield "abreviado", {"p309": abreviar(case.p309), "p308": abreviar(case.p308), "p308a": abreviar(case.p308a)}
    yield "errores", {
        "p309": "!!! " + quitar_vocales_parcial(case.p309.lower()) + " ???",
        "p308": quitar_vocales_parcial(case.p308.lower()),
        "p308a": quitar_vocales_parcial(case.p308a.lower()),
    }
    yield "fragmentado", {"p309": fragmentar(case.p309.lower()), "p308": "", "p308a": ""}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrenamiento", required=True)
    parser.add_argument("--catalogo", required=True)
    args = parser.parse_args()

    catalog = cargar_catalogo(args.catalogo)
    cases = cargar_casos(args.entrenamiento, catalog)
    engine = MotorR2(catalog).fit(cases)
    totals = Counter()
    hits1 = Counter()
    hits3 = Counter()
    manual = Counter()
    for case in cases:
        for kind, record in variantes(case):
            record["id_registro"] = f"stress-{case.id_registro}-{kind}"
            result = engine.predict(record)
            totals[kind] += 1
            if result.get("revision_manual"):
                manual[kind] += 1
                continue
            codes = [item["codigo"] for item in result["candidatos"]]
            hits1[kind] += int(codes[0] == case.codigo)
            hits3[kind] += int(case.codigo in codes)

    print(f"modelo={engine.model_version}")
    for kind in ("control", "sin_contexto", "abreviado", "errores", "fragmentado"):
        total = totals[kind]
        print(
            f"{kind}: registros={total} top1={hits1[kind] / total:.3%} "
            f"top3={hits3[kind] / total:.3%} derivacion={manual[kind] / total:.3%}"
        )
    print("Advertencia: usa alteraciones del entrenamiento; mide robustez, no generalización.")


if __name__ == "__main__":
    main()
