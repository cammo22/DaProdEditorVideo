"""Le funzioni AI del motore locale. Ognuna gira in un processo Python suo (ambiente suo): quando finisce la memoria
della scheda video torna libera, e annullare = terminare il processo.

Qui la parte che decide (controlli, limiti, nomi dei file, forma dei risultati) è separata dai modelli veri:
ogni funzione riceve un «backend» e le prove ne passano uno finto. I backend veri importano torch & C. solo quando
servono; questo file, da solo, usa soltanto la libreria standard.
Protocollo con il server: JSON su stdin; su stdout una riga JSON per ogni avanzamento {"k","dettaglio"} e alla fine
{"risultato": …} oppure {"errore": …, "valido": true|false}. Tutto il resto che le librerie stampano finisce su stderr.
"""
import gc
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys

import motore_catalogo as C

NOME = re.compile(r'^[A-Za-z0-9._-]{1,80}$')
ESTENSIONI_VIDEO = ('.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.mts', '.m2ts', '.wmv')
MAX_TESTI = 3000
MAX_CARATTERI = 2000
MAX_SECONDI_RALLENTA = 12
MAX_PAROLE = 50000
MAX_TAGLI = 2000


class Contesto:
    """Cosa serve a una funzione: dove sono i modelli, la cartella di scambio, come raccontare l'avanzamento."""
    def __init__(self, radice, job='0', avanza=None, dispositivo='cuda'):
        self.radice = Path(radice)
        self.modelli = self.radice / 'modelli'
        self.scambio = self.radice / 'scambio'
        self.job = str(job)
        self.dispositivo = dispositivo if dispositivo in ('cuda', 'cpu') else 'cuda'
        self._avanza = avanza or (lambda k, testo: None)

    def avanza(self, k, testo):
        self._avanza(max(0.0, min(1.0, float(k))), str(testo))

    def modello_dir(self, id_):
        return self.modelli / id_


# ——— controlli comuni ———

def nome_valido(nome):
    """Un nome dentro la cartella di scambio: al massimo una sottocartella, mai '..'."""
    if not isinstance(nome, str):
        return False
    parti = nome.split('/')
    return 1 <= len(parti) <= 2 and all(NOME.match(p) and p not in ('.', '..') for p in parti)


def file_scambio(ctx, nome, esiste=True):
    if not nome_valido(nome):
        raise ValueError('Nome del file non valido')
    p = ctx.scambio / nome
    if esiste and not p.is_file():
        raise ValueError('Il file da lavorare non è arrivato al motore: riprova')
    return p


def file_video(percorso):
    if not isinstance(percorso, str) or not percorso or len(percorso) > 1024 or '\0' in percorso:
        raise ValueError('Percorso del video non valido')
    p = Path(percorso)
    if not p.is_absolute() or p.suffix.lower() not in ESTENSIONI_VIDEO or not p.is_file():
        raise ValueError('Il motore non trova questo video sul disco. Funziona con i file veri, non con quelli dentro un pacchetto.')
    return p


def numero(valore, minimo, massimo, nome, predefinito=None):
    if valore is None and predefinito is not None:
        return predefinito
    if isinstance(valore, bool) or not isinstance(valore, (int, float)) or not math.isfinite(valore) or not minimo <= valore <= massimo:
        raise ValueError(f'{nome}: valore fuori dai limiti ({minimo}–{massimo})')
    return float(valore)


# ——— le funzioni ———

def lavora_traduci(dati, ctx, backend):
    testi = dati.get('testi')
    if not isinstance(testi, list) or not 1 <= len(testi) <= MAX_TESTI or not all(isinstance(t, str) and len(t) <= MAX_CARATTERI for t in testi):
        raise ValueError(f'Servono da 1 a {MAX_TESTI} testi, ognuno di al massimo {MAX_CARATTERI} caratteri')
    da, a = dati.get('da'), dati.get('a')
    if da not in C.LINGUE_TRADUZIONE or a not in C.LINGUE_TRADUZIONE:
        raise ValueError('Questa coppia di lingue non la so tradurre')
    if da == a:
        return {'testi': list(testi), 'lingua': a}
    out = list(testi)
    fare = [i for i, t in enumerate(testi) if t.strip()]
    for n, i in enumerate(fare):
        ctx.avanza(n / max(1, len(fare)), f'Traduco: {n + 1} di {len(fare)}')
        r = backend.traduci(testi[i], C.LINGUE_TRADUZIONE[da], C.LINGUE_TRADUZIONE[a])
        out[i] = (r or '').strip() or testi[i]
    ctx.avanza(1, 'Fatto')
    return {'testi': out, 'lingua': a}


def lavora_pulisci(dati, ctx, backend):
    ingresso = file_scambio(ctx, dati.get('file'))
    forza = numero(dati.get('forza'), 0.1, 1.0, 'forza', 1.0)
    uscita = f'pulito-{ctx.job}.wav'
    ctx.scambio.mkdir(parents=True, exist_ok=True)
    info = backend.pulisci(str(ingresso), str(ctx.scambio / uscita), forza, ctx.avanza)
    if not (ctx.scambio / uscita).is_file():
        raise ValueError('Il motore non ha prodotto il file della voce pulita')
    ctx.avanza(1, 'Fatto')
    return {'file': uscita, 'sr': int(info.get('sr', 48000)), 'durata': float(info.get('durata', 0))}


def lavora_separa(dati, ctx, backend):
    ingresso = file_scambio(ctx, dati.get('file'))
    cartella = ctx.scambio / f'separa-{ctx.job}'
    cartella.mkdir(parents=True, exist_ok=True)
    try:
        r = backend.separa(str(ingresso), str(cartella), ctx.avanza)
        voce, musica = Path(r.get('voce', '')), Path(r.get('musica', ''))
        if not voce.is_file() or not musica.is_file():
            raise ValueError('Il motore non ha prodotto voce e musica')
        nv, nm = f'voce-{ctx.job}.wav', f'musica-{ctx.job}.wav'
        shutil.move(str(voce), ctx.scambio / nv)
        shutil.move(str(musica), ctx.scambio / nm)
    finally:
        shutil.rmtree(cartella, ignore_errors=True)
    ctx.avanza(1, 'Fatto')
    return {'voce': nv, 'musica': nm}


def lavora_scene(dati, ctx, backend):
    video = file_video(dati.get('file'))
    da = numero(dati.get('da'), 0, 86400 * 3, 'da', 0.0)
    a = numero(dati.get('a'), 0, 86400 * 3, 'a', 0.0)
    if a and a <= da:
        raise ValueError('Il tratto da guardare è vuoto')
    soglia = numero(dati.get('soglia'), 0.05, 0.95, 'soglia', 0.5)
    r = backend.scene(str(video), da, a, soglia, ctx.avanza)
    fps = float(r.get('fps') or 0)
    durata = float(r.get('durata') or 0)
    tagli = []
    for x in r.get('tagli', []):
        t, p = float(x.get('t', -1)), float(x.get('p', 0))
        if math.isfinite(t) and math.isfinite(p) and t >= 0 and (not a or t <= a + 0.001) and t >= da:
            tagli.append({'t': round(t, 3), 'p': round(max(0.0, min(1.0, p)), 3)})
    tagli.sort(key=lambda x: x['t'])
    # due tagli a meno di 0,25 s sono lo stesso taglio: resta il più sicuro
    puliti = []
    for x in tagli:
        if puliti and x['t'] - puliti[-1]['t'] < 0.25:
            if x['p'] > puliti[-1]['p']:
                puliti[-1] = x
        else:
            puliti.append(x)
    ctx.avanza(1, f'Trovati {len(puliti)} tagli')
    return {'tagli': puliti[:MAX_TAGLI], 'fps': fps, 'durata': durata, 'soglia': soglia}


def lavora_rallenta(dati, ctx, backend):
    video = file_video(dati.get('file'))
    da = numero(dati.get('da'), 0, 86400 * 3, 'da')
    a = numero(dati.get('a'), 0, 86400 * 3, 'a')
    if not 0 < a - da <= MAX_SECONDI_RALLENTA:
        raise ValueError(f'Il rallentatore fluido lavora su al massimo {MAX_SECONDI_RALLENTA} secondi per volta')
    fattore = dati.get('fattore')
    if fattore not in (2, 4):
        raise ValueError('Il fattore può essere 2 o 4')
    cartella = f'rallenta-{ctx.job}'
    (ctx.scambio / cartella).mkdir(parents=True, exist_ok=True)
    r = backend.rallenta(str(video), da, a, int(fattore), str(ctx.scambio / cartella), ctx.avanza)
    file = [f for f in r.get('file', []) if nome_valido(f)]
    if len(file) < 2 or any(not (ctx.scambio / cartella / f).is_file() for f in file):
        raise ValueError('Il motore non ha prodotto i fotogrammi')
    ctx.avanza(1, 'Fatto')
    return {'cartella': cartella, 'file': file, 'fps': float(r.get('fps') or 0), 'fattore': int(fattore),
            'larghezza': int(r.get('larghezza') or 0), 'altezza': int(r.get('altezza') or 0)}


def lavora_trascrivi(dati, ctx, backend):
    wav = file_scambio(ctx, dati.get('file'))
    lingua = dati.get('lingua', 'auto')
    if lingua != 'auto' and lingua not in C.LINGUE_ASR:
        raise ValueError('Questa lingua non la so riconoscere')
    r = backend.trascrivi(str(wav), None if lingua == 'auto' else C.LINGUE_ASR[lingua], ctx.avanza)
    parole = []
    for p in r.get('parole', []):
        da, a = float(p.get('da', -1)), float(p.get('a', -1))
        t = str(p.get('t', '')).strip()
        if t and math.isfinite(da) and math.isfinite(a) and da >= 0:
            parole.append({'t': t, 'da': round(da, 3), 'a': round(max(a, da), 3)})
    parole.sort(key=lambda p: p['da'])
    ctx.avanza(1, f'{len(parole)} parole')
    return {'lingua': str(r.get('lingua') or ''), 'testo': str(r.get('testo') or ''), 'parole': parole[:MAX_PAROLE],
            'senza_tempi': bool(r.get('senza_tempi')) or (not parole and bool(r.get('testo')))}


def lavora_prepara_kim(dati, ctx, backend):
    """Una volta sola, dopo i pesi: audio-separator scarica la sua piccola scheda di configurazione e il modello è pronto."""
    backend.prepara(ctx.avanza)
    return {'ok': True}


LAVORATORI = {
    'traduci': (lavora_traduci, 'traduci'),
    'pulisci': (lavora_pulisci, 'pulisci'),
    'separa': (lavora_separa, 'separa'),
    'scene': (lavora_scene, 'scene'),
    'rallenta': (lavora_rallenta, 'rallenta'),
    'trascrivi': (lavora_trascrivi, 'trascrivi'),
    'prepara-kim': (lavora_prepara_kim, 'prepara-kim'),
}


# ——— i motori veri (si importano solo quando servono; mai provati senza modelli: vedi TERZE-PARTI.md) ———

def _dispositivo(ctx):
    import torch
    return 'cuda:0' if ctx.dispositivo == 'cuda' and torch.cuda.is_available() else 'cpu'


def _libera_gpu():
    gc.collect()
    torch = sys.modules.get('torch')
    if torch is not None and torch.cuda.is_available():
        torch.cuda.empty_cache()


class TraduttoreReale:
    """Hy-MT2 1.8B (Apache-2.0). Prompt dalla scheda del modello (inglese, nomi delle lingue in inglese)."""
    def __init__(self, ctx):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        ctx.avanza(0.02, 'Carico Hy-MT2 in memoria…')
        cartella = str(ctx.modello_dir('hy-mt2-18b'))
        self.dev = _dispositivo(ctx)
        # trust_remote_code resta spento: dei modelli si scaricano solo pesi e configurazioni, mai codice da eseguire
        self.tok = AutoTokenizer.from_pretrained(cartella, local_files_only=True)
        self.modello = AutoModelForCausalLM.from_pretrained(cartella, dtype=torch.bfloat16 if self.dev != 'cpu' else torch.float32,
                                                            local_files_only=True).to(self.dev)
        self.modello.eval()

    def traduci(self, testo, da, a):
        import torch
        prompt = f'Translate the following segment into {a}, without additional explanation.\n\n{testo}'
        ingresso = self.tok.apply_chat_template([{'role': 'user', 'content': prompt}], add_generation_prompt=True,
                                                return_tensors='pt', return_dict=True).to(self.dev)
        with torch.no_grad():
            uscita = self.modello.generate(**ingresso, max_new_tokens=min(1024, 64 + len(testo) * 3), do_sample=True,
                                           temperature=0.7, top_p=0.6, top_k=20, repetition_penalty=1.05)
        return self.tok.decode(uscita[0][ingresso['input_ids'].shape[-1]:], skip_special_tokens=True)


class PulitoreReale:
    """DeepFilterNet3 (MIT o Apache-2.0), pacchetto deepfilternet; modello dal file pinnato nel catalogo."""
    def __init__(self, ctx):
        self.ctx = ctx

    def pulisci(self, ingresso, uscita, forza, avanza):
        import soundfile as sf
        import torch
        from df.enhance import enhance, init_df
        from df.io import resample
        avanza(0.05, 'Carico DeepFilterNet3…')
        cartella = next((p for p in self.ctx.modello_dir('deepfilternet3').iterdir() if p.is_dir()), self.ctx.modello_dir('deepfilternet3'))
        modello, stato, _ = init_df(model_base_dir=str(cartella), log_level='ERROR')
        sr = stato.sr()
        audio, sr0 = sf.read(ingresso, dtype='float32', always_2d=True)
        canali = []
        limite = None if forza >= 0.99 else round(40 * forza)
        for c in range(audio.shape[1]):
            x = torch.from_numpy(audio[:, c].copy()).unsqueeze(0)
            if sr0 != sr:
                x = resample(x, sr0, sr)
            canali.append(enhance(modello, stato, x, atten_lim_db=limite).squeeze(0).cpu().numpy())
            avanza(0.1 + 0.85 * (c + 1) / audio.shape[1], f'Pulisco il canale {c + 1} di {audio.shape[1]}…')
        n = min(len(c) for c in canali)
        sf.write(uscita, torch.tensor([c[:n] for c in canali]).T.numpy(), sr, subtype='PCM_16')
        return {'sr': sr, 'durata': n / sr}


class SeparatoreReale:
    """Mel-Band RoFormer «Kim Vocal 2» (MIT) tramite audio-separator (MIT). Il file dei pesi è quello pinnato dal catalogo."""
    NOME_MODELLO = 'vocals_mel_band_roformer.ckpt'

    def __init__(self, ctx):
        self.ctx = ctx

    def _separatore(self, uscita):
        from audio_separator.separator import Separator
        cartella = self.ctx.modello_dir('kim-vocal-2') / 'audio-separator'
        cartella.mkdir(parents=True, exist_ok=True)
        pesi = cartella / self.NOME_MODELLO
        originale = self.ctx.modello_dir('kim-vocal-2') / 'MelBandRoformer.ckpt'
        if not pesi.exists() and originale.exists():
            shutil.copyfile(originale, pesi)
        return Separator(output_dir=str(uscita), model_file_dir=str(cartella), output_format='WAV')

    def prepara(self, avanza):
        avanza(0.2, 'Preparo la scheda di configurazione del modello…')
        s = self._separatore(self.ctx.scambio)
        s.load_model(model_filename=self.NOME_MODELLO)

    def separa(self, ingresso, cartella, avanza):
        avanza(0.1, 'Carico il modello…')
        s = self._separatore(cartella)
        s.load_model(model_filename=self.NOME_MODELLO)
        avanza(0.3, 'Separo voce e musica…')
        trovati = [Path(f) if Path(f).is_absolute() else Path(cartella) / f for f in s.separate(ingresso)]
        voce = next((f for f in trovati if '(vocals)' in f.name.lower()), None)
        musica = next((f for f in trovati if '(instrumental)' in f.name.lower()), None)
        if not voce or not musica:
            raise ValueError('La separazione non ha dato voce e musica come previsto')
        return {'voce': str(voce), 'musica': str(musica)}


class SceneReale:
    """TransNetV2 (MIT) in ONNX sul processore. Finestre da 100 fotogrammi 48×27, come nel modello originale."""
    def __init__(self, ctx):
        import onnxruntime as ort
        self.ctx = ctx
        self.sess = ort.InferenceSession(str(next(ctx.modello_dir('transnetv2').glob('*.onnx'))), providers=['CPUExecutionProvider'])

    def scene(self, percorso, da, a, soglia, avanza):
        import cv2
        import numpy as np
        cap = cv2.VideoCapture(percorso)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        totale = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        inizio = int(da * fps)
        fine = min(totale, int(a * fps)) if a else totale
        cap.set(cv2.CAP_PROP_POS_FRAMES, inizio)
        quadri = []
        for i in range(inizio, fine):
            ok, q = cap.read()
            if not ok:
                break
            quadri.append(cv2.resize(q, (48, 27), interpolation=cv2.INTER_AREA)[:, :, ::-1])
            if i % 200 == 0:
                avanza(0.05 + 0.4 * (i - inizio) / max(1, fine - inizio), 'Guardo i fotogrammi…')
        cap.release()
        if len(quadri) < 2:
            return {'fps': fps, 'durata': len(quadri) / fps, 'tagli': []}
        v = np.array(quadri, dtype=np.uint8)
        n = len(v)
        dopo = 25 + (50 - (n % 50 or 50))
        p = np.concatenate([np.repeat(v[:1], 25, 0), v, np.repeat(v[-1:], dopo, 0)])
        nome = self.sess.get_inputs()[0].name
        float_ = 'float' in self.sess.get_inputs()[0].type
        prob = []
        for k, i in enumerate(range(0, len(p) - 100 + 1, 50)):
            finestra = p[i:i + 100][None]
            if float_:
                finestra = finestra.astype(np.float32)
            y = np.asarray(self.sess.run(None, {nome: finestra})[0]).reshape(-1)
            if y.min() < 0 or y.max() > 1:
                y = 1 / (1 + np.exp(-y))
            prob.append(y[25:75])
            avanza(0.45 + 0.5 * min(1, (i + 100) / len(p)), 'Cerco i tagli…')
        prob = np.concatenate(prob)[:n]
        tagli = []
        i = 0
        while i < n:
            if prob[i] > soglia:
                j = i
                while j + 1 < n and prob[j + 1] > soglia:
                    j += 1
                picco = i + int(np.argmax(prob[i:j + 1]))
                tagli.append({'t': (inizio + picco + 1) / fps, 'p': float(prob[picco])})
                i = j + 1
            else:
                i += 1
        return {'fps': fps, 'durata': n / fps, 'tagli': tagli}


class TrascrittoreReale:
    """Qwen3-ASR 0.6B e poi Qwen3-ForcedAligner 0.6B (Apache-2.0): uno alla volta in memoria."""
    def __init__(self, ctx):
        self.ctx = ctx

    def trascrivi(self, wav, lingua, avanza):
        import torch
        from qwen_asr import Qwen3ASRModel, Qwen3ForcedAligner
        base = self.ctx.modello_dir('qwen3-asr-06b')
        dev = _dispositivo(self.ctx)
        dtype = torch.bfloat16 if dev != 'cpu' else torch.float32
        avanza(0.05, 'Carico il riconoscitore…')
        asr = Qwen3ASRModel.from_pretrained(str(base / 'asr'), dtype=dtype, device_map=dev, max_inference_batch_size=1, max_new_tokens=2048)
        avanza(0.2, 'Ascolto il parlato…')
        r = asr.transcribe(audio=wav, language=lingua)[0]
        testo, rilevata = str(r.text), str(r.language)
        del asr
        _libera_gpu()
        codice = next((k for k, v in C.LINGUE_ASR.items() if v == rilevata), None)
        if codice not in C.LINGUE_ALLINEATORE:
            return {'lingua': rilevata, 'testo': testo, 'parole': [], 'senza_tempi': True}
        avanza(0.6, 'Carico l\'allineatore delle parole…')
        al = Qwen3ForcedAligner.from_pretrained(str(base / 'aligner'), dtype=dtype, device_map=dev)
        avanza(0.75, 'Metto le parole al loro tempo…')
        risultato = al.align(audio=wav, text=testo, language=rilevata)
        parole = [{'t': x.text, 'da': float(x.start_time), 'a': float(x.end_time)} for x in risultato[0]]
        return {'lingua': rilevata, 'testo': testo, 'parole': parole}


class RallentatoreReale:
    """RIFE 4.25 (MIT): SPERIMENTALE. L'architettura IFNet va fornita dal modulo rife_ifnet (non è ancora nel repository)."""
    def __init__(self, ctx):
        self.ctx = ctx

    def rallenta(self, percorso, da, a, fattore, cartella, avanza):
        try:
            import rife_ifnet
        except ImportError:
            raise ValueError('Il rallentatore fluido non è ancora completo in questa versione: manca l\'architettura RIFE da collaudare sulla scheda NVIDIA') from None
        import cv2
        import numpy as np
        import torch
        dev = _dispositivo(self.ctx)
        pesi = next(self.ctx.modello_dir('rife-425').rglob('rife_v4.25.safetensors'))
        modello = rife_ifnet.carica(str(pesi), dev)
        cap = cv2.VideoCapture(percorso)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(da * fps))
        n = int((a - da) * fps)
        quadri = []
        for _ in range(n + 1):
            ok, q = cap.read()
            if not ok:
                break
            if q.shape[1] > 1280:
                q = cv2.resize(q, (1280, round(q.shape[0] * 1280 / q.shape[1])), interpolation=cv2.INTER_AREA)
            quadri.append(q)
        cap.release()
        if len(quadri) < 2:
            raise ValueError('Il tratto scelto ha meno di due fotogrammi')
        file = []
        h, w = quadri[0].shape[:2]

        def scrivi(img):
            nome = f'f{len(file) + 1:06d}.jpg'
            cv2.imwrite(str(Path(cartella) / nome), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
            file.append(nome)

        def tensore(q):
            return torch.from_numpy(q[:, :, ::-1].copy()).permute(2, 0, 1).float().div(255).unsqueeze(0).to(dev)
        with torch.no_grad():
            for i in range(len(quadri) - 1):
                scrivi(quadri[i])
                x0, x1 = tensore(quadri[i]), tensore(quadri[i + 1])
                for k in range(1, fattore):
                    y = modello(x0, x1, k / fattore).clamp(0, 1)[0].permute(1, 2, 0).cpu().numpy()
                    scrivi((y[:, :, ::-1] * 255).round().astype(np.uint8))
                avanza(0.05 + 0.9 * (i + 1) / (len(quadri) - 1), f'Fotogramma {i + 1} di {len(quadri) - 1}')
            scrivi(quadri[-1])
        return {'fps': fps, 'larghezza': w, 'altezza': h, 'file': file}


BACKEND_REALI = {
    'traduci': TraduttoreReale, 'pulisci': PulitoreReale, 'separa': SeparatoreReale, 'scene': SceneReale,
    'trascrivi': TrascrittoreReale, 'rallenta': RallentatoreReale, 'prepara-kim': SeparatoreReale,
}
# Le prove mettono qui i loro motori finti (nome → funzione che prende il contesto).
BACKEND = {}


def crea_backend(nome, ctx):
    return (BACKEND.get(nome) or BACKEND_REALI[nome])(ctx)


def descrivi_errore(e):
    """(testo in italiano, errore_di_uso) — i ValueError sono già frasi per l'utente, il resto no."""
    testo = str(e)
    if 'out of memory' in testo.lower():
        return 'La VRAM non basta: chiudi gli altri programmi AI o scegli il processore e riprova', True
    if isinstance(e, ValueError):
        return testo, True
    if isinstance(e, ImportError):
        return 'Mancano dei pacchetti nell\'ambiente di questo modello: scaricalo di nuovo dal Centro AI', False
    return 'Il lavoro non è riuscito (' + type(e).__name__ + '). Controlla rete, file del modello e installazione, poi riprova.', False


def main_lavoratore(funzione, ingresso=None, uscita=None):
    """Punto d'ingresso del processo figlio: legge la richiesta, lavora, scrive il risultato."""
    protocollo = uscita or sys.stdout
    sys.stdout = sys.stderr  # le librerie che stampano non devono rompere il protocollo

    def manda(oggetto):
        protocollo.write(json.dumps(oggetto, ensure_ascii=False) + '\n')
        protocollo.flush()
    try:
        richiesta = json.loads((ingresso or sys.stdin).read())
        if funzione not in LAVORATORI:
            raise ValueError('Funzione non prevista')
        ctx = Contesto(richiesta['radice'], richiesta.get('job', '0'), lambda k, t: manda({'k': k, 'dettaglio': t}),
                       richiesta.get('dispositivo', 'cuda'))
        corpo, nome_backend = LAVORATORI[funzione]
        backend = crea_backend(nome_backend, ctx)
        manda({'risultato': corpo(richiesta.get('dati', {}), ctx, backend)})
    except BaseException as e:  # noqa: BLE001 — qualunque cosa succeda, il server riceve una frase
        testo, valido = descrivi_errore(e)
        manda({'errore': testo, 'valido': valido})
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main_lavoratore(sys.argv[1]))
