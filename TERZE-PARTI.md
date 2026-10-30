# Componenti di terze parti

## Motore AI locale facoltativo · Qwen3-TTS

Il programma non distribuisce Python, torch o pesi Qwen nell’installer. Li scarica soltanto dopo la scelta nel Centro AI, in `%LOCALAPPDATA%\DaProdVideo\motori\qwen3-tts-v1`. I pesi si scaricano con un secondo pulsante. Nessuna API a pagamento, nessuna chiave esterna richiesta.

- **Qwen3-TTS**, codice Alibaba Qwen Team, pacchetto `qwen-tts==0.1.1`: Apache-2.0. Sorgente e licenza: https://github.com/QwenLM/Qwen3-TTS e https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE.
- **Qwen/Qwen3-TTS-12Hz-0.6B-Base**, pesi e tokenizer incluso nella sottocartella `speech_tokenizer`: Apache-2.0 secondo la scheda https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base. Revisione fissata a `5d83992436eae1d760afd27aff78a71d676296fc`; metadati ufficiali consultati senza scaricare i pesi: circa 2,52 GB per il repository. Il server verifica licenza, dimensioni e SHA-256 LFS (oppure hash Git dei file piccoli), conserva README/LICENSE/NOTICE presenti e registra l’inventario in `scaricato.json`. Nessun altro checkpoint è ammesso dal server.
- **uv 0.9.7**, Astral: MIT oppure Apache-2.0, https://github.com/astral-sh/uv. Archivio ufficiale Windows x64 e checksum SHA-256 della stessa release; gestisce CPython standalone 3.12.8 privato e il venv, senza usare Python di sistema.
- **CPython**, Python Software Foundation License: https://docs.python.org/3/license.html; runtime standalone gestito da uv, con gli avvisi inclusi nella distribuzione.
- **PyTorch/torchaudio 2.8.0**, licenze BSD e componenti CUDA NVIDIA con termini propri: https://github.com/pytorch/pytorch/blob/v2.8.0/LICENSE e https://github.com/pytorch/audio/blob/v2.8.0/LICENSE. Wheel CUDA 12.8 dall’indice ufficiale https://download.pytorch.org/whl/cu128. Il vincolo sulle licenze permissive qui riguarda i pesi del catalogo; i binari CUDA conservano i termini NVIDIA.
- **Hugging Face Hub 0.36.0** Apache-2.0, **Transformers 4.57.3** Apache-2.0, **Accelerate 1.12.0** Apache-2.0 e dipendenze del pacchetto Qwen; **SoundFile 0.13.1** BSD-3-Clause e libsndfile LGPL. Gli avvisi dei pacchetti installati restano nei rispettivi `dist-info`; le versioni effettive, comprese quelle transitive, vengono salvate in `pacchetti-installati.txt` nella cartella del motore. Non viene installato FlashAttention. Gli altri modelli opzionali (traduzione, voce pulita, scene, parole, rallentatore) hanno la loro sezione qui sotto e il loro ambiente.

`server.py`, `installa.ps1`, il client e il gestore Rust sono scritti per DaProd Video. DaProdImage è stato consultato come riferimento di architettura (Python privato, venv e processo locale), senza copiarne il motore ComfyUI. Italiano, qualità della clonazione, compatibilità delle wheel e VRAM sulla RTX 4060 restano da validare con l’ambiente vero.

## Motore AI locale · funzioni facili (traduzione, voce, scene, parole, rallentatore)

Tutte opzionali e locali: nessun modello è nell'installer, ognuno si scarica **solo quando lo scegli** dal Centro AI (uno alla volta, con peso e VRAM dichiarati), nel suo ambiente Python privato (`ambienti/<id>` accanto al motore). Il server controlla licenza, revisione e SHA-256 prima di tenere i file; il catalogo (`src-tauri/motore/motore_catalogo.py`) ammette **solo Apache-2.0 e MIT**, e una prova lo verifica. Dei modelli si scaricano solo pesi e configurazioni: nessun codice remoto viene eseguito (`trust_remote_code` resta spento). Pesi e VRAM sono quelli dichiarati dai modelli o stime della ricerca del 29/10/2026: **non sono misure sulla RTX 4060, e nessuno di questi modelli è mai stato eseguito da questo ambiente**.

| Funzione | Modello | Licenza | Revisione fissata | Peso |
|---|---|---|---|---|
| Traduzione | Hy-MT2-1.8B, Tencent (`tencent/Hy-MT2-1.8B`) | Apache-2.0 | `9a341cd1b679d3efd23b46e847b01745a71ed792` | circa 3,6 GB |
| Voce pulita | DeepFilterNet3, Hendrik Schröter (`DeepFilterNet3.zip` dal repository Rikorose/DeepFilterNet) + pacchetto `deepfilternet` 0.5.6 | MIT oppure Apache-2.0 | `d375b2d8309e0935d165700c91da9de862a99c31` | 8 MB |
| Voce e musica | Mel-Band RoFormer «Kim Vocal 2» di KimberleyJSN (`KimberleyJSN/melbandroformer`) tramite `audio-separator` | MIT | `ac9b0614ab3cd7f77219e18ba494dfd93956c348` | 0,9 GB |
| Tagli automatici | TransNetV2 in ONNX (`elya5/transnetv2`; modello originale di Tomáš Souček e Jakub Lokoč) con `onnxruntime` e `opencv-python-headless` | MIT | `e1cfcb717af91e41ffb84b5fd851505682c576ee` | 31 MB |
| Parole con i tempi | Qwen3-ASR 0.6B e Qwen3-ForcedAligner 0.6B, Alibaba Qwen Team (pacchetto `qwen-asr`) | Apache-2.0 | `5eb144179a02acc5e5ba31e748d22b0cf3e303b0` (ASR), `c7cbfc2048c462b0d63a45797104fc9db3ad62b7` (aligner) | circa 3,7 GB in tutto |
| Rallentatore fluido (SPERIMENTALE) | RIFE 4.25 (`rife_v4.25.safetensors` da `Comfy-Org/Frame-Interpolation`; autori di RIFE: Huang et al.) | MIT (la scheda su Hugging Face dice `other / mit-and-apache-2.0`: il server accetta solo questo nome preciso) | `aa7009be4d1471ea0bac91d6fe4d7e4b637cbbfc` | 23 MB |

- **Tolto: NLLB-200 di Meta** (`Xenova/nllb-200-distilled-600M`), licenza **CC-BY-NC 4.0, non commerciale**: non è più usato né scaricato, il suo worker è stato cancellato.
- Le librerie Python di ogni ambiente (torch/torchaudio 2.8.0 BSD, transformers e accelerate Apache-2.0, soundfile BSD, libsndfile LGPL, onnxruntime MIT, opencv-python-headless Apache-2.0, audio-separator MIT) hanno ciascuna la loro licenza nel proprio `dist-info`; le versioni davvero installate, comprese quelle trascinate dalle dipendenze, si salvano in `pacchetti-installati.txt` nella cartella dell'ambiente. Al primo uso `audio-separator` scarica da GitHub la piccola scheda di configurazione del modello Kim Vocal 2: è l'unico passo di rete dopo i pesi, ed è dichiarato.
- **Non collaudato**: i lavoratori veri (`motore_lavoratori.py`: `TraduttoreReale`, `PulitoreReale`, `SeparatoreReale`, `SceneReale`, `TrascrittoreReale`) sono scritti dalla documentazione dei pacchetti e provati solo con motori finti. Il rallentatore ha il percorso completo (client, cartella di scambio, clip nuova) ma il backend aspetta il modulo `rife_ifnet` con l'architettura IFNet, che non è ancora nel repository: finché manca, il motore risponde con una frase che lo dice.

## Clear (Desert Ant Labs) · licenza NON permissiva

Pacchetto npm `@desert-ant-labs/clear` 3.6.0, usato da «Voce migliorata» (`src/media/clear.ts`). Licenza: **Desert Ant Labs Source-Available License 1.0** (https://license.desertant.com/1.0), non Apache/MIT: gratis sotto i 100.000 dispositivi attivi al mese per piattaforma e per modello (sopra serve una licenza commerciale, licensing@desertant.com); vietato usare modelli, risultati o log per addestrare un modello concorrente; obbligo di citare «Powered by Desert Ant Labs» (c'è in Info del programma); l'SDK manda un conteggio d'uso anonimo (niente audio). Tutto il resto dell'AI del programma ha licenze permissive. **Si può spegnere**: Centro AI, Impostazioni, «Usa Clear»: «Voce migliorata» sparisce e Clear non viene mai caricato (localStorage `dpv-clear = no`). Di partenza resta acceso, come sempre; se non vuoi questi vincoli spegnilo prima di distribuire l'app.

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

## SAM 2.1 Tiny · Apache-2.0

Il ritaglio usa [SAM 2.1 Tiny di Meta](https://huggingface.co/facebook/sam2.1-hiera-tiny), nella [conversione ONNX CardAnvilModels](https://huggingface.co/CardAnvilModels/sam2.1-hiera-tiny-ONNX): la scheda dichiara Apache-2.0 e copia invariata della conversione ONNX Community. I pesi si scaricano al primo uso, non sono inclusi nell’app. La licenza è nel repository del modello.
