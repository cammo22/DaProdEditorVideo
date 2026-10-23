// Le copie leggere (proxy): copie delle riprese pesanti (al massimo 960 pixel di lato, un fotogramma chiave ogni mezzo
// secondo). I monitor leggono quelle e vanno lisci anche con i file dei telefoni e dei generatori (4K, HEVC, fotogrammi
// chiave ogni 10 secondi); l'export legge sempre gli originali. Si conservano nel disco privato del browser/app (OPFS).
// Dalla 1.5.8 NON si fanno più da sole: né all'import, né quando la ripresa entra in timeline, né alla riapertura.
// Se una copia c'è già (sul disco o dentro un .dap) si legge e si usa subito; se no la fa l'utente con «Prepara copia
// leggera» (una riga da avviare nel Centro attività). Mentre il montaggio suona il lavoro si sospende (pausa vera).
import {
  ALL_FORMATS, BlobSource, BufferSource, BufferTarget, Conversion, EncodedPacketSink, Input, Mp4OutputFormat, Output,
  QUALITY_MEDIUM, WebMOutputFormat, getFirstEncodableVideoCodec, type Source,
} from 'mediabunny';
import type { MediaItem } from '../core/tipi';
import type { MediaRT } from './libreria';
import { avviaRiga, pausaPerRiproduzione, proponi, rigaAttivita, type Lavoro, type Proposto } from './attivita';

export interface Proxy { input: Input; v: NonNullable<MediaRT['v']>; w: number; h: number }

const LATO = 960;
const CARTELLA = 'proxy-1';

/**
 * La preferenza di prima (Vista → Copie leggere). Dalla 1.5.8 non fa partire più niente da sola:
 *  · 'mai'    il monitor legge sempre gli originali (le copie già fatte non si usano) e «Prepara copia leggera» non si offre;
 *  · 'sempre' «Prepara copia leggera» si offre per tutti i video, anche quelli leggeri;
 *  · 'auto'   si offre solo per le riprese pesanti (grandi, HEVC/AV1, fotogrammi chiave radi).
 * Il valore salvato in localStorage si legge e non si cancella.
 */
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
export function nomeProxy(m: MediaItem) {
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

/** serve un proxy? Riprese grandi, fotogrammi chiave radi o codec faticosi; mai per i file brevi (solo letture di metadati) */
export async function serveProxy(m: MediaItem, r: MediaRT): Promise<boolean> {
  if (modo === 'mai' || m.type !== 'video' || !r.v || !r.vDecodable || m.duration < 2) return false;
  if (modo === 'sempre') return true;
  if (m.width * m.height > 1280 * 720 * 1.05) return true;
  if (/hev|hvc|hevc|av01|av1/i.test(m.vcodec)) return true;
  return (await distanzaChiavi(r, m.duration)) > 1.1;
}
const serve = serveProxy;

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

// ——— il lavoro: nel centro attività, sospeso mentre si suona o quando l'utente preme Pausa ———
let fermo = false;
/** le conversioni al lavoro adesso (con Sovraccarica possono essere più di una): la riproduzione le sospende tutte */
const sospendi = new Set<AbortController>();
const svegliaRiproduzione = new Set<() => void>();

/** il montaggio suona (true) o si è fermato (false): i proxy aspettano */
export function pausaProxy(on: boolean) {
  fermo = on;
  pausaPerRiproduzione(on);
  if (on) for (const c of sospendi) c.abort();
  else { const fs = [...svegliaRiproduzione]; svegliaRiproduzione.clear(); for (const f of fs) f(); }
}

/** il proxy di questo file è già sul disco? Se sì lo si apre e si usa subito (è una lettura: non si produce niente) */
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

export interface OpzioniProxy {
  /** più alta = prima (chi sta in timeline passa avanti) */
  priorita?: number | (() => number);
  /** parte subito (l'utente l'ha chiesta adesso per questo file); se no nasce «da avviare» */
  avvia?: boolean;
  /** anche se il file non sembra pesante (la scelta esplicita dell'utente su un file) */
  forza?: boolean;
}

/**
 * «Prepara copia leggera» per una ripresa. Ritorna la riga (da avviare, o già avviata con avvia:true) o null se non si
 * offre (non è un video decodificabile, Copie leggere = Mai, c'è già o è già in giro). Non fa partire niente da sola.
 * fonte = una lettura nuova del file originale (il proxy lo legge per conto suo, senza disturbare il monitor).
 * Pausa vera (pauseSignal di Mediabunny): riparte dallo stesso fotogramma. Annulla: la copia a metà si butta
 * (sul disco si scrive solo a lavoro finito).
 */
export function proponiProxy(m: MediaItem, r: MediaRT, fonte: () => Source, o: OpzioniProxy = {}): Proposto<boolean> | null {
  if (modo === 'mai' || m.type !== 'video' || !r.v || !r.vDecodable || r.proxy) return null;
  if (r.proxyStato === 'coda' || r.proxyStato === 'lavoro') return null;
  const opz = {
    corsia: 'pesante' as const, titolo: 'Copie leggere per il monitor', categoria: 'proxy' as const, gruppo: 'proxy', dettaglio: m.name, priorita: o.priorita, pausa: 'vera' as const, chiave: 'proxy:' + m.id, media: m.id,
    alAvvio: () => { r.proxyStato = 'coda'; avvisa(); },
    alAnnulla: () => { if (r.proxyStato === 'coda' || r.proxyStato === 'manuale') { r.proxyStato = undefined; avvisa(); } },
  };
  r.proxyStato = o.avvia ? 'coda' : 'manuale';
  avvisa();
  // finito in qualunque modo senza essere partito (scartato, annullato in coda): lo stato torna «non fatta»
  const rimetti = () => { if (r.proxyStato === 'coda' || r.proxyStato === 'manuale') { r.proxyStato = undefined; avvisa(); } };
  const lavoro = async (l: Lavoro): Promise<boolean> => {
    if (r.proxy) return true;
    if (!r.input) return false;
    if (await proxyEsistente(m, r)) return true;
    if (!o.forza && !(await serve(m, r))) { r.proxyStato = 'no'; avvisa(); l.imposta(1, `${m.name} · non serve (file già leggero)`); return false; }
    r.proxyStato = 'lavoro';
    r.proxyProg = 0;
    avvisa();
    l.imposta(0, m.name);
    try {
      const p = await creaProxy(m, r, fonte, l);
      if (p && l.valido) { metti(r, p); return true; }
      p?.input.dispose();
      r.proxyStato = l.fermato ? undefined : 'errore';
    } catch (e) {
      r.proxyStato = l.fermato ? undefined : 'errore';
      if (!l.fermato) throw e;
    } finally { avvisa(); }
    return false;
  };
  if (o.avvia) {
    const p = proponi(opz, lavoro);
    const id = avviaRiga(p.riga.id);
    void p.esito.then(rimetti);
    return { ...p, riga: (id !== null && rigaAttivita(id)) || p.riga };
  }
  const p = proponi(opz, lavoro);
  void p.esito.then(rimetti);
  return p;
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
      if (fermo) await new Promise<void>((ok) => { svegliaRiproduzione.add(ok); l.segnale.addEventListener('abort', () => ok(), { once: true }); });
      // la Pausa dell'utente: si ferma qui (la conversione è sospesa, non buttata) e lascia la corsia agli altri
      await l.checkpoint();
      const sosp = new AbortController();
      sospendi.add(sosp);
      const stacca = l.allaPausa(() => sosp.abort());
      if (fermo) sosp.abort();
      try { await conv.execute({ pauseSignal: sosp.signal }); } finally { stacca(); sospendi.delete(sosp); }
      if (conv.state === 'done') break;
      if (conv.state === 'canceled') return null;
    }
  } finally {
    input.dispose();
  }
  if (!l.valido) return null;
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

/** quanti proxy sono pronti, in lavorazione o in coda, e quanti da avviare (per la barra di stato) */
export function statoProxy(lista: MediaRT[]) {
  let pronti = 0, lavoro = 0, prog = 0, attesa = 0, manuali = 0;
  for (const r of lista) {
    if (r.proxyStato === 'pronto') pronti++;
    else if (r.proxyStato === 'attesa') attesa++;
    else if (r.proxyStato === 'manuale') manuali++;
    else if (r.proxyStato === 'lavoro' || r.proxyStato === 'coda') { lavoro++; if (r.proxyStato === 'lavoro') prog = r.proxyProg ?? 0; }
  }
  return { pronti, lavoro, prog, attesa, manuali };
}

/** le copie leggere già fatte dei media del progetto (nome → file): vanno dentro il .dap */
export async function proxyDelProgetto(media: MediaItem[]): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  const dir = await cartella();
  if (!dir) return out;
  for (const m of media) {
    if (m.type !== 'video') continue;
    const n = nomeProxy(m);
    try { const f = await (await dir.getFileHandle(n)).getFile(); if (f.size) out.set(n, f); } catch { /* non c'è */ }
  }
  return out;
}

/** aprendo un .dap: la copia leggera torna nel disco privato (se non c'è già), così il monitor la usa subito */
export async function rimettiProxy(nome: string, len: number, leggi: (a: number, b: number) => Promise<Uint8Array>): Promise<boolean> {
  const dir = await cartella();
  if (!dir || !/^[0-9a-f]{16}$/.test(nome)) return false;
  try { const f = await (await dir.getFileHandle(nome)).getFile(); if (f.size === len) return true; } catch { /* non c'è: si copia */ }
  try {
    const fh = await dir.getFileHandle(nome, { create: true });
    const ws = await fh.createWritable();
    const PEZZO = 8 << 20;
    for (let a = 0; a < len; a += PEZZO) await ws.write(new Blob([await leggi(a, Math.min(len, a + PEZZO)) as BlobPart]));
    await ws.close();
    return true;
  } catch { return false; }
}

/** svuota i proxy salvati (menu Vista): si rifanno quando servono */
export async function svuotaProxy() {
  try {
    const radice = await navigator.storage.getDirectory();
    await radice.removeEntry(CARTELLA, { recursive: true });
  } catch { /* niente da svuotare */ }
}
