"""Motore AI locale facoltativo. All'avvio usa solo la libreria standard, senza torch o GPU.

Un solo lavoro alla volta per tutto il motore. La voce (Qwen3-TTS) lavora dentro questo processo; tutte le altre funzioni
(traduzione, voce pulita, voce e musica, scene, rallentatore, parole con i tempi) girano in un processo figlio nell'ambiente
Python del loro modello: finito il lavoro la memoria della scheda video è libera, e annullare vuol dire terminare il processo.
"""
import base64
import gc
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.parse
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motore_catalogo as CAT  # noqa: E402
import motore_lavoratori as LAV  # noqa: E402
from motore_catalogo import CATALOGO, FUNZIONE_MODELLO, LICENZE_AMMESSE, REPO_TTS as REPO, REVISIONE, modello as modello_di  # noqa: E402,F401

LINGUE = {'it': 'Italian', 'en': 'English', 'fr': 'French', 'de': 'German', 'es': 'Spanish', 'zh': 'Chinese'}
# Indirizzo → funzione del motore. Una funzione, un modello (CAT.FUNZIONE_MODELLO).
ROTTE_LAVORO = {'/traduci': 'traduci', '/voce/pulisci': 'pulisci', '/audio/separa': 'separa', '/scene': 'scene',
                '/rallenta': 'rallenta', '/trascrivi': 'trascrivi'}
MAX_SCAMBIO = 1_500_000_000
PEZZO_MAX = 4 * 1024 * 1024
TTS = 'qwen3-tts-06b'
INDICE_TORCH = 'https://download.pytorch.org/whl/cu128'
INDICE_PYPI = 'https://pypi.org/simple'


class Motore:
    def __init__(self, radice):
        self.radice = Path(radice)
        self.cartella = self.cartella_di(TTS)
        self.scambio = self.radice / 'scambio'
        self.lock = threading.Lock()
        self.stati = threading.Lock()
        self.file_lock = threading.Lock()
        self.lavori = {}
        self.numero = 0
        self.modello = None
        self.dispositivo = None

    # ——— cartelle e stato dei modelli ———

    def cartella_di(self, id_):
        return self.radice / 'modelli' / id_

    def python_di(self, m):
        base = self.radice / 'venv' if m['ambiente'] == 'base' else self.radice / 'ambienti' / m['ambiente']
        return base / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')

    def ambiente_pronto(self, m):
        return m['ambiente'] == 'base' or (self.radice / 'ambienti' / m['ambiente'] / 'pronto').exists()

    def scaricato(self, m):
        return (self.cartella_di(m['id']) / 'scaricato.json').exists() and self.ambiente_pronto(m)

    def descrizione(self, m):
        return {**{k: m[k] for k in ('id', 'nome', 'repo', 'revisione', 'licenza', 'byte', 'requisiti', 'stato', 'peso', 'vram', 'funzioni')},
                'ambiente_gb': m['ambiente_gb'], 'scaricato': self.scaricato(m)}

    def aggiorna(self, n, **campi):
        with self.stati:
            self.lavori[n].update(campi)

    # ——— i lavori ———

    def avvia(self, percorso, dati):
        if percorso == '/modelli/scarica':
            id_ = dati.get('modello', TTS)
            if not isinstance(id_, str) or modello_di(id_) is None:
                raise ValueError('Questo modello non è nel catalogo delle licenze ammesse')
        elif percorso in ('/voce/genera', '/voce/clona'):
            if dati.get('modello', TTS) != TTS:
                raise ValueError('Questo modello non è nel catalogo delle licenze ammesse')
        elif percorso not in ROTTE_LAVORO:
            raise ValueError('Indirizzo non previsto')
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
                    id_ = dati.get('modello', TTS)
                    risultato = self.scarica(n) if id_ == TTS else self.scarica_modello(n, id_)
                elif percorso in ROTTE_LAVORO:
                    risultato = self.lavora(n, ROTTE_LAVORO[percorso], dati)
                else:
                    risultato = self.genera(n, dati)
                self.aggiorna(n, stato='finito', k=1, risultato=risultato, dettaglio='Fatto')
            except Exception as e:
                testo, _ = LAV.descrivi_errore(e)
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

    # ——— scaricare un modello ———

    def esegui_comando(self, argv, env, log):
        """Lancia un programma (uv) e ne aspetta la fine. Le prove lo sostituiscono."""
        flag = 0x08000000 if os.name == 'nt' else 0
        with open(log, 'ab') as f:
            f.write(('\n$ ' + ' '.join(argv) + '\n').encode())
            return subprocess.run(argv, env=env, stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, creationflags=flag).returncode

    def pacchetti_installati(self, uv, python, env):
        """Le versioni davvero installate (anche quelle trascinate dalle dipendenze), da conservare accanto all'ambiente."""
        return subprocess.run([str(uv), 'pip', 'freeze', '--python', python], env=env, capture_output=True, text=True).stdout

    def prepara_ambiente(self, n, m, k0, k1):
        """L'ambiente Python del modello (venv suo, pacchetti suoi). Si fa una volta, quando si sceglie di scaricare il modello."""
        if self.ambiente_pronto(m):
            return
        uv = self.radice / ('uv.exe' if os.name == 'nt' else 'uv')
        if not uv.exists():
            raise ValueError('Installa prima il motore dal Centro AI')
        amb = self.radice / 'ambienti' / m['ambiente']
        (self.radice / 'ambienti').mkdir(parents=True, exist_ok=True)
        log = self.radice / 'ambienti' / (m['ambiente'] + '.log')
        env = {**os.environ, 'UV_PYTHON_INSTALL_DIR': str(self.radice / 'python'), 'UV_CACHE_DIR': str(self.radice / 'cache-uv'),
               'UV_NO_PROGRESS': '1', 'UV_PYTHON_DOWNLOADS': 'automatic'}
        python = str(self.python_di(m))
        torch = ['torch==2.8.0', 'torchaudio==2.8.0'] if m.get('torch') else []
        passi = [('Preparo l\'ambiente Python del modello…', ['venv', '--clear', '--managed-python', '--python', '3.12.8', str(amb)])]
        if torch:
            passi.append(('Scarico torch e CUDA: diversi GB, può volerci un po\'…', ['pip', 'install', '--python', python, '--only-binary', ':all:', *torch, '--index-url', INDICE_TORCH]))
        passi.append(('Installo le librerie del modello…', ['pip', 'install', '--python', python, '--index-url', INDICE_PYPI, *torch, *m.get('pacchetti', [])]))
        for i, (testo, args) in enumerate(passi):
            self.aggiorna(n, k=k0 + (k1 - k0) * i / len(passi), dettaglio=testo)
            if self.esegui_comando([str(uv), *args], env, log) != 0:
                raise ValueError(f'Installazione interrotta: guarda {log.name} nella cartella del motore')
        (amb / 'pacchetti-installati.txt').write_text(self.pacchetti_installati(uv, python, env), encoding='utf-8')
        (amb / 'pronto').write_text('1', encoding='ascii')

    def elenco_file(self, id_, m, fonte, leggi_json):
        """Cosa scaricare da una fonte: [(nome, url, destinazione, byte, sha256, blob)]. Controlla licenza e revisione."""
        radice_fonte = self.cartella_di(id_) / fonte.get('sotto', '')
        if fonte['tipo'] == 'git-blob':
            return [(fonte['nome'], fonte['url'], radice_fonte / fonte['nome'], fonte['size'], None, fonte['blob'])]
        repo, rev = fonte['repo'], fonte['revisione']
        meta = leggi_json(f'https://huggingface.co/api/models/{repo}/revision/{rev}?blobs=true')
        carta = meta.get('cardData', {})
        if carta.get('license') != fonte['licenza_hf'] or (fonte.get('licenza_nome') and carta.get('license_name') != fonte['licenza_nome']):
            raise ValueError('La licenza dei pesi non corrisponde al catalogo: download fermato')
        if meta['sha'] != rev:
            raise ValueError('La revisione del modello non corrisponde al catalogo')
        giusti = []
        for f in meta['siblings']:
            nome = f['rfilename']
            if any(nome.startswith(e) for e in fonte['escludi']):
                continue
            if nome.endswith(tuple(fonte['estensioni'])) or Path(nome).name in fonte['nomi']:
                giusti.append(f)
        if not any(f['rfilename'].endswith(tuple(fonte['estensioni'])) and not f['rfilename'].endswith(('.json', '.txt', '.md', '.jinja')) for f in giusti):
            raise ValueError('Il catalogo non contiene i pesi attesi')
        out = []
        for f in giusti:
            nome = f['rfilename']
            relativo = Path(nome)
            if relativo.is_absolute() or '..' in relativo.parts or '\\' in nome or ':' in nome:
                raise ValueError('Il modello contiene un percorso non valido')
            url = f'https://huggingface.co/{repo}/resolve/{rev}/' + urllib.parse.quote(nome, safe='/')
            out.append((nome, url, radice_fonte / relativo, f['size'], (f.get('lfs') or {}).get('sha256'), f.get('blobId')))
        return out

    def scarica(self, n):
        return self.scarica_modello(n, TTS)

    def scarica_modello(self, n, id_):
        m = modello_di(id_)
        if m is None or not CAT.licenza_ammessa(m):
            raise ValueError('Questo modello non è nel catalogo delle licenze ammesse')
        self.libera()
        k0 = 0.0
        if m['ambiente'] != 'base' and not self.ambiente_pronto(m):
            self.prepara_ambiente(n, m, 0.0, 0.5)
            k0 = 0.5
        self.cartella_di(id_).mkdir(parents=True, exist_ok=True)

        def leggi_json(url):
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        voci = []
        for fonte in m['fonti']:
            voci += [(fonte, *v) for v in self.elenco_file(id_, m, fonte, leggi_json)]
        totale = sum(v[4] for v in voci)
        fatti = 0
        inventario = []
        for fonte, nome, url, dest, size, atteso, blob in voci:
            dest.parent.mkdir(parents=True, exist_ok=True)

            def verifica(p):
                if not p.exists() or p.stat().st_size != size:
                    return False
                h = hashlib.sha256() if atteso else hashlib.sha1()
                if not atteso:
                    h.update(f'blob {size}\0'.encode())
                with p.open('rb') as s:
                    for blocco in iter(lambda: s.read(1024 * 1024), b''):
                        h.update(blocco)
                return h.hexdigest() == (atteso or blob)
            if not verifica(dest):
                parziale = dest.with_name(dest.name + '.part')
                offset = parziale.stat().st_size if parziale.exists() else 0
                if offset > size:
                    parziale.unlink()
                    offset = 0
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
                                self.aggiorna(n, k=k0 + (1 - k0) * (fatti + offset) / max(1, totale), dettaglio=f'Scarico {nome}: {fatti + offset} di {totale} byte')
                if not verifica(parziale):
                    parziale.unlink(missing_ok=True)
                    raise ValueError('Il controllo dei pesi non torna: premi Riprova')
                parziale.replace(dest)
            if fonte.get('estrai'):
                self.estrai(dest, dest.parent)
            fatti += size
            inventario.append({'file': nome, 'byte': size, 'sha256': atteso, 'blob': blob})
        revisioni = {f.get('repo', f.get('nome')): f.get('revisione', m['revisione']) for f in m['fonti']}
        inventario_file = self.cartella_di(id_) / 'scaricato.json'
        temporaneo = inventario_file.with_suffix('.tmp')
        temporaneo.write_text(json.dumps({'repo': m['repo'], 'revisione': m['revisione'], 'revisioni': revisioni, 'licenza': m['licenza'], 'file': inventario}, indent=2), encoding='utf-8')
        temporaneo.replace(inventario_file)
        if m.get('prepara'):
            self.aggiorna(n, k=0.97, dettaglio='Ultimo passo: preparo il modello…')
            self.esegui_lavoratore(n, m['prepara'], m, {}, 'cpu', rete=True)
        return {'byte': totale, 'revisione': m['revisione']}

    @staticmethod
    def estrai(archivio, cartella):
        with zipfile.ZipFile(archivio) as z:
            radice = cartella.resolve()
            for voce in z.infolist():
                destinazione = (cartella / voce.filename).resolve()
                if destinazione != radice and radice not in destinazione.parents:
                    raise ValueError('L\'archivio del modello contiene un percorso non valido')
            z.extractall(cartella)

    # ——— le funzioni che girano in un processo a parte ———

    def comando_lavoratore(self, funzione, m):
        return [str(self.python_di(m)), '-u', str(Path(LAV.__file__).resolve()), funzione]

    def lavora(self, n, funzione, dati):
        m = modello_di(FUNZIONE_MODELLO[funzione])
        if not self.scaricato(m):
            raise ValueError(f'Scarica prima «{m["nome"]}» dal Centro AI')
        self.libera()  # la voce Qwen3-TTS non resta in memoria mentre lavora un altro modello
        return self.esegui_lavoratore(n, funzione, m, dati, dati.get('dispositivo', 'cuda'))

    def esegui_lavoratore(self, n, funzione, m, dati, dispositivo, rete=False):
        env = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1', 'HF_HUB_DISABLE_TELEMETRY': '1', 'DO_NOT_TRACK': '1'}
        if not rete:
            env.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
        richiesta = json.dumps({'radice': str(self.radice), 'job': n, 'dati': dati, 'dispositivo': dispositivo}, ensure_ascii=False)
        self.scambio.mkdir(parents=True, exist_ok=True)
        flag = 0x08000000 if os.name == 'nt' else 0
        with open(self.radice / 'lavoratore.log', 'wb') as log:
            p = subprocess.Popen(self.comando_lavoratore(funzione, m), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log,
                                 env=env, creationflags=flag)
            try:
                p.stdin.write(richiesta.encode('utf-8'))
                p.stdin.close()
                risultato, errore = None, None
                for riga in p.stdout:
                    try:
                        v = json.loads(riga.decode('utf-8', 'replace'))
                    except ValueError:
                        continue
                    if not isinstance(v, dict):
                        continue
                    if 'k' in v and n in self.lavori:
                        self.aggiorna(n, k=float(v['k']), dettaglio=str(v.get('dettaglio', ''))[:300])
                    if 'risultato' in v:
                        risultato = v['risultato']
                    if 'errore' in v:
                        errore = str(v['errore'])
                p.wait()
            finally:
                if p.poll() is None:
                    p.kill()
                    p.wait()
                p.stdout.close()
        if errore:
            raise ValueError(errore)
        if risultato is None:
            raise ValueError('Il modello si è fermato senza dare un risultato (forse la memoria è finita). Riprova o scegli il processore.')
        return risultato

    # ——— la voce (Qwen3-TTS, dentro questo processo) ———

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

    def togli_modello(self, dati):
        """Toglie dal disco i pesi di un modello e il suo ambiente Python (quello della voce Qwen resta: è il motore)."""
        m = modello_di(dati.get('modello')) if isinstance(dati.get('modello'), str) else None
        if m is None:
            raise ValueError('Questo modello non è nel catalogo delle licenze ammesse')
        if self.lock.locked():
            raise ValueError('Il motore sta lavorando: aspetta o spegnilo')
        if m['id'] == TTS:
            self.libera()
        shutil.rmtree(self.cartella_di(m['id']), ignore_errors=True)
        if m['ambiente'] != 'base':
            shutil.rmtree(self.radice / 'ambienti' / m['ambiente'], ignore_errors=True)
        return {'ok': True}

    # ——— la cartella di scambio: i file passano a pezzi, mai per percorsi scelti da chi chiama ———

    def scambio_scrivi(self, dati):
        nome, da = dati.get('nome'), dati.get('da', 0)
        if not LAV.nome_valido(nome) or '/' in nome or not isinstance(da, int) or da < 0:
            raise ValueError('Richiesta non valida')
        pezzo = base64.b64decode(dati.get('dati', ''), validate=True)
        if len(pezzo) > PEZZO_MAX or da + len(pezzo) > MAX_SCAMBIO:
            raise ValueError('Il file è troppo grande per il motore')
        with self.file_lock:
            self.scambio.mkdir(parents=True, exist_ok=True)
            p = self.scambio / nome
            attuale = p.stat().st_size if p.exists() else 0
            if da == 0:
                p.write_bytes(pezzo)
            elif attuale == da:
                with p.open('ab') as f:
                    f.write(pezzo)
            else:
                raise ValueError('Un pezzo del file è arrivato fuori posto: riprova')
            return {'byte': p.stat().st_size}

    def scambio_leggi(self, dati):
        nome, da, lunghezza = dati.get('nome'), dati.get('da', 0), dati.get('len', PEZZO_MAX)
        if not LAV.nome_valido(nome) or not isinstance(da, int) or da < 0 or not isinstance(lunghezza, int) or not 0 < lunghezza <= PEZZO_MAX:
            raise ValueError('Richiesta non valida')
        p = self.scambio / nome
        if not p.is_file():
            raise ValueError('Il file non c\'è più nel motore')
        totale = p.stat().st_size
        with p.open('rb') as f:
            f.seek(da)
            pezzo = f.read(lunghezza)
        return {'dati': base64.b64encode(pezzo).decode('ascii'), 'byte': totale, 'fine': da + len(pezzo) >= totale}

    def scambio_pulisci(self, dati):
        if self.lock.locked():
            raise ValueError('Il motore sta lavorando: aspetta')
        with self.file_lock:
            if self.scambio.exists():
                shutil.rmtree(self.scambio, ignore_errors=True)
        return {'ok': True}


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
                self.rispondi(200, {'modelli': [motore.descrizione(c) for c in CATALOGO]})
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
                elif self.path in ('/modelli/scarica', '/voce/genera', '/voce/clona', *ROTTE_LAVORO):
                    self.rispondi(200, motore.avvia(self.path, dati))
                elif self.path == '/modelli/togli':
                    self.rispondi(200, motore.togli_modello(dati))
                elif self.path == '/scambio/scrivi':
                    self.rispondi(200, motore.scambio_scrivi(dati))
                elif self.path == '/scambio/leggi':
                    self.rispondi(200, motore.scambio_leggi(dati))
                elif self.path == '/scambio/pulisci':
                    self.rispondi(200, motore.scambio_pulisci(dati))
                else:
                    self.rispondi(404, {'errore': 'Indirizzo non previsto'})
            except ValueError as e:
                self.rispondi(400, {'errore': str(e) or 'Richiesta non valida. Controlla i dati e riprova.'})
            except (KeyError, TypeError):
                self.rispondi(400, {'errore': 'Richiesta non valida. Controlla i dati e riprova.'})
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
