import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from tunel_qwen_ajustado import check_service

TOKEN = 'token-sintetico-de-prueba-123456789'

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_GET(self):
        if self.headers.get('Authorization') != 'Bearer ' + TOKEN:
            self.send_response(401); self.end_headers(); return
        body = json.dumps({'estado':'ok','servicio':'qwen-ft','contrato_version':'1.1','catalogo_clases':417}).encode()
        self.send_response(200); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

class TunnelTest(unittest.TestCase):
    def test_health_with_token_and_wrong_token(self):
        server = HTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            self.assertEqual(check_service(TOKEN, server.server_port)['servicio'], 'qwen-ft')
            with self.assertRaises(RuntimeError):
                check_service('otro-token-sintetico-123456789', server.server_port)
        finally:
            server.shutdown(); server.server_close()

if __name__ == '__main__': unittest.main()
