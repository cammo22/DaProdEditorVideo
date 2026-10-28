// La diagnosi delle funzioni AI (Centro AI → "Controlla l'AI"): risponde alle domande che prima restavano senza
// risposta quando un'AI "dava errore": la libreria parte? da dove (app o CDN)? c'è la scheda video? Hugging Face si
// raggiunge (per scaricare i modelli la prima volta)? quali modelli sono già sul computer? il motore NVIDIA c'è?
import { baseLocaleAI } from './libreriaAI';
import { spiegaErroreAI } from './erroriAI';
import { motoreNemo, type StatoMotore } from './nemo';
import { rilevaHardware, type Hardware } from './hardware';

export interface ProvaLibreria { ok: boolean; dove: string; ms: number; msg: string }

/** la libreria e il suo motore partono? (un conto piccolo in un worker, niente modelli) */
export function provaLibreria(scadenza = 60000): Promise<ProvaLibreria> {
  return new Promise((ok) => {
    let w: Worker;
    try { w = new Worker(new URL('./provaAI.worker.ts', import.meta.url), { type: 'module' }); } catch (e) { ok({ ok: false, dove: '', ms: 0, msg: spiegaErroreAI(e) }); return; }
    const timer = setTimeout(() => { w.terminate(); ok({ ok: false, dove: '', ms: scadenza, msg: 'la prova non ha risposto in tempo' }); }, scadenza);
    w.onmessage = (e) => { clearTimeout(timer); w.terminate(); const r = e.data as ProvaLibreria; ok({ ...r, msg: r.ok ? '' : spiegaErroreAI(r.msg) }); };
    w.onerror = (e) => { clearTimeout(timer); w.terminate(); ok({ ok: false, dove: '', ms: 0, msg: spiegaErroreAI(e.message || 'il worker di prova non parte') }); };
    w.postMessage({ base: baseLocaleAI() });
  });
}

/** Hugging Face risponde? (serve solo per scaricare un modello la prima volta) */
export async function provaInternet(scadenza = 7000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), scadenza);
  try {
    const r = await fetch('https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json', { method: 'HEAD', signal: ctrl.signal, cache: 'no-store' });
    return r.ok || r.status === 302 || r.status === 307;
  } catch { return false; } finally { clearTimeout(timer); }
}

/** la scheda video vista dall'AI (WebGPU): il nome, o null se non c'è */
export async function schedaVideo(): Promise<string | null> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ info?: { vendor?: string; description?: string; architecture?: string } } | null> } }).gpu;
  if (!gpu) return null;
  try {
    const a = await gpu.requestAdapter();
    if (!a) return null;
    const i = a.info ?? {};
    return [i.vendor, i.description || i.architecture].filter(Boolean).join(' ') || 'presente';
  } catch { return null; }
}

const CACHE = 'transformers-cache';

/** i modelli già scaricati (dalla cache della libreria): indirizzo → byte (circa) */
export async function modelliScaricati(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    if (!('caches' in self)) return out;
    const c = await caches.open(CACHE);
    for (const req of await c.keys()) {
      const m = /huggingface\.co\/([^/]+\/[^/]+)\/resolve\//.exec(req.url);
      if (!m) continue;
      const r = await c.match(req);
      const n = Number(r?.headers.get('content-length') ?? 0);
      out.set(m[1], (out.get(m[1]) ?? 0) + n);
    }
  } catch { /* niente cache */ }
  return out;
}

/** toglie i modelli scaricati (si riscaricano quando servono) */
export async function svuotaModelli(): Promise<boolean> {
  try { return 'caches' in self ? await caches.delete(CACHE) : false; } catch { return false; }
}

/** toglie dalla cache i file di un modello (si riscaricano quando servono) */
export async function togliRepoModello(repo: string): Promise<number> {
  let n = 0;
  try {
    if (!('caches' in self)) return 0;
    const c = await caches.open(CACHE);
    for (const req of await c.keys()) if (req.url.includes('huggingface.co/' + repo + '/')) { if (await c.delete(req)) n++; }
  } catch { /* niente cache */ }
  return n;
}

/** lo stato del motore NVIDIA (solo nell'app) */
export async function statoNvidia(): Promise<StatoMotore | null> {
  const m = motoreNemo();
  if (!m) return null;
  return m.stato().catch(() => null);
}

export interface Diagnosi {
  libreria: ProvaLibreria;
  internet: boolean;
  scheda: string | null;
  /** tutte le schede che il sistema offre, la prova di ognuna e quella scelta (src/media/hardware.ts) */
  hardware: Hardware | null;
  modelli: Map<string, number>;
  nvidia: StatoMotore | null;
}

/** tutto insieme (le prove vanno in parallelo) */
export async function diagnosi(): Promise<Diagnosi> {
  const [libreria, internet, scheda, modelli, nvidia, hardware] = await Promise.all([
    provaLibreria(), provaInternet(), schedaVideo(), modelliScaricati(), statoNvidia(), rilevaHardware(true).catch(() => null),
  ]);
  return { libreria, internet, scheda, hardware, modelli, nvidia };
}
