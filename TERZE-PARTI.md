# Componenti di terze parti

## OpenReel Video · MIT

Origine: https://github.com/Augani/openreel-video

Commit studiato: `367d7e90b61b5181f9861b852bb8b9d7a7d2954a`.

Adattamenti in DaProd Video:

- `src/render/lut.ts`: parser `.cube` da `apps/web/src/components/editor/inspector/LUTLoader.tsx` (`parseCubeLUT`) e riferimento trilineare da `packages/core/src/video/color-grading-engine.ts` (`applyLutToData`). Aggiunti domini, limiti e validazione; upload 3D WebGL2 in `src/render/coloreGpu.ts` scritto per DaProd.
- `src/render/curve.ts`, `src/render/coloreGpu.ts`: generatore e applicazione curve da `color-grading-engine.ts` (`buildCurveLUT`, `applyCurvesToData`, `CURVES_SHADER`), riscritti in float con Hermite a pendenze limitate, texture GPU e vera curva luma Rec.709.
- `src/core/ducking.ts`: rilevamento RMS, unione intervalli e generazione inviluppo da `packages/core/src/audio/volume-automation.ts` (`AudioDucker.detectAudioPresence`, `generateDuckingKeyframes`, `mergePresenceRanges`). Estesi a tutti i canali, flusso a pezzi, isteresi, tempo timeline e attenuazione separata in dB.

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
