import json
import tempfile
import unittest
from pathlib import Path

from comparar_asistentes import load_data, summarize

class ComparisonTest(unittest.TestCase):
    def test_reference_never_goes_to_service(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'entrada.jsonl').write_text(json.dumps({'id_registro':'1', 'p309':'venta', 'codigo_esperado':'9999', 'candidatos':[{'codigo':'5610', 'etiqueta_real':'9999'}]}) + '\n', encoding='utf-8')
            (root / 'ref.csv').write_text('id_registro,codigo_esperado\n1,5610\n', encoding='utf-8')
            records, truth = load_data(root / 'entrada.jsonl', root / 'ref.csv')
            self.assertEqual(truth['1'], '5610')
            self.assertNotIn('codigo_esperado', records[0])
            self.assertNotIn('etiqueta_real', records[0]['candidatos'][0])

    def test_errors_and_abstentions_are_not_predictions(self):
        rows = [{'esperado':'5610','top1':'5610','a':{'estado':'seleccion','codigo':'5610','segundos':1}},
                {'esperado':'5610','top1':'5610','a':{'estado':'revision','codigo':'','segundos':2}},
                {'esperado':'5610','top1':'5610','a':{'estado':'error','codigo':'','segundos':3}}]
        report = summarize(rows, 'a')
        self.assertEqual((report['aciertos'], report['revisiones'], report['errores_tecnicos']), (1, 1, 1))
        self.assertAlmostEqual(report['cobertura_seleccion'], 1 / 3)
        self.assertEqual(report['precision_seleccion'], 1)

if __name__ == '__main__':
    unittest.main()
