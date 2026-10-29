// Analisi locale, nessun modello o servizio da scaricare.
import { AnalizzatoreRms } from '../core/ducking';
let rms = new AnalizzatoreRms();
self.onmessage = (e: MessageEvent<{ canali?: Float32Array[]; sr: number; t: number; fine?: boolean }>) => {
  try {
    const d = e.data;
    const finestre = d.fine ? [rms.fine()].filter((v) => v !== null) : rms.push(d.canali!, d.sr, d.t);
    if (d.fine) rms = new AnalizzatoreRms();
    self.postMessage({ finestre });
  } catch (e) { self.postMessage({ errore: e instanceof Error ? e.message : String(e) }); }
};
