# Componenti di terze parti

## Motore AI locale facoltativo · Qwen3-TTS

Il programma non distribuisce Python, torch o pesi Qwen nell’installer. Li scarica soltanto dopo la scelta nel Centro AI, in `%LOCALAPPDATA%\DaProdVideo\motori\qwen3-tts-v1`. I pesi si scaricano con un secondo pulsante. Nessuna API a pagamento, nessuna chiave esterna richiesta.

- **Qwen3-TTS**, codice Alibaba Qwen Team, pacchetto `qwen-tts==0.1.1`: Apache-2.0. Sorgente e licenza: https://github.com/QwenLM/Qwen3-TTS e https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE.
- **Qwen/Qwen3-TTS-12Hz-0.6B-Base**, pesi e tokenizer incluso nella sottocartella `speech_tokenizer`: Apache-2.0 secondo la scheda https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base. Revisione fissata a `5d83992436eae1d760afd27aff78a71d676296fc`; metadati ufficiali consultati senza scaricare i pesi: circa 2,52 GB per il repository. Il server verifica licenza, dimensioni e SHA-256 LFS (oppure hash Git dei file piccoli), conserva README/LICENSE/NOTICE presenti e registra l’inventario in `scaricato.json`. Nessun altro checkpoint è ammesso dal server.
- **uv 0.9.7**, Astral: MIT oppure Apache-2.0, https://github.com/astral-sh/uv. Archivio ufficiale Windows x64 e checksum SHA-256 della stessa release; gestisce CPython standalone 3.12.8 privato e il venv, senza usare Python di sistema.
- **CPython**, Python Software Foundation License: https://docs.python.org/3/license.html; runtime standalone gestito da uv, con gli avvisi inclusi nella distribuzione.
- **PyTorch/torchaudio 2.8.0**, licenze BSD e componenti CUDA NVIDIA con termini propri: https://github.com/pytorch/pytorch/blob/v2.8.0/LICENSE e https://github.com/pytorch/audio/blob/v2.8.0/LICENSE. Wheel CUDA 12.8 dall’indice ufficiale https://download.pytorch.org/whl/cu128. Il vincolo sulle licenze permissive qui riguarda i pesi del catalogo; i binari CUDA conservano i termini NVIDIA.
- **Hugging Face Hub 0.36.0** Apache-2.0, **Transformers 4.57.3** Apache-2.0, **Accelerate 1.12.0** Apache-2.0 e dipendenze del pacchetto Qwen; **SoundFile 0.13.1** BSD-3-Clause e libsndfile LGPL. Gli avvisi dei pacchetti installati restano nei rispettivi `dist-info`; le versioni effettive, comprese quelle transitive, vengono salvate in `pacchetti-installati.txt` nella cartella del motore. Non viene installato FlashAttention e non vengono aggiunti pesi di denoiser o riconoscitori.

`server.py`, `installa.ps1`, il client e il gestore Rust sono scritti per DaProd Video. DaProdImage è stato consultato come riferimento di architettura (Python privato, venv e processo locale), senza copiarne il motore ComfyUI. Italiano, qualità della clonazione, compatibilità delle wheel e VRAM sulla RTX 4060 restano da validare con l’ambiente vero.

## OpenReel Video · MIT

Origine: https://github.com/Augani/openreel-video

Commit studiato: `367d7e90b61b5181f9861b852bb8b9d7a7d2954a`.

Adattamenti in DaProd Video:

- `src/render/lut.ts`: parser `.cube` da `apps/web/src/components/editor/inspector/LUTLoader.tsx` (`parseCubeLUT`) e riferimento trilineare da `packages/core/src/video/color-grading-engine.ts` (`applyLutToData`). Aggiunti domini, limiti e validazione; upload 3D WebGL2 in `src/render/coloreGpu.ts` scritto per DaProd.
- `src/render/curve.ts`, `src/render/coloreGpu.ts`: generatore e applicazione curve da `color-grading-engine.ts` (`buildCurveLUT`, `applyCurvesToData`, `CURVES_SHADER`), riscritti in float con Hermite a pendenze limitate, texture GPU e vera curva luma Rec.709.
- `src/core/ducking.ts`: rilevamento RMS, unione intervalli e generazione inviluppo da `packages/core/src/audio/volume-automation.ts` (`AudioDucker.detectAudioPresence`, `generateDuckingKeyframes`, `mergePresenceRanges`). Estesi a tutti i canali, flusso a pezzi, isteresi, tempo timeline e attenuazione separata in dB.

- `src/core/automazioni.ts`, `src/core/maschereForma.ts`: keyframe e maschere a forma. Dall'architettura di `packages/core/src/animation/evaluate-keyframes.ts`, `keyframe-properties.ts` e `video/keyframe-engine.ts` (linee di chiavi per proprietà, ricerca della coppia di chiavi, descrittori dei parametri per percorso) e da `packages/core/src/video/mask-engine.ts` (forme parametriche come tracciati di Bézier, l'ellisse con la costante 0,5522847498, sfumatura, inversione, maschere multiple). Il calcolo è riscritto da zero: interpolazione lineare / morbida / a gradino, copertura in distanza con segno su griglia a un canale, compositore WebGL2 e interfaccia sono propri di DaProd.

Nessun asset LUT, font, framework React o dipendenza del donatore è stato importato.

```text
MIT License

Copyright (c) 2024-2026 Augustus Otu and Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## OpenScreen · MIT

La geometria del focus in `src/core/zoomCursore.ts` è adattata da
`src/components/video-editor/videoPlayback/zoomTransform.ts` di OpenScreen.
La raccolta Windows, il raccordo con le tappe DaProd e gli anelli dei clic sono implementazioni locali.
Non sono stati importati gli asset dei puntatori, Electron o Pixi.

Sorgenti di riferimento: il clone locale OpenScreen fornito per l'integrazione.

```text
MIT License

Copyright (c) 2025 Siddharth Vaddem

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## HyperFrames · Apache-2.0

Origine: https://github.com/heygen-com/hyperframes (HeyGen). Licenza controllata sul repository: Apache License 2.0, nessun file NOTICE.

Cosa ne abbiamo preso: **l'idea**, non il codice. Titoli e grafiche scritti in HTML/CSS e guidati dal tempo fotogramma per fotogramma, così anteprima ed esportazione sono identiche; e le idee di movimento dei suoi blocchi (entrata, tenuta, uscita) per i sottopancia e i testi animati.

- `src/core/titoliHtml.ts` e `src/render/titoliHtml.ts` (titoli animati HTML): motore, modelli e disegno **scritti per DaProd Video**. Niente codice, template, CSS o immagini di HyperFrames è stato copiato; non c'è nessuna sua dipendenza. Il disegno passa da un SVG con `foreignObject` e dalla tela del browser (nessun Node, Puppeteer o FFmpeg).
- `src/core/animazioni.ts` e `src/render/anim/*.ts` (animazioni su tela 2D, 1.1.4): stessa ispirazione, ridisegnate da zero.

Caratteri dei titoli HTML: solo quelli già nel programma, tutti con licenza SIL OFL 1.1 (@fontsource: Orbitron, Rajdhani, Montserrat, Oswald, Bebas Neue, Archivo Black, Space Mono, Playfair Display; DSEG7 di Keshikan, `src/stile/font/DSEG-LICENSE.txt`).
