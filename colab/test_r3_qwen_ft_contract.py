import unittest
from r3_qwen_ft_contract import build_prompt, parse_output

CANDIDATES = [{'codigo':'5610','descripcion':'Restaurantes'}, {'codigo':'5629','descripcion':'Otros servicios'}]

class ContractTest(unittest.TestCase):
    def test_valid_selection(self):
        result = parse_output('{"CIIU":"5610","Razon":"Restaurante"}', CANDIDATES)
        self.assertEqual((result['decision'], result['codigo']), ('seleccionar', '5610'))

    def test_rejects_malformed_outside_and_explicit_review(self):
        for text in ['{"CIIU":"5610","Razon":"{', '{"CIIU":"9999"}', '{"decision":"revision_humana","CIIU":"5610"}']:
            with self.subTest(text=text):
                result = parse_output(text, CANDIDATES)
                self.assertEqual(result['decision'], 'revision_humana')
                self.assertIsNone(result['codigo'])

    def test_never_includes_reference_label(self):
        item = {'p309':'Venta de comida', 'p308':'Cocinera', 'p308a':'Cocina', 'C309_COD':'9999'}
        self.assertNotIn('9999', build_prompt(item, CANDIDATES))

if __name__ == '__main__':
    unittest.main()
