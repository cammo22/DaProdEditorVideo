"""Prova manuale: nessun download automatico. Avvia solo dopo aver chiuso LM Studio.

Esempio con il Python privato del motore installato:
  .../venv/Scripts/python.exe scripts/prova-qwen3tts.py --campione voce.wav
Il WAV finale viene portato a 10 s senza accelerare la voce; il resoconto distingue
la durata prodotta dal modello e quella salvata. Il tempo di sintesi riguarda l'audio
prodotto: per confrontare testi diversi viene riportato anche il tempo equivalente per 10 s.
"""
import argparse
import gc
import json
import os
from pathlib import Path
import time


def main():
    p = argparse.ArgumentParser(description='Misura tempo e VRAM di Qwen3-TTS locale, senza scaricare pesi')
    p.add_argument('--campione', type=Path, required=True, help='WAV autorizzato da 3 a 30 secondi')
    p.add_argument('--testo-campione', default='')
    p.add_argument('--modello', type=Path, default=Path(os.environ.get('LOCALAPPDATA', '.')) / 'DaProdVideo/motori/qwen3-tts-v1/modelli/qwen3-tts-06b')
    p.add_argument('--testo', default='Oggi proviamo la voce del nostro editor video. Le immagini scorrono sullo schermo, mentre il racconto accompagna ogni scena con calma e chiarezza.')
    p.add_argument('--uscita', type=Path, default=Path('prova-qwen3tts-10s.wav'))
    p.add_argument('--confermo-gpu-libera', action='store_true', help='Conferma di avere chiuso LM Studio e gli altri modelli sulla GPU')
    a = p.parse_args()
    if not a.confermo_gpu_libera:
        p.error('Chiudi LM Studio, poi aggiungi --confermo-gpu-libera')
    if not (a.modello / 'scaricato.json').is_file():
        p.error('Scarica prima Qwen3-TTS dal Centro AI: questa prova non scarica nulla')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    if not torch.cuda.is_available():
        p.error('CUDA non disponibile')
    audio, sr = sf.read(a.campione, dtype='float32', always_2d=True)
    if not 3 <= len(audio) / sr <= 30:
        p.error('Il campione deve durare da 3 a 30 secondi')
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()
    libera, totale = torch.cuda.mem_get_info()
    modello = None
    try:
        inizio = time.perf_counter()
        modello = Qwen3TTSModel.from_pretrained(str(a.modello), local_files_only=True, device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa')
        torch.cuda.synchronize()
        carica = time.perf_counter() - inizio
        inizio = time.perf_counter()
        with torch.inference_mode():
            wavs, frequenza = modello.generate_voice_clone(text=a.testo, language='Italian', ref_audio=(audio.mean(axis=1), sr), ref_text=a.testo_campione or None, x_vector_only_mode=not bool(a.testo_campione), max_new_tokens=1500)
        torch.cuda.synchronize()
        secondi = time.perf_counter() - inizio
        voce = wavs[0]
        durata = len(voce) / frequenza
        dieci = np.zeros(int(10 * frequenza), dtype=np.float32)
        n = min(len(voce), len(dieci))
        dieci[:n] = voce[:n]
        sf.write(a.uscita, dieci, frequenza, subtype='PCM_16')
        resoconto = {'scheda': torch.cuda.get_device_name(), 'caricamento_s': carica, 'sintesi_s': secondi,
            'audio_generato_s': durata, 'audio_salvato_s': 10, 'tagliato_s': max(0, durata - 10), 'silenzio_aggiunto_s': max(0, 10 - durata),
            'tempo_equivalente_10s': secondi / durata * 10 if durata else None,
            'vram_libera_prima_byte': libera, 'vram_totale_byte': totale,
            'picco_allocato_byte': torch.cuda.max_memory_allocated(), 'picco_riservato_byte': torch.cuda.max_memory_reserved()}
        a.uscita.with_suffix('.json').write_text(json.dumps(resoconto, indent=2, ensure_ascii=False), encoding='utf-8')
        print(json.dumps(resoconto, indent=2, ensure_ascii=False))
    finally:
        del modello
        gc.collect()
        torch.cuda.empty_cache()

if __name__ == '__main__':
    main()
