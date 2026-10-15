---
name: prove
description: Come far girare le prove di DaProd Video (build, suite completa o una sola area, foto) e cosa guardare quando una prova rossa è solo lentezza del computer. Usala prima di dire "fatto" su qualunque modifica.
---
# Le prove di DaProd Video

1. `npx tsc --noEmit -p .` (tipi) e `npm run build` (le prove leggono `dist/`: dopo ogni modifica si rifà il build, anche dopo aver cambiato la versione).
2. Una sola area, veloce: `node test/prove-nuove.mjs <chiave>` con chiave = `sfondo`, `animazioni`, `montage`, `pannello`, `seguito`, `attivita`, `aiuto`, `rifiniture`, `banco`, `correzioni`, `proprieta`, `liveaudio`, `live`, `audioui`, `audioai`.
3. Tutto: `node test/prove.mjs` (lungo; su computer carichi alcune prove vanno a tempo: se una cade da sola ma passa da sola, è la lentezza, si rende la prova paziente con `waitForFunction`, non si toglie).
4. Le foto: `node test/foto.mjs` → `test/.out/`, vanno guardate (Read sull'immagine) prima di pubblicare cose che si vedono.
5. Nelle prove i modelli AI e le sorgenti LIVE sono finti (`impostaSegmentatore`, `impostaSorgenteLive`, Demucs finto); l'hardware vero (scheda video, webcam, schermo) non si può provare dal container: va detto all'utente.
6. Chromium: WebM/VP9, niente H.264; senza scheda video (swiftshader).
