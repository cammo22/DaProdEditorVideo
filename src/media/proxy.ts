// Le copie leggere (proxy): copie delle riprese pesanti (al massimo 960 pixel di lato, un fotogramma chiave ogni mezzo
// secondo). I monitor leggono quelle e vanno lisci anche con i file dei telefoni e dei generatori (4K, HEVC, fotogrammi
// chiave ogni 10 secondi); l'export legge sempre gli originali. Si conservano nel disco privato del browser/app (OPFS).
// All'import dei video pesanti partono da sole, se la preferenza è accesa. Alla riapertura si usano solo quelle già
// pronte. Resta «Prepara copia leggera» nel Centro attività. Mentre il montaggio suona il lavoro si sospende (pausa vera).
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
 * La preferenza di prima (Vista → Copie leggere), conservata anche per i progetti vecchi:
 *  · 'mai'    il monitor legge sempre gli originali (le copie già fatte non si usano) e «Prepara copia leggera» non si offre;
 *  · 'sempre' «Prepara copia leggera» si offre per tutti i video, anche quelli leggeri;
 *  · 'auto'   si offre solo per le riprese pesanti.
 * L'avvio all'import ha una preferenza separata e riguarda sempre solo i video pesanti.
 * Il valore salvato in localStorage si legge e non si cancella.
 */
export type ModoProxy = 'auto' | 'sempre' | 'mai';
const leggiModo = (): ModoProxy => { try { const v = localStorage.getItem('dpv-proxy'); return v === 'sempre' || v === 'mai' ? v : 'auto'; } catch { return 'auto'; } };
let modo: ModoProxy = leggiModo();
export const modoProxy = () => modo;
const CHIAVE_AUTO = 'dpv-proxy-automatiche';
let automatiche = (() => { try { return localStorage.getItem(CHIAVE_AUTO) !== 'no'; } catch { return true; } })();
export const copieLeggereAutomatiche = () => automatiche;
export function impostaCopieLeggereAutomatiche(on: boolean) {
  automatiche = on;
  try { localStorage.setItem(CHIAVE_AUTO, on ? 'si' : 'no'); } catch { /* vale per questa sessione */ }
  avvisa();
}
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
    return Math.max(...ts.slice(1).map((t, i) => t - ts[i]));
  } catch { return 0; }
}

/** Fino a 1440p anche verticale; oltre 60 Mbit/s o chiavi distanti più di 2 secondi. */
export const SOGLIE_PROXY = Object.freeze({ latoLungo: 2560, latoCorto: 1440, bit: 10, bitrate: 60_000_000, distanzaChiavi: 2 });
export interface DatiProxy { codec?: string; bit?: number; bitrate?: number; distanzaChiavi?: number; hdr?: boolean }

/** La profondità dichiarata nella stringa WebCodecs (il nome generico «vp9» non basta). */
export function bitVideo(codec: string): number {
  const profondita = /^(?:vp09\.\d+\.\d+|av01\.\d\.\d+[mh])\.(\d+)/i.exec(codec);
  if (profondita) return Number(profondita[1]);
  if (/^avc[13]\.(6e|7a|f4)/i.test(codec)) return 10;
  return 0;
}

/** Solo metadati: non cambia il progetto e non decodifica fotogrammi. */
export function videoPesante(m: Pick<MediaItem, 'type' | 'width' | 'height' | 'vcodec'>, d: DatiProxy = {}): boolean {
  if (m.type !== 'video') return false;
  const codec = d.codec || m.vcodec;
  return Math.max(m.width, m.height) > SOGLIE_PROXY.latoLungo || Math.min(m.width, m.height) > SOGLIE_PROXY.latoCorto
    || d.hdr === true || (d.bit ?? bitVideo(codec)) >= SOGLIE_PROXY.bit
    || /hev|hvc|av01|av1|prores|ap4[hcxs]|apch|apcn|apcs|apco|aprh|aprn/i.test(codec)
    || (d.bitrate ?? 0) > SOGLIE_PROXY.bitrate || (d.distanzaChiavi ?? 0) > SOGLIE_PROXY.distanzaChiavi;
}

/** serve un proxy? Solo letture di metadati; «sempre» vale per le richieste manuali. */
export async function serveProxy(m: MediaItem, r: MediaRT): Promise<boolean> {
  if (modo === 'mai' || m.type !== 'video' || !r.v || !r.vDecodable || m.duration <= 0) return false;
  if (modo === 'sempre') return true;
  return ripresaPesante(m, r);
}
const serve = serveProxy;

/** Anche con la vecchia preferenza «sempre», l'automatismo sceglie solo le riprese pesanti. */
export async function ripresaPesante(m: MediaItem, r: MediaRT): Promise<boolean> {
  if (m.type !== 'video' || !r.v || !r.vDecodable || m.duration <= 0) return false;
  if (videoPesante(m)) return true;
  const [config, bitrate] = await Promise.all([
    r.v.getDecoderConfig().catch(() => null), r.v.getAverageBitrate().catch(() => null),
  ]);
  const transfer = String(config?.colorSpace?.transfer ?? '');
  const d = { codec: config?.codec, bitrate: bitrate ?? (m.size > 0 ? m.size * 8 / m.duration : 0), hdr: /^(pq|hlg|smpte2084|arib-std-b67)$/i.test(transfer) };
  if (videoPesante(m, d)) return true;
  return videoPesante(m, { ...d, distanzaChiavi: await distanzaChiavi(r, m.duration) });
}

async function apriProxy(fonte: Blob | ArrayBuffer): Promise<Proxy | null> {
  const input = new Input({ source: fonte instanceof Blob ? new BlobSource(fonte) : new BufferSource(fonte), formats: ALL_FORMATS });
  try {
  const v = await input.getPrimaryVideoTrack();
  if (!v || !(await v.canDecode())) { input.dispose(); return null; }
  return { input, v, w: await v.getDisplayWidth(), h: await v.getDisplayHeight() };
  } catch (e) { input.dispose(); throw e; }
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
 * offre (non è un video decodificabile, Copie leggere = Mai, c'è già o è già in giro).
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
    if (!l.valido || !r.input) return false;
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
  let conv: Conversion | undefined;
  let annulla: (() => void) | undefined;
  let annullamento: Promise<void> | undefined;
  try {
    conv = await Conversion.init({
      input, output, tracks: 'primary',
      video: { width: w, height: h, fit: 'fill', codec, keyFrameInterval: 0.5, quality: QUALITY_MEDIUM, forceTranscode: true, hardwareAcceleration: hw },
      audio: { discard: true },
    });
    if (!conv.isValid) return null;
    // l'avanzamento si segna e basta: avvisare a ogni fotogramma farebbe ridisegnare il monitor per niente
    conv.onProgress = (p) => { r.proxyProg = p; l.imposta(p); };
    const conversione = conv;
    annulla = () => { annullamento ??= conversione.cancel().catch(() => {}); };
    l.segnale.addEventListener('abort', annulla);
    if (l.segnale.aborted) annulla();
    for (;;) {
      if (l.fermato) return null;
      // in pausa finché il montaggio suona; il ✕ del centro attività la sveglia subito (se no restava appesa)
      if (fermo) await new Promise<void>((ok) => {
        const sveglia = () => { svegliaRiproduzione.delete(sveglia); l.segnale.removeEventListener('abort', sveglia); ok(); };
        svegliaRiproduzione.add(sveglia);
        l.segnale.addEventListener('abort', sveglia, { once: true });
        if (l.segnale.aborted) sveglia();
      });
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
    if (annulla) l.segnale.removeEventListener('abort', annulla);
    await annullamento;
    if (conv && conv.state !== 'done' && conv.state !== 'canceled') await conv.cancel().catch(() => {});
    input.dispose();
  }
  if (!l.valido) return null;
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) return null;
  return scriviProxy(m, buf, l);
}

// Due media possono riferirsi allo stesso originale: la chiave attività usa l'ID media,
// il nome su disco invece è condiviso. Anche il ripristino da .dap deve rispettare questo lock.
const scrittureProxy = new Map<string, Promise<void>>();
async function esclusivaProxy<T>(nome: string, fn: () => Promise<T>): Promise<T> {
  const precedente = scrittureProxy.get(nome) ?? Promise.resolve();
  let libera!: () => void;
  const turno = new Promise<void>((ok) => { libera = ok; });
  scrittureProxy.set(nome, turno);
  await precedente;
  try {
    return navigator.locks ? await navigator.locks.request('dpv-proxy:' + nome, fn) : await fn();
  } finally {
    libera();
    if (scrittureProxy.get(nome) === turno) scrittureProxy.delete(nome);
  }
}

/** Il confine asincrono del disco: dopo ogni attesa si ricontrolla l'annullamento. */
async function scriviProxy(m: MediaItem, buf: ArrayBuffer, l: Pick<Lavoro, 'valido'>): Promise<Proxy | null> {
  return esclusivaProxy(nomeProxy(m), () => scriviProxyEsclusiva(m, buf, l));
}
async function scriviProxyEsclusiva(m: MediaItem, buf: ArrayBuffer, l: Pick<Lavoro, 'valido'>): Promise<Proxy | null> {
  if (!l.valido) return null;
  const dir = await cartella();
  if (!l.valido) return null;
  if (dir) {
    const nome = nomeProxy(m);
    let ws: FileSystemWritableFileStream | undefined;
    let creato = false;
    const scarta = async () => {
      await ws?.abort().catch(() => {});
      if (creato) await dir.removeEntry(nome);
    };
    try {
      const esistente = await dir.getFileHandle(nome).catch((e: unknown) => {
        if (e instanceof Error && e.name === 'NotFoundError') return null;
        throw e;
      });
      if (!l.valido) return null;
      if (esistente) {
        const p = await apriProxy(await esistente.getFile());
        if (!l.valido) { p?.input.dispose(); return null; }
        if (p) return p;
        // Non è nostro: neppure un file preesistente rovinato va cancellato dal nostro Annulla.
        throw new Error('proxy su disco non leggibile: uso la copia in memoria');
      }
      const fh = await dir.getFileHandle(nome, { create: true }); creato = true;
      if (!l.valido) { await scarta(); return null; }
      ws = await fh.createWritable();
      if (!l.valido) { await scarta(); return null; }
      await ws.write(buf);
      if (!l.valido) { await scarta(); return null; }
      await ws.close(); ws = undefined;
      if (!l.valido) { await scarta(); return null; }
      const p = await apriProxy(await fh.getFile());
      if (!l.valido) { p?.input.dispose(); await scarta(); return null; }
      return p;
    } catch (e) {
      await scarta();
      if (!l.valido) return null;
      // Disco pieno/non disponibile: il proxy completo resta in memoria, mai un file parziale.
      void e;
    }
  }
  if (!l.valido) return null;
  const p = await apriProxy(buf);
  if (!l.valido) { p?.input.dispose(); return null; }
  return p;
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
  return esclusivaProxy(nome, async () => {
  try { const f = await (await dir.getFileHandle(nome)).getFile(); if (f.size === len) return true; } catch { /* non c'è: si copia */ }
  try {
    const fh = await dir.getFileHandle(nome, { create: true });
    const ws = await fh.createWritable();
    const PEZZO = 8 << 20;
    for (let a = 0; a < len; a += PEZZO) await ws.write(new Blob([await leggi(a, Math.min(len, a + PEZZO)) as BlobPart]));
    await ws.close();
    return true;
  } catch { return false; }
  });
}

/** svuota i proxy salvati (menu Vista): si rifanno quando servono */
export async function svuotaProxy() {
  try {
    const radice = await navigator.storage.getDirectory();
    await radice.removeEntry(CARTELLA, { recursive: true });
  } catch { /* niente da svuotare */ }
}
