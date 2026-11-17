import csv
import json
import os
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

os.environ['R3_API_TOKEN'] = 'token-sintetico-de-prueba-123456789'
import torch
import r3_qwen_ft_service as service

class Inputs(dict):
    def to(self, _device): return self

class Tokenizer:
    eos_token_id = 0
    def apply_chat_template(self, *_args, **_kwargs): return 'prompt-sintetico'
    def __call__(self, *_args, **_kwargs): return Inputs(input_ids=torch.tensor([[1, 2]]))
    def decode(self, *_args, **_kwargs): return '{"CIIU":"5610","Razon":"Restaurante"}'

class Model:
    device = 'cpu'
    def eval(self): return self
    def generate(self, **_kwargs): return torch.tensor([[1, 2, 3]])

class ServiceTest(unittest.TestCase):
    def test_authenticated_end_to_end_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'catalogo.csv'
            with path.open('w', encoding='utf-8', newline='') as file:
                writer = csv.writer(file)
                writer.writerow(['codigo', 'descripcion'])
                for code in list(range(416)) + [5610]: writer.writerow([str(code).zfill(4), 'Clase'])
            service.configure(Model(), Tokenizer(), path)
            server = service.start_server(0)
            try:
                url = f'http://127.0.0.1:{server.server_port}'
                with self.assertRaises(HTTPError) as blocked:
                    urlopen(url + '/salud', timeout=5)
                self.assertEqual(blocked.exception.code, 401)
                headers = {'Authorization':'Bearer ' + os.environ['R3_API_TOKEN'], 'Content-Type':'application/json'}
                with urlopen(Request(url + '/salud', headers=headers), timeout=5) as response:
                    self.assertEqual(json.load(response)['modelo'], service.MODEL_NAME)
                payload = {'id_registro':'SINT-1','p309':'Comida','candidatos':[{'codigo':'5610','descripcion':'Restaurante'}]}
                request = Request(url + '/codificar', data=json.dumps(payload).encode(), headers=headers, method='POST')
                with urlopen(request, timeout=5) as response:
                    result = json.load(response)
                self.assertEqual((result['id_registro'], result['decision'], result['codigo']), ('SINT-1', 'seleccionar', '5610'))
            finally:
                server.shutdown()
                server.server_close()

if __name__ == '__main__': unittest.main()
