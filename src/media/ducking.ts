// Lettura a pezzi e analisi in worker: resta in memoria solo l'energia, mai una registrazione intera.
import { AudioBufferSink } from 'mediabunny';
import type { Clip, Key, Project } from '../core/tipi';
import { conIncroci } from './audio';
import { f2s } from '../core/timecode';
import { codaVoce, firmaDucking, generaDuckKeys, impostazioneDucking, presenzaVoce, ruoloAudio, vociDucking, type FinestraRms } from '../core/ducking';
import { mediaRT } from './libreria';

async function analizza(p: Project, c: Clip, segnale?: AbortSignal): Promise<FinestraRms[]> {
  const rt = c.media ? mediaRT(c.media) : undefined;
  if (!rt?.a || !rt.aDecodable) throw new Error(`L'audio di «${c.name}» non è disponibile`);
  const w = new Worker(new URL('./ducking.worker.ts', import.meta.url), { type: 'module' });
  let rifiuta: ((e: Error) => void) | undefined;
  const annullato = () => { rifiuta?.(new Error('Analisi fermata')); w.terminate(); };
  segnale?.addEventListener('abort', annullato);
  const invia = (d: { canali?: Float32Array[]; sr: number; t: number; fine?: boolean }) => new Promise<FinestraRms[]>((resolve, reject) => {
    if (segnale?.aborted) { reject(new Error('Analisi fermata')); return; }
    rifiuta = reject;
    w.onmessage = (e) => { rifiuta = undefined; if (e.data.errore) reject(new Error(e.data.errore)); else resolve(e.data.finestre); };
    w.onerror = () => reject(new Error('Il lavoro in secondo piano per abbassare la musica non è partito'));
    w.postMessage(d, d.canali?.map((c) => c.buffer as ArrayBuffer) ?? []);
  });
  const da = c.srcIn, a = da + f2s(c.len + codaVoce(p, c), p.rate) * c.speed;
  const iter = new AudioBufferSink(rt.a).buffers(da, a);
  const out: FinestraRms[] = [];
  try {
    for await (const { buffer, timestamp } of iter) {
      if (segnale?.aborted) throw new Error('Analisi fermata');
      const sr = buffer.sampleRate;
      const inizio = Math.max(0, Math.ceil((da - timestamp) * sr)), fine = Math.min(buffer.length, Math.ceil((a - timestamp) * sr));
      if (fine <= inizio) continue;
      const canali = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice(inizio, fine));
      out.push(...await invia({ canali, sr, t: timestamp + inizio / sr }));
      if (out.length > 2_000_000) throw new Error('Voce troppo lunga: dividila in parti prima di analizzarla');
    }
    out.push(...await invia({ sr: 0, t: 0, fine: true }));
    return out;
  } finally { void iter.return?.().catch(() => {}); segnale?.removeEventListener('abort', annullato); w.terminate(); }
}

export interface RisultatoDucking { id: string; firma: string; keys: Key[] }
/** Il chiamante applica tutti i risultati in una sola store.edit, dopo aver ricontrollato le firme. */
export async function preparaDucking(p0: Project, ids?: string[], segnale?: AbortSignal, progresso?: (testo: string) => void): Promise<RisultatoDucking[]> {
  const p = conIncroci(structuredClone(p0));
  const musiche = p.clips.filter((c) => ruoloAudio(p, c) === 'musica' && impostazioneDucking(p, c).attivo && (!ids || ids.includes(c.id)));
  if (!musiche.length) throw new Error('Segna la musica e accendi «Abbassa sotto la voce»');
  const voci = vociDucking(p), letture = new Map<string, FinestraRms[]>();
  if (!voci.length) throw new Error('Segna almeno una clip o una traccia audio come voce e lasciala in ascolto');
  for (const [i, c] of voci.entries()) { progresso?.(`Analizzo la voce ${i + 1}/${voci.length}: ${c.name}`); letture.set(c.id, await analizza(p, c, segnale)); }
  return musiche.map((c) => {
    const d = impostazioneDucking(p, c);
    const ranges = voci.flatMap((v) => presenzaVoce(p, v, letture.get(v.id)!, d));
    return { id: c.id, firma: firmaDucking(p, c), keys: generaDuckKeys(p, c, ranges, d) };
  });
}
// Si verifica sullo stesso progetto con gli incroci derivati, anche nel monitor e nell'export.
export const firmaDuckingAttuale = (p: Project, c: Clip) => firmaDucking(conIncroci(p), c);
