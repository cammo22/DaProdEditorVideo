---
name: hardware-ai
description: Come DaProd Video sceglie scheda video e processore per l'AI e le conversioni (rilevatore, ripiego WebGPU→WASM, codifica hardware, Sovraccarica). Da leggere prima di toccare worker AI, proxy o scheduler.
---
# Hardware e AI

- `src/media/hardware.ts` (pagina): `rilevaHardware` guarda TUTTE le schede WebGPU (alte prestazioni, basso consumo), fa fare a ognuna un conto vero e sceglie; risultato in localStorage `dpv-hardware`, rifatto se cambia l'hardware. `messaggioScheda()` → `{scheda, potenza, f16}` va nei messaggi `carica`/`inizia` dei worker; i worker lo leggono con `usaImpostazioneScheda` (`libreriaAI.ts`).
- Un errore della scheda a metà lavoro (`erroreDellaScheda`, regex larga: `setPipeline`, `GPUComputePipeline`, `wgsl`…) → il worker ricarica su WASM, rifà il pezzo e manda `{tipo:'scheda-guasta'}`: la pagina chiama `schedaGuasta()` e la prossima volta si prova l'altra scheda o il processore.
- Conversioni e copie leggere: `hardwareAcceleration: 'prefer-hardware'` prima, poi `'no-preference'` se non va (`proxy.ts`, `normalizza.ts`).
- Scheduler (`src/media/attivita.ts`): corsie `leggero`/`pesante`, limiti da `limitiNormali()`; **Sovraccarica** = `sovraccarica(true)` (`limitiForti()`, i lavori pesanti non aspettano il montaggio che suona; si spegne da solo). Nelle prove `impostaLimiti`.
- Dal container non si prova mai l'hardware vero.
