"""Le funzioni nuove del motore (traduzione, voce pulita, voce e musica, scene, rallentatore, parole con i tempi)
provate con motori FINTI: nessun modello, nessuna rete, nessuna GPU. Il giro con i modelli veri non è mai stato fatto da qui."""
import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from unittest.mock import patch

RADICE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RADICE / 'src-tauri/motore'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import motore_catalogo as C  # noqa: E402
import motore_lavoratori as L  # noqa: E402
SPEC = importlib.util.spec_from_file_location('server_ai_nuovo', RADICE / 'src-tauri/motore/server.py')
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
FINTO = Path(__file__).resolve().parent / 'lavoratore_finto.py'


class Registro:
    """Un backend finto che ricorda cosa gli è stato chiesto."""
    def __init__(self, **ris):
        self.chiamate = []
        self.ris = ris

    def __getattr__(self, nome):
        def f(*a, **k):
            self.chiamate.append((nome, a))
            r = self.ris.get(nome)
            return r(*a) if callable(r) else r
        return f


class Base(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ctx = L.Contesto(self.temp.name, '7')
        self.ctx.scambio.mkdir(parents=True)
        self.progresso = []
        self.ctx._avanza = lambda k, t: self.progresso.append(k)

    def tearDown(self):
        self.temp.cleanup()

    def scrivi(self, nome, byte=b'RIFFfinto'):
        (self.ctx.scambio / nome).write_bytes(byte)


class Catalogo(unittest.TestCase):
    def test_catalogo_chiuso_licenze_revisioni_e_stati(self):
        ids = [m['id'] for m in C.CATALOGO]
        self.assertEqual(len(ids), len(set(ids)))
        for m in C.CATALOGO:
            self.assertTrue(C.licenza_ammessa(m), m['id'])
            self.assertIn(m['stato'], ('opzionale', 'sperimentale'))
            self.assertTrue(m['peso'] and m['vram'] and m['requisiti'], m['id'])
            self.assertRegex(m['revisione'], r'^[0-9a-f]{40}$', m['id'])
            for f in m['fonti']:
                if f['tipo'] == 'hf':
                    self.assertRegex(f['revisione'], r'^[0-9a-f]{40}$')
                    self.assertIn(f['licenza_hf'], ('apache-2.0', 'mit', 'other'))
                    if f['licenza_hf'] == 'other':
                        self.assertIn(f['licenza_nome'], C.LICENZE_AMMESSE)
                else:
                    self.assertRegex(f['blob'], r'^[0-9a-f]{40}$')
                    self.assertIn(m['revisione'], f['url'])
        # solo RIFE è sperimentale; ogni funzione ha un solo modello
        self.assertEqual([m['id'] for m in C.CATALOGO if m['stato'] == 'sperimentale'], ['rife-425'])
        self.assertEqual(set(C.FUNZIONE_MODELLO), {'voce', 'traduci', 'trascrivi', 'separa', 'scene', 'pulisci', 'rallenta'})
        # il catalogo non nomina i modelli esclusi per licenza
        testo = json.dumps(C.CATALOGO, default=str).lower()
        for vietato in ('nllb', 'cc-by-nc', 'sam3', 'sam-license', 'matanyone', 'rmbg', 'propainter'):
            self.assertNotIn(vietato, testo)

    def test_traduzione_copre_le_nove_lingue_dell_interfaccia(self):
        for lingua in ('it', 'en', 'es', 'fr', 'de', 'pt', 'zh', 'ja', 'ar'):
            self.assertIn(lingua, C.LINGUE_TRADUZIONE)


class Funzioni(Base):
    def test_traduci(self):
        b = Registro(traduci=lambda t, d, a: f' <{a}> {t} ')
        r = L.lavora_traduci({'testi': ['Ciao', '', '  ', 'Come stai?'], 'da': 'it', 'a': 'en'}, self.ctx, b)
        self.assertEqual(r['testi'], ['<English> Ciao', '', '  ', '<English> Come stai?'])
        self.assertEqual([c[1][1:] for c in b.chiamate], [('Italian', 'English')] * 2)
        self.assertEqual(self.progresso, sorted(self.progresso))
        self.assertEqual(self.progresso[-1], 1.0)
        # stessa lingua: il testo torna com'è, il modello non si tocca
        b2 = Registro()
        self.assertEqual(L.lavora_traduci({'testi': ['x'], 'da': 'it', 'a': 'it'}, self.ctx, b2)['testi'], ['x'])
        self.assertEqual(b2.chiamate, [])
        # risposta vuota del modello: resta il testo originale
        self.assertEqual(L.lavora_traduci({'testi': ['x'], 'da': 'it', 'a': 'en'}, self.ctx, Registro(traduci=''))['testi'], ['x'])
        for male in ({'testi': [], 'da': 'it', 'a': 'en'}, {'testi': ['x'], 'da': 'it', 'a': 'xx'}, {'testi': [1], 'da': 'it', 'a': 'en'},
                     {'testi': ['x' * 2001], 'da': 'it', 'a': 'en'}, {'testi': ['x'] * 301, 'da': 'it', 'a': 'en'}, {'da': 'it', 'a': 'en'}):
            with self.assertRaises(ValueError, msg=str(male)[:40]):
                L.lavora_traduci(male, self.ctx, Registro())

    def test_pulisci(self):
        self.scrivi('in.wav')

        def pulisci(i, o, forza, avanza):
            Path(o).write_bytes(b'pulito')
            avanza(0.5, 'metà')
            return {'sr': 48000, 'durata': 2.5}
        b = Registro(pulisci=pulisci)
        r = L.lavora_pulisci({'file': 'in.wav', 'forza': 0.7}, self.ctx, b)
        self.assertEqual(r, {'file': 'pulito-7.wav', 'sr': 48000, 'durata': 2.5})
        self.assertEqual(b.chiamate[0][1][2], 0.7)
        with self.assertRaisesRegex(ValueError, 'non è arrivato'):
            L.lavora_pulisci({'file': 'manca.wav'}, self.ctx, b)
        for nome in ('../x.wav', 'a/b/c.wav', '/etc/passwd', 'a b.wav', '', None, 5):
            with self.assertRaises(ValueError, msg=repr(nome)):
                L.lavora_pulisci({'file': nome}, self.ctx, b)
        with self.assertRaises(ValueError):
            L.lavora_pulisci({'file': 'in.wav', 'forza': 5}, self.ctx, b)
        self.ctx.job = '8'
        with self.assertRaisesRegex(ValueError, 'non ha prodotto'):
            L.lavora_pulisci({'file': 'in.wav'}, self.ctx, Registro(pulisci={'sr': 48000}))

    def test_separa_sposta_i_file_e_toglie_la_cartella_di_lavoro(self):
        self.scrivi('canzone.wav')

        def separa(i, cartella, avanza):
            (Path(cartella) / 'a.wav').write_bytes(b'voce')
            (Path(cartella) / 'b.wav').write_bytes(b'base')
            return {'voce': str(Path(cartella) / 'a.wav'), 'musica': str(Path(cartella) / 'b.wav')}
        r = L.lavora_separa({'file': 'canzone.wav'}, self.ctx, Registro(separa=separa))
        self.assertEqual(r, {'voce': 'voce-7.wav', 'musica': 'musica-7.wav'})
        self.assertEqual((self.ctx.scambio / 'voce-7.wav').read_bytes(), b'voce')
        self.assertFalse((self.ctx.scambio / 'separa-7').exists())
        with self.assertRaises(ValueError):
            L.lavora_separa({'file': 'canzone.wav'}, self.ctx, Registro(separa={'voce': 'no', 'musica': 'no'}))
        self.assertFalse((self.ctx.scambio / 'separa-7').exists())

    def test_scene_pulisce_ordina_e_unisce_i_tagli_vicini(self):
        video = Path(self.temp.name) / 'clip.mp4'
        video.write_bytes(b'x')
        grezzi = {'fps': 25, 'durata': 30, 'tagli': [{'t': 12, 'p': 0.7}, {'t': 3, 'p': 0.9}, {'t': 3.1, 'p': 0.6}, {'t': -1, 'p': 1},
                                                     {'t': float('nan'), 'p': 1}, {'t': 99, 'p': 0.9}, {'t': 3.2, 'p': 0.95}]}
        r = L.lavora_scene({'file': str(video), 'da': 0, 'a': 30}, self.ctx, Registro(scene=grezzi))
        self.assertEqual([x['t'] for x in r['tagli']], [3.2, 12])
        self.assertEqual(r['fps'], 25)
        with self.assertRaisesRegex(ValueError, 'non trova'):
            L.lavora_scene({'file': str(video.with_suffix('.txt'))}, self.ctx, Registro())
        with self.assertRaisesRegex(ValueError, 'non trova'):
            L.lavora_scene({'file': 'relativo.mp4'}, self.ctx, Registro())
        with self.assertRaises(ValueError):
            L.lavora_scene({'file': str(video), 'da': 10, 'a': 5}, self.ctx, Registro())
        with self.assertRaises(ValueError):
            L.lavora_scene({'file': str(video), 'soglia': 3}, self.ctx, Registro())

    def test_rallenta_limiti_e_fotogrammi(self):
        video = Path(self.temp.name) / 'clip.mov'
        video.write_bytes(b'x')

        def rallenta(p, da, a, fattore, cartella, avanza):
            nomi = [f'f{i:06d}.jpg' for i in range(1, 6)]
            for n in nomi:
                (Path(cartella) / n).write_bytes(b'j')
            return {'fps': 30, 'larghezza': 1280, 'altezza': 720, 'file': nomi + ['../fuori.jpg']}
        r = L.lavora_rallenta({'file': str(video), 'da': 1, 'a': 3, 'fattore': 2}, self.ctx, Registro(rallenta=rallenta))
        self.assertEqual(r['cartella'], 'rallenta-7')
        self.assertEqual(len(r['file']), 5)  # il nome con '..' è scartato
        self.assertEqual(r['fattore'], 2)
        for male in ({'da': 0, 'a': 13, 'fattore': 2}, {'da': 0, 'a': 5, 'fattore': 3}, {'da': 5, 'a': 5, 'fattore': 2}, {'a': 5, 'fattore': 2}):
            with self.assertRaises(ValueError, msg=str(male)):
                L.lavora_rallenta({'file': str(video), **male}, self.ctx, Registro(rallenta=rallenta))
        with self.assertRaisesRegex(ValueError, 'non ha prodotto'):
            L.lavora_rallenta({'file': str(video), 'da': 0, 'a': 2, 'fattore': 2}, self.ctx, Registro(rallenta={'file': ['f1.jpg']}))

    def test_trascrivi_parole_ordinate_e_valide(self):
        self.scrivi('parlato.wav')
        grezzo = {'lingua': 'Italian', 'testo': 'ciao a tutti', 'parole': [
            {'t': 'tutti', 'da': 1.0, 'a': 1.5}, {'t': 'ciao', 'da': 0.1, 'a': 0.5}, {'t': '', 'da': 2, 'a': 3}, {'t': 'a', 'da': 0.6, 'a': 0.4},
            {'t': 'x', 'da': -1, 'a': 0}, {'t': 'y', 'da': float('inf'), 'a': 1}]}
        b = Registro(trascrivi=grezzo)
        r = L.lavora_trascrivi({'file': 'parlato.wav', 'lingua': 'it'}, self.ctx, b)
        self.assertEqual([p['t'] for p in r['parole']], ['ciao', 'a', 'tutti'])
        self.assertEqual(r['parole'][1], {'t': 'a', 'da': 0.6, 'a': 0.6})  # la fine non va prima dell'inizio
        self.assertFalse(r['senza_tempi'])
        self.assertEqual(b.chiamate[0][1][1], 'Italian')
        L.lavora_trascrivi({'file': 'parlato.wav'}, self.ctx, b)
        self.assertIsNone(b.chiamate[1][1][1])  # «auto»: lascia scegliere al modello
        r2 = L.lavora_trascrivi({'file': 'parlato.wav', 'lingua': 'it'}, self.ctx, Registro(trascrivi={'lingua': 'Arabic', 'testo': 'مرحبا', 'parole': []}))
        self.assertTrue(r2['senza_tempi'])
        with self.assertRaisesRegex(ValueError, 'lingua'):
            L.lavora_trascrivi({'file': 'parlato.wav', 'lingua': 'xx'}, self.ctx, b)


class Processo(Base):
    """Il giro vero del protocollo: processo figlio, righe JSON, errori, memoria."""
    def lancia(self, funzione, dati, dispositivo='cuda'):
        import lavoratore_finto  # noqa: F401  (registra i motori finti)
        richiesta = json.dumps({'radice': self.temp.name, 'job': '3', 'dati': dati, 'dispositivo': dispositivo})
        out = io.StringIO()
        stdout = sys.stdout
        try:
            L.main_lavoratore(funzione, io.StringIO(richiesta), out)
        finally:
            sys.stdout = stdout
        return [json.loads(r) for r in out.getvalue().splitlines()]

    def test_main_in_processo(self):
        righe = self.lancia('traduci', {'testi': ['Ciao'], 'da': 'it', 'a': 'en'})
        self.assertEqual(righe[-1], {'risultato': {'testi': ['[English] Ciao'], 'lingua': 'en'}})
        self.assertTrue(any('k' in r for r in righe[:-1]))
        errore = self.lancia('traduci', {'testi': ['ESPLODI'], 'da': 'it', 'a': 'en'})[-1]
        self.assertEqual(errore, {'errore': 'Frase di prova rifiutata', 'valido': True})
        memoria = self.lancia('traduci', {'testi': ['x'], 'da': 'it', 'a': 'en'}, 'cpu')[-1]
        self.assertIn('VRAM', memoria['errore'])
        self.assertIn('errore', self.lancia('inesistente', {})[-1])

    def motore_finto(self):
        m = S.Motore(self.temp.name)
        m.comando_lavoratore = lambda funzione, mod: [sys.executable, '-u', str(FINTO), funzione]
        # il modello risulta scaricato (la prova non scarica niente)
        d = m.cartella_di('hy-mt2-18b')
        d.mkdir(parents=True)
        (d / 'scaricato.json').write_text('{}')
        (m.radice / 'ambienti' / 'hy-mt2-18b').mkdir(parents=True)
        (m.radice / 'ambienti' / 'hy-mt2-18b' / 'pronto').write_text('1')
        return m

    def attendi(self, m, n):
        for _ in range(400):
            with m.lock:
                pass
            r = m.lavori[n]
            if r['stato'] != 'lavoro':
                return r
        self.fail('lavoro non finito')

    def test_il_motore_lancia_il_processo_e_passa_il_risultato(self):
        m = self.motore_finto()
        n = m.avvia('/traduci', {'testi': ['Ciao', ''], 'da': 'it', 'a': 'fr'})['id']
        r = self.attendi(m, n)
        self.assertEqual(r['stato'], 'finito', r)
        self.assertEqual(r['risultato']['testi'], ['[French] Ciao', ''])
        n = m.avvia('/traduci', {'testi': ['ESPLODI'], 'da': 'it', 'a': 'fr'})['id']
        r = self.attendi(m, n)
        self.assertEqual((r['stato'], r['errore']), ('errore', 'Frase di prova rifiutata'))
        # l'errore non lascia il motore occupato: si può riprovare
        n = m.avvia('/traduci', {'testi': ['ok'], 'da': 'it', 'a': 'fr'})['id']
        self.assertEqual(self.attendi(m, n)['stato'], 'finito')

    def test_senza_modello_scaricato_dice_cosa_fare(self):
        m = S.Motore(self.temp.name)
        for percorso in ('/traduci', '/voce/pulisci', '/audio/separa', '/scene', '/rallenta', '/trascrivi'):
            n = m.avvia(percorso, {})['id']
            r = self.attendi(m, n)
            self.assertEqual(r['stato'], 'errore')
            self.assertRegex(r['errore'], 'Scarica prima')

    def test_processo_morto_senza_risultato(self):
        m = self.motore_finto()
        m.comando_lavoratore = lambda f, mod: [sys.executable, '-c', 'import sys; sys.stdin.read(); print("rumore di libreria"); sys.exit(3)']
        n = m.avvia('/traduci', {'testi': ['x'], 'da': 'it', 'a': 'en'})['id']
        r = self.attendi(m, n)
        self.assertEqual(r['stato'], 'errore')
        self.assertIn('fermato', r['errore'])

    def test_la_voce_si_libera_prima_di_un_altro_modello(self):
        m = self.motore_finto()
        m.modello = object()
        n = m.avvia('/traduci', {'testi': ['x'], 'da': 'it', 'a': 'en'})['id']
        self.attendi(m, n)
        self.assertIsNone(m.modello)


class Scambio(Base):
    def test_pezzi_in_ordine_lettura_e_nomi_chiusi(self):
        m = S.Motore(self.temp.name)

        def b(x):
            return base64.b64encode(x).decode()
        self.assertEqual(m.scambio_scrivi({'nome': 'a.wav', 'da': 0, 'dati': b(b'abc')})['byte'], 3)
        self.assertEqual(m.scambio_scrivi({'nome': 'a.wav', 'da': 3, 'dati': b(b'def')})['byte'], 6)
        with self.assertRaisesRegex(ValueError, 'fuori posto'):
            m.scambio_scrivi({'nome': 'a.wav', 'da': 2, 'dati': b(b'x')})
        r = m.scambio_leggi({'nome': 'a.wav', 'da': 0, 'len': 4})
        self.assertEqual((base64.b64decode(r['dati']), r['byte'], r['fine']), (b'abcd', 6, False))
        r = m.scambio_leggi({'nome': 'a.wav', 'da': 4, 'len': 4})
        self.assertEqual((base64.b64decode(r['dati']), r['fine']), (b'ef', True))
        # ricominciare da 0 riscrive
        m.scambio_scrivi({'nome': 'a.wav', 'da': 0, 'dati': b(b'z')})
        self.assertEqual((m.scambio / 'a.wav').read_bytes(), b'z')
        for nome in ('../fuori.wav', 'a/b.wav', '..', '', 'a b', None):
            with self.assertRaises(ValueError, msg=repr(nome)):
                m.scambio_scrivi({'nome': nome, 'da': 0, 'dati': b(b'x')})
        with self.assertRaises(ValueError):
            m.scambio_leggi({'nome': 'manca.wav'})
        with self.assertRaises(ValueError):
            m.scambio_leggi({'nome': 'a.wav', 'len': S.PEZZO_MAX + 1})
        with self.assertRaises(ValueError):
            m.scambio_scrivi({'nome': 'a.wav', 'da': 0, 'dati': b(b'x' * (S.PEZZO_MAX + 1))})
        self.assertEqual(m.scambio_pulisci({}), {'ok': True})
        self.assertFalse(m.scambio.exists())

    def test_pulire_non_si_puo_durante_un_lavoro(self):
        m = S.Motore(self.temp.name)
        with m.lock:
            with self.assertRaisesRegex(ValueError, 'lavorando'):
                m.scambio_pulisci({})

    def test_http_con_token(self):
        server = S.crea_server(self.temp.name, 'x' * 64)
        t = threading.Thread(target=server.serve_forever)
        t.start()
        url = f'http://127.0.0.1:{server.server_port}'

        def chiama(percorso, dati, token='x' * 64):
            r = urllib.request.Request(url + percorso, data=json.dumps(dati).encode(), method='POST', headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(r, timeout=3) as x:
                    return x.status, json.load(x)
            except urllib.error.HTTPError as e:
                return e.code, json.load(e)
        try:
            self.assertEqual(chiama('/scambio/scrivi', {'nome': 'p.wav', 'da': 0, 'dati': base64.b64encode(b'ciao').decode()}), (200, {'byte': 4}))
            codice, r = chiama('/scambio/leggi', {'nome': 'p.wav', 'da': 0, 'len': 10})
            self.assertEqual((codice, base64.b64decode(r['dati'])), (200, b'ciao'))
            self.assertEqual(chiama('/scambio/scrivi', {'nome': '../x', 'da': 0, 'dati': ''})[0], 400)
            self.assertEqual(chiama('/scambio/leggi', {'nome': 'p.wav'}, 'sbagliato')[0], 403)
            codice, r = chiama('/modelli/scarica', {'modello': 'nllb-200'})
            self.assertEqual(codice, 400)
            self.assertIn('catalogo', r['errore'])
            self.assertEqual(chiama('/altro', {})[0], 404)
            lista = urllib.request.Request(url + '/modelli', headers={'Authorization': 'Bearer ' + 'x' * 64})
            self.assertEqual(len(json.load(urllib.request.urlopen(lista, timeout=3))['modelli']), 7)
        finally:
            server.shutdown()
            server.server_close()
            t.join()


class Risposta(io.BytesIO):
    status = 206


class Scaricamento(Base):
    def rete(self, meta_per_repo, contenuti):
        def urlopen(richiesta, **kwargs):
            if isinstance(richiesta, str):
                repo = re.search(r'/api/models/(.+?)/revision/', richiesta).group(1)
                return io.BytesIO(json.dumps(meta_per_repo[repo]).encode())
            offset = int(richiesta.get_header('Range', 'bytes=0-').split('=')[1].split('-')[0])
            return Risposta(contenuti[richiesta.full_url][offset:])
        return urlopen

    def meta(self, rev, file, licenza='apache-2.0', **extra):
        def voce(n, c):
            if n.endswith(('.safetensors', '.ckpt', '.onnx')):
                return {'rfilename': n, 'size': len(c), 'lfs': {'sha256': hashlib.sha256(c).hexdigest()}}
            return {'rfilename': n, 'size': len(c), 'blobId': hashlib.sha1(f'blob {len(c)}\0'.encode() + c).hexdigest()}
        return {'sha': rev, 'cardData': {'license': licenza, **extra}, 'siblings': [voce(n, c) for n, c in file.items()]}

    def motore_con_uv(self, nome=None):
        m = S.Motore(nome or self.temp.name)
        m.radice.mkdir(parents=True, exist_ok=True)
        (m.radice / 'uv.exe').write_bytes(b'x')
        (m.radice / 'uv').write_bytes(b'x')
        m.lavori['1'] = {}
        return m

    def test_due_repo_in_sottocartelle_e_ambiente_con_torch(self):
        m = self.motore_con_uv()
        comandi = []

        def esegui(argv, env, log):
            comandi.append(argv[1:])
            return 0
        m.esegui_comando = esegui
        m.pacchetti_installati = lambda *a: 'torch==2.8.0+cu128\n'
        (m.radice / 'ambienti' / 'qwen3-asr-06b').mkdir(parents=True)
        asr, ali = C.modello('qwen3-asr-06b')['fonti']
        contenuti, meta = {}, {}
        for f, nomi in ((asr, {'model.safetensors': b'pesi-asr', 'config.json': b'{}', 'vocab.json': b'{}', 'README.md': b'x'}),
                        (ali, {'model.safetensors': b'pesi-ali', 'config.json': b'{}', 'imgs/logo.png': b'png'})):
            meta[f['repo']] = self.meta(f['revisione'], nomi)
            for nome, c in nomi.items():
                contenuti[f'https://huggingface.co/{f["repo"]}/resolve/{f["revisione"]}/{nome}'] = c
        with patch.object(S.urllib.request, 'urlopen', self.rete(meta, contenuti)):
            r = m.scarica_modello('1', 'qwen3-asr-06b')
        d = m.cartella_di('qwen3-asr-06b')
        self.assertEqual((d / 'asr' / 'model.safetensors').read_bytes(), b'pesi-asr')
        self.assertEqual((d / 'aligner' / 'model.safetensors').read_bytes(), b'pesi-ali')
        self.assertFalse((d / 'aligner' / 'imgs').exists())  # niente immagini d'esempio
        self.assertFalse((d / 'asr' / 'README.md').exists())
        self.assertTrue(m.scaricato(C.modello('qwen3-asr-06b')))
        self.assertEqual(r['revisione'], C.modello('qwen3-asr-06b')['revisione'])
        # ambiente: venv, torch dall'indice CUDA, poi il resto con torch fissato (così pip non cambia il torch con cu128)
        self.assertEqual(comandi[0][0], 'venv')
        self.assertIn(S.INDICE_TORCH, comandi[1])
        self.assertIn('torch==2.8.0', comandi[2])
        self.assertIn('qwen-asr', comandi[2])
        self.assertTrue((m.radice / 'ambienti' / 'qwen3-asr-06b' / 'pacchetti-installati.txt').exists())

    def test_ambiente_senza_torch_e_motore_non_installato(self):
        m = S.Motore(self.temp.name)
        with self.assertRaisesRegex(ValueError, 'Installa prima il motore'):
            m.prepara_ambiente('1', C.modello('transnetv2'), 0, 1)
        m = self.motore_con_uv(self.temp.name + '-b')
        self.addCleanup(shutil.rmtree, m.radice, True)
        comandi = []
        m.esegui_comando = lambda argv, env, log: comandi.append(argv[1:]) or 0
        m.pacchetti_installati = lambda *a: ''
        (m.radice / 'ambienti' / 'transnetv2').mkdir(parents=True)
        m.prepara_ambiente('1', C.modello('transnetv2'), 0, 1)
        self.assertEqual(len(comandi), 2)
        self.assertFalse(any(S.INDICE_TORCH in c for c in comandi))
        self.assertTrue(m.ambiente_pronto(C.modello('transnetv2')))
        # uv che fallisce: errore in italiano, ambiente non segnato pronto
        m2 = self.motore_con_uv(self.temp.name + '-c')
        self.addCleanup(shutil.rmtree, m2.radice, True)
        m2.esegui_comando = lambda *a: 1
        with self.assertRaisesRegex(ValueError, 'Installazione interrotta'):
            m2.prepara_ambiente('1', C.modello('transnetv2'), 0, 1)
        self.assertFalse(m2.ambiente_pronto(C.modello('transnetv2')))

    def test_licenza_o_revisione_diversa_ferma_il_download(self):
        m = S.Motore(self.temp.name)
        m.lavori['1'] = {}
        m.prepara_ambiente = lambda *a: None
        f = C.modello('transnetv2')['fonti'][0]
        pesi = {'transnetv2.onnx': b'onnx-finto'}
        meta = {f['repo']: self.meta(f['revisione'], pesi, licenza='cc-by-nc-4.0')}
        with patch.object(S.urllib.request, 'urlopen', self.rete(meta, {})):
            with self.assertRaisesRegex(ValueError, 'licenza'):
                m.scarica_modello('1', 'transnetv2')
        meta = {f['repo']: self.meta('a' * 40, pesi, licenza='mit')}
        with patch.object(S.urllib.request, 'urlopen', self.rete(meta, {})):
            with self.assertRaisesRegex(ValueError, 'revisione'):
                m.scarica_modello('1', 'transnetv2')
        self.assertFalse(m.scaricato(C.modello('transnetv2')))
        with self.assertRaisesRegex(ValueError, 'catalogo'):
            m.scarica_modello('1', 'nllb-200')

    def test_rife_accetta_licenza_other_solo_con_il_nome_giusto(self):
        m = S.Motore(self.temp.name)
        m.lavori['1'] = {}
        m.prepara_ambiente = lambda *a: None
        f = C.modello('rife-425')['fonti'][0]
        nomi = {'frame_interpolation/rife_v4.25.safetensors': b'rife', 'frame_interpolation/rife_v4.25_heavy.safetensors': b'h', 'README.md': b'r'}
        meta = {f['repo']: self.meta(f['revisione'], nomi, licenza='other', license_name='mit-and-apache-2.0')}
        contenuti = {f'https://huggingface.co/{f["repo"]}/resolve/{f["revisione"]}/{n}': c for n, c in nomi.items()}
        with patch.object(S.urllib.request, 'urlopen', self.rete(meta, contenuti)):
            m.scarica_modello('1', 'rife-425')
        d = m.cartella_di('rife-425') / 'frame_interpolation'
        self.assertTrue((d / 'rife_v4.25.safetensors').exists())
        self.assertFalse((d / 'rife_v4.25_heavy.safetensors').exists())  # solo la versione scelta
        meta[f['repo']]['cardData']['license_name'] = 'custom'
        with patch.object(S.urllib.request, 'urlopen', self.rete(meta, contenuti)):
            with self.assertRaisesRegex(ValueError, 'licenza'):
                m.scarica_modello('1', 'rife-425')

    def test_zip_di_deepfilternet_verificato_con_blob_git_e_estratto(self):
        m = S.Motore(self.temp.name)
        m.lavori['1'] = {}
        m.prepara_ambiente = lambda *a: None
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('DeepFilterNet3/config.ini', '[df]')
            z.writestr('DeepFilterNet3/checkpoints/model_120.ckpt.best', 'pesi')
        dati = buf.getvalue()
        f = dict(C.modello('deepfilternet3')['fonti'][0], size=len(dati), blob=hashlib.sha1(f'blob {len(dati)}\0'.encode() + dati).hexdigest())
        finto = dict(C.modello('deepfilternet3'), fonti=[f])
        with patch.object(S, 'modello_di', lambda i: finto), patch.object(S.urllib.request, 'urlopen', lambda r, **k: Risposta(dati)):
            m.scarica_modello('1', 'deepfilternet3')
        self.assertTrue((m.cartella_di('deepfilternet3') / 'DeepFilterNet3' / 'config.ini').exists())
        # byte alterati: il controllo del blob li rifiuta
        m2 = S.Motore(self.temp.name + '-d')
        self.addCleanup(shutil.rmtree, m2.radice, True)
        m2.lavori['1'] = {}
        m2.prepara_ambiente = lambda *a: None
        with patch.object(S, 'modello_di', lambda i: finto), patch.object(S.urllib.request, 'urlopen', lambda r, **k: Risposta(dati[:-1] + b'X')):
            with self.assertRaisesRegex(ValueError, 'controllo'):
                m2.scarica_modello('1', 'deepfilternet3')

    def test_estrazione_rifiuta_percorsi_che_escono(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('../fuori.txt', 'no')
        z = Path(self.temp.name) / 'a.zip'
        z.write_bytes(buf.getvalue())
        with self.assertRaisesRegex(ValueError, 'percorso'):
            S.Motore.estrai(z, Path(self.temp.name) / 'dest')

    def test_il_kim_vocal_si_prepara_con_la_rete_dopo_i_pesi(self):
        m = S.Motore(self.temp.name)
        m.lavori['1'] = {}
        m.prepara_ambiente = lambda *a: None
        f = C.modello('kim-vocal-2')['fonti'][0]
        nomi = {'MelBandRoformer.ckpt': b'ckpt', 'README.md': b'r'}
        meta = {f['repo']: self.meta(f['revisione'], nomi, licenza='mit')}
        contenuti = {f'https://huggingface.co/{f["repo"]}/resolve/{f["revisione"]}/MelBandRoformer.ckpt': b'ckpt'}
        chiamate = []
        m.esegui_lavoratore = lambda n, funzione, mod, dati, disp, rete=False: chiamate.append((funzione, rete))
        with patch.object(S.urllib.request, 'urlopen', self.rete(meta, contenuti)):
            m.scarica_modello('1', 'kim-vocal-2')
        self.assertEqual(chiamate, [('prepara-kim', True)])


if __name__ == '__main__':
    unittest.main()
