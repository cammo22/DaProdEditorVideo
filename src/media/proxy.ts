// I proxy automatici: copie leggere delle riprese pesanti (al massimo 960 pixel di lato, un fotogramma chiave
// ogni mezzo secondo), fatte dietro le quinte appena la ripresa entra nel contenitore. I monitor leggono quelle e
// vanno lisci anche con i file dei telefoni e dei generatori (4K, HEVC, fotogrammi chiave ogni 10 secondi);
// l'export legge sempre gli originali. Si conservano nel disco privato del browser/app (OPFS): la seconda volta
// sono già pronti. Mentre il montaggio suona il lavoro si mette in pausa, per non rubare il decoder.
import {
  ALL_FORMATS, BlobSource, BufferSource, BufferTarget, Conversion, EncodedPacketSink, Input, Mp4OutputFormat, Output,
  QUALITY_MEDIUM, WebMOutputFormat, getFirstEncodableVideoCodec, type Source,
} from 'mediabunny';
import type { MediaItem } from '../core/tipi';
import type { MediaRT } from './libreria';
import { inCoda, pausaPerRiproduzione, type Lavoro } from './attivita';

export interface Proxy { input: Input; v: NonNullable<MediaRT['v']>; w: number; h: number }

const LATO = 960;
const CARTELLA = 'proxy-1';

export type ModoProxy = 'auto' | 'sempre' | 'mai';
const leggiModo = (): ModoProxy => { try { const v = localStorage.getItem('dpv-proxy'); return v === 'sempre' || v === 'mai' ? v : 'auto'; } catch { return 'auto'; } };
let modo: ModoProxy = leggiModo();
export const modoProxy = () => modo;
export function impostaModoProxy(m: ModoProxy) {
  modo = m;
  try { localStorage.setItem('dpv-proxy', m); } catch { /* niente memoria: vale per questa volta */ }
  avvisa();
}

const ascoltatori = new Set<() => void>();
/** chi mostra lo stato dei proxy (le carte del contenitore, la barra di stato) si iscrive qui */
export const quandoProxy = (fn: () => void) => { ascoltatori.add(fn); return () => ascoltatori.delete(fn); };
const avvisa = () => { for (const f of ascoltatori) f(); };

/** il nome del file del proxy: dipende solo dal file originale (nome, dimensione, data, durata) */
function nomeProxy(m: MediaItem) {
  const s = `${m.name}|${m.size}|${m.lastModified}|${m.duration.toFixed(3)}|${m.width}x${m.height}`;
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619); b = Math.imul(b ^ s.charCodeAt(i), 2246822519); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

async function cartella(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const radice = await navigator.storage?.getDirectory?.();
    return radice ? await radice.getDirectoryHandle(CARTELLA, { create: true }) : null;
  } catch { return null; }
}

/** quanto sono lontani i fotogrammi chiave (secondi): i file dei telefoni ne hanno uno ogni 1-10 secondi */
async function distanzaChiavi(r: MediaRT, durata: number): Promise<number> {
  try {
    const ps = new EncodedPacketSink(r.v!);
    const ts: number[] = [];
    let k = await ps.getFirstKeyPacket({ metadataOnly: true });
    while (k && ts.length < 5) { ts.push(k.timestamp); k = await ps.getNextKeyPacket(k, { metadataOnly: true }); }
    if (ts.length < 2) return durata;
    return (ts[ts.length - 1] - ts[0]) / (ts.length - 1);
  } catch { return 0; }
}

/** serve un proxy? Riprese grandi, fotogrammi chiave radi o codec faticosi; mai per i file brevi */
async function serve(m: MediaItem, r: MediaRT): Promise<boolean> {
  if (modo === 'mai' || m.type !== 'video' || !r.v || !r.vDecodable || m.duration < 2) return false;
  if (modo === 'sempre') return true;
  if (m.width * m.height > 1280 * 720 * 1.05) return true;
  if (/hev|hvc|hevc|av01|av1/i.test(m.vcodec)) return true;
  return (await distanzaChiavi(r, m.duration)) > 1.1;
}

async function apriProxy(fonte: Blob | ArrayBuffer): Promise<Proxy | null> {
  const input = new Input({ source: fonte instanceof Blob ? new BlobSource(fonte) : new BufferSource(fonte), formats: ALL_FORMATS });
  const v = await input.getPrimaryVideoTrack();
  if (!v || !(await v.canDecode())) { input.dispose(); return null; }
  return { input, v, w: await v.getDisplayWidth(), h: await v.getDisplayHeight() };
}

function metti(r: MediaRT, p: Proxy) {
  r.proxy?.input.dispose();
  r.proxy = p;
  r.proxyStato = 'pronto';
  r.proxyProg = 1;
  avvisa();
}

// ——— la coda: un proxy alla volta (nel centro attività), in pausa mentre si suona ———
let fermo = false;
let pausa: AbortController | null = null;
let riprendi: (() => void) | null = null;

/** il montaggio suona (true) o si è fermato (false): i proxy aspettano */
export function pausaProxy(on: boolean) {
  fermo = on;
  pausaPerRiproduzione(on);
  if (on) pausa?.abort();
  else { const f = riprendi; riprendi = null; f?.(); }
}

/** il proxy di questo file è già sul disco? Se sì lo si apre e si usa subito */
export async function proxyEsistente(m: MediaItem, r: MediaRT): Promise<boolean> {
  if (r.proxy) return true;
  const dir = await cartella();
  if (!dir) return false;
  try {
    const fh = await dir.getFileHandle(nomeProxy(m));
    const p = await apriProxy(await fh.getFile());
    if (p) { metti(r, p); return true; }
  } catch { /* non c'è ancora */ }
  return false;
}

/** la ripresa deve avere la sua copia leggera: se c'è già sul disco si usa, se serve si mette in coda.
 *  fonte = una lettura nuova del file originale (il proxy lo legge per conto suo, senza disturbare il monitor);
 *  priorita = chi è in timeline passa avanti */
export async function accodaProxy(m: MediaItem, r: MediaRT, fonte: () => Source, priorita: number | (() => number) = 0) {
  if (r.proxy || r.proxyStato === 'coda' || r.proxyStato === 'lavoro') return;
  if (await proxyEsistente(m, r)) return;
  if (!(await serve(m, r))) { r.proxyStato = 'no'; return; }
  r.proxyStato = 'coda';
  r.proxyProg = 0;
  avvisa();
  void inCoda({ corsia: 'pesante', titolo: 'Copie leggere per il monitor', categoria: 'proxy', gruppo: 'proxy', dettaglio: m.name, priorita }, async (l) => {
    if (r.proxy || !r.input) return;
    r.proxyStato = 'lavoro';
    avvisa();
    l.imposta(0, m.name);
    try {
      const p = await creaProxy(m, r, fonte, l);
      if (p) metti(r, p); else r.proxyStato = l.fermato ? 'no' : 'errore';
    } catch {
      r.proxyStato = 'errore';
    }
    avvisa();
  }).then(() => { if (r.proxyStato === 'coda') { r.proxyStato = 'no'; avvisa(); } });
}

/** prima con la scheda video (il codificatore hardware è molto più veloce e il processore resta libero); se non c'è o sbaglia, col processore */
async function creaProxy(m: MediaItem, r: MediaRT, fonte: () => Source, l: Lavoro): Promise<Proxy | null> {
  for (const hw of ['prefer-hardware', 'no-preference'] as const) {
    if (l.fermato) return null;
    try {
      const p = await creaProxyCon(m, r, fonte, l, hw);
      if (p || hw === 'no-preference' || l.fermato) return p;
    } catch (e) {
      if (hw === 'no-preference' || l.fermato) throw e;
    }
    r.proxyProg = 0;
    l.imposta(0, m.name);
  }
  return null;
}

async function creaProxyCon(m: MediaItem, r: MediaRT, fonte: () => Source, l: Lavoro, hw: 'prefer-hardware' | 'no-preference'): Promise<Proxy | null> {
  const k = Math.min(1, LATO / Math.max(m.width, m.height, 1));
  const w = Math.max(2, Math.round((m.width * k) / 2) * 2), h = Math.max(2, Math.round((m.height * k) / 2) * 2);
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width: w, height: h });
  if (!codec) return null;
  const output = new Output({ format: codec === 'avc' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const input = new Input({ source: fonte(), formats: ALL_FORMATS });
  try {
    const conv = await Conversion.init({
      input, output, tracks: 'primary',
      video: { width: w, height: h, fit: 'fill', codec, keyFrameInterval: 0.5, quality: QUALITY_MEDIUM, forceTranscode: true, hardwareAcceleration: hw },
      audio: { discard: true },
    });
    if (!conv.isValid) return null;
    // l'avanzamento si segna e basta: avvisare a ogni fotogramma farebbe ridisegnare il monitor per niente
    conv.onProgress = (p) => { r.proxyProg = p; l.imposta(p); };
    l.segnale.addEventListener('abort', () => { void conv.cancel(); });
    for (;;) {
      if (l.fermato) return null;
      // in pausa finché il montaggio suona; il ✕ del centro attività la sveglia subito (se no restava appesa)
      if (fermo) await new Promise<void>((ok) => { riprendi = ok; l.segnale.addEventListener('abort', () => ok(), { once: true }); });
      if (l.fermato) return null;
      pausa = new AbortController();
      await conv.execute({ pauseSignal: pausa.signal });
      pausa = null;
      if (conv.state === 'done') break;
      if (conv.state === 'canceled') return null;
    }
  } finally {
    input.dispose();
  }
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) return null;
  const dir = await cartella();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(nomeProxy(m), { create: true });
      const ws = await fh.createWritable();
      await ws.write(buf);
      await ws.close();
      return await apriProxy(await fh.getFile());
    } catch { /* disco privato pieno o non scrivibile: il proxy resta in memoria */ }
  }
  return apriProxy(buf);
}

/** quanti proxy sono pronti, in lavorazione o in coda (per la barra di stato) */
export function statoProxy(lista: MediaRT[]) {
  let pronti = 0, lavoro = 0, prog = 0, attesa = 0;
  for (const r of lista) {
    if (r.proxyStato === 'pronto') pronti++;
    else if (r.proxyStato === 'attesa') attesa++;
    else if (r.proxyStato === 'lavoro' || r.proxyStato === 'coda') { lavoro++; if (r.proxyStato === 'lavoro') prog = r.proxyProg ?? 0; }
  }
  return { pronti, lavoro, prog, attesa };
}

/** svuota i proxy salvati (menu Vista): si rifanno quando servono */
export async function svuotaProxy() {
  try {
    const radice = await navigator.storage.getDirectory();
    await radice.removeEntry(CARTELLA, { recursive: true });
  } catch { /* niente da svuotare */ }
}
