// Il modello che separa voce e base (Demucs, htdemucs in formato ONNX, ~172 MB) si scarica la prima volta e resta sul
// computer: nella cache del browser/dell'app (la stessa dei modelli di transformers.js, così "Libera lo spazio" del
// Centro AI lo toglie e il conto dei modelli lo vede). Lo scarico è fatto per resistere: se la rete cade a metà si
// riprende da dove era arrivato (intestazione Range), con qualche tentativo; alla fine si controlla che sia arrivato
// intero (la dimensione dichiarata dal server, una dimensione minima e la prima riga di un file ONNX).
// Niente DOM: gira nel worker e nella pagina.
import { testoErrore } from './erroriAI';

export interface ModelloAudio {
  /** dove si scarica (Hugging Face) */
  url: string;
  /** "autore/nome" su Hugging Face: così lo riconosce modelliScaricati() del Centro AI */
  repo: string;
  nome: string;
  /** quanti byte pesa, circa (per dirlo a chi lo scarica) */
  peso: number;
  /** sotto questa dimensione il file è rotto o incompleto, qualunque cosa dica il server */
  minimo: number;
}

/** htdemucs con la STFT fuori dal modello (la fa src/core/separa.ts): lo stesso file che usa demucs-web */
export const MODELLO_SEPARAZIONE: ModelloAudio = {
  url: 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx',
  repo: 'timcsy/demucs-web-onnx',
  nome: 'Demucs (htdemucs)',
  peso: 172 * 1048576,
  minimo: 100 * 1048576,
};

/** il nome della cache: quella di transformers.js (vedi diagnosiAI.ts) */
export const CACHE_MODELLI = 'transformers-cache';

const cacheAperta = async () => ('caches' in self ? caches.open(CACHE_MODELLI) : null);

/** quanti byte ha il modello nella cache, o null se non c'è */
export async function modelloInCache(m: ModelloAudio = MODELLO_SEPARAZIONE): Promise<number | null> {
  try {
    const c = await cacheAperta();
    const r = c ? await c.match(m.url) : undefined;
    if (!r) return null;
    const n = Number(r.headers.get('content-length') ?? 0);
    return n > 0 ? n : (await r.clone().arrayBuffer()).byteLength;
  } catch { return null; }
}

/** toglie il modello dal computer (si riscarica quando serve) */
export async function togliModello(m: ModelloAudio = MODELLO_SEPARAZIONE): Promise<boolean> {
  try { const c = await cacheAperta(); return c ? await c.delete(m.url) : false; } catch { return false; }
}

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** "bytes 100-199/1000" → 1000 */
const totaleDaRange = (r: Response) => { const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') ?? ''); return m ? Number(m[1]) : 0; };

/** il file sembra un modello ONNX? (un ModelProto comincia con il campo 1, ir_version: byte 0x08) */
export const sembraOnnx = (b: Uint8Array) => b.length > 16 && b[0] === 0x08;

export interface OpzioniScarico {
  /** (byte arrivati, byte totali — 0 se il server non lo dice) */
  avanza?: (caricati: number, totali: number) => void;
  segnale?: AbortSignal;
  tentativi?: number;
  /** pausa fra un tentativo e l'altro, in ms (le prove la accorciano) */
  attesa?: number;
}

/**
 * Il modello come byte: dalla cache se c'è, se no lo scarica (riprendendo se cade) e lo mette in cache.
 * Se la cache non c'è o è piena si lavora lo stesso: la prossima volta si riscarica.
 */
export async function ottieniModello(m: ModelloAudio = MODELLO_SEPARAZIONE, o: OpzioniScarico = {}): Promise<Uint8Array> {
  try {
    const c = await cacheAperta();
    const r = c ? await c.match(m.url) : undefined;
    if (r) {
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length >= m.minimo && sembraOnnx(b)) { o.avanza?.(b.length, b.length); return b; }
      // una copia rovinata: si butta e si riscarica
      await c!.delete(m.url);
    }
  } catch { /* niente cache: si scarica */ }
  const b = await scarica(m, o);
  try {
    const c = await cacheAperta();
    await c?.put(m.url, new Response(b as BodyInit, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(b.length) } }));
  } catch { /* spazio finito: si usa il modello senza tenerlo */ }
  return b;
}

async function scarica(m: ModelloAudio, o: OpzioniScarico): Promise<Uint8Array> {
  const max = o.tentativi ?? 5;
  let totale = 0;
  let buf: Uint8Array | null = null;
  let caricati = 0;
  let ultimoErrore: unknown = null;
  for (let t = 0; t < max; t++) {
    if (o.segnale?.aborted) throw new Error('fermato');
    try {
      const r = await fetch(m.url, { headers: caricati > 0 ? { Range: `bytes=${caricati}-` } : {}, signal: o.segnale });
      if (!r.ok) throw new Error(`il server ha risposto ${r.status}`);
      if (caricati > 0 && r.status !== 206) { caricati = 0; buf = null; totale = 0; } // il server non sa riprendere: da capo
      // la dimensione intera: da Content-Range se il server lo lascia leggere, se no quanto già scaricato + quanto resta
      const resto = Number(r.headers.get('content-length') ?? 0);
      const dichiarato = r.status === 206 ? totaleDaRange(r) || (resto ? caricati + resto : 0) : resto;
      if (!totale) totale = dichiarato;
      let dove: Uint8Array = buf ?? new Uint8Array(totale || m.peso + (8 << 20));
      buf = dove;
      const lettore = r.body?.getReader();
      if (!lettore) throw new Error('il server non manda i dati');
      for (;;) {
        const { done, value } = await lettore.read();
        if (done) break;
        if (caricati + value.length > dove.length) {
          const piu: Uint8Array = new Uint8Array(Math.max(dove.length * 2, caricati + value.length));
          piu.set(dove.subarray(0, caricati));
          dove = piu;
          buf = piu;
        }
        dove.set(value, caricati);
        caricati += value.length;
        o.avanza?.(caricati, totale);
      }
      if (totale && caricati < totale) throw new Error(`il file si è interrotto a ${Math.round(caricati / 1048576)} di ${Math.round(totale / 1048576)} MB`);
      if (totale && caricati > totale) throw new Error('il file è più lungo del previsto');
      ultimoErrore = null;
      break;
    } catch (e) {
      if (o.segnale?.aborted) throw new Error('fermato');
      ultimoErrore = e;
      // una risposta 4xx non cambia riprovando (il file non c'è o non è permesso): si smette subito
      if (/ha risposto 4\d\d/.test(testoErrore(e))) break;
      await pausa((o.attesa ?? 1500) * (t + 1));
    }
  }
  if (ultimoErrore || !buf) throw ultimoErrore ?? new Error('scarico non riuscito');
  const out = buf.subarray(0, caricati);
  if (out.length < m.minimo) throw new Error(`il modello è troppo piccolo (${Math.round(out.length / 1048576)} MB): scarico incompleto`);
  if (!sembraOnnx(out)) throw new Error('il file scaricato non è un modello ONNX: forse il server ha risposto con una pagina di errore');
  return out;
}
