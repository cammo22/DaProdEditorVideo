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
