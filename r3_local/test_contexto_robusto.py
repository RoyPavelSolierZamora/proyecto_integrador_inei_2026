# -*- coding: utf-8 -*-

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import clasificador
import contrato


class ContextoRobustoTest(unittest.TestCase):
    def test_filtra_antecedentes_fuera_del_top_k(self):
        entrada, errores = contrato.normalizar_entrada({
            "id_registro": "A-1",
            "p309": "vta d almuerzos",
            "p308": "cocinera",
            "p308a": "prepara platos",
            "candidatos": [
                {"codigo": "5610", "descripcion": "Restaurantes", "prob": 0.6},
                {"codigo": "4922", "descripcion": "Transporte", "prob": 0.4},
            ],
            "casos_similares": [
                {"codigo": "5610", "p309": "Venta de almuerzos", "similitud": 0.9},
                {"codigo": "6201", "p309": "Programación", "similitud": 0.8},
            ],
        })
        self.assertFalse(errores)
        self.assertEqual([item["codigo"] for item in entrada["casos_similares"]], ["5610"])

    def test_prompt_incluye_contexto_y_antecedente_validado(self):
        prompt = clasificador.construir_mensaje_usuario(
            "vta d almuerzos",
            [{"codigo": "5610", "descripcion": "Restaurantes", "rank": 1, "prob": 0.63}],
            p308="cocinera",
            p308a="prepara platos",
            casos_similares=[{
                "codigo": "5610", "p309": "Venta de almuerzos", "p308": "cocinera",
                "p308a": "prepara menú", "similitud": 0.91,
            }],
        )
        self.assertIn("<P308>cocinera</P308>", prompt)
        self.assertIn("rango 1: 5610", prompt)
        self.assertIn("puntaje R2 0.630", prompt)
        self.assertIn('P309="Venta de almuerzos"', prompt)
        self.assertIn('P308A="prepara menú"', prompt)
        self.assertIn("similitud 0.910", prompt)


if __name__ == "__main__":
    unittest.main()
