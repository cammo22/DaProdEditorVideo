// La misura del volume (BS.1770) fuori dalla pagina: riceve l'audio a pezzi e a fine lavoro risponde con i numeri.
import { MisuraLoudness } from '../core/loudness';

type Richiesta = { tipo: 'inizio'; sr: number; canali: number } | { tipo: 'dati'; canali: Float32Array[] } | { tipo: 'fine' };

let misura: MisuraLoudness | null = null;

self.onmessage = (e: MessageEvent<Richiesta>) => {
  try {
    const d = e.data;
    if (d.tipo === 'inizio') { misura = new MisuraLoudness(d.sr, d.canali); self.postMessage({ tipo: 'pronto' }); }
    else if (d.tipo === 'dati') { misura?.aggiungi(d.canali); self.postMessage({ tipo: 'preso' }); }
    else { const r = misura?.fine() ?? null; misura = null; self.postMessage({ tipo: 'risultato', r }); }
  } catch (err) { self.postMessage({ tipo: 'errore', msg: err instanceof Error ? err.message : String(err) }); }
};
