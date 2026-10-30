"""Prove del server senza pacchetti AI, rete, modelli o GPU."""
import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

RADICE = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('server_ai', RADICE / 'src-tauri/motore/server.py')
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)

class Prove(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
    def tearDown(self):
        self.temp.cleanup()
    def test_salute_catalogo_token_e_origin_senza_torch(self):
        server = S.crea_server(self.temp.name, 'x' * 64)
        t = threading.Thread(target=server.serve_forever)
        t.start()
        url = f'http://127.0.0.1:{server.server_port}'
        def leggi(percorso, token='x' * 64, origin=None):
            headers = {'Authorization': 'Bearer ' + token}
            if origin:
                headers['Origin'] = origin
            with urllib.request.urlopen(urllib.request.Request(url + percorso, headers=headers), timeout=3) as r:
                return json.load(r)
        try:
            self.assertTrue(leggi('/salute')['ok'])
            self.assertFalse(leggi('/modelli')['modelli'][0]['scaricato'])
            for token, origin in [('sbagliato', None), ('x' * 64, 'http://sito.example')]:
                with self.assertRaises(urllib.error.HTTPError) as errore:
                    leggi('/salute', token, origin)
                self.assertEqual(errore.exception.code, 403)
            self.assertNotIn('torch', sys.modules)
            self.assertNotIn('qwen_tts', sys.modules)
        finally:
            server.shutdown(); server.server_close(); t.join()
    def test_un_solo_lavoro_e_risultati_senza_accumulo(self):
        m = S.Motore(self.temp.name)
        partita, continua = threading.Event(), threading.Event()
        def scarica(n):
            partita.set(); continua.wait(3); return {'ok': True}
        m.scarica = scarica
        n = m.avvia('/modelli/scarica', {})['id']
        self.assertTrue(partita.wait(1))
        try:
            with self.assertRaises(ValueError):
                m.avvia('/modelli/scarica', {})
        finally:
            continua.set()
            with m.lock:
                pass
        self.assertEqual(m.lavori[n]['stato'], 'finito')
        with self.assertRaises(ValueError):
            m.avvia('/voce/genera', {'modello': 'non-permissivo'})
        self.assertNotIn('torch', sys.modules)
    def test_download_hash_ripresa_e_catalogo_chiuso(self):
        m = S.Motore(self.temp.name)
        contenuto = b'pesi finti per la prova'
        h = hashlib.sha256(contenuto).hexdigest()
        meta = {'sha': S.REVISIONE, 'cardData': {'license': 'apache-2.0'},
                'siblings': [{'rfilename': 'model.safetensors', 'size': len(contenuto), 'lfs': {'sha256': h}}]}
        class Risposta(io.BytesIO):
            status = 206
        def rete(richiesta, **kwargs):
            if isinstance(richiesta, str):
                return io.BytesIO(json.dumps(meta).encode())
            offset = int(richiesta.get_header('Range', 'bytes=0-').split('=')[1].split('-')[0])
            return Risposta(contenuto[offset:])
        m.cartella.mkdir(parents=True)
        (m.cartella / 'model.safetensors.part').write_bytes(contenuto[:5])
        m.lavori['1'] = {}
        with patch.object(S.urllib.request, 'urlopen', rete):
            m.scarica('1')
            self.assertEqual((m.cartella / 'model.safetensors').read_bytes(), contenuto)
            self.assertTrue((m.cartella / 'scaricato.json').exists())
            meta['cardData']['license'] = 'non-commerciale'
            with self.assertRaisesRegex(ValueError, 'licenza'):
                m.scarica('1')
            meta['cardData']['license'] = 'apache-2.0'
            meta['siblings'][0]['rfilename'] = '../model.safetensors'
            with self.assertRaisesRegex(ValueError, 'percorso'):
                m.scarica('1')
    def test_generazione_senza_pesi_non_importa_torch(self):
        m = S.Motore(self.temp.name)
        with self.assertRaisesRegex(ValueError, 'Scarica prima'):
            m.genera('1', {'testo': 'Ciao', 'campione': base64.b64encode(b'campione').decode()})
        self.assertNotIn('torch', sys.modules)
    def test_pipe_chiusa_termina_python(self):
        env = {**os.environ, 'DAPROD_TOKEN': 'x' * 64, 'DAPROD_RADICE': self.temp.name}
        child = subprocess.Popen([sys.executable, '-u', str(RADICE / 'src-tauri/motore/server.py')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        try:
            self.assertIn('porta', json.loads(child.stdout.readline()))
            child.stdin.close()
            self.assertEqual(child.wait(timeout=5), 0)
        finally:
            if child.poll() is None:
                child.kill(); child.wait()
            child.stdout.close(); child.stderr.close()

if __name__ == '__main__':
    unittest.main()
