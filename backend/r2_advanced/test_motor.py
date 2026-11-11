# -*- coding: utf-8 -*-

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from motor import CasoHistorico, MotorR2Avanzado, evaluar_calidad


class MotorR2AvanzadoTest(unittest.TestCase):
    def setUp(self):
        self.catalog = {
            "5610": "RESTAURANTES Y SERVICIO MÓVIL DE COMIDAS",
            "4922": "TRANSPORTE DE PASAJEROS",
            "6201": "PROGRAMACIÓN INFORMÁTICA",
        }
        self.cases = [
            CasoHistorico("A1", "2025", "01", "Venta de almuerzos en restaurante", "Cocinera", "Prepara platos", "", "", "", "5610"),
            CasoHistorico("A2", "2025", "02", "Preparación de comida en pollería", "Cocinero", "Cocina y sirve", "", "", "", "5610"),
            CasoHistorico("B1", "2025", "01", "Servicio de mototaxi", "Conductor", "Transporta pasajeros", "", "", "", "4922"),
            CasoHistorico("B2", "2025", "02", "Transporte de pasajeros en mototaxi", "Chofer", "Conduce vehículo", "", "", "", "4922"),
            CasoHistorico("C1", "2025", "01", "Desarrollo de software", "Programador", "Programa sistemas", "", "", "", "6201"),
            CasoHistorico("C2", "2025", "02", "Programación de aplicaciones", "Desarrollador", "Crea software", "", "", "", "6201"),
        ]
        self.engine = MotorR2Avanzado(self.catalog).fit(self.cases)

    def test_predice_top_k_y_evidencia(self):
        result = self.engine.predict({
            "id_registro": "X",
            "p309": "venta de almuerzos en restaurante",
            "p308": "cocinera",
            "p308a": "prepara platos",
        })
        self.assertEqual(result["candidatos"][0]["codigo"], "5610")
        self.assertLessEqual(len(result["candidatos"]), 3)
        self.assertTrue(result["casos_similares"])

    def test_deriva_texto_no_informativo(self):
        result = self.engine.predict({"id_registro": "X", "p309": "NO SABE NO RESPONDE"})
        self.assertTrue(result["revision_manual"])
        self.assertIn("respuesta_no_informativa", result["calidad_entrada"]["motivos"])

    def test_calidad_detecta_secuencia_sin_sentido(self):
        quality = evaluar_calidad({"p309": "QWERTY ZXCV ASDF"})
        self.assertEqual(quality["nivel"], "baja")
        self.assertIn("texto_sin_sentido", quality["motivos"])

    def test_deriva_p309_vacio_sin_consultar_qwen(self):
        result = self.engine.predict({"id_registro": "X", "p309": "", "p308": "", "p308a": ""})
        self.assertTrue(result["revision_manual"])
        self.assertIn("p309_vacio", result["calidad_entrada"]["motivos"])


if __name__ == "__main__":
    unittest.main()
