# -*- coding: utf-8 -*-
"""Genera un histórico R2 cerrado temporalmente y evita incorporar el periodo de prueba."""

from __future__ import annotations

import argparse
import csv
import os
from collections import Counter
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", required=True, type=Path)
    parser.add_argument("--salida", required=True, type=Path)
    parser.add_argument("--hasta", required=True, help="Último periodo permitido, por ejemplo 2025-12")
    args = parser.parse_args()

    try:
        limit_year, limit_month = (int(part) for part in args.hasta.split("-", 1))
    except (TypeError, ValueError) as error:
        raise SystemExit("--hasta debe usar el formato AAAA-MM") from error
    if not 1900 <= limit_year <= 2200 or not 1 <= limit_month <= 12:
        raise SystemExit("--hasta está fuera de un periodo válido")
    if args.entrada.resolve() == args.salida.resolve():
        raise SystemExit("La salida debe ser distinta del histórico original")

    with args.entrada.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {"ANIO", "MES", "ID_C200", "C309", "C309_COD"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"Faltan columnas obligatorias: {sorted(missing)}")
        rows = []
        periods = Counter()
        classes = set()
        seen_ids = set()
        for line, row in enumerate(reader, start=2):
            try:
                year, month = int(row["ANIO"]), int(row["MES"])
            except (TypeError, ValueError) as error:
                raise SystemExit(f"Periodo inválido en la fila {line}") from error
            identifier = str(row.get("ID_C200") or "").strip()
            if not identifier or identifier in seen_ids:
                raise SystemExit(f"ID vacío o duplicado en la fila {line}: {identifier!r}")
            seen_ids.add(identifier)
            if (year, month) <= (limit_year, limit_month):
                rows.append(row)
                periods[f"{year:04d}-{month:02d}"] += 1
                classes.add(str(row.get("C309_COD") or "").strip().zfill(4))

    if not rows:
        raise SystemExit("El filtro temporal no produjo registros")
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.salida.with_suffix(args.salida.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=reader.fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temporary, args.salida)
    print(
        f"Histórico creado: {args.salida.resolve()} | registros={len(rows)} | "
        f"clases={len(classes)} | periodo={min(periods)}..{max(periods)}"
    )


if __name__ == "__main__":
    main()
