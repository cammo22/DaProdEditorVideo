"""Catalogo chiuso dei modelli del motore AI locale: solo licenze permissive, revisioni fissate.

Solo libreria standard. Ogni modello si scarica su richiesta, uno alla volta, e lavora in un processo suo
(la memoria della scheda video si libera quando il processo finisce). I numeri di peso e VRAM sono quelli
della ricerca del 29/10/2026 (RICERCA-MODELLI-AI-2026-10.md): stime, non misure sulla RTX 4060.
"""

# Le uniche licenze ammesse nel catalogo. Una voce con una licenza diversa non entra (lo controlla una prova).
LICENZE_AMMESSE = ('apache-2.0', 'mit', 'mit-or-apache-2.0', 'mit-and-apache-2.0')

REPO_TTS = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
REVISIONE = '5d83992436eae1d760afd27aff78a71d676296fc'  # Commit upstream verificato (Qwen3-TTS).

# Il ritaglio della cartella di un repository: cosa si scarica e cosa no (niente codice da eseguire, niente esempi di training).
_FILTRO_PESI = {'estensioni': ('.json', '.safetensors', '.txt', '.md', '.jinja'), 'nomi': ('LICENSE', 'LICENSE.txt', 'NOTICE'),
                'escludi': ('train/', 'imgs/')}

CATALOGO = [
    {
        'id': 'qwen3-tts-06b', 'nome': 'Qwen3-TTS 0.6B Base', 'repo': REPO_TTS, 'revisione': REVISIONE, 'licenza': 'Apache-2.0',
        'byte': 2516106051, 'requisiti': 'Windows x64, GPU NVIDIA 6+ GB consigliata; 15–25 GB liberi per motore e modello (stima)',
        'stato': 'opzionale', 'peso': '2,5 GB', 'vram': '3–4 GB', 'ambiente': 'base', 'ambiente_gb': 0,
        'funzioni': ['voce'],
        'fonti': [{'tipo': 'hf', 'repo': REPO_TTS, 'revisione': REVISIONE, 'licenza_hf': 'apache-2.0', 'sotto': '',
                   'estensioni': ('.json', '.safetensors', '.txt', '.md'), 'nomi': ('LICENSE', 'NOTICE'), 'escludi': ()}],
    },
    {
        'id': 'hy-mt2-18b', 'nome': 'Hy-MT2 1.8B · traduzione', 'repo': 'tencent/Hy-MT2-1.8B',
        'revisione': '9a341cd1b679d3efd23b46e847b01745a71ed792', 'licenza': 'Apache-2.0', 'byte': 3_600_000_000,
        'requisiti': 'GPU NVIDIA 4+ GB consigliata (anche processore, più lento); ambiente Python suo di circa 6 GB',
        'stato': 'opzionale', 'peso': '3,6 GB', 'vram': '2–4 GB', 'ambiente': 'hy-mt2-18b', 'ambiente_gb': 6,
        'funzioni': ['traduci'],
        'torch': True,
        'pacchetti': ['transformers>=5.6.0,<6', 'accelerate>=1.0', 'safetensors', 'sentencepiece'],
        'fonti': [{'tipo': 'hf', 'repo': 'tencent/Hy-MT2-1.8B', 'revisione': '9a341cd1b679d3efd23b46e847b01745a71ed792',
                   'licenza_hf': 'apache-2.0', 'sotto': '', **_FILTRO_PESI}],
    },
    {
        'id': 'qwen3-asr-06b', 'nome': 'Qwen3-ASR 0.6B + ForcedAligner · parole con i tempi', 'repo': 'Qwen/Qwen3-ASR-0.6B',
        'revisione': '5eb144179a02acc5e5ba31e748d22b0cf3e303b0', 'licenza': 'Apache-2.0', 'byte': 3_712_000_000,
        'requisiti': 'GPU NVIDIA 4+ GB consigliata; ambiente Python suo di circa 6 GB',
        'stato': 'opzionale', 'peso': '3,7 GB (due modelli)', 'vram': '2–4 GB, uno alla volta', 'ambiente': 'qwen3-asr-06b', 'ambiente_gb': 6,
        'funzioni': ['trascrivi'],
        'torch': True,
        'pacchetti': ['qwen-asr', 'soundfile'],
        'fonti': [
            {'tipo': 'hf', 'repo': 'Qwen/Qwen3-ASR-0.6B', 'revisione': '5eb144179a02acc5e5ba31e748d22b0cf3e303b0',
             'licenza_hf': 'apache-2.0', 'sotto': 'asr', 'estensioni': ('.json', '.safetensors', '.txt'), 'nomi': ('LICENSE',), 'escludi': ()},
            {'tipo': 'hf', 'repo': 'Qwen/Qwen3-ForcedAligner-0.6B', 'revisione': 'c7cbfc2048c462b0d63a45797104fc9db3ad62b7',
             'licenza_hf': 'apache-2.0', 'sotto': 'aligner', 'estensioni': ('.json', '.safetensors', '.txt'), 'nomi': ('LICENSE',), 'escludi': ()},
        ],
    },
    {
        'id': 'kim-vocal-2', 'nome': 'Kim Vocal 2 · voce e musica', 'repo': 'KimberleyJSN/melbandroformer',
        'revisione': 'ac9b0614ab3cd7f77219e18ba494dfd93956c348', 'licenza': 'MIT', 'byte': 913106900,
        'requisiti': 'GPU NVIDIA 6+ GB consigliata; ambiente Python suo di circa 6 GB; al primo avvio prende da GitHub la piccola scheda di configurazione di audio-separator',
        'stato': 'opzionale', 'peso': '0,9 GB', 'vram': '3–6 GB', 'ambiente': 'kim-vocal-2', 'ambiente_gb': 6,
        'funzioni': ['separa'],
        'torch': True,
        'pacchetti': ['audio-separator[gpu]', 'soundfile'],
        'prepara': 'prepara-kim',
        'fonti': [{'tipo': 'hf', 'repo': 'KimberleyJSN/melbandroformer', 'revisione': 'ac9b0614ab3cd7f77219e18ba494dfd93956c348',
                   'licenza_hf': 'mit', 'sotto': '', 'estensioni': ('.ckpt',), 'nomi': (), 'escludi': ()}],
    },
    {
        'id': 'transnetv2', 'nome': 'TransNetV2 · scene e tagli', 'repo': 'elya5/transnetv2',
        'revisione': 'e1cfcb717af91e41ffb84b5fd851505682c576ee', 'licenza': 'MIT', 'byte': 31250929,
        'requisiti': 'Basta il processore; ambiente Python suo di circa 0,5 GB',
        'stato': 'opzionale', 'peso': '31 MB', 'vram': 'meno di 1 GB (anche solo processore)', 'ambiente': 'transnetv2', 'ambiente_gb': 0.5,
        'funzioni': ['scene'],
        'torch': False,
        'pacchetti': ['onnxruntime', 'opencv-python-headless', 'numpy'],
        'fonti': [{'tipo': 'hf', 'repo': 'elya5/transnetv2', 'revisione': 'e1cfcb717af91e41ffb84b5fd851505682c576ee',
                   'licenza_hf': 'mit', 'sotto': '', 'estensioni': ('.onnx',), 'nomi': (), 'escludi': ()}],
    },
    {
        'id': 'deepfilternet3', 'nome': 'DeepFilterNet3 · voce pulita', 'repo': 'Rikorose/DeepFilterNet',
        'revisione': 'd375b2d8309e0935d165700c91da9de862a99c31', 'licenza': 'MIT o Apache-2.0', 'byte': 7986207,
        'requisiti': 'Basta il processore; ambiente Python suo di circa 4 GB (torch)',
        'stato': 'opzionale', 'peso': '8 MB', 'vram': 'processore sufficiente', 'ambiente': 'deepfilternet3', 'ambiente_gb': 4,
        'funzioni': ['pulisci'],
        'torch': True,
        'pacchetti': ['deepfilternet==0.5.6', 'soundfile'],
        'fonti': [{'tipo': 'git-blob', 'nome': 'DeepFilterNet3.zip', 'sotto': '', 'estrai': True,
                   'url': 'https://raw.githubusercontent.com/Rikorose/DeepFilterNet/d375b2d8309e0935d165700c91da9de862a99c31/models/DeepFilterNet3.zip',
                   'size': 7986207, 'blob': 'ea53bac00d064378451d0201d573f44f05f1d746', 'licenza_hf': None}],
    },
    {
        'id': 'rife-425', 'nome': 'RIFE 4.25 · rallentatore fluido', 'repo': 'Comfy-Org/Frame-Interpolation',
        'revisione': 'aa7009be4d1471ea0bac91d6fe4d7e4b637cbbfc', 'licenza': 'MIT', 'byte': 22674688,
        'requisiti': 'GPU NVIDIA 4+ GB consigliata; ambiente Python suo di circa 6 GB; SPERIMENTALE: il motore reale non è stato collaudato',
        'stato': 'sperimentale', 'peso': '23 MB', 'vram': '1–3 GB a 1080p', 'ambiente': 'rife-425', 'ambiente_gb': 6,
        'funzioni': ['rallenta'],
        'torch': True,
        'pacchetti': ['safetensors', 'opencv-python-headless', 'numpy'],
        'fonti': [{'tipo': 'hf', 'repo': 'Comfy-Org/Frame-Interpolation', 'revisione': 'aa7009be4d1471ea0bac91d6fe4d7e4b637cbbfc',
                   'licenza_hf': 'other', 'licenza_nome': 'mit-and-apache-2.0', 'sotto': '',
                   'estensioni': ('rife_v4.25.safetensors',), 'nomi': (), 'escludi': ()}],
    },
]

# Quale modello serve a quale funzione del motore (una funzione, un modello).
FUNZIONE_MODELLO = {m_f: m['id'] for m in CATALOGO for m_f in m['funzioni']}

# I nomi delle lingue come li vuole il modello di traduzione (prompt in inglese) e quelli di Qwen3-ASR.
LINGUE_TRADUZIONE = {
    'it': 'Italian', 'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pt': 'Portuguese', 'zh': 'Chinese',
    'ja': 'Japanese', 'ar': 'Arabic', 'ru': 'Russian', 'ko': 'Korean', 'tr': 'Turkish', 'nl': 'Dutch', 'pl': 'Polish',
    'uk': 'Ukrainian', 'hi': 'Hindi', 'vi': 'Vietnamese', 'th': 'Thai', 'id': 'Indonesian', 'cs': 'Czech', 'he': 'Hebrew',
}
LINGUE_ASR = {
    'it': 'Italian', 'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pt': 'Portuguese', 'zh': 'Chinese',
    'ja': 'Japanese', 'ko': 'Korean', 'ru': 'Russian', 'ar': 'Arabic', 'tr': 'Turkish', 'nl': 'Dutch', 'pl': 'Polish',
}
# Il ForcedAligner capisce meno lingue del riconoscitore: per le altre le parole non hanno i tempi.
LINGUE_ALLINEATORE = ('zh', 'en', 'fr', 'de', 'it', 'ja', 'ko', 'pt', 'ru', 'es')


def modello(id_):
    for m in CATALOGO:
        if m['id'] == id_:
            return m
    return None


def licenza_ammessa(m):
    """La licenza dichiarata di un modello è fra quelle permissive del catalogo?"""
    return m['licenza'].lower().replace(' o ', '-or-') in LICENZE_AMMESSE
