"""Voce locale facoltativa. All'avvio usa solo la libreria standard, senza torch o GPU."""
import base64
import gc
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import sys
import threading
import time
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

REPO = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
REVISIONE = '5d83992436eae1d760afd27aff78a71d676296fc'  # Commit upstream verificato.
CATALOGO = [{'id': 'qwen3-tts-06b', 'nome': 'Qwen3-TTS 0.6B Base', 'repo': REPO,
             'revisione': REVISIONE, 'licenza': 'Apache-2.0', 'byte': 2516106051,
             'requisiti': 'Windows x64, GPU NVIDIA 6+ GB consigliata; 15–25 GB liberi per motore e modello (stima)'}]
LINGUE = {'it': 'Italian', 'en': 'English', 'fr': 'French', 'de': 'German', 'es': 'Spanish', 'zh': 'Chinese'}

class Motore:
    def __init__(self, radice):
        self.radice = Path(radice)
        self.cartella = self.radice / 'modelli' / 'qwen3-tts-06b'
        self.lock = threading.Lock()
        self.stati = threading.Lock()
        self.lavori = {}
        self.numero = 0
        self.modello = None
        self.dispositivo = None

    def aggiorna(self, n, **campi):
        with self.stati:
            self.lavori[n].update(campi)

    def avvia(self, percorso, dati):
        if dati.get('modello', 'qwen3-tts-06b') != 'qwen3-tts-06b':
            raise ValueError('Questo modello non è nel catalogo delle licenze ammesse')
        if not self.lock.acquire(blocking=False):
            raise ValueError('Il motore sta già lavorando: aspetta o spegnilo per annullare')
        with self.stati:
            self.numero += 1
            n = str(self.numero)
            # I campioni vocali non vengono salvati e le risposte precedenti non si accumulano.
            self.lavori.clear()
            self.lavori[n] = {'stato': 'lavoro', 'k': 0, 'dettaglio': 'Preparo il lavoro…'}
        def esegui():
            try:
                if percorso == '/modelli/scarica':
                    risultato = self.scarica(n)
                else:
                    risultato = self.genera(n, dati)
                self.aggiorna(n, stato='finito', k=1, risultato=risultato, dettaglio='Fatto')
            except Exception as e:
                testo = str(e)
                if 'out of memory' in testo.lower():
                    testo = 'La VRAM non basta: chiudi gli altri programmi AI o scegli il processore e riprova'
                elif not isinstance(e, ValueError):
                    testo = 'Il lavoro non è riuscito (' + type(e).__name__ + '). Controlla rete, file del modello e installazione, poi riprova.'
                self.libera()
                self.aggiorna(n, stato='errore', errore=testo)
            finally:
                self.lock.release()
        threading.Thread(target=esegui, daemon=True).start()
        return {'id': n}

    def libera(self):
        self.modello = None
        self.dispositivo = None
        gc.collect()
        # Nessuna importazione di torch per la sola salute o per scaricare pesi.
        torch = sys.modules.get('torch')
        if torch is not None and torch.cuda.is_initialized():
            torch.cuda.empty_cache()

    def scarica(self, n):
        self.libera()
        self.cartella.mkdir(parents=True, exist_ok=True)
        def leggi_json(url):
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        meta = leggi_json(f'https://huggingface.co/api/models/{REPO}/revision/{REVISIONE}?blobs=true')
        if meta.get('cardData', {}).get('license') != 'apache-2.0':
            raise ValueError('La licenza dei pesi non corrisponde al catalogo: download fermato')
        sha = meta['sha']
        if sha != REVISIONE:
            raise ValueError('La revisione del modello non corrisponde al catalogo')
        file = [f for f in meta['siblings'] if f['rfilename'].endswith(('.json', '.safetensors', '.txt', '.md'))
                or Path(f['rfilename']).name in ('LICENSE', 'NOTICE')]
        if not any(f['rfilename'].endswith('.safetensors') for f in file):
            raise ValueError('Il catalogo non contiene pesi safetensors')
        totale = sum(f.get('size', 0) for f in file)
        fatti = 0
        inventario = []
        for f in file:
            nome = f['rfilename']
            relativo = Path(nome)
            if relativo.is_absolute() or '..' in relativo.parts or '\\' in nome or ':' in nome:
                raise ValueError('Il modello contiene un percorso non valido')
            dest = self.cartella / relativo
            dest.parent.mkdir(parents=True, exist_ok=True)
            size = f['size']
            lfs = f.get('lfs') or {}
            atteso = lfs.get('sha256')
            def verifica(p):
                if not p.exists() or p.stat().st_size != size:
                    return False
                h = hashlib.sha256() if atteso else hashlib.sha1()
                if not atteso:
                    h.update(f'blob {size}\0'.encode())
                with p.open('rb') as s:
                    for blocco in iter(lambda: s.read(1024 * 1024), b''):
                        h.update(blocco)
                return h.hexdigest() == (atteso or f['blobId'])
            if not verifica(dest):
                parziale = dest.with_name(dest.name + '.part')
                offset = parziale.stat().st_size if parziale.exists() else 0
                if offset > size:
                    parziale.unlink()
                    offset = 0
                url = f'https://huggingface.co/{REPO}/resolve/{sha}/' + urllib.parse.quote(nome, safe='/')
                richiesta = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
                if offset < size:
                    with urllib.request.urlopen(richiesta, timeout=60) as r:
                        if r.status != 206:
                            offset = 0
                        with parziale.open('ab' if offset else 'wb') as s:
                            while True:
                                pezzo = r.read(1024 * 1024)
                                if not pezzo:
                                    break
                                s.write(pezzo)
                                offset += len(pezzo)
                                self.aggiorna(n, k=(fatti + offset) / max(1, totale), dettaglio=f'Scarico {nome}: {fatti + offset} di {totale} byte')
                if not verifica(parziale):
                    parziale.unlink(missing_ok=True)
                    raise ValueError('Il controllo dei pesi non torna: premi Riprova')
                parziale.replace(dest)
            fatti += size
            inventario.append({'file': nome, 'byte': size, 'sha256': atteso, 'blob': f.get('blobId')})
        inventario_file = self.cartella / 'scaricato.json'
        temporaneo = inventario_file.with_suffix('.tmp')
        temporaneo.write_text(json.dumps({'repo': REPO, 'revisione': sha, 'licenza': 'Apache-2.0', 'file': inventario}, indent=2), encoding='utf-8')
        temporaneo.replace(inventario_file)
        return {'byte': totale, 'revisione': sha}

    def genera(self, n, dati):
        testo = dati.get('testo', '').strip()
        lingua = LINGUE.get(dati.get('lingua', 'it'))
        dispositivo = dati.get('dispositivo', 'cuda')
        if not testo or len(testo) > 500 or not lingua or dispositivo not in ('cuda', 'cpu'):
            raise ValueError('Servono un testo da 1 a 500 caratteri, una lingua disponibile e un dispositivo valido')
        if not (self.cartella / 'scaricato.json').exists():
            raise ValueError('Scarica prima Qwen3-TTS dal Centro AI')
        try:
            campione = base64.b64decode(dati.get('campione', ''), validate=True)
        except Exception:
            raise ValueError('Scegli un campione WAV valido') from None
        if not campione or len(campione) > 6 * 1024 * 1024:
            raise ValueError('Il modello Base richiede un campione WAV da almeno 3 secondi (massimo 6 MB)')
        import soundfile as sf
        audio, sr = sf.read(io.BytesIO(campione), dtype='float32', always_2d=True)
        if not 3 <= len(audio) / sr <= 30:
            raise ValueError('Il campione deve durare da 3 a 30 secondi')
        import numpy as np
        audio = audio.mean(axis=1)
        if not np.isfinite(audio).all() or float(np.max(np.abs(audio))) < 0.001:
            raise ValueError('Il campione è vuoto o non contiene una voce udibile')
        self.aggiorna(n, k=0.08, dettaglio='Carico la voce in memoria…')
        import torch
        if dispositivo == 'cuda' and not torch.cuda.is_available():
            raise ValueError('CUDA non è disponibile: controlla i driver NVIDIA oppure scegli il processore')
        if self.modello is None or self.dispositivo != dispositivo:
            self.libera()
            from qwen_tts import Qwen3TTSModel
            self.modello = Qwen3TTSModel.from_pretrained(str(self.cartella), device_map='cuda:0' if dispositivo == 'cuda' else 'cpu',
                dtype=torch.bfloat16 if dispositivo == 'cuda' else torch.float32, attn_implementation='sdpa', local_files_only=True)
            self.dispositivo = dispositivo
        self.aggiorna(n, k=0.25, dettaglio='Genero la voce sintetica…')
        riferimento = dati.get('testoCampione', '').strip()
        if len(riferimento) > 1000:
            raise ValueError('La trascrizione del campione è troppo lunga')
        with torch.inference_mode():
            wavs, frequenza = self.modello.generate_voice_clone(text=testo, language=lingua, ref_audio=(audio, sr),
                ref_text=riferimento or None, x_vector_only_mode=not bool(riferimento), max_new_tokens=1500)
        self.aggiorna(n, k=0.95, dettaglio='Preparo il WAV…')
        wav = io.BytesIO()
        sf.write(wav, wavs[0], frequenza, format='WAV', subtype='PCM_16')
        return {'wav': base64.b64encode(wav.getvalue()).decode('ascii'), 'sr': frequenza}


def crea_server(radice, token):
    motore = Motore(radice)
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(15)
        def log_message(self, *args):
            pass  # Non scriviamo testi, campioni o token nei log.
        def rispondi(self, codice, corpo):
            b = json.dumps(corpo, ensure_ascii=False).encode('utf-8')
            self.send_response(codice)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(b)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(b)
        def autorizzata(self):
            if self.headers.get('Origin') is not None or self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}' or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
                self.rispondi(403, {'errore': 'Accesso al motore non autorizzato'})
                return False
            return True
        def do_GET(self):
            if not self.autorizzata():
                return
            if self.path == '/salute':
                self.rispondi(200, {'ok': True, 'occupato': motore.lock.locked(), 'modello': 'qwen3-tts-06b' if motore.modello else None})
            elif self.path == '/modelli':
                self.rispondi(200, {'modelli': [{**c, 'scaricato': (motore.cartella / 'scaricato.json').exists()} for c in CATALOGO]})
            elif self.path.startswith('/lavori/'):
                with motore.stati:
                    risultato = motore.lavori.get(self.path[len('/lavori/'):])
                    self.rispondi(200 if risultato else 404, risultato or {'errore': 'Lavoro non trovato'})
            else:
                self.rispondi(404, {'errore': 'Indirizzo non previsto'})
        def do_POST(self):
            if not self.autorizzata():
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 8 * 1024 * 1024:
                    raise ValueError('Richiesta troppo grande o vuota')
                dati = json.loads(self.rfile.read(size))
                if not isinstance(dati, dict):
                    raise ValueError('Richiesta non valida')
                if self.path == '/libera':
                    if not motore.lock.acquire(blocking=False):
                        raise ValueError('Il modello sta lavorando: aspetta o spegni il motore')
                    try:
                        motore.libera()
                    finally:
                        motore.lock.release()
                    self.rispondi(200, {'ok': True})
                elif self.path in ('/modelli/scarica', '/voce/genera', '/voce/clona'):
                    self.rispondi(200, motore.avvia(self.path, dati))
                else:
                    self.rispondi(404, {'errore': 'Indirizzo non previsto'})
            except (ValueError, KeyError):
                self.rispondi(400, {'errore': 'Richiesta non valida o motore già occupato. Controlla i dati e riprova.'})
    # Il lavoro pesante è già in un thread separato. Creare un nuovo thread HTTP
    # durante il caricamento delle DLL di NumPy su Windows può bloccare entrambi.
    return HTTPServer(('127.0.0.1', 0), Handler)

if __name__ == '__main__':
    token = os.environ.pop('DAPROD_TOKEN')
    if len(token) < 32:
        raise ValueError('Manca il token di sessione')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    server = crea_server(os.environ['DAPROD_RADICE'], token)
    # La pipe appartiene a Rust: chiudendosi l'app sparisce anche Python, persino dopo un crash.
    def sorveglia():
        if os.name == 'nt':
            import ctypes
            import msvcrt
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            peek = kernel.PeekNamedPipe
            peek.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32,
                             ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
            peek.restype = ctypes.c_int
            pipe = msvcrt.get_osfhandle(sys.stdin.fileno())
            while peek(pipe, None, 0, None, None, None):
                time.sleep(0.25)
        else:
            while sys.stdin.buffer.read(1):
                pass
        os._exit(0)
    threading.Thread(target=sorveglia, daemon=True).start()
    print(json.dumps({'porta': server.server_port, 'dettaglio': 'Motore acceso, nessun modello caricato'}), flush=True)
    server.serve_forever()
