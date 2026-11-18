# -*- coding: utf-8 -*-

import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from motor import MotorR2, cargar_catalogo, cargar_casos


class MotorR2Test(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.catalog = root / "catalogo.csv"
        self.training = root / "training.csv"
        self.catalog.write_text(
            "codigo,descripcion\n5610,RESTAURANTES\n4922,TRANSPORTE TERRESTRE\n6201,PROGRAMACION\n",
            encoding="utf-8",
        )
        self.training.write_text(
            "ID_C200,C308,C308A,C309,C309_COD\n"
            "A1,Cocinera,Prepara platos,Venta de almuerzos en restaurante,5610\n"
            "A2,Conductor,Transporta pasajeros,Servicio de mototaxi,4922\n"
            "A3,Programador,Desarrolla sistemas,Programación de software,6201\n",
            encoding="utf-8",
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_carga_alias_reales_y_predice(self):
        catalog = cargar_catalogo(self.catalog)
        engine = MotorR2(catalog).fit(cargar_casos(self.training, catalog))
        result = engine.predict({"id_registro": "X", "p309": "vende almuerzos en restorante", "p308": "cocinera", "p308a": "prepara platos"})
        self.assertEqual(result["candidatos"][0]["codigo"], "5610")
        self.assertLessEqual(result["confianza_ml"], 0.69)
        self.assertTrue(result["casos_similares"])

    def test_deriva_texto_desconocido(self):
        catalog = cargar_catalogo(self.catalog)
        engine = MotorR2(catalog).fit(cargar_casos(self.training, catalog))
        result = engine.predict({"id_registro": "X", "p309": "actividad completamente desconocida zzz"})
        self.assertTrue(result["revision_manual"])

    def test_resiste_abreviaturas_y_errores(self):
        catalog = cargar_catalogo(self.catalog)
        engine = MotorR2(catalog).fit(cargar_casos(self.training, catalog))
        result = engine.predict({
            "id_registro": "X",
            "p309": "VTA d almuersos!!! en rest",
            "p308": "cosinera",
            "p308a": "prepara platoz",
        })
        self.assertEqual(result["candidatos"][0]["codigo"], "5610")
        self.assertEqual(result["calidad_entrada"]["nivel"], "alta")

    def test_deriva_entrada_con_simbolos_sin_evidencia(self):
        catalog = cargar_catalogo(self.catalog)
        engine = MotorR2(catalog).fit(cargar_casos(self.training, catalog))
        result = engine.predict({"id_registro": "X", "p309": "?????"})
        self.assertTrue(result["revision_manual"])
        self.assertEqual(result["calidad_entrada"]["nivel"], "baja")

    def test_deriva_respuestas_no_informativas_o_sin_sentido(self):
        catalog = cargar_catalogo(self.catalog)
        engine = MotorR2(catalog).fit(cargar_casos(self.training, catalog))
        for text in ("NO SABE NO RESPONDE", "QWERTY ZXCV ASDF"):
            with self.subTest(text=text):
                result = engine.predict({"id_registro": "X", "p309": text})
                self.assertTrue(result["revision_manual"])
                self.assertEqual(result["calidad_entrada"]["nivel"], "baja")


if __name__ == "__main__":
    unittest.main()
